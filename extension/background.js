// background.js

// Allow users to open the side panel by clicking the action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Companion Tracking State
let sessionMetadata = {
  tabCount: 0,
  tabSwitches: 0,
  sessionStartTime: Date.now(),
  domainFrequency: {},
  lastNudgeTime: 0
};

// Tracking Configurations (Defaults)
let config = {
  idleThreshold: 300, // 5 minutes
  tabCountThreshold: 10,
  nudgesEnabled: true,
  nudgeCooldown: 600000 // 10 minutes
};

// Initialize session
async function initSession() {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
}

initSession();

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      sessionMetadata.domainFrequency[domain] = (sessionMetadata.domainFrequency[domain] || 0) + 1;
      
      // Update tab count on every completed update just in case
      const tabs = await chrome.tabs.query({});
      sessionMetadata.tabCount = tabs.length;
    } catch (e) {}
  }
});

// Listen for tab creation/removal
chrome.tabs.onCreated.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
  checkTabOverload();
});

chrome.tabs.onRemoved.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  sessionMetadata.tabCount = tabs.length;
});

// Listen for tab switching
chrome.tabs.onActivated.addListener(() => {
  sessionMetadata.tabSwitches++;
  // We can broadcast the update immediately to anyone listening
  chrome.runtime.sendMessage({ 
    type: 'SESSION_METADATA_UPDATE', 
    data: sessionMetadata 
  }).catch(() => {}); // Ignore error if no one is listening
});

// Idle detection
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === 'idle' && config.nudgesEnabled) {
    sendNudge("You've been idle for a bit. Want to take a break or jump back in?");
  }
});

function checkTabOverload() {
  if (config.nudgesEnabled && sessionMetadata.tabCount >= config.tabCountThreshold) {
    const now = Date.now();
    if (now - sessionMetadata.lastNudgeTime > config.nudgeCooldown) {
      sendNudge(`That's a lot of tabs (${sessionMetadata.tabCount})! DHeer recommends focusing on one thing at a time.`);
      sessionMetadata.lastNudgeTime = now;
    }
  }
}

function sendNudge(message) {
  // Use a simple notification or send message to sidepanel
  chrome.runtime.sendMessage({ type: 'COMPANION_NUDGE', message }).catch(() => {});
  
  // Optional: Chrome notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon128_1767721345183.png',
    title: 'DHeer Companion',
    message: message,
    priority: 1
  });
}

// Handle messages from UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SESSION_METADATA') {
    sendResponse(sessionMetadata);
  } else if (request.type === 'UPDATE_CONFIG') {
    config = { ...config, ...request.config };
  } else if (request.type === 'LAUNCH_WORKSPACE') {
    launchWorkspace(request.urls);
  }
  return true; // Keep message channel open for async response
});

async function launchWorkspace(urls) {
  chrome.windows.create({ url: urls });
}
