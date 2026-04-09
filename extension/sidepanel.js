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
  const ALL_SECTIONS = ['bookmark-section', 'companion-section', 'todo-section'];
  const showSection = (sectionId) => {
    ALL_SECTIONS.forEach(id => { document.getElementById(id).classList.add('hidden'); });
    document.getElementById(sectionId).classList.remove('hidden');
    // Update active tab button
    ['nav-bookmark', 'nav-companion', 'nav-todo'].forEach(id => {
      document.getElementById(id).classList.remove('active');
    });
    const sectionToNav = { 'bookmark-section': 'nav-bookmark', 'companion-section': 'nav-companion', 'todo-section': 'nav-todo' };
    const navId = sectionToNav[sectionId];
    if (navId) document.getElementById(navId).classList.add('active');
  };

  document.getElementById('nav-bookmark').addEventListener('click', () => showSection('bookmark-section'));
  document.getElementById('nav-companion').addEventListener('click', () => { showSection('companion-section'); fetchCompanionData(); });
  document.getElementById('nav-todo').addEventListener('click', () => { showSection('todo-section'); loadTodos(); });

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

  // ── Todo tab logic ──────────────────────────────────────────────────────────
  let todoStatuses = [];
  let todosData = [];
  let todoFilter = 'all';

  window._dheerTodoFilter = 'all';

  // Priority filter buttons
  document.querySelectorAll('.todo-priority-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window._dheerTodoFilter = btn.dataset.filter;
      document.querySelectorAll('.todo-priority-btn').forEach(b => {
        b.className = 'todo-priority-btn';
      });
      btn.classList.add('active-' + window._dheerTodoFilter);
      renderTodos(window._dheerTodos, window._dheerStatuses);
    });
  });

  // Add todo form
  document.getElementById('todo-add-btn').addEventListener('click', async () => {
    const title = document.getElementById('todo-add-input').value.trim();
    if (!title) return;
    const priority = document.getElementById('todo-add-priority').value;
    const statusIdRaw = document.getElementById('todo-add-status').value;
    const statusId = statusIdRaw ? parseInt(statusIdRaw) : undefined;
    try {
      const res = await fetch(`${API_BASE_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority, statusId: statusId || null }),
        credentials: 'include'
      });
      if (res.ok) {
        document.getElementById('todo-add-input').value = '';
        await loadTodos();
      }
    } catch (err) { console.error('Failed to add todo', err); }
  });

  document.getElementById('todo-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('todo-add-btn').click();
  });
  // ─────────────────────────────────────────────────────────────────────────────

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

// ── Todo functions ─────────────────────────────────────────────────────────────
async function loadTodos() {
  try {
    const [todosRes, statusesRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/todos`, { credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/todo-statuses`, { credentials: 'include' })
    ]);
    if (!todosRes.ok || !statusesRes.ok) return;
    const todos = await todosRes.json();
    const statuses = await statusesRes.json();

    // Update status dropdown in add form
    const statusSelect = document.getElementById('todo-add-status');
    statusSelect.innerHTML = '<option value="">No status</option>';
    statuses.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      statusSelect.appendChild(opt);
    });

    // Store globally inside closure (DOMContentLoaded scope holds todoStatuses/todosData)
    // We re-render directly here
    renderTodos(todos, statuses);

    // Persist for filter re-renders: attach to window for closure access
    window._dheerTodos = todos;
    window._dheerStatuses = statuses;
  } catch (err) {
    console.error('Failed to load todos', err);
  }
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function renderTodos(todos, statuses) {
  // Use window cache if called from filter buttons
  const allTodos = todos || window._dheerTodos || [];
  const allStatuses = statuses || window._dheerStatuses || [];

  // Apply filter (todoFilter is defined in DOMContentLoaded scope; fallback to 'all')
  const filter = window._dheerTodoFilter || 'all';
  const filtered = filter === 'all' ? allTodos : allTodos.filter(t => t.priority === filter);

  // Sort by priority
  const sorted = [...filtered].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  );

  const list = document.getElementById('todo-list');
  list.innerHTML = '';

  if (sorted.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:32px 0; color: var(--text-muted); font-size:13px;">No tasks yet — add one above!</div>';
    return;
  }

  sorted.forEach(todo => {
    const status = allStatuses.find(s => s.id === todo.statusId);
    const isDone = status && status.name === 'Done';
    const priorityBadgeClass = `todo-priority-badge badge-${todo.priority || 'medium'}`;

    const div = document.createElement('div');
    div.className = 'todo-item' + (isDone ? ' done' : '');

    div.innerHTML = `
      <div class="todo-check ${isDone ? 'checked' : ''}" data-id="${todo.id}" data-done="${isDone}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="todo-body">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        <div class="todo-meta">
          <span class="${priorityBadgeClass}">${capitalize(todo.priority || 'medium')}</span>
          ${status ? `<span class="todo-status-dot" style="background:${status.color}"></span><span class="todo-status-label">${escapeHtml(status.name)}</span>` : ''}
        </div>
      </div>
      <button class="todo-delete-btn" data-id="${todo.id}" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    `;

    // Toggle done
    div.querySelector('.todo-check').addEventListener('click', async (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const currentlyDone = e.currentTarget.dataset.done === 'true';
      const doneStatus = allStatuses.find(s => s.name === 'Done');
      const todoStatus = allStatuses.find(s => s.name === 'To Do');
      const targetStatusId = currentlyDone ? (todoStatus?.id ?? null) : (doneStatus?.id ?? null);
      try {
        await fetch(`${API_BASE_URL}/api/todos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statusId: targetStatusId }),
          credentials: 'include'
        });
        await loadTodos();
      } catch (err) { console.error('Toggle done failed', err); }
    });

    // Delete
    div.querySelector('.todo-delete-btn').addEventListener('click', async (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      try {
        await fetch(`${API_BASE_URL}/api/todos/${id}`, { method: 'DELETE', credentials: 'include' });
        await loadTodos();
      } catch (err) { console.error('Delete todo failed', err); }
    });

    list.appendChild(div);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
