# DHeer — Features

This document lists every feature of the DHeer bookmark manager, what it does, and the value it delivers to the user.

---

## 1. User Authentication
**What it is:** Sign-in via Replit Auth (OpenID Connect). Session is stored server-side in PostgreSQL.
**Value:** Zero-friction login — users with a Replit account can authenticate in one click. No separate password to manage.

---

## 2. Bookmark Management (CRUD)
**What it is:** Create, read, update, and delete bookmarks. Each bookmark stores a URL, title, optional notes, tags, and a public/private flag.
**Value:** Gives users a structured, searchable personal library of URLs instead of relying on the browser's flat bookmark bar.

### 2a. Tags
**What it is:** Free-form labels attached to any bookmark. Many-to-many relationship via a join table.
**Value:** Flexible, non-hierarchical organisation — users can filter by multiple tags simultaneously.

### 2b. Public / Private Visibility
**What it is:** Toggle per bookmark. Public bookmarks appear in the community feed.
**Value:** Lets users share discoveries with the community without exposing their entire library.

---

## 3. Full-Text Search
**What it is:** SQL ILIKE search across title, URL, notes, and tag names. Filtered at database level.
**Value:** Instant recall — users can find any saved page by typing a keyword, tag, or partial URL.

---

## 4. Public Feed
**What it is:** A page showing all public bookmarks from every user, with author name and avatar attribution via correlated subqueries.
**Value:** Turns DHeer into a discovery platform — users find useful links shared by the community, not just their own saves.

---

## 5. Chrome Extension — Side Panel
**What it is:** A Manifest V3 Chrome extension that opens as a side panel. Auto-fills the current tab's URL and title into the save form.
**Value:** One-click bookmark saving without leaving the current page. No copy-paste required.

### 5a. Pop-out Chat Window
**What it is:** A button in the side panel that detaches the panel into a floating popup window. The side panel auto-closes on first pop-out; the user can reopen the panel alongside the popup.
**Value:** Frees up browser width while keeping DHeer accessible as a floating tool.

### 5b. Dock Button
**What it is:** Inside the popup window, a button that re-opens the side panel and closes the popup.
**Value:** Lets users switch back to the embedded panel workflow with one click.

---

## 6. Companion Panel
**What it is:** A tab inside the extension (and a card in the web app) showing real-time session metadata: open tab count, tab switches, session duration, top visited domain.
**Value:** Passive productivity awareness — users notice browsing patterns (too many tabs, long sessions) without installing a separate tracker.

### 6a. Nudge System
**What it is:** Desktop notifications + in-panel banners triggered by idle detection and tab overload thresholds. Configurable toggle and threshold slider.
**Value:** Gentle, opt-in focus reminders that help users stay on task.

---

## 7. Workspace Launcher
**What it is:** Named sets of URLs saved as workspaces. Clicking a workspace in the extension opens all URLs in a new Chrome window simultaneously.
**Value:** Instant context switching — a single click opens every tool needed for a project.

---

## 8. Todo List
**What it is:** A lightweight task manager inside the extension. Todos have a title, priority (low / medium / high), and a status (To Do / Done). Filterable by priority.
**Value:** Keeps the user's immediate action items visible alongside their bookmarks and companion data, without switching to a separate app.

---

## 9. Mobile Hamburger Navigation
**What it is:** On narrow screens the left sidebar collapses behind a hamburger button that opens it as a slide-over Sheet.
**Value:** The full desktop feature-set is accessible on mobile without a cluttered layout.

---

## 10. Inline Workspace Form
**What it is:** Workspace creation uses an inline form in the companion panel instead of a native `window.prompt()` dialog.
**Value:** Consistent look and feel — no jarring browser-native dialogs breaking the UI.
