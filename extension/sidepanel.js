/**
 * extension/sidepanel.js
 *
 * Main script for the DHeer browser extension side panel (sidepanel.html).
 * Runs in the Chrome side panel context — it has access to chrome.* APIs
 * but NOT to page content (no direct DOM access to the active tab).
 *
 * Also runs when the panel is popped out as a floating popup window
 * (sidepanel.html?mode=popup), detected via the `IS_POPUP_MODE` flag.
 *
 * Sections:
 *  1. Tab auto-fill  — reads the active tab's URL/title into the save form
 *  2. Popup/Dock     — toggles between sidepanel and floating window modes
 *  3. Auth check     — verifies session via /api/auth/user before showing UI
 *  4. Navigation     — tab bar switching (Bookmarks / Companion / Todos)
 *  5. Companion      — 4-stat insights, workspace list, nudge settings (polled every 5s)
 *  6. Nudge banner   — shown for 8 s when COMPANION_NUDGE is received
 *  7. Todo           — full todo list with add, filter, toggle-done, delete
 *  8. Bookmark save  — saves the active tab as a bookmark via POST /api/bookmarks
 *  9. Recent list    — shows last 5 bookmarks at the bottom of the bookmark tab
 *
 * Impact if this file changes:
 *  - All API_BASE_URL calls go to the production app — changing this URL
 *    disconnects the extension from the backend
 *  - Message types sent via chrome.runtime.sendMessage must match background.js handlers
 *  - Toggle-done logic depends on statuses named exactly "Done" and "To Do"
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * API_BASE_URL
 * Base URL of the deployed DHeer web app.
 * In development change this to 'http://localhost:5000' and reload the extension.
 */
const API_BASE_URL = 'https://d-heer--hanvithsaia.replit.app';

/** True when the panel is opened as a detached popup window. */
const IS_POPUP_MODE = new URLSearchParams(window.location.search).get('mode') === 'popup';

// ── Element references ─────────────────────────────────────────────────────────
const userDisplay  = document.getElementById('user-display');
const titleInput   = document.getElementById('title');
const urlInput     = document.getElementById('url');
const tagsInput    = document.getElementById('tags');
const noteInput    = document.getElementById('note');
const saveBtn      = document.getElementById('save-btn');
const statusMsg    = document.getElementById('status-message');
const authCheck    = document.getElementById('auth-check');
const mainContent  = document.getElementById('main-content');
const loginLink    = document.getElementById('login-link');
const recentList   = document.getElementById('recent-list');

// ── Tab auto-fill ──────────────────────────────────────────────────────────────

/**
 * populateTabFields
 * Fills URL and title inputs from a Chrome Tab object.
 * Only overwrites the field if the user hasn't manually edited it.
 */
function populateTabFields(tab) {
  if (!tab) return;
  if (!urlInput.dataset.userEdited)   urlInput.value   = tab.url   || '';
  if (!titleInput.dataset.userEdited) titleInput.value = tab.title || '';
}

/**
 * syncActiveTab
 * Queries the currently active tab and pre-fills the save form.
 */
async function syncActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  populateTabFields(tab);
}

// ── Initialization ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  await syncActiveTab();

  // ── Input tracking ─────────────────────────────────────────────────────
  urlInput.addEventListener('input',   () => { urlInput.dataset.userEdited   = 'true'; });
  titleInput.addEventListener('input', () => { titleInput.dataset.userEdited = 'true'; });

  saveBtn.addEventListener('click', () => {
    delete urlInput.dataset.userEdited;
    delete titleInput.dataset.userEdited;
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    delete urlInput.dataset.userEdited;
    delete titleInput.dataset.userEdited;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    populateTabFields(tab);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id === tabId) populateTabFields(tab);
    }
  });

  // ── Popup / Dock toggle ────────────────────────────────────────────────
  const btnPopout = document.getElementById('btn-popout');
  const btnDock   = document.getElementById('btn-dock');

  if (IS_POPUP_MODE) {
    document.body.classList.add('popup-mode');
    btnPopout.classList.add('hidden');
    btnDock.classList.remove('hidden');

    btnDock.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
      window.close();
    });
  } else {
    btnPopout.classList.remove('hidden');
    btnDock.classList.add('hidden');

    btnPopout.addEventListener('click', async () => {
      // Pass our own window ID so background.js can query the correct active tab
      // without relying on `currentWindow: true` (unreliable from service worker context)
      const win = await chrome.windows.getCurrent();
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP', sourceWindowId: win.id });
    });
  }

  // ── Auth check ─────────────────────────────────────────────────────────
  checkAuth();

  // ── Nudge banner close button ─────────────────────────────────────────
  /**
   * Dismisses the nudge banner immediately when the × button is clicked.
   * Auto-dismiss is handled by the COMPANION_NUDGE message handler below.
   */
  const nudgeBannerClose = document.getElementById('nudge-banner-close');
  if (nudgeBannerClose) {
    nudgeBannerClose.addEventListener('click', () => {
      document.getElementById('nudge-banner')?.classList.add('hidden');
      clearTimeout(window._nudgeBannerTimer);
    });
  }

  // ── Section navigation ─────────────────────────────────────────────────
  const ALL_SECTIONS = ['bookmark-section', 'companion-section', 'todo-section'];

  const showSection = (sectionId) => {
    ALL_SECTIONS.forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');

    ['nav-bookmark', 'nav-companion', 'nav-todo'].forEach(id => {
      document.getElementById(id).classList.remove('active');
    });
    const sectionToNav = {
      'bookmark-section':  'nav-bookmark',
      'companion-section': 'nav-companion',
      'todo-section':      'nav-todo',
    };
    const navId = sectionToNav[sectionId];
    if (navId) document.getElementById(navId).classList.add('active');
  };

  document.getElementById('nav-bookmark').addEventListener('click', () => showSection('bookmark-section'));

  document.getElementById('nav-companion').addEventListener('click', () => {
    showSection('companion-section');
    fetchCompanionData();    // Refresh live stats
    loadNudgeSettings();     // Sync toggle + slider with DB values
  });

  document.getElementById('nav-todo').addEventListener('click', () => {
    showSection('todo-section');
    loadTodos();
  });

  // ── Companion section ──────────────────────────────────────────────────

  /**
   * updateDisplay
   *
   * Updates the 4-cell Insights grid with data from background.js:
   *  - Tab count
   *  - Tab switches
   *  - Session duration (calculated from sessionStartTime)
   *  - Top domain (highest-count key in domainFrequency)
   *
   * @param data — Session metadata object from background.js sessionMetadata
   */
  const updateDisplay = (data) => {
    if (!data) return;

    const tabCountEl    = document.getElementById('ext-tab-count');
    const tabSwitchesEl = document.getElementById('ext-tab-switches');
    const durationEl    = document.getElementById('ext-session-duration');
    const topDomainEl   = document.getElementById('ext-top-domain');

    if (tabCountEl)    tabCountEl.innerText    = data.tabCount    ?? 0;
    if (tabSwitchesEl) tabSwitchesEl.innerText = data.tabSwitches ?? 0;

    // Session duration
    if (durationEl) {
      if (data.sessionStartTime) {
        const mins = Math.floor((Date.now() - data.sessionStartTime) / 60000);
        durationEl.innerText = mins >= 60
          ? `${Math.floor(mins / 60)}h ${mins % 60}m`
          : `${mins}m`;
      } else {
        durationEl.innerText = '--';
      }
    }

    // Top domain by frequency
    if (topDomainEl) {
      const freq    = data.domainFrequency || {};
      const entries = Object.entries(freq).sort(([, a], [, b]) => b - a);
      const top     = entries[0]?.[0];
      topDomainEl.innerText = top ? top.replace('www.', '') : '--';
    }
  };

  /**
   * fetchCompanionData
   *
   * Fetches session metadata from background.js and workspace list from the API.
   * Called on companion tab switch and every 5 seconds.
   */
  const fetchCompanionData = async () => {
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA' }, (data) => {
      updateDisplay(data);
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces`, { credentials: 'include' });
      if (res.ok) {
        const workspaces = await res.json();
        renderWorkspaces(workspaces);
      }
    } catch (err) {
      console.error('Failed to load workspaces', err);
    }
  };

  /**
   * loadNudgeSettings
   *
   * Fetches companion settings from the API and populates the nudge-settings UI:
   *  - ext-nudges-enabled checkbox
   *  - ext-threshold-slider + ext-threshold-label
   *
   * Called when the companion tab is opened to keep the UI in sync with the DB.
   */
  async function loadNudgeSettings() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/companion/settings`, { credentials: 'include' });
      if (!res.ok) return;
      const settings = await res.json();

      const nudgesToggle     = document.getElementById('ext-nudges-enabled');
      const thresholdSlider  = document.getElementById('ext-threshold-slider');
      const thresholdLabel   = document.getElementById('ext-threshold-label');

      if (nudgesToggle)    nudgesToggle.checked = settings.nudgesEnabled !== false;
      if (thresholdSlider && thresholdLabel) {
        const val = settings.tabCountThreshold ?? 10;
        thresholdSlider.value    = val;
        thresholdLabel.innerText = val;
      }
    } catch (err) {
      console.error('Failed to load nudge settings:', err);
    }
  }

  /**
   * saveCompanionSetting
   * PATCHes a partial companion settings update and forwards it to background.js.
   *
   * @param updates — Partial settings object (e.g. { nudgesEnabled: false })
   */
  async function saveCompanionSetting(updates) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/companion/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updates),
        credentials: 'include',
      });
      if (res.ok) {
        // Forward to background.js so in-memory config stays in sync
        chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config: updates });
      }
    } catch (err) {
      console.error('Failed to save companion setting:', err);
    }
  }

  // ── Nudge settings event listeners ───────────────────────────────────────

  /** Enable / disable nudges toggle */
  const nudgesToggle = document.getElementById('ext-nudges-enabled');
  if (nudgesToggle) {
    nudgesToggle.addEventListener('change', () => {
      saveCompanionSetting({ nudgesEnabled: nudgesToggle.checked });
    });
  }

  /** Tab threshold slider — live label update + debounced save */
  const thresholdSlider = document.getElementById('ext-threshold-slider');
  const thresholdLabel  = document.getElementById('ext-threshold-label');
  if (thresholdSlider && thresholdLabel) {
    // Update label in real time as the slider moves
    thresholdSlider.addEventListener('input', () => {
      thresholdLabel.innerText = thresholdSlider.value;
    });
    // Persist to DB only when the user releases the slider
    thresholdSlider.addEventListener('change', () => {
      saveCompanionSetting({ tabCountThreshold: parseInt(thresholdSlider.value, 10) });
    });
  }

  /**
   * Real-time session metadata listener
   *
   * background.js broadcasts SESSION_METADATA_UPDATE on every tab switch
   * so the Insights grid updates immediately without waiting for the 5-second poll.
   *
   * COMPANION_NUDGE is broadcast when a nudge fires (tab overload or idle).
   * It is displayed in the nudge banner for 8 seconds, then auto-dismissed.
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SESSION_METADATA_UPDATE') {
      updateDisplay(message.data);
    } else if (message.type === 'COMPANION_NUDGE') {
      const banner    = document.getElementById('nudge-banner');
      const bannerTxt = document.getElementById('nudge-banner-text');
      if (banner && bannerTxt) {
        bannerTxt.innerText = message.message || 'DHeer says: check in with yourself!';
        banner.classList.remove('hidden');
        clearTimeout(window._nudgeBannerTimer);
        window._nudgeBannerTimer = setTimeout(() => banner.classList.add('hidden'), 8000);
      }
    }
  });

  /**
   * renderWorkspaces
   *
   * Renders the workspace list in the companion section.
   * Each item sends LAUNCH_WORKSPACE to background.js on click.
   */
  function renderWorkspaces(workspaces) {
    const list = document.getElementById('ext-workspaces-list');
    list.innerHTML = '';
    if (!workspaces || workspaces.length === 0) {
      list.innerHTML = '<div style="font-size:11px; color:var(--text-muted); font-style:italic; text-align:center; padding:12px 4px; background:var(--card-bg); border-radius:10px">No workspaces yet</div>';
      return;
    }

    workspaces.forEach(ws => {
      const div = document.createElement('div');
      div.className = 'workspace-item';
      // ws.name is user-controlled content — we use textContent to avoid XSS
      const nameEl = document.createElement('div');
      const labelEl = document.createElement('div');
      nameEl.style.cssText = 'font-size:13px; font-weight:700; color:var(--text)';
      labelEl.style.cssText = 'font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.1em; margin-top:2px';
      nameEl.textContent  = ws.name;
      labelEl.textContent = `${ws.urls.length} Resource${ws.urls.length !== 1 ? 's' : ''}`;

      const textWrap = document.createElement('div');
      textWrap.appendChild(nameEl);
      textWrap.appendChild(labelEl);

      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'padding:8px; background:rgba(192,133,82,0.1); border-radius:8px; color:var(--primary); flex-shrink:0';
      iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

      div.appendChild(textWrap);
      div.appendChild(iconWrap);
      div.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LAUNCH_WORKSPACE', urls: ws.urls });
      });
      list.appendChild(div);
    });
  }

  // Start the 5-second companion data poll and do an immediate fetch
  setInterval(fetchCompanionData, 5000);
  fetchCompanionData();

  // ── Todo section ───────────────────────────────────────────────────────

  window._dheerTodoFilter = 'all';

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

  document.getElementById('todo-add-btn').addEventListener('click', async () => {
    const title      = document.getElementById('todo-add-input').value.trim();
    if (!title) return;
    const priority    = document.getElementById('todo-add-priority').value;
    const statusIdRaw = document.getElementById('todo-add-status').value;
    const statusId    = statusIdRaw ? parseInt(statusIdRaw, 10) : undefined;

    try {
      const res = await fetch(`${API_BASE_URL}/api/todos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title, priority, statusId: statusId || null }),
        credentials: 'include',
      });
      if (res.ok) {
        document.getElementById('todo-add-input').value = '';
        await loadTodos();
      }
    } catch (err) {
      console.error('Failed to add todo', err);
    }
  });

  document.getElementById('todo-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('todo-add-btn').click();
  });

  // ── Bookmark save + login ──────────────────────────────────────────────
  saveBtn.addEventListener('click', saveBookmark);

  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${API_BASE_URL}/` });
  });
});

// ── Auth ───────────────────────────────────────────────────────────────────────

/**
 * checkAuth
 * Verifies session via /api/auth/user.
 * On success: hides login prompt, shows main content, loads recent bookmarks.
 * On failure: shows login prompt.
 */
async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/user`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      if (userDisplay) userDisplay.innerText = user.firstName || user.email || 'DHeer User';
      authCheck.style.display = 'none';
      mainContent.style.display = 'block';
      authCheck.classList.add('hidden');
      mainContent.classList.remove('hidden');
      loadRecentBookmarks();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('Auth check failed', err);
    showLogin();
  }
}

function showLogin() {
  authCheck.style.display = 'flex';
  mainContent.style.display = 'none';
  authCheck.classList.remove('hidden');
  mainContent.classList.add('hidden');
}

// ── Bookmark save ──────────────────────────────────────────────────────────────

/**
 * saveBookmark
 * Reads the save form and POSTs a new bookmark.
 * Shows status feedback and reloads the recent bookmarks list on success.
 */
async function saveBookmark() {
  if (saveBtn.disabled) return;

  const url   = urlInput.value.trim();
  const title = titleInput.value.trim();
  const tags  = tagsInput.value.trim();
  const note  = noteInput.value.trim();

  if (!url) {
    statusMsg.style.color = '#f87171';
    statusMsg.innerText   = '⚠ Please enter a URL';
    return;
  }

  saveBtn.disabled   = true;
  saveBtn.innerText  = 'Saving...';
  statusMsg.innerText = '';

  try {
    const tagList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const res = await fetch(`${API_BASE_URL}/api/bookmarks`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        url,
        title:     title || url,
        note:      note  || undefined,
        tags:      tagList,
        isPublic:  false,
        savedFrom: 'extension',
      }),
      credentials: 'include',
    });

    if (res.ok) {
      statusMsg.style.color = '#4ade80';
      statusMsg.innerText   = '✓ Saved!';
      tagsInput.value = '';
      noteInput.value = '';
      delete urlInput.dataset.userEdited;
      delete titleInput.dataset.userEdited;
      await loadRecentBookmarks();
      setTimeout(() => { statusMsg.innerText = ''; }, 2000);
    } else {
      const err = await res.json().catch(() => ({}));
      statusMsg.style.color = '#f87171';
      statusMsg.innerText   = err.message || `Error ${res.status}`;
    }
  } catch (err) {
    console.error('Save error', err);
    statusMsg.style.color = '#f87171';
    statusMsg.innerText   = 'Network error — check your connection';
  } finally {
    saveBtn.disabled  = false;
    saveBtn.innerText = 'Save to DHeer';
  }
}

// ── Recent bookmarks ───────────────────────────────────────────────────────────

/**
 * loadRecentBookmarks
 * Fetches the 5 most recent bookmarks and renders them in the recent list.
 */
async function loadRecentBookmarks() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookmarks`, { credentials: 'include' });
    if (!res.ok) return;

    const bookmarks = await res.json();
    const recent    = bookmarks.slice(0, 5);
    recentList.innerHTML = '';

    if (recent.length === 0) {
      recentList.innerHTML = '<div style="font-size:12px; color:var(--text-muted); font-style:italic">No bookmarks saved yet</div>';
      return;
    }

    recent.forEach(bm => {
      const div = document.createElement('div');
      div.style.cssText = 'background:var(--card-bg); border-radius:10px; padding:10px 12px; cursor:pointer; border:1px solid transparent;';
      div.addEventListener('mouseenter', () => div.style.borderColor = 'var(--primary)');
      div.addEventListener('mouseleave', () => div.style.borderColor = 'transparent');

      // Use textContent for user-controlled data to prevent XSS
      const titleEl  = document.createElement('div');
      const domainEl = document.createElement('div');
      titleEl.style.cssText  = 'font-size:12px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px';
      domainEl.style.cssText = 'font-size:10px; color:var(--text-muted)';
      titleEl.textContent    = bm.title || bm.url;
      try { domainEl.textContent = new URL(bm.url).hostname.replace('www.', ''); } catch { domainEl.textContent = bm.url; }

      div.appendChild(titleEl);
      div.appendChild(domainEl);
      div.addEventListener('click', () => chrome.tabs.create({ url: bm.url }));
      recentList.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load recent bookmarks', err);
  }
}

// ── Todo helpers ───────────────────────────────────────────────────────────────

/**
 * loadTodos
 * Fetches statuses + todos in parallel and renders the list.
 */
async function loadTodos() {
  try {
    const [statusRes, todoRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/todo-statuses`, { credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/todos`,          { credentials: 'include' }),
    ]);

    const statuses = statusRes.ok ? await statusRes.json() : [];
    const todos    = todoRes.ok   ? await todoRes.json()   : [];

    window._dheerTodos    = todos;
    window._dheerStatuses = statuses;

    // Populate the status select in the add form
    const statusSelect = document.getElementById('todo-add-status');
    if (statusSelect) {
      statusSelect.innerHTML = '<option value="">No status</option>';
      statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.id;
        opt.textContent = s.name;
        statusSelect.appendChild(opt);
      });
    }

    renderTodos(todos, statuses);
  } catch (err) {
    console.error('Failed to load todos', err);
  }
}

/**
 * renderTodos
 * Renders the filtered todo list in #todo-list.
 */
function renderTodos(todos, statuses) {
  const container = document.getElementById('todo-list');
  if (!container) return;

  const filtered = (window._dheerTodoFilter === 'all')
    ? todos
    : todos.filter(t => t.priority === window._dheerTodoFilter);

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:32px 0; color:var(--text-muted); font-size:12px; font-style:italic">No tasks here yet</div>';
    return;
  }

  filtered.forEach(todo => {
    const status = statuses.find(s => s.id === todo.statusId);
    const isDone = status?.name === 'Done';

    const item = document.createElement('div');
    item.className = `todo-item${isDone ? ' done' : ''}`;

    // Toggle-done button
    const check = document.createElement('div');
    check.className = `todo-check${isDone ? ' checked' : ''}`;
    check.title = isDone ? 'Mark as To Do' : 'Mark as Done';
    check.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    check.addEventListener('click', async () => {
      const doneStatus = statuses.find(s => s.name === 'Done');
      const todoStatus = statuses.find(s => s.name === 'To Do');
      const nextStatus = isDone ? (todoStatus ?? null) : (doneStatus ?? null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/todos/${todo.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ statusId: nextStatus?.id ?? null }),
          credentials: 'include',
        });
        if (res.ok) await loadTodos();
      } catch (err) {
        console.error('Failed to toggle todo', err);
      }
    });

    // Body
    const body = document.createElement('div');
    body.className = 'todo-body';
    const titleEl = document.createElement('div');
    titleEl.className = 'todo-title';
    titleEl.textContent = todo.title;

    const meta = document.createElement('div');
    meta.className = 'todo-meta';

    const badge = document.createElement('span');
    badge.className = `todo-priority-badge badge-${todo.priority || 'medium'}`;
    badge.textContent = (todo.priority || 'medium').charAt(0).toUpperCase() + (todo.priority || 'medium').slice(1);

    if (status) {
      const dot = document.createElement('span');
      dot.className = 'todo-status-dot';
      dot.style.background = status.color || '#555';
      const lbl = document.createElement('span');
      lbl.className   = 'todo-status-label';
      lbl.textContent = status.name;
      meta.appendChild(dot);
      meta.appendChild(lbl);
    }
    meta.prepend(badge);

    body.appendChild(titleEl);
    body.appendChild(meta);

    // Delete button
    const del = document.createElement('button');
    del.className = 'todo-delete-btn';
    del.title     = 'Delete';
    del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const res = await fetch(`${API_BASE_URL}/api/todos/${todo.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.ok) await loadTodos();
      } catch (err) {
        console.error('Failed to delete todo', err);
      }
    });

    item.appendChild(check);
    item.appendChild(body);
    item.appendChild(del);
    container.appendChild(item);
  });
}
