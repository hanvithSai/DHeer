// background.js

// Allow users to open the side panel by clicking the action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listen for tab updates to potentially update the side panel context
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // We could send a message to the side panel if needed
    // chrome.runtime.sendMessage({ type: 'TAB_UPDATED', url: tab.url, title: tab.title });
  }
});
