/**
 * extension/background.js
 *
 * Chrome Extension Service Worker — the persistent background process
 * that runs independently of any open tab or popup/sidepanel.
 *
 * Responsibilities:
 *  1. Open the side panel when the extension action icon is clicked
 *  2. Track session metadata (open tabs, tab switches, domain frequency,
 *     per-tab active time)
 *  3. Send productivity nudge notifications when thresholds are exceeded
 *  4. Respond to messages from the sidepanel / companion panel UI
 */

// ── Side panel setup ───────────────────────────────────────────────────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error("setPanelBehavior failed:", error));

// ── Session state ─────────────────────────────────────────────────────────────

/**
 * sessionMetadata
 *
 * In-memory object tracking the current browsing session's statistics.
 *
 * Shape:
 *  - tabCount         — number of currently open tabs
 *  - tabSwitches      — how many times the user has switched tabs this session
 *  - sessionStartTime — Unix timestamp when the service worker started
 *  - domainFrequency  — map of domain → page-load count for the current session
 *  - lastNudgeTime    — Unix timestamp of the most recent nudge (for cooldown)
 */
let sessionMetadata = {
  tabCount: 0,
  tabSwitches: 0,
  sessionStartTime: Date.now(),
  domainFrequency: {},
  lastNudgeTime: 0,
};

/**
 * Per-tab active-time tracking
 *
 * tabTimings[tabId] = { domain, title, url, totalActiveMs }
 *  - totalActiveMs is the accumulated milliseconds this tab was the active foreground tab
 *
 * activeTabId / activeTabActivatedAt
 *  - track which tab is currently in the foreground and when it was switched to,
 *    so we can compute live (in-progress) time for the currently active tab.
 */
let tabTimings = {};         // tabId → { domain, title, url, totalActiveMs }
let activeTabId = null;      // tabId of the currently focused tab
let activeTabActivatedAt = null; // Date.now() when the current tab became active

/**
 * config
 *
 * Companion behavior configuration persisted to chrome.storage.local.
 */
let config = {
  idleThreshold: 300,
  tabCountThreshold: 10,
  nudgesEnabled: true,
  nudgeCooldown: 600000,
};

// ── Session initialization ────────────────────────────────────────────────────

/**
 * initSession
 *
 * Queries all open tabs at service worker startup, sets tabCount, and
 * discovers which tab is currently active so per-tab timing starts correctly.
 * Also restores the last-known companion settings from chrome.storage.local.
 */
async function initSession() {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;

  // Find the currently active tab in the last focused window
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTabs.length > 0) {
    const tab = activeTabs[0];
    activeTabId = tab.id;
    activeTabActivatedAt = Date.now();
    ensureTabEntry(tab.id, tab.url, tab.title);
  }

  // Restore persisted companion settings
  try {
    const stored = await chrome.storage.local.get('companionConfig');
    if (stored.companionConfig) {
      config = { ...config, ...stored.companionConfig };
    }
  } catch (err) {
    console.warn('[DHeer] Could not restore companion config from storage:', err);
  }
}

initSession();

// ── Tab timing helpers ────────────────────────────────────────────────────────

/**
 * ensureTabEntry
 * Creates a tabTimings entry for a tab if it doesn't already exist.
 */
function ensureTabEntry(tabId, url, title) {
  if (!tabTimings[tabId]) {
    tabTimings[tabId] = { domain: '', title: title || '', url: url || '', totalActiveMs: 0 };
  }
  if (url) {
    try {
      tabTimings[tabId].domain = new URL(url).hostname;
    } catch (_e) {}
  }
  if (title) tabTimings[tabId].title = title;
  if (url) tabTimings[tabId].url = url;
}

/**
 * flushActiveTabTime
 * Called just before switching away from the currently active tab.
 * Accumulates the time spent on it into tabTimings.
 */
function flushActiveTabTime() {
  if (activeTabId !== null && activeTabActivatedAt !== null) {
    ensureTabEntry(activeTabId, null, null);
    tabTimings[activeTabId].totalActiveMs += Date.now() - activeTabActivatedAt;
  }
}

/**
 * buildLiveTimings
 * Returns a copy of tabTimings with the currently active tab's in-progress
 * time added (without modifying the stored value so each call is idempotent).
 */
function buildLiveTimings() {
  const live = {};
  for (const [id, entry] of Object.entries(tabTimings)) {
    live[id] = { ...entry };
  }
  if (activeTabId !== null && activeTabActivatedAt !== null) {
    if (!live[activeTabId]) live[activeTabId] = { domain: '', title: '', url: '', totalActiveMs: 0 };
    live[activeTabId] = {
      ...live[activeTabId],
      totalActiveMs: live[activeTabId].totalActiveMs + (Date.now() - activeTabActivatedAt),
      isActive: true,
    };
  }
  return live;
}

// ── Tab event listeners ───────────────────────────────────────────────────────

/**
 * tabs.onUpdated listener
 *
 * Fires when a tab's URL, title, or loading status changes.
 * On status === 'complete': updates domain frequency and tab timing entry.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    try {
      const domain = new URL(tab.url).hostname;
      sessionMetadata.domainFrequency[domain] =
        (sessionMetadata.domainFrequency[domain] || 0) + 1;
    } catch (_e) {}

    // Update tab metadata in timing registry
    ensureTabEntry(tabId, tab.url, tab.title);

    const tabs = await chrome.tabs.query({});
    sessionMetadata.tabCount = tabs.length;
  }

  // Keep title up-to-date as pages finish loading
  if (changeInfo.title && tabTimings[tabId]) {
    tabTimings[tabId].title = changeInfo.title;
  }
});

/**
 * tabs.onCreated listener
 */
chrome.tabs.onCreated.addListener(async (tab) => {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
  ensureTabEntry(tab.id, tab.url, tab.title);
  checkTabOverload();
});

/**
 * tabs.onRemoved listener
 *
 * Finalizes timing for the closed tab and clears activeTabId if it was active.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) {
    flushActiveTabTime();
    activeTabId = null;
    activeTabActivatedAt = null;
  }
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
});

/**
 * tabs.onActivated listener
 *
 * Fires whenever the user switches to a different tab.
 * Flushes time for the previous tab, then starts timing the new one.
 * Broadcasts updated metadata so the companion panel updates instantly.
 */
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Flush time for the outgoing tab
  flushActiveTabTime();

  // Switch to new tab
  activeTabId = tabId;
  activeTabActivatedAt = Date.now();
  sessionMetadata.tabSwitches++;

  // Get tab details to populate the timing entry
  try {
    const tab = await chrome.tabs.get(tabId);
    ensureTabEntry(tabId, tab.url, tab.title);
  } catch (_e) {
    ensureTabEntry(tabId, null, null);
  }

  // Broadcast to open sidepanel/companion panels
  chrome.runtime
    .sendMessage({
      type: "SESSION_METADATA_UPDATE",
      data: { ...sessionMetadata, tabTimings: buildLiveTimings(), activeTabId },
    })
    .catch(() => {});
});

// ── Idle detection ────────────────────────────────────────────────────────────
chrome.idle.onStateChanged.addListener(newState => {
  if (newState === "idle" && config.nudgesEnabled) {
    sendNudge("You've been idle for a bit. Want to take a break or jump back in?");
  }
});

// ── Nudge helpers ─────────────────────────────────────────────────────────────
function checkTabOverload() {
  if (
    config.nudgesEnabled &&
    sessionMetadata.tabCount >= config.tabCountThreshold
  ) {
    const now = Date.now();
    if (now - sessionMetadata.lastNudgeTime > config.nudgeCooldown) {
      sendNudge(
        `That's a lot of tabs (${sessionMetadata.tabCount})! DHeer recommends focusing on one thing at a time.`,
      );
      sessionMetadata.lastNudgeTime = now;
    }
  }
}

function sendNudge(message) {
  chrome.runtime
    .sendMessage({ type: "COMPANION_NUDGE", message })
    .catch(() => {});

  chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon128_1767721345183.png",
    title: "DHeer Companion",
    message,
    priority: 1,
  });
}

// ── Popup window tracking ─────────────────────────────────────────────────────
let popupState = { windowId: null, sourceTabId: null };

chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === popupState.windowId) {
    popupState = { windowId: null, sourceTabId: null };
    chrome.sidePanel.setOptions({ enabled: true }).catch(() => {});
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "GET_SESSION_METADATA") {
    // Include live per-tab timings (active tab's current time included)
    sendResponse({
      ...sessionMetadata,
      tabTimings: buildLiveTimings(),
      activeTabId,
    });

  } else if (request.type === "UPDATE_CONFIG") {
    config = { ...config, ...request.config };
    chrome.storage.local.set({ companionConfig: config }).catch(err =>
      console.warn('[DHeer] Could not persist companion config:', err)
    );

  } else if (request.type === "LAUNCH_WORKSPACE") {
    launchWorkspace(request.urls);

  } else if (request.type === "POPUP_CREATED") {
    const { popupWindowId, sourceTabId } = request;
    popupState = { windowId: popupWindowId, sourceTabId: sourceTabId ?? null };

    chrome.sidePanel
      .setOptions({ enabled: false })
      .then(() => new Promise(resolve => setTimeout(resolve, 300)))
      .then(() => chrome.sidePanel.setOptions({ enabled: true }))
      .catch(err => console.error("[DHeer] setOptions error:", err));

  } else if (request.type === "OPEN_SIDEPANEL") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab) return;
      chrome.sidePanel
        .setOptions({ tabId: tab.id, enabled: true })
        .then(() => chrome.sidePanel.open({ windowId: tab.windowId }))
        .catch(() => {});
    });
  }

  return true;
});

// ── Workspace launcher ────────────────────────────────────────────────────────
async function launchWorkspace(urls) {
  chrome.windows.create({ url: urls });
}
