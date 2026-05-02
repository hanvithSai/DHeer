# DHeer — Sprint Backlog
**Generated:** May 2, 2026  
**Based on:** PRD.md v1.1 × codebase audit  
**App status:** Server running clean on port 5000. All previously reported bugs patched.

---

## PRD Cross-Check Summary

| Section | ID | Feature | Status |
|---|---|---|---|
| Auth | AUTH-01…05 | All auth features | ✅ Done |
| Bookmarks | BM-01…09 | Full CRUD, search, tags, timestamps, source tracking | ✅ Done |
| Tags | TAG-01…07 | Create, rename, delete, filter, badges | ✅ Done |
| Public Feed | PF-01, PF-02 | `/public` route, no auth required | ✅ Done |
| Public Feed | **PF-03** | **User attribution (name/avatar) on public bookmarks** | ❌ Missing |
| Workspaces | WS-01…05 | Create, delete, launch (web + extension), persistence | ✅ Done (UX issue below) |
| Companion | CP-01…02 | Tab count, tab switch tracking | ✅ Done |
| Companion | CP-03 | Domain frequency tracked | ⚠️ Tracked but never displayed |
| Companion | CP-04 | Session timer recorded | ⚠️ Tracked but never displayed |
| Companion | CP-05, CP-06 | Idle detection, real-time broadcast | ✅ Done |
| Nudges | NU-01…03 | Tab overload, cooldown, idle nudge | ⚠️ Broken — manifest missing permissions |
| Nudges | NU-04, NU-05 | Enable/disable nudges, tab threshold (web UI only) | ✅ Done (web) |
| Nudges | **NU-06** | **Idle threshold — stored but no UI control** | ❌ Missing UI |
| Nudges | **NU-07** | **Nudge frequency (Low/Med/High) — stored but no UI control** | ❌ Missing UI |
| Settings | — | trackingEnabled — stored but no UI control | ❌ Missing UI |
| Extension | — | Companion tab: Top domain insight | ❌ Missing UI |
| Extension | — | Companion tab: Session duration | ❌ Missing UI |
| Extension | — | Companion tab: Nudge settings inline | ❌ Missing (web-only) |
| Extension | — | COMPANION_NUDGE in-panel display handler | ❌ Missing |
| Extension | — | `idle` + `notifications` permissions in manifest.json | 🔴 Critical bug |
| Workspaces | — | Creation via `window.prompt()` | ⚠️ Works but poor UX |
| Mobile | — | No hamburger/mobile sidebar toggle | ❌ Missing |

---

## Sprint Tasks (Linear Execution Order)

---

### T001 — Fix manifest.json: Add missing `idle` and `notifications` permissions
**Priority:** Critical — nudge system completely non-functional without these  
**File:** `extension/manifest.json`  
**What to do:**  
Add `"idle"` and `"notifications"` to the `permissions` array.  
`chrome.idle.onStateChanged` silently does nothing without `"idle"`.  
`chrome.notifications.create` silently fails without `"notifications"`.  
**Acceptance:** manifest has both permissions; idle nudge + desktop notification fire correctly.

---

### T002 — Public feed user attribution (PF-03)
**Priority:** High — PRD requirement, currently broken  
**Files:** `server/storage.ts`, `shared/schema.ts`, `client/src/components/bookmark-card.tsx`, `client/src/pages/public-bookmarks.tsx`  
**What to do:**  
1. In `storage.getPublicBookmarks()`, JOIN to `users` table and add `authorName` and `authorAvatar` fields to the returned rows.  
2. Update `BookmarkResponse` type in `shared/schema.ts` to include optional `authorName?: string | null` and `authorAvatar?: string | null`.  
3. In `BookmarkCard`, when `authorName` is present (public feed context), show a small avatar + name chip at the bottom of the card.  
**Acceptance:** Each card on the `/public` page shows the saving user's name and avatar.

---

### T003 — Companion panel: Add missing nudge setting controls (NU-06, NU-07, trackingEnabled)
**Priority:** High — three stored settings have no UI  
**File:** `client/src/components/companion-panel.tsx`  
**What to do:**  
Inside the "Nudge Settings" card, add:  
1. **Tracking toggle** (`trackingEnabled`) — Switch labeled "Enable Companion Tracking". When off, the companion still works but the mascot stops displaying insights (future-proofing).  
2. **Idle threshold slider** (`idleThreshold`) — Slider from 60 to 900 seconds, labeled "Idle Detection (seconds)" with the current value shown. Updates via `updateSettings.mutate({ idleThreshold: val })`. Also sends `UPDATE_CONFIG` to the extension so background.js updates its in-memory threshold immediately.  
3. **Nudge frequency selector** (`nudgeFrequency`) — Three toggle buttons: Low / Medium / High. Highlights the active level. Updates via `updateSettings.mutate({ nudgeFrequency: val })`.  
**Acceptance:** All three controls render, save to the DB, and propagate to the extension.

---

### T004 — Companion panel: Show session duration and top domain
**Priority:** Medium — CP-04 display, CP-03 display  
**Files:** `client/src/components/companion-panel.tsx`, `extension/sidepanel.html`, `extension/sidepanel.js`  
**What to do:**  
1. In `companion-panel.tsx`, expand the Insights card grid from 2 columns to show:
   - Tabs Open (existing)
   - Switches (existing)
   - Session Duration (calculated from `sessionData.sessionStartTime`)
   - Top Domain (the highest-count key from `sessionData.domainFrequency`)
2. Update `sessionData` state to include `sessionStartTime: 0` and `domainFrequency: {}`.
3. In `extension/sidepanel.html`, expand the `.insight-card` in the companion section to show 4 stats (2×2 grid or 4-column strip): Tabs, Switches, Duration, Top Domain.
4. In `extension/sidepanel.js`, update `updateDisplay()` to populate the two new elements.
**Acceptance:** Both the web companion panel and the extension companion tab show session duration and the most-visited domain.

---

### T005 — Extension companion tab: Add inline nudge settings
**Priority:** Medium — PRD 4.2 says nudge settings should be inline in the companion tab  
**Files:** `extension/sidepanel.html`, `extension/sidepanel.js`  
**What to do:**  
1. In `sidepanel.html`, add a "Nudge Settings" section inside `#companion-section` below the workspaces list, containing:
   - A toggle row "Enable Nudges" (checkbox or styled toggle)
   - A number input "Tab Threshold" (min 2, max 50)
2. In `sidepanel.js`:
   - On companion section open, fetch `/api/companion/settings` and populate the controls.
   - On change, PATCH `/api/companion/settings` AND send `UPDATE_CONFIG` to background.js so both the server and the in-memory config are updated simultaneously.
**Acceptance:** Toggling nudges and changing the threshold in the extension updates both the DB and background.js config.

---

### T006 — Extension: Handle `COMPANION_NUDGE` message in sidepanel
**Priority:** Medium — in-panel nudge display is part of the nudge system  
**Files:** `extension/sidepanel.js`, `extension/sidepanel.html`  
**What to do:**  
1. In `sidepanel.html`, add a `#nudge-banner` element (hidden by default) styled as an amber/warm-brown alert strip at the top of `<main>`, with an `×` dismiss button.
2. In `sidepanel.js`, inside the `chrome.runtime.onMessage` listener, add a `COMPANION_NUDGE` case that:
   - Sets `#nudge-banner`'s text content to `message.message`
   - Reveals the banner (remove `.hidden`)
   - Auto-hides after 8 seconds or on dismiss click
**Acceptance:** When background.js fires a nudge, the sidepanel shows the message in the in-panel banner for 8 seconds.

---

### T007 — Replace `window.prompt()` workspace creation with an inline form
**Priority:** Medium — UX improvement, also breaks in some browsers/contexts  
**File:** `client/src/components/companion-panel.tsx`  
**What to do:**  
Replace the two chained `prompt()` calls with a collapsible inline form inside the companion panel.  
Form fields:
- Workspace name (text input)
- URLs (textarea, one per line — split on newlines OR commas)
- Save + Cancel buttons  
Use local state `[showForm, setShowForm]` to toggle visibility.  
On save, split/trim the URL textarea into an array, filter empty lines, and call `createWorkspace.mutate({ name, urls })`.  
**Acceptance:** Workspace creation works without any native dialog; textarea accepts URLs one-per-line or comma-separated.

---

### T008 — Mobile: Add hamburger menu / sidebar toggle
**Priority:** Medium — sidebar is hidden on mobile (`hidden md:flex`) with no way to open it  
**Files:** `client/src/pages/home-page.tsx`, `client/src/pages/public-bookmarks.tsx`, `client/src/components/sidebar.tsx`  
**What to do:**  
1. Add a hamburger `<Button>` in the page header (visible only on mobile, `md:hidden`) that toggles a `<Sheet side="left">` containing the full `<Sidebar>`.  
2. The Sheet should use the same sidebar component so tag navigation, companion trigger, and todo trigger all work.  
3. Apply to both `home-page.tsx` and `public-bookmarks.tsx`.  
**Acceptance:** On a mobile-width viewport, tapping the hamburger opens the full sidebar in a drawer; all sidebar features work inside it.

---

### T009 — Public feed: Show empty state + bookmark count
**Priority:** Low — UX polish  
**File:** `client/src/pages/public-bookmarks.tsx`  
**What to do:**  
1. The current empty state is a plain text string. Replace it with a styled empty-state card matching the home-page empty state design (icon, heading, subtext, CTA to sign in and share).  
2. Add bookmark count below the "Discover" heading ("X bookmarks shared by the community") mirroring the home-page pattern.  
**Acceptance:** Empty state and count match the home-page visual style.

---

### T010 — Bookmark card: `data-testid` attributes audit
**Priority:** Low — test coverage / automation readiness  
**Files:** `client/src/components/bookmark-card.tsx`, `client/src/components/add-bookmark-dialog.tsx`  
**What to do:**  
Add `data-testid` attributes to all interactive elements and dynamic data elements in `BookmarkCard` and `AddBookmarkDialog` that are currently missing them, following the `{action}-{target}-{id}` convention from the fullstack-js skill.  
**Acceptance:** Every button, input, link, and displayed value in both components has a unique `data-testid`.

---

### T011 — In-memory search → SQL ILIKE (scalability)
**Priority:** Low — non-functional requirement; works today but won't scale  
**File:** `server/storage.ts`  
**What to do:**  
In `getBookmarks()`, replace the post-query in-memory filter with a Drizzle `where` clause using `sql\`... ILIKE \${'%' + search + '%'}\`` across `title`, `url`, and `note` columns, plus a subquery or JOIN filter for tag name matches.  
Keep the `tag` filter in-memory (it's already exact-match and cheap).  
**Acceptance:** A search with 10,000+ bookmarks returns results in < 100ms. No behavioral change for users.

---

## Done (no action needed)

The following PRD features are fully implemented and working:

- All 5 auth features (AUTH-01…05)
- All 9 bookmark CRUD features (BM-01…09)
- All 7 tag features (TAG-01…07)
- Public feed route + unauthenticated access (PF-01, PF-02)
- All 5 workspace features (WS-01…05)
- Tab + switch tracking + broadcast (CP-01, CP-02, CP-06)
- Idle detection listener (CP-05)
- Tab overload nudge + cooldown (NU-01, NU-02)
- Idle nudge trigger (NU-03)
- Nudge enable/disable toggle (NU-04) — web only
- Tab count threshold slider (NU-05) — web only
- Full Chrome Extension MV3 architecture (background.js, sidepanel.html/js, manifest)
- Extension: Bookmark save with auto-fill from active tab (BM-01)
- Extension: Recent bookmarks list
- Extension: Workspace list + launch
- Extension: Tab tracking stats display (partial — T004 expands it)
- Extension: Popup/dock toggle
- Full Todo system (web + extension): CRUD, statuses, priorities, toggle-done
- All API routes from PRD section 5
- FK constraint: `todos.statusId` ON DELETE SET NULL
- Session management via PostgreSQL
- All JSDoc comments across all major files
