// sidepanel.js

// Change this to your actual deployed URL or localhost for testing
const API_BASE_URL = window.location.origin.includes('chrome-extension://') 
  ? 'http://localhost:5000' // Development default, user will need to change this for prod
  : window.location.origin;

// State
let currentTab = null;

// Elements
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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTab = tab;
    titleInput.value = tab.title || '';
    urlInput.value = tab.url || '';
  }

  // Check auth status
  checkAuth();

  // Setup listeners
  saveBtn.addEventListener('click', saveBookmark);
  loginLink.addEventListener('click', () => {
    chrome.tabs.create({ url: `${API_BASE_URL}/` });
  });
});

async function checkAuth() {
  try {
    // Note: Cross-origin cookies must be enabled for this to work in dev
    // For production, we might need a more robust auth flow for extensions (e.g. token based)
    // But for this MVP we'll try to rely on the session cookie if SameSite allows or just prompt
    const res = await fetch(`${API_BASE_URL}/api/auth/user`);
    if (res.ok) {
      authCheck.classList.add('hidden');
      mainContent.classList.remove('hidden');
      loadRecentBookmarks();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error("Auth check failed", err);
    // In extension context, fetch might fail if CORS not set up or server down
    statusMsg.innerText = "Could not connect to server.";
    statusMsg.style.color = "red";
  }
}

function showLogin() {
  authCheck.classList.remove('hidden');
  mainContent.classList.add('hidden');
}

async function saveBookmark() {
  saveBtn.disabled = true;
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
      body: JSON.stringify(data)
    });

    if (res.ok) {
      statusMsg.innerText = "Saved!";
      statusMsg.style.color = "#9C64FB";
      setTimeout(() => {
        statusMsg.innerText = "";
        saveBtn.innerText = "Save Bookmark";
        saveBtn.disabled = false;
      }, 2000);
      loadRecentBookmarks();
    } else {
      const err = await res.json();
      throw new Error(err.message || "Failed to save");
    }
  } catch (error) {
    statusMsg.innerText = error.message;
    statusMsg.style.color = "red";
    saveBtn.innerText = "Save Bookmark";
    saveBtn.disabled = false;
  }
}

async function loadRecentBookmarks() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookmarks`);
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
    recentList.innerHTML = '<div style="color:#666; font-style:italic;">No bookmarks yet</div>';
    return;
  }
  
  bookmarks.forEach(b => {
    const div = document.createElement('div');
    div.style.padding = '8px';
    div.style.background = '#222';
    div.style.borderRadius = '4px';
    div.innerHTML = `
      <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.title || b.url}</div>
      <div style="font-size:11px; color:#888;">${new URL(b.url).hostname}</div>
    `;
    div.addEventListener('click', () => {
       chrome.tabs.create({ url: b.url });
    });
    div.style.cursor = 'pointer';
    recentList.appendChild(div);
  });
}
