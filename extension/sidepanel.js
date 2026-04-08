// sidepanel.js

const API_BASE_URL = 'https://d-heer--hanvithsaia.replit.app';

// Detect if this page is running as a detached popup window
const IS_POPUP_MODE = new URLSearchParams(window.location.search).get('mode') === 'popup';

// Elements
const userDisplay = document.getElementById('user-display');
const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const tagsInput = document.getElementById('tags');
const noteInput = document.getElementById('note');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-message');
const authCheck = document.getElementById('auth-check');
const mainContent = document.getElementById('main-content');
const loginLink = document.getElementById('login-link');
const recentList = document.getElementById('recent-list');

// Populate URL and title fields from a tab object
function populateTabFields(tab) {
  if (!tab) return;
  const url = tab.url || '';
  const title = tab.title || '';
  // Only update if the user hasn't manually edited the fields
  if (!urlInput.dataset.userEdited) urlInput.value = url;
  if (!titleInput.dataset.userEdited) titleInput.value = title;
}

// Fetch the active tab and populate fields
async function syncActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  populateTabFields(tab);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab info on open
  await syncActiveTab();

  // Track if the user manually edited either field
  urlInput.addEventListener('input', () => { urlInput.dataset.userEdited = 'true'; });
  titleInput.addEventListener('input', () => { titleInput.dataset.userEdited = 'true'; });

  // Clear the manual-edit flag after saving so next tab switch auto-fills again
  saveBtn.addEventListener('click', () => {
    delete urlInput.dataset.userEdited;
    delete titleInput.dataset.userEdited;
  });

  // Update fields whenever the user switches to a different tab
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    delete urlInput.dataset.userEdited;
    delete titleInput.dataset.userEdited;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    populateTabFields(tab);
  });

  // Update fields when the active tab navigates to a new URL
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id === tabId) {
        populateTabFields(tab);
      }
    }
  });

  // ── Popup / Dock mode setup ──────────────────────────────────────────
  const btnPopout = document.getElementById('btn-popout');
  const btnDock   = document.getElementById('btn-dock');

  if (IS_POPUP_MODE) {
    // Running as a detached popup window
    document.body.classList.add('popup-mode');
    btnPopout.classList.add('hidden');
    btnDock.classList.remove('hidden');

    // Dock: reopen sidepanel and close this popup window
    btnDock.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
      window.close();
    });
  } else {
    // Running as a sidepanel
    btnPopout.classList.remove('hidden');
    btnDock.classList.add('hidden');

    // Popout: close the sidepanel then open as a floating popup window
    btnPopout.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' });
      const popupUrl = chrome.runtime.getURL('sidepanel.html?mode=popup');
      chrome.windows.create({
        url: popupUrl,
        type: 'popup',
        width: 420,
        height: 680,
        focused: true
      });
    });
  }
  // ────────────────────────────────────────────────────────────────────

  // Check auth status
  checkAuth();
  
  // Show/Hide sections
  const showSection = (sectionId) => {
    ['bookmark-section', 'companion-section'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
  };

  document.getElementById('nav-bookmark').addEventListener('click', () => showSection('bookmark-section'));
  document.getElementById('nav-companion').addEventListener('click', () => showSection('companion-section'));

  // Companion logic
  const updateDisplay = (data) => {
    if (data) {
      const tabCountEl = document.getElementById('ext-tab-count');
      const tabSwitchesEl = document.getElementById('ext-tab-switches');
      if (tabCountEl) tabCountEl.innerText = data.tabCount || 0;
      if (tabSwitchesEl) tabSwitchesEl.innerText = data.tabSwitches || 0;
    }
  };

  const fetchCompanionData = async () => {
    // Session metadata from background
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA' }, (data) => {
      updateDisplay(data);
    });

    // Workspaces from API
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces`, { credentials: 'include' });
      if (res.ok) {
        const workspaces = await res.json();
        renderWorkspaces(workspaces);
      }
    } catch (err) {
      console.error("Failed to load workspaces", err);
    }
  };

  // Listen for real-time updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SESSION_METADATA_UPDATE') {
      updateDisplay(message.data);
    }
  });

  function renderWorkspaces(workspaces) {
    const list = document.getElementById('ext-workspaces-list');
    list.innerHTML = '';
    if (workspaces.length === 0) {
      list.innerHTML = '<div class="empty-state">No workspaces found</div>';
      return;
    }

    workspaces.forEach(ws => {
      const div = document.createElement('div');
      div.className = 'workspace-item';
      div.innerHTML = `
        <div style="min-width:0;flex:1;">
          <div class="workspace-item-name">${ws.name}</div>
          <div class="workspace-item-meta">${ws.urls.length} Resource${ws.urls.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="padding:6px;background:rgba(192,133,82,0.1);border-radius:8px;color:#c08552;flex-shrink:0;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      `;
      div.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LAUNCH_WORKSPACE', urls: ws.urls });
      });
      list.appendChild(div);
    });
  }

  setInterval(fetchCompanionData, 5000);
  fetchCompanionData();

  // Setup listeners
  saveBtn.addEventListener('click', saveBookmark);
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${API_BASE_URL}/` });
  });
});

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/user`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      if (userDisplay) {
        userDisplay.innerText = `${user.firstName || user.email}`;
      }
      // Ensure we hide auth check and show main content correctly
      authCheck.style.display = 'none';
      mainContent.style.display = 'block';
      authCheck.classList.add('hidden');
      mainContent.classList.remove('hidden');
      loadRecentBookmarks();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error("Auth check failed", err);
    showLogin();
  }
}

function showLogin() {
  authCheck.style.display = 'flex';
  mainContent.style.display = 'none';
  authCheck.classList.remove('hidden');
  mainContent.classList.add('hidden');
}

async function saveBookmark() {
  if (saveBtn.disabled) return;
  
  saveBtn.disabled = true;
  const originalBtnText = saveBtn.innerText;
  saveBtn.innerText = "Saving...";
  statusMsg.innerText = "";

  const data = {
    url: urlInput.value,
    title: titleInput.value,
    note: noteInput.value,
    tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
    savedFrom: 'extension'
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });

    if (res.ok) {
      statusMsg.innerText = "✓ Saved Successfully";
      statusMsg.style.color = "#895737";
      
      tagsInput.value = '';
      noteInput.value = '';
      
      setTimeout(() => {
        statusMsg.innerText = "";
        saveBtn.innerText = originalBtnText;
        saveBtn.disabled = false;
      }, 2000);
      loadRecentBookmarks();
    } else {
      const err = await res.json();
      throw new Error(err.message || "Failed to save");
    }
  } catch (error) {
    statusMsg.innerText = "✕ " + error.message;
    statusMsg.style.color = "#ef4444";
    saveBtn.innerText = originalBtnText;
    saveBtn.disabled = false;
  }
}

async function loadRecentBookmarks() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookmarks`, { credentials: 'include' });
    if (res.ok) {
      const bookmarks = await res.json();
      renderRecent(bookmarks.slice(0, 5));
    }
  } catch (err) {
    console.error("Failed to load recents", err);
  }
}

function renderRecent(bookmarks) {
  recentList.innerHTML = '';
  if (bookmarks.length === 0) {
    recentList.innerHTML = '<div class="empty-state">No bookmarks yet</div>';
    return;
  }
  
  bookmarks.forEach(b => {
    const div = document.createElement('div');
    div.className = 'recent-item';
    
    let hostname = '';
    try {
      hostname = new URL(b.url).hostname;
    } catch (e) {
      hostname = b.url;
    }

    div.innerHTML = `
      <div class="recent-title">${b.title || b.url}</div>
      <div class="recent-url">${hostname}</div>
    `;
    
    div.addEventListener('click', () => {
       chrome.tabs.create({ url: b.url });
    });
    recentList.appendChild(div);
  });
}
