/**
 * extension/background.js
 *
 * Chrome Extension Service Worker — the persistent background process
 * that runs independently of any open tab or popup/sidepanel.
 *
 * Responsibilities:
 *  1. Open the side panel when the extension action icon is clicked
 *  2. Track session metadata (open tabs, tab switches, domain frequency)
 *  3. Send productivity nudge notifications when thresholds are exceeded
 *  4. Respond to messages from the sidepanel / companion panel UI
 *
 * Lifecycle:
 *  Service workers can be terminated by Chrome when idle.  This means
 *  `sessionMetadata` and `config` are in-memory only — they reset on
 *  service worker restart.  For persistence across restarts, chrome.storage
 *  would be required.
 *
 * Impact if this file changes:
 *  - Any change to message types (GET_SESSION_METADATA, UPDATE_CONFIG, etc.)
 *    must be mirrored in sidepanel.js and companion-panel.tsx
 *  - Changing `sessionMetadata` shape breaks the companion-panel.tsx Insights card
 *  - Removing the `return true` in onMessage breaks async sendResponse calls
 */

// ── Side panel setup ───────────────────────────────────────────────────────────

/**
 * setPanelBehavior
 *
 * Configures the side panel to open automatically when the user clicks
 * the extension's action icon in the Chrome toolbar.
 * Called once at service worker startup.
 *
 * Effect: Sets the global side panel open behavior for all tabs.
 * Impact if changed:
 *  - Removing this call means the icon click does nothing by default
 *  - `openPanelOnActionClick: false` would require a custom popup.html instead
 */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error("setPanelBehavior failed:", error));

// ── Session state ─────────────────────────────────────────────────────────────

/**
 * sessionMetadata
 *
 * In-memory object tracking the current browsing session's statistics.
 * Populated and updated by tab event listeners below.
 * Reset whenever the service worker is restarted by Chrome.
 *
 * Shape:
 *  - tabCount       — number of currently open tabs
 *  - tabSwitches    — how many times the user has switched tabs this session
 *  - sessionStartTime — Unix timestamp when the service worker started
 *  - domainFrequency  — map of domain → visit count for the current session
 *  - lastNudgeTime  — Unix timestamp of the most recent nudge (for cooldown)
 *
 * Impact if changed:
 *  - Adding new fields requires updating the companion-panel.tsx useEffect
 *    handler that maps the response to `setSessionData`
 *  - Removing `tabSwitches` breaks the Switches display in the Insights card
 */
let sessionMetadata = {
  tabCount: 0,
  tabSwitches: 0,
  sessionStartTime: Date.now(),
  domainFrequency: {},
  lastNudgeTime: 0,
};

/**
 * config
 *
 * Companion behavior configuration.  Defaults are applied at startup;
 * the web app's PATCH /api/companion/settings sends an UPDATE_CONFIG
 * message to sync these with the server-persisted values.
 *
 * Shape:
 *  - idleThreshold      — seconds of inactivity before an idle nudge fires
 *  - tabCountThreshold  — tab count that triggers a tab-overload nudge
 *  - nudgesEnabled      — global toggle for all nudge notifications
 *  - nudgeCooldown      — minimum milliseconds between nudges (prevents spam)
 *
 * Impact if changed:
 *  - Changing `nudgeCooldown` affects how frequently users see notifications
 *  - Changing `idleThreshold` must be compatible with Chrome's idle API resolution
 *    (chrome.idle detects idle in 15-second minimum intervals by default)
 */
let config = {
  idleThreshold: 300,       // 5 minutes
  tabCountThreshold: 10,
  nudgesEnabled: true,
  nudgeCooldown: 600000,    // 10 minutes between nudges
};

// ── Session initialization ────────────────────────────────────────────────────

/**
 * initSession
 *
 * Queries all open tabs at service worker startup and sets the initial
 * `sessionMetadata.tabCount`.  Ensures the Insights card shows an accurate
 * count immediately when the sidepanel is opened.
 *
 * Called once at the top level (service worker boot).
 *
 * Impact if changed:
 *  - Removing this call means tabCount starts at 0 until the next tab event
 *  - Adding chrome.storage.local.get here could restore the previous session's
 *    switch count across service worker restarts
 */
async function initSession() {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
}

initSession();

// ── Tab event listeners ───────────────────────────────────────────────────────

/**
 * tabs.onUpdated listener
 *
 * Fires when any tab's URL, title, or loading status changes.
 * On `status === 'complete'` (page fully loaded):
 *  - Increments the visit count for the tab's domain in `domainFrequency`
 *  - Re-queries all tabs to get an accurate count (handles tab splitting/merging)
 *
 * Impact if changed:
 *  - `domainFrequency` is currently tracked but not yet exposed in the UI —
 *    future features (distraction insights) can read it from sessionMetadata
 *  - Re-querying on every page load is accurate but slightly expensive;
 *    alternative: increment/decrement on created/removed events only
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    try {
      const domain = new URL(tab.url).hostname;
      sessionMetadata.domainFrequency[domain] =
        (sessionMetadata.domainFrequency[domain] || 0) + 1;
    } catch (_e) {
      // Ignore non-parseable URLs (e.g. chrome://, about:blank)
    }
    // Keep tab count accurate after any navigation (tabs can be split/merged)
    const tabs = await chrome.tabs.query({});
    sessionMetadata.tabCount = tabs.length;
  }
});

/**
 * tabs.onCreated listener
 *
 * Fires when a new tab is opened.
 * Updates `tabCount` and checks if the tab-overload nudge threshold is crossed.
 *
 * Impact if changed:
 *  - Removing `checkTabOverload()` here disables the tab-count nudge feature
 *  - If `tabCountThreshold` is 0, every new tab would trigger a nudge
 */
chrome.tabs.onCreated.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
  checkTabOverload();
});

/**
 * tabs.onRemoved listener
 *
 * Fires when a tab is closed.
 * Decrements `tabCount` by re-querying (more accurate than decrementing a counter).
 * No nudge is sent on removal — closing tabs is the desired behavior.
 *
 * Impact if changed:
 *  - Removing this listener means tabCount grows monotonically and never decreases
 */
chrome.tabs.onRemoved.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
});

/**
 * tabs.onActivated listener
 *
 * Fires whenever the user switches to a different tab.
 * Increments `tabSwitches` and immediately broadcasts the updated metadata
 * to any open sidepanel instances.
 *
 * The broadcast uses `sendMessage` — if no listener is open (sidepanel not open),
 * Chrome logs a "Could not establish connection" error which is silently caught.
 *
 * Impact if changed:
 *  - Removing the broadcast means the companion panel only updates on its 5-second poll
 *  - `tabSwitches` is a session-lifetime counter; it resets on service worker restart
 */
chrome.tabs.onActivated.addListener(() => {
  sessionMetadata.tabSwitches++;
  chrome.runtime
    .sendMessage({ type: "SESSION_METADATA_UPDATE", data: sessionMetadata })
    .catch(() => {}); // Ignore — no listeners when sidepanel is closed
});

// ── Idle detection ────────────────────────────────────────────────────────────

/**
 * idle.onStateChanged listener
 *
 * Fires when Chrome's idle detector transitions to "idle" (user inactive for
 * `idleThreshold` seconds) or back to "active".
 * Sends a nudge notification when idle is detected and nudges are enabled.
 *
 * Note: Chrome's idle API requires `permissions: ["idle"]` in manifest.json.
 * The minimum idle detection interval is 15 seconds regardless of threshold.
 *
 * Impact if changed:
 *  - Responding to "active" state (return from idle) could send a "welcome back" nudge
 *  - Removing this listener disables idle detection without affecting tab tracking
 */
chrome.idle.onStateChanged.addListener(newState => {
  if (newState === "idle" && config.nudgesEnabled) {
    sendNudge("You've been idle for a bit. Want to take a break or jump back in?");
  }
});

// ── Nudge helpers ─────────────────────────────────────────────────────────────

/**
 * checkTabOverload
 *
 * Checks if the current tab count exceeds `config.tabCountThreshold`.
 * If it does AND the nudge cooldown has elapsed, sends a tab-overload nudge.
 * Updates `lastNudgeTime` to enforce the cooldown period.
 *
 * Called by `tabs.onCreated` listener every time a new tab opens.
 *
 * Impact if changed:
 *  - Setting `nudgeCooldown` to 0 would send a nudge on every tab open above threshold
 *  - Changing the threshold check from `>=` to `>` shifts the trigger by 1 tab
 */
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

/**
 * sendNudge
 *
 * Sends a nudge in two ways simultaneously:
 *  1. `chrome.runtime.sendMessage({ type: 'COMPANION_NUDGE', message })` — notifies
 *     any open sidepanel or companion panel UI to display an in-panel alert
 *  2. `chrome.notifications.create(...)` — shows a native OS desktop notification
 *     (requires `permissions: ["notifications"]` in manifest.json)
 *
 * @param message — Human-readable nudge text shown to the user
 *
 * Impact if changed:
 *  - Removing the sendMessage call disables in-panel nudges
 *  - Removing the notifications.create call disables OS desktop notifications
 *  - Changing the icon path requires updating manifest.json's declared web_accessible_resources
 */
function sendNudge(message) {
  // In-panel nudge (companion panel may or may not be open)
  chrome.runtime
    .sendMessage({ type: "COMPANION_NUDGE", message })
    .catch(() => {}); // Silent if no listeners

  // OS-level desktop notification
  chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon128_1767721345183.png",
    title: "DHeer Companion",
    message,
    priority: 1,
  });
}

// ── Popup window tracking ─────────────────────────────────────────────────────

/**
 * popupState
 *
 * Tracks the floating popup window opened via the "Pop out" button.
 *  - windowId   — Chrome window ID of the popup (null when closed)
 *  - sourceTabId — ID of the tab whose side panel was closed to open the popup.
 *                  Used to re-enable the correct side panel when the popup closes.
 *
 * Impact if changed:
 *  - Losing `sourceTabId` means we cannot re-enable the right panel when the
 *    user closes the popup via the OS X button (without clicking Dock)
 */
let popupState = { windowId: null, sourceTabId: null };

/**
 * windows.onRemoved listener
 *
 * Fires when any Chrome window closes.
 * When the popup floating window is closed (by any means — X button, OS close,
 * etc.) we automatically re-enable the side panel for the original tab so the
 * user can open it again by clicking the extension icon.
 *
 * Impact if changed:
 *  - Removing this listener means the side panel stays permanently disabled if
 *    the user closes the popup without clicking the "Dock" button
 */
chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === popupState.windowId) {
    const tabId = popupState.sourceTabId;
    popupState = { windowId: null, sourceTabId: null };
    if (tabId != null) {
      chrome.sidePanel.setOptions({ tabId, enabled: true }).catch(() => {});
    }
  }
});

// ── Message handler ───────────────────────────────────────────────────────────

/**
 * runtime.onMessage listener
 *
 * Central message dispatcher for all messages sent to the background worker
 * from the sidepanel (sidepanel.js) or the web app companion panel
 * (companion-panel.tsx via chrome.runtime.sendMessage).
 *
 * Handled message types:
 *  - GET_SESSION_METADATA — returns the current sessionMetadata synchronously
 *  - UPDATE_CONFIG        — merges new config values into the in-memory config
 *  - LAUNCH_WORKSPACE     — opens all URLs in a new Chrome window
 *  - OPEN_POPUP           — captures the active tab ID, creates the floating popup
 *                           window, THEN disables the side panel (correct order,
 *                           no race condition).  Replaces the old two-message pattern.
 *  - OPEN_SIDEPANEL       — re-enables and opens the sidepanel (used when docking
 *                           back from the popup via the Dock button)
 *
 * ⚠️  `return true` at the end is REQUIRED.
 *     It keeps the message channel open so async callbacks can still call sendResponse.
 *     Without it, Chrome closes the port and sendResponse silently fails.
 *
 * Impact if changed:
 *  - Adding a new type here enables new cross-context communication patterns
 *  - Removing `return true` breaks all handlers that use callbacks (not just async)
 *  - OPEN_POPUP / OPEN_SIDEPANEL must stay in sync with sidepanel.js's
 *    popup/dock button logic
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "GET_SESSION_METADATA") {
    sendResponse(sessionMetadata);

  } else if (request.type === "UPDATE_CONFIG") {
    config = { ...config, ...request.config };

  } else if (request.type === "LAUNCH_WORKSPACE") {
    launchWorkspace(request.urls);

  } else if (request.type === "OPEN_POPUP") {
    /**
     * OPEN_POPUP — reliable pop-out flow:
     *  1. Create the popup window FIRST — no tab query needed for this step,
     *     so the popup always opens regardless of service-worker window context.
     *  2. After the window is confirmed created, query the active tab using the
     *     sourceWindowId supplied by the side panel (avoids the `currentWindow: true`
     *     service-worker unreliability that caused the popup not to open).
     *  3. Disable the side panel for that specific tab — it's already behind the popup.
     *  4. Store IDs in popupState so onRemoved can re-enable the panel automatically.
     */
    const sourceWindowId = request.sourceWindowId;
    const popupUrl = chrome.runtime.getURL("sidepanel.html?mode=popup");

    chrome.windows.create(
      { url: popupUrl, type: "popup", width: 420, height: 680, focused: true },
      newWindow => {
        if (chrome.runtime.lastError || !newWindow) return;

        // Query the source window's active tab now that the popup exists
        const queryOpts = sourceWindowId != null
          ? { active: true, windowId: sourceWindowId }
          : { active: true, lastFocusedWindow: true };

        chrome.tabs.query(queryOpts, tabs => {
          const tabId = tabs[0]?.id ?? null;
          popupState = { windowId: newWindow.id, sourceTabId: tabId };
          if (tabId != null) {
            chrome.sidePanel
              .setOptions({ tabId, enabled: false })
              .catch(() => {});
          }
        });
      },
    );

  } else if (request.type === "OPEN_SIDEPANEL") {
    /**
     * OPEN_SIDEPANEL — dock flow:
     *  Re-enable the side panel for the source tab and open it.
     *  The popup's dock button calls this; onRemoved also re-enables (no-op if
     *  dock was already clicked, since popupState is cleared on popup close).
     */
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

/**
 * launchWorkspace
 *
 * Opens all URLs from a workspace in a single new Chrome window,
 * each URL opening as a separate tab within that window.
 *
 * @param urls — Array of URL strings (validated by storage at creation time)
 *
 * Impact if changed:
 *  - Passing a single string instead of an array to `chrome.windows.create`
 *    opens only one tab — the `url` property accepts both string and string[]
 *  - Opening in the CURRENT window (omit `type: undefined`) would mix workspace
 *    tabs with the user's existing tabs
 */
async function launchWorkspace(urls) {
  chrome.windows.create({ url: urls });
}
