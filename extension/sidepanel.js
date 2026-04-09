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
 *  5. Companion      — session stats + workspace list (polled every 5s)
 *  6. Todo           — full todo list with add, filter, toggle-done, delete
 *  7. Bookmark save  — saves the active tab as a bookmark via POST /api/bookmarks
 *  8. Recent list    — shows last 5 bookmarks at the bottom of the bookmark tab
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
 *
 * Base URL of the deployed DHeer web app.  All fetch calls in the extension
 * target this URL to share authentication sessions with the web app.
 *
 * Impact if changed:
 *  - Pointing to a different origin would break session cookie sharing
 *    (cookies are origin-scoped)
 *  - In development, change this to 'http://localhost:5000' and reload the extension
 */
const API_BASE_URL = 'https://d-heer--hanvithsaia.replit.app';

/**
 * IS_POPUP_MODE
 *
 * True when the panel is opened as a detached popup window
 * (via chrome.windows.create with the sidepanel.html?mode=popup URL).
 * Controls whether the Popout or Dock button is shown.
 *
 * Impact if changed:
 *  - This flag drives all popup vs. sidepanel UI differences
 *  - Removing it would make the dock/popout buttons behave incorrectly
 */
const IS_POPUP_MODE = new URLSearchParams(window.location.search).get('mode') === 'popup';

// ── Element references ─────────────────────────────────────────────────────────
// These are cached once at module load time.
// If any element ID in sidepanel.html changes, the matching reference here must be updated.
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
 *
 * Fills the URL and title inputs from a Chrome Tab object.
 * Only overwrites the field if the user hasn't manually edited it
 * (tracked via `dataset.userEdited`).  This prevents overwriting
 * the user's typed content when they switch tabs in the background.
 *
 * @param tab — Chrome Tab object (may be undefined if no tab is active)
 *
 * Impact if changed:
 *  - Removing the `userEdited` guard would overwrite whatever the user typed
 *    every time the active tab changes
 */
function populateTabFields(tab) {
  if (!tab) return;
  if (!urlInput.dataset.userEdited)   urlInput.value   = tab.url   || '';
  if (!titleInput.dataset.userEdited) titleInput.value = tab.title || '';
}

/**
 * syncActiveTab
 *
 * Queries the currently active tab in the current window and calls
 * `populateTabFields` to pre-fill the save form.
 * Called once on DOMContentLoaded so the form is ready immediately.
 *
 * Impact if changed:
 *  - Removing this call means the form starts blank and requires manual URL entry
 */
async function syncActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  populateTabFields(tab);
}

// ── Initialization ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  // Pre-fill form with the current tab
  await syncActiveTab();

  // ── Input tracking ─────────────────────────────────────────────────────────

  /**
   * userEdited tracking
   *
   * When the user types in the URL or title fields, mark them as manually edited
   * so `populateTabFields` won't overwrite them on the next tab switch.
   * The flag is cleared on each save so the next tab switch auto-fills again.
   *
   * Impact if changed:
   *  - Removing these listeners causes the form to auto-reset to the active tab
   *    URL mid-edit, losing the user's input
   */
  urlInput.addEventListener('input',   () => { urlInput.dataset.userEdited   = 'true'; });
  titleInput.addEventListener('input', () => { titleInput.dataset.userEdited = 'true'; });

  saveBtn.addEventListener('click', () => {
    delete urlInput.dataset.userEdited;
    delete titleInput.dataset.userEdited;
  });

  // Re-fill when the user switches tabs
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    delete urlInput.dataset.userEdited;
    delete titleInput.dataset.userEdited;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    populateTabFields(tab);
  });

  // Re-fill when the active tab navigates to a new URL
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id === tabId) {
        populateTabFields(tab);
      }
    }
  });

  // ── Popup / Dock toggle ────────────────────────────────────────────────────

  /**
   * Popup / Dock button setup
   *
   * If IS_POPUP_MODE:
   *  - Show the "Dock" button which sends OPEN_SIDEPANEL to background.js
   *    (background re-enables and opens the sidepanel) then closes this popup.
   * If sidepanel mode:
   *  - Show the "Popout" button which:
   *    1. Sends CLOSE_SIDEPANEL to background.js (disables the sidepanel on the active tab)
   *    2. Opens sidepanel.html?mode=popup as a standalone Chrome popup window
   *
   * Impact if changed:
   *  - Changing 'OPEN_SIDEPANEL' or 'CLOSE_SIDEPANEL' message types must match
   *    background.js's onMessage handler switch cases
   *  - The popup dimensions (420×680) should match the sidepanel width for consistent UX
   */
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

    btnPopout.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' });
      const popupUrl = chrome.runtime.getURL('sidepanel.html?mode=popup');
      chrome.windows.create({ url: popupUrl, type: 'popup', width: 420, height: 680, focused: true });
    });
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  /**
   * checkAuth is called here to decide whether to show the login prompt
   * or the main content.  It is defined below (hoisted as a function declaration).
   */
  checkAuth();

  // ── Section navigation ─────────────────────────────────────────────────────

  /**
   * showSection
   *
   * Hides all main content sections and shows only the target section.
   * Also updates the active state of the navigation tab buttons.
   *
   * @param sectionId — One of: 'bookmark-section' | 'companion-section' | 'todo-section'
   *
   * Impact if changed:
   *  - Adding a new section requires adding its ID to `ALL_SECTIONS` and mapping
   *    it in `sectionToNav`
   *  - The section IDs must match the `id` attributes in sidepanel.html
   */
  const ALL_SECTIONS = ['bookmark-section', 'companion-section', 'todo-section'];
  const showSection = (sectionId) => {
    ALL_SECTIONS.forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');

    // Sync active tab button styling
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
    fetchCompanionData(); // Refresh companion data on tab switch
  });
  document.getElementById('nav-todo').addEventListener('click', () => {
    showSection('todo-section');
    loadTodos(); // Refresh todo list on tab switch
  });

  // ── Companion section ──────────────────────────────────────────────────────

  /**
   * updateDisplay
   *
   * Updates the companion Insights card (tab count, tab switches) with
   * data received from the background worker's session metadata.
   *
   * @param data — Session metadata object from background.js `sessionMetadata`
   *
   * Impact if changed:
   *  - If the DOM element IDs change in sidepanel.html, these updates silently fail
   *  - The format (plain integer) is intentional — no formatting for brevity
   */
  const updateDisplay = (data) => {
    if (!data) return;
    const tabCountEl    = document.getElementById('ext-tab-count');
    const tabSwitchesEl = document.getElementById('ext-tab-switches');
    if (tabCountEl)    tabCountEl.innerText    = data.tabCount    || 0;
    if (tabSwitchesEl) tabSwitchesEl.innerText = data.tabSwitches || 0;
  };

  /**
   * fetchCompanionData
   *
   * Fetches both session metadata (from background.js) and workspace list
   * (from the API) and updates the companion section UI.
   *
   * Called:
   *  - When the companion tab is clicked (via showSection listener)
   *  - Every 5 seconds via setInterval for real-time updates
   *  - Once immediately at startup
   *
   * Impact if changed:
   *  - Removing the workspace fetch means workspaces never appear in the extension
   *  - The 5-second poll interval matches companion-panel.tsx's poll interval for consistency
   */
  const fetchCompanionData = async () => {
    // Session metadata via chrome.runtime message (synchronous callback pattern)
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA' }, (data) => {
      updateDisplay(data);
    });

    // Workspace list from the web app API
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
   * SESSION_METADATA_UPDATE listener
   *
   * Listens for real-time broadcasts from background.js's `tabs.onActivated`
   * handler.  Each tab switch triggers a broadcast so the Insights card
   * updates immediately without waiting for the 5-second poll.
   *
   * Impact if changed:
   *  - Removing this listener means the card only updates on the 5-second poll
   *  - The message type 'SESSION_METADATA_UPDATE' must match background.js
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SESSION_METADATA_UPDATE') {
      updateDisplay(message.data);
    }
  });

  /**
   * renderWorkspaces
   *
   * Renders the workspace list in the companion section.
   * Each item is a clickable card that sends LAUNCH_WORKSPACE to background.js.
   *
   * @param workspaces — Array of Workspace objects from the API
   *
   * Impact if changed:
   *  - XSS note: `ws.name` is injected via innerHTML — a malicious workspace name
   *    could inject HTML.  Safe in practice since the user controls workspace names,
   *    but consider textContent or sanitization for higher-trust scenarios.
   *  - Clicking a workspace sends 'LAUNCH_WORKSPACE' to background.js's
   *    `launchWorkspace(urls)` function which calls `chrome.windows.create`
   */
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

  // Start the 5-second companion data poll and do an immediate fetch
  setInterval(fetchCompanionData, 5000);
  fetchCompanionData();

  // ── Todo section ───────────────────────────────────────────────────────────

  /**
   * window._dheerTodoFilter
   *
   * Global priority filter for the todo list.  Set to 'all' initially.
   * Updated by priority filter buttons.  Stored on `window` because the
   * filter buttons' click handlers and `renderTodos` are in different
   * scopes — window acts as the bridge.
   *
   * Possible values: 'all' | 'high' | 'medium' | 'low'
   *
   * Impact if changed:
   *  - Adding more filter values requires matching buttons in sidepanel.html
   *    and handling them in `renderTodos`'s filter clause
   */
  window._dheerTodoFilter = 'all';

  /**
   * Priority filter button listeners
   *
   * Each `.todo-priority-btn` in sidepanel.html has a `data-filter` attribute
   * set to 'all' | 'high' | 'medium' | 'low'.
   * On click:
   *  1. Updates `window._dheerTodoFilter`
   *  2. Resets all button styles then adds the active class for the clicked button
   *  3. Re-renders the todo list with the new filter applied
   *
   * Impact if changed:
   *  - The active class name ('active-all', 'active-high', etc.) must be
   *    defined in sidepanel.html's `<style>` block for visual feedback
   *  - `renderTodos` reads `window._dheerTodos` and `window._dheerStatuses`
   *    as the data source (set by `loadTodos`)
   */
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

  /**
   * Todo add button listener
   *
   * Reads the add-form inputs (title, priority, statusId), POSTs to the API,
   * clears the title input, and reloads the todo list on success.
   *
   * Impact if changed:
   *  - `statusId: statusId || null` ensures unselected status is stored as null,
   *    not 0 or empty string, which would cause a FK violation
   *  - Missing error display: currently only console.error on failure —
   *    adding a visible error message would improve UX
   */
  document.getElementById('todo-add-btn').addEventListener('click', async () => {
    const title      = document.getElementById('todo-add-input').value.trim();
    if (!title) return;
    const priority   = document.getElementById('todo-add-priority').value;
    const statusIdRaw = document.getElementById('todo-add-status').value;
    const statusId   = statusIdRaw ? parseInt(statusIdRaw) : undefined;

    try {
      const res = await fetch(`${API_BASE_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority, statusId: statusId || null }),
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

  /**
   * Enter key shortcut for the add-todo input
   * Simulates a click on the add button so users can submit without reaching for the mouse.
   *
   * Impact if changed:
   *  - Removing this listener only affects keyboard UX; mouse click still works
   */
  document.getElementById('todo-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('todo-add-btn').click();
  });

  // ── Bookmark save + login ──────────────────────────────────────────────────

  /**
   * Save bookmark button listener
   * Delegates to `saveBookmark()` which is defined as a hoisted function declaration below.
   */
  saveBtn.addEventListener('click', saveBookmark);

  /**
   * Login link click handler
   * Opens the main web app in a new tab so the user can authenticate.
   * After login, the extension can use the same session cookie.
   *
   * Impact if changed:
   *  - Preventing default is required to stop the anchor from navigating within the panel
   */
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${API_BASE_URL}/` });
  });
});

// ── Auth ───────────────────────────────────────────────────────────────────────

/**
 * checkAuth
 *
 * Verifies the user's session by calling /api/auth/user.
 * On success: hides the login prompt, shows the main content, loads recent bookmarks.
 * On failure (401 or network error): shows the login prompt.
 *
 * Called once from DOMContentLoaded.
 *
 * Impact if changed:
 *  - The `user.firstName || user.email` display name fallback handles users who
 *    signed up without a full name (common with email-only providers)
 *  - `authCheck.style.display` and `mainContent.style.display` are used alongside
 *    `classList` to ensure compatibility across CSS specificity rules in the extension
 */
async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/user`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      if (userDisplay) {
        userDisplay.innerText = user.firstName || user.email;
      }
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

/**
 * showLogin
 *
 * Reveals the authentication prompt and hides the main content.
 * Called when the session is absent or the auth check fails.
 *
 * Impact if changed:
 *  - Both `style.display` and `classList` are set to handle any possible initial state
 *  - Removing the `flex` display on authCheck would break its centering layout
 */
function showLogin() {
  authCheck.style.display = 'flex';
  mainContent.style.display = 'none';
  authCheck.classList.remove('hidden');
  mainContent.classList.add('hidden');
}

// ── Bookmark save ──────────────────────────────────────────────────────────────

/**
 * saveBookmark
 *
 * Reads the save form and POSTs a new bookmark to the web app API.
 * While saving:
 *  - Disables the button and changes its text to "Saving..."
 *  - Clears status message
 * On success:
 *  - Shows a green "✓ Saved" message for 2 seconds
 *  - Clears tags and note fields (URL/title are kept for re-saving with edits)
 *  - Reloads the recent bookmarks list
 * On failure:
 *  - Shows the error message in red
 *  - Re-enables the button immediately
 *
 * `savedFrom: 'extension'` is included in the payload so the server can tag
 * this bookmark as coming from the browser extension (useful for analytics).
 *
 * Impact if changed:
 *  - The `if (saveBtn.disabled) return` guard prevents double-submission
 *  - Removing the `savedFrom` field requires removing it from the server schema too
 */
async function saveBookmark() {
  if (saveBtn.disabled) return;

  saveBtn.disabled = true;
  const originalBtnText = saveBtn.innerText;
  saveBtn.innerText = 'Saving...';
  statusMsg.innerText = '';

  const data = {
    url:       urlInput.value,
    title:     titleInput.value,
    note:      noteInput.value,
    tags:      tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
    savedFrom: 'extension',
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/bookmarks`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
      credentials: 'include',
    });

    if (res.ok) {
      statusMsg.innerText = '✓ Saved Successfully';
      statusMsg.style.color = '#895737';

      tagsInput.value = '';
      noteInput.value = '';

      setTimeout(() => {
        statusMsg.innerText = '';
        saveBtn.innerText = originalBtnText;
        saveBtn.disabled = false;
      }, 2000);

      loadRecentBookmarks();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to save');
    }
  } catch (error) {
    statusMsg.innerText = '✕ ' + error.message;
    statusMsg.style.color = '#ef4444';
    saveBtn.innerText = originalBtnText;
    saveBtn.disabled = false;
  }
}

// ── Recent bookmarks ───────────────────────────────────────────────────────────

/**
 * loadRecentBookmarks
 *
 * Fetches the user's bookmark list and renders the 5 most recently created
 * ones in the "recent" section at the bottom of the bookmark tab.
 *
 * Impact if changed:
 *  - `slice(0, 5)` limits to 5 items — change this to show more/fewer recent bookmarks
 *  - This function is also called after a successful save to immediately show
 *    the newly saved bookmark at the top of the list
 */
async function loadRecentBookmarks() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookmarks`, { credentials: 'include' });
    if (res.ok) {
      const bookmarks = await res.json();
      renderRecent(bookmarks.slice(0, 5));
    }
  } catch (err) {
    console.error('Failed to load recents', err);
  }
}

/**
 * renderRecent
 *
 * Renders a list of bookmark items into the `recentList` container.
 * Each item shows the title (or URL if no title) and the domain name.
 * Clicking an item opens the URL in a new tab.
 *
 * @param bookmarks — Array of BookmarkResponse objects (title, url, tags, etc.)
 *
 * Impact if changed:
 *  - `new URL(b.url).hostname` can throw on invalid URLs — the try/catch fallback
 *    shows the raw URL instead, preventing a crash
 *  - XSS note: `.innerText` is used for title/domain — no HTML injection risk
 */
function renderRecent(bookmarks) {
  recentList.innerHTML = '';
  if (bookmarks.length === 0) {
    recentList.innerHTML = '<div class="empty-state">No bookmarks yet</div>';
    return;
  }

  bookmarks.forEach(b => {
    const div = document.createElement('div');
    div.className = 'recent-item';

    let hostname = b.url;
    try { hostname = new URL(b.url).hostname; } catch (_e) {}

    const titleEl = document.createElement('div');
    titleEl.className = 'recent-title';
    titleEl.textContent = b.title || b.url;

    const urlEl = document.createElement('div');
    urlEl.className = 'recent-url';
    urlEl.textContent = hostname;

    div.appendChild(titleEl);
    div.appendChild(urlEl);
    div.addEventListener('click', () => chrome.tabs.create({ url: b.url }));
    recentList.appendChild(div);
  });
}

// ── Todos ──────────────────────────────────────────────────────────────────────

/**
 * PRIORITY_ORDER
 *
 * Maps priority string values to sort order numbers.
 * Used by `renderTodos` to sort the todo list by priority before rendering.
 * Lower number = displayed first.
 *
 * Impact if changed:
 *  - Adding 'urgent' would require handling it in the filter buttons and badge styles
 *  - The `?? 1` fallback in sort places unknowns at "medium" level
 */
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * loadTodos
 *
 * Fetches both todos and todo-statuses from the API in parallel,
 * then:
 *  1. Populates the status dropdown in the add-form
 *  2. Renders the todo list
 *  3. Stores data in `window._dheerTodos` and `window._dheerStatuses`
 *     so priority filter re-renders can access it without a new fetch
 *
 * Called when the todo tab is activated and after any create/update/delete.
 *
 * Impact if changed:
 *  - `window._dheerTodos` / `window._dheerStatuses` are used by priority filter
 *    buttons' click handlers — removing them breaks the filter re-render
 *  - If either request fails, the function bails without updating the UI
 *    (a silent failure — consider showing an error state)
 */
async function loadTodos() {
  try {
    const [todosRes, statusesRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/todos`,         { credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/todo-statuses`, { credentials: 'include' }),
    ]);
    if (!todosRes.ok || !statusesRes.ok) return;

    const todos    = await todosRes.json();
    const statuses = await statusesRes.json();

    // Populate the status dropdown in the add form
    const statusSelect = document.getElementById('todo-add-status');
    statusSelect.innerHTML = '<option value="">No status</option>';
    statuses.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      statusSelect.appendChild(opt);
    });

    // Persist data for filter re-renders (accessed via window by priority filter handlers)
    window._dheerTodos    = todos;
    window._dheerStatuses = statuses;

    renderTodos(todos, statuses);
  } catch (err) {
    console.error('Failed to load todos', err);
  }
}

/**
 * renderTodos
 *
 * Renders the todo list for the current priority filter.
 * Reads `window._dheerTodoFilter` to determine which priority to show.
 * Sorts the filtered list by PRIORITY_ORDER before rendering.
 *
 * For each todo item renders:
 *  - A toggle-done circle (marks as "Done" / reverts to "To Do")
 *  - Title (with optional strikethrough if done)
 *  - Priority badge
 *  - Status dot + label
 *  - Delete button
 *
 * Toggle-done logic:
 *  - "Done"   status: looks up the status named "Done" and sets statusId to it
 *  - "To Do"  status: looks up the status named "To Do" and reverts to it
 *  ⚠️  This relies on the exact status names "Done" and "To Do" existing.
 *     If those defaults are deleted or renamed, the toggle silently sets statusId to null.
 *
 * @param todos    — Array of Todo objects (may be null; falls back to window._dheerTodos)
 * @param statuses — Array of TodoStatus objects (may be null; falls back to window._dheerStatuses)
 *
 * Impact if changed:
 *  - Changing `escapeHtml` usage for non-innerHTML content is redundant but harmless
 *  - Each PATCH for toggle-done is a full round-trip — consider optimistic UI
 */
function renderTodos(todos, statuses) {
  const allTodos    = todos    || window._dheerTodos    || [];
  const allStatuses = statuses || window._dheerStatuses || [];
  const filter      = window._dheerTodoFilter || 'all';

  const filtered = filter === 'all' ? allTodos : allTodos.filter(t => t.priority === filter);
  const sorted   = [...filtered].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1),
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

    /**
     * Toggle-done click handler
     *
     * Toggles a todo between "Done" and "To Do" states by PATCHing the statusId.
     * Reads the current done-state from `data-done` attribute set during render
     * to avoid re-fetching just to check current status.
     *
     * Impact if changed:
     *  - Relies on statuses named "Done" and "To Do" existing (seeded by default)
     *  - `targetStatusId = null` if neither name is found — todo loses its status
     */
    div.querySelector('.todo-check').addEventListener('click', async (e) => {
      const id             = parseInt(e.currentTarget.dataset.id);
      const currentlyDone  = e.currentTarget.dataset.done === 'true';
      const doneStatus     = allStatuses.find(s => s.name === 'Done');
      const toDoStatus     = allStatuses.find(s => s.name === 'To Do');
      const targetStatusId = currentlyDone ? (toDoStatus?.id ?? null) : (doneStatus?.id ?? null);
      try {
        await fetch(`${API_BASE_URL}/api/todos/${id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ statusId: targetStatusId }),
          credentials: 'include',
        });
        await loadTodos();
      } catch (err) {
        console.error('Toggle done failed', err);
      }
    });

    /**
     * Delete click handler
     *
     * DELETEs a todo by ID.  Reloads the list on success.
     * No confirmation dialog — deletion is immediate.
     *
     * Impact if changed:
     *  - Adding a confirm() dialog would improve safety but blocks the UI
     */
    div.querySelector('.todo-delete-btn').addEventListener('click', async (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      try {
        await fetch(`${API_BASE_URL}/api/todos/${id}`, { method: 'DELETE', credentials: 'include' });
        await loadTodos();
      } catch (err) {
        console.error('Delete todo failed', err);
      }
    });

    list.appendChild(div);
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

/**
 * escapeHtml
 *
 * Sanitizes a string for safe insertion into innerHTML.
 * Replaces &, <, >, and " with their HTML entity equivalents.
 *
 * @param str — Raw string to sanitize (may be null/undefined)
 * @returns    Sanitized string safe for innerHTML, or empty string if input is falsy
 *
 * Impact if changed:
 *  - Removing this function and using innerHTML with raw user data would create
 *    an XSS vulnerability — todo titles are user-controlled content
 *  - Single quotes (') are not escaped here — ensure they're not used in attribute contexts
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/**
 * capitalize
 *
 * Returns the input string with the first character uppercased.
 * Used to display priority labels ("high" → "High") in the priority badge.
 *
 * @param str — String to capitalize (may be falsy)
 * @returns    Capitalized string, or empty string if input is falsy
 *
 * Impact if changed:
 *  - Only the first character is changed; the rest are left as-is
 *  - For multi-word priorities (e.g. "very high"), only "V" would be capitalized
 */
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
