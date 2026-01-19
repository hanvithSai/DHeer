// sidepanel.js

const API_BASE_URL = 'https://d-heer--hanvithsaia.replit.app';

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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    titleInput.value = tab.title || '';
    urlInput.value = tab.url || '';
  }

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
  const fetchCompanionData = async () => {
    // Session metadata from background
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA' }, (data) => {
      if (data) {
        document.getElementById('ext-tab-count').innerText = data.tabCount || 0;
        document.getElementById('ext-tab-switches').innerText = data.tabSwitches || 0;
      }
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

  function renderWorkspaces(workspaces) {
    const list = document.getElementById('ext-workspaces-list');
    list.innerHTML = '';
    if (workspaces.length === 0) {
      list.innerHTML = '<div class="text-[10px] text-[#895737] italic text-center p-4 bg-[#2a1f1b] rounded-xl">No workspaces found</div>';
      return;
    }

    workspaces.forEach(ws => {
      const div = document.createElement('div');
      div.className = 'bg-[#2a1f1b] p-4 rounded-xl flex items-center justify-between group hover:border-[#c08552] border border-transparent transition-all cursor-pointer';
      div.innerHTML = `
        <div>
          <div class="text-sm font-bold text-[#f3e9dc]">${ws.name}</div>
          <div class="text-[8px] text-[#895737] uppercase tracking-widest">${ws.urls.length} Resources</div>
        </div>
        <div class="p-2 bg-[#c08552]/10 rounded-lg text-[#c08552]">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
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
