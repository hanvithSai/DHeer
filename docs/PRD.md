# Product Requirements Document
## DHeer — Bookmark Manager & Browsing Companion

---

| Field | Detail |
|---|---|
| **Product** | DHeer |
| **Version** | 2.1 |
| **Status** | Living Document |
| **Owner** | Product |
| **Last Updated** | May 2026 |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Personas](#4-user-personas)
5. [User Stories](#5-user-stories)
6. [Feature Requirements](#6-feature-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Out of Scope](#8-out-of-scope)
9. [Risks & Dependencies](#9-risks--dependencies)
10. [Milestones](#10-milestones)
11. [Appendix](#11-appendix)

---

## 1. Executive Summary

DHeer is a personal bookmark manager with an integrated Chrome extension and a browsing companion that encourages focused, mindful work. Users save URLs from any page, organise them with tags, discover content in a public community feed, and get gentle nudges when their browsing habits drift — too many tabs, too much idle time.

The product is live on the web and in the Chrome extension sidebar. The current milestone focuses on stabilising the core loop (save → organise → discover), completing the companion nudge system, and improving the pop-out chat experience.

---

## 2. Problem Statement

### The Core Problem
Knowledge workers accumulate dozens of browser tabs and bookmarks with no meaningful system behind them. The browser's native bookmark bar is flat, unsearchable, and disconnected from productivity intent.

### Why Existing Solutions Fall Short

| Tool | Gap |
|---|---|
| Browser bookmarks | No tags, no notes, no sharing, no search by content |
| Read-later apps (Pocket, Instapaper) | Read-only focus; no community; no browsing awareness |
| Note-taking apps (Notion, Obsidian) | Heavy setup; not designed for quick URL capture |
| Tab managers | Manage open tabs, not saved references |

### Opportunity
A lightweight, opinionated bookmark manager that lives in the browser sidebar — capturing URLs in one click, surfacing them through search and tags, and passively monitoring browsing health — fills the gap no existing tool addresses end-to-end.

---

## 3. Goals & Success Metrics

### Product Goals

| # | Goal |
|---|---|
| G1 | Make saving a URL from any page a single action |
| G2 | Make finding a saved URL faster than a Google search |
| G3 | Surface community-curated links that users actually want to read |
| G4 | Reduce tab overload through awareness, not restriction |

### Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Bookmark save rate | ≥ 3 saves / active user / week | Server event log |
| Search-to-find rate | ≥ 70% of searches result in a click | Frontend analytics |
| Public feed engagement | ≥ 20% of logged-in users view public feed per week | Server log |
| Nudge opt-out rate | < 30% of users disable nudges within 7 days | companion_settings table |
| Extension retention | ≥ 60% of installers active after 14 days | Extension event |
| Side panel open rate | ≥ 1 open / active day / user | Extension event |

---

## 4. User Personas

### P1 — The Researcher
> *"I save 20 links a session. By end of day I can't find the one I need."*

- Heavy tab user (15–30 open at once)
- Reads deeply on one topic at a time
- Needs fast retrieval — searches by keyword, not hierarchy
- **Primary jobs:** Save quickly, find later, tag for context

### P2 — The Focused Worker
> *"I know I get distracted. I just need something to catch me before it gets bad."*

- Manages multiple projects across many tabs
- Responds well to non-intrusive reminders
- Values workspaces to context-switch cleanly
- **Primary jobs:** Launch project context, get nudged when drifting

### P3 — The Curator
> *"I love sharing good links. I want credit for finding things first."*

- Saves bookmarks with the intent to share
- Browses the community feed for discovery
- Cares about author attribution
- **Primary jobs:** Publish links, explore the public feed

### P4 — The Extension-First User
> *"I never want to leave the page I'm on just to save something."*

- Installs the Chrome extension first; may never visit the web app
- Values speed above all
- **Primary jobs:** Save current tab, view recent saves, quick companion check

---

## 5. User Stories

### Authentication
| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-01 | Visitor | Sign in with my Replit account in one click | I don't manage another password |
| US-02 | User | Stay signed in across sessions | I don't re-authenticate every visit |
| US-03 | User | Sign out from any page | I can switch accounts or use a shared device |

### Saving & Managing Bookmarks
| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-04 | User | Save the current tab from the extension sidebar | I don't need to copy-paste the URL |
| US-05 | User | Add tags when saving a bookmark | I can filter and find it later by topic |
| US-06 | User | Add a personal note to a bookmark | I remember why I saved it |
| US-07 | User | Mark a bookmark public or private | I control what the community sees |
| US-08 | User | Edit or delete any of my bookmarks | I keep my library clean and accurate |
| US-09 | User | Search across title, URL, note, and tags | I find any saved link within seconds |
| US-21 | User | Import bookmarks from a URL list or browser HTML export | I migrate my existing library without re-saving each link |

### Discovery
| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-10 | Visitor | Browse the public feed without logging in | I discover good content before committing to sign up |
| US-11 | User | See who shared a public bookmark | I can explore that person's other saves |
| US-12 | User | Filter my library by clicking a tag | I see all bookmarks on a topic at a glance |

### Workspaces
| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-13 | User | Group related URLs into a named workspace | I can launch my full project context in one click |
| US-14 | User | Launch a workspace from the extension | A new Chrome window opens with all my project tabs |
| US-15 | User | Delete a workspace I no longer need | My companion panel stays uncluttered |

### Companion & Nudges
| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-16 | User | See my open tab count and session duration at a glance | I'm aware of my browsing without tracking myself manually |
| US-17 | User | Get a nudge when I have too many tabs open | I'm reminded to close what I don't need |
| US-18 | User | Set my own tab threshold for nudges | The alerts match my personal working style |
| US-19 | User | Turn nudges off entirely | I'm not interrupted during deep focus |
| US-20 | User | Pop the extension out into a floating window | I keep DHeer visible on a second screen |

### Todos
| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-22 | User | Create a todo with a title, priority, and status | I track action items alongside my saved links |
| US-23 | User | Change a todo's status | I track progress through custom workflow stages |
| US-24 | User | Delete a todo I no longer need | My task list stays focused and relevant |

---

## 6. Feature Requirements

### Priority Key
| Label | Meaning |
|---|---|
| P0 | Must-have — product does not function without it |
| P1 | Should-have — core value proposition |
| P2 | Nice-to-have — improves experience |

---

### 6.1 Authentication

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| AUTH-01 | Sign in via Replit OpenID Connect | P0 | User clicks "Sign in", is redirected to Replit, returns authenticated |
| AUTH-02 | Persistent sessions | P0 | Refreshing the page keeps the user signed in for 7 days |
| AUTH-03 | User profile stored | P0 | Name, email, and avatar saved to the users table on first sign-in |
| AUTH-04 | All user APIs gated | P0 | Unauthenticated requests to protected routes return 401 |
| AUTH-05 | Sign out | P1 | Session destroyed; user redirected to the landing page |

---

### 6.2 Bookmark Management

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| BM-01 | Create bookmark | P0 | URL required; title and note optional; appears in list immediately |
| BM-02 | Edit bookmark | P1 | Any field updatable (URL, title, note, tags, visibility) |
| BM-03 | Delete bookmark | P1 | Bookmark and tag associations removed; list updates immediately |
| BM-04 | Bookmark list | P0 | Displays newest first; shows title, URL, tags, note preview |
| BM-05 | Full-text search | P1 | Searches title, URL, note, and tag names via SQL ILIKE |
| BM-06 | Tag filter | P1 | Clicking a sidebar tag narrows the list to matching bookmarks |
| BM-07 | Public / private toggle | P1 | Default private; public bookmarks appear in the community feed |
| BM-08 | Optimistic UI | P1 | Create / edit / delete updates UI before server confirmation |
| BM-09 | Source tracking | P2 | Records whether saved from web or extension |

---

### 6.3 Tags

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| TAG-01 | Add tags on save or edit | P1 | Comma-separated input; new tag names created automatically |
| TAG-02 | Many-to-many relationship | P0 | One bookmark can carry many tags; one tag can span many bookmarks |
| TAG-03 | Tag list in sidebar | P1 | All user tags listed; clicking any tag filters the bookmark list |
| TAG-04 | Badge display | P1 | Tags shown as coloured badges on each bookmark card |
| TAG-05 | Rename tag | P2 | Name update propagates to all associated bookmarks |
| TAG-06 | Delete tag | P2 | Tag removed; bookmarks retain all other tags |

---

### 6.4 Public Feed

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| PF-01 | Community page at /public | P1 | Shows all public bookmarks across all users |
| PF-02 | Accessible without login | P1 | /public and /api/public respond without a session cookie |
| PF-03 | Author attribution | P1 | Each card shows the saving user's display name and avatar |
| PF-04 | Empty state | P1 | Styled message shown when no public bookmarks exist |
| PF-05 | Bookmark count | P2 | Total public bookmark count displayed at top of feed |

---

### 6.5 Workspaces

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| WS-01 | Create workspace | P1 | Named group of one or more URLs; saved to DB |
| WS-02 | Delete workspace | P1 | Removed from DB; disappears from the list |
| WS-03 | Launch from web | P1 | Opens each URL as a new tab in the current browser window |
| WS-04 | Launch from extension | P1 | Opens a new Chrome window with all URLs loaded simultaneously |
| WS-05 | Inline creation form | P1 | Created via in-panel form; no native window.prompt() dialog |

---

### 6.6 DHeer Companion

#### Session Tracking
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| CP-01 | Open tab count | P1 | Accurate count shown; updates on tab create and remove events |
| CP-02 | Tab switch count | P1 | Increments on every tab activation event |
| CP-03 | Session duration | P1 | Time elapsed since the extension service worker started |
| CP-04 | Top domain | P1 | Most-visited hostname in the current session |
| CP-05 | Real-time updates | P1 | Stats refresh on every tab switch without a manual reload |

#### Nudge System
| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| NU-01 | Tab overload nudge | P1 | Desktop notification fires when open tabs exceed user threshold |
| NU-02 | Idle nudge | P1 | Notification fires after user is idle beyond the idle threshold |
| NU-03 | In-panel nudge banner | P1 | Banner appears in side panel for 8 s alongside OS notification |
| NU-04 | Nudge cooldown | P1 | Minimum 10 min between consecutive tab-overload notifications |
| NU-05 | Enable / disable nudges | P1 | Global toggle saved to DB and synced to extension at runtime |
| NU-06 | Tab count threshold | P1 | User-adjustable trigger (default: 10 tabs); controlled by a slider |
| NU-07 | Idle threshold | P2 | Configurable idle detection window (default: 5 minutes) |
| NU-08 | Nudge frequency | P2 | Low / Medium / High level controls notification aggressiveness |

---

### 6.7 Chrome Extension

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| EXT-01 | Side panel opens on icon click | P0 | Clicking toolbar icon opens the DHeer side panel |
| EXT-02 | Auto-fill current tab | P1 | URL and title pre-populated from the active tab |
| EXT-03 | Pop-out window | P1 | Button opens a floating popup; side panel auto-closes once |
| EXT-04 | Dock button | P1 | Button in popup re-opens the side panel and closes the popup |
| EXT-05 | Coexist mode | P1 | After first auto-close, user can reopen side panel alongside popup |
| EXT-06 | Recent bookmarks | P1 | Last 5 saved bookmarks shown in the Bookmarks tab |
| EXT-07 | Nudge settings in extension | P1 | Toggle and threshold slider in Companion tab; persists to DB |
| EXT-08 | Config persistence across restarts | P1 | Companion config saved to chrome.storage.local; restored on service worker wake |

---

### 6.8 Bookmark Import

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| IMP-01 | Import from URL list | P1 | User pastes newline-separated URLs; valid ones are batch-inserted |
| IMP-02 | Import from browser HTML export | P1 | Netscape HTML bookmark export parsed; title and URL extracted per link |
| IMP-03 | Deduplication | P1 | URLs already in the user's library are silently skipped |
| IMP-04 | Import result summary | P1 | Response reports how many bookmarks were imported and how many were duplicates |
| IMP-05 | Import dialog in web app | P1 | "Import" button in the header opens a dialog with paste area and file format selector |

---

### 6.9 Todo Management

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| TD-01 | Create todo | P1 | Title required; optional note, priority, and statusId |
| TD-02 | Update todo | P1 | Any field patchable (title, note, priority, statusId) |
| TD-03 | Delete todo | P1 | Todo removed; list updates immediately |
| TD-04 | Custom statuses | P1 | Users can define named, colour-coded statuses; three defaults seeded on first use |
| TD-05 | Todo panel — web | P1 | "My Tasks" in sidebar opens a sheet with full CRUD and status management |
| TD-06 | Todo panel — extension | P1 | Todos tab in side panel mirrors web panel functionality |

---

## 7. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Optimistic UI | Bookmark mutations appear in the list before server confirmation |
| NFR-02 | Search latency | Results visible within one render cycle of typing |
| NFR-03 | Extension stat refresh | Companion stats update on every tab switch (under 100 ms perceived) |
| NFR-04 | Session persistence | Sessions survive server restarts via PostgreSQL session store |
| NFR-05 | Public feed — no auth | /public responds to unauthenticated requests |
| NFR-06 | Nudge cooldown enforcement | No more than one tab-overload notification per 10-minute window |
| NFR-07 | Ownership enforcement | All user-data APIs verify the requester owns the resource |
| NFR-08 | Companion data stays local | Tab tracking lives in extension memory only — never sent to server |
| NFR-09 | Mobile usability | Full feature set accessible on narrow screens via hamburger sidebar |

---

## 8. Out of Scope

The following are explicitly not planned for the current milestone:

| Item | Rationale |
|---|---|
| Firefox / Safari extension | Manifest V3 migration complexity; Chrome is the primary platform |
| Nested folders / collections | Conflicts with the flat, tag-based mental model |
| Collaborative workspaces | Multi-user editing introduces significant backend complexity |
| Browser history sync | Privacy-sensitive; outside current product scope |
| Offline mode | Requires service worker caching strategy; separate workstream |
| Native mobile app | Web and extension cover the primary use case today |
| Monetisation / payments | Not planned for the current milestone |

---

## 9. Risks & Dependencies

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Replit Auth OIDC unavailable outside Replit | High | Critical | Document migration path in Engineering.md; build auth abstraction layer |
| R2 | Chrome changes side panel API behaviour | Medium | High | Monitor Chrome release notes; isolate panel logic in background.js |
| R3 | GITHUB_TOKEN not available in isolated build environments | High | Medium | Use GitHub API from main agent where token is accessible |
| R4 | Service worker terminated mid-session by Chrome | Medium | Medium | ✅ Mitigated — config persisted to chrome.storage.local on every UPDATE_CONFIG; restored on service worker restart via initSession() |
| R5 | Tab overload nudges feel intrusive to users | Medium | Medium | Default threshold of 10; 10-min cooldown; easy one-click disable |

### External Dependencies

| Dependency | Owner | Risk if Unavailable |
|---|---|---|
| Replit Auth (OIDC) | Replit | Users cannot sign in |
| Replit PostgreSQL | Replit | All data unavailable |
| Chrome Side Panel API | Google | Extension side panel breaks |
| chrome.idle API | Google | Idle nudges stop firing |
| chrome.notifications API | Google | Desktop nudges stop firing |

---

## 10. Milestones

| Milestone | Description | Status |
|---|---|---|
| M1 — Core MVP | Bookmark CRUD, tags, search, Replit Auth, PostgreSQL | ✅ Complete |
| M2 — Extension v1 | Side panel, companion stats, workspace launcher | ✅ Complete |
| M3 — Sprint 1 | All 11 sprint tasks: nudge system, public feed attribution, search ILIKE, mobile nav, pop-out window | ✅ Complete |
| M4 — Documentation | PRD, Engineering, Features, error log in docs/ pushed to GitHub documentation branch | ✅ Complete |
| M5 — Import & Todos | Bookmark import (URL list + HTML), Todo management (web + extension), config persistence | ✅ Complete |
| M6 — Auth Portability | Decouple from Replit OIDC; support generic OIDC or local auth | 📋 Planned |
| M7 — Extension v2 | Configurable backend URL; Firefox support | 📋 Planned |

---

## 11. Appendix

### A. Data Models

```
users(id, email, first_name, last_name, profile_image_url)
sessions(sid, sess, expire)

bookmarks(id, userId, url, title, note, isPublic, createdAt, updatedAt, savedFrom)
tags(id, userId, name)
bookmark_tags(id, bookmarkId, tagId)

workspaces(id, userId, name, urls[], createdAt)
companion_settings(id, userId, trackingEnabled, nudgesEnabled,
                   tabCountThreshold, idleThreshold, nudgeFrequency)

todo_statuses(id, userId, name, color, sortOrder)
todos(id, userId, title, note, priority, statusId, createdAt, updatedAt)
```

### B. API Surface

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/auth/user | Required | Current user profile |
| GET | /api/bookmarks | Required | List bookmarks; supports ?search= and ?tag= |
| POST | /api/bookmarks | Required | Create a bookmark |
| GET | /api/bookmarks/:id | Required | Get a single bookmark by ID |
| PUT | /api/bookmarks/:id | Required | Update a bookmark |
| DELETE | /api/bookmarks/:id | Required | Delete a bookmark |
| POST | /api/bookmarks/import | Required | Import bookmarks from URL list or browser HTML export |
| GET | /api/tags | Required | List all user tags |
| PATCH | /api/tags/:id | Required | Rename a tag |
| DELETE | /api/tags/:id | Required | Delete a tag |
| GET | /api/public/bookmarks | None | All public bookmarks with author attribution |
| GET | /api/workspaces | Required | List workspaces |
| POST | /api/workspaces | Required | Create a workspace |
| DELETE | /api/workspaces/:id | Required | Delete a workspace |
| GET | /api/companion/settings | Required | Get companion config |
| PATCH | /api/companion/settings | Required | Update one or more companion settings |
| GET | /api/todo-statuses | Required | List todo status definitions (seeds 3 defaults on first call) |
| POST | /api/todo-statuses | Required | Create a custom status |
| PATCH | /api/todo-statuses/:id | Required | Update a status name, colour, or sort order |
| DELETE | /api/todo-statuses/:id | Required | Delete a status; associated todos set statusId to null |
| GET | /api/todos | Required | List all todos for the user |
| POST | /api/todos | Required | Create a todo |
| PATCH | /api/todos/:id | Required | Partially update a todo |
| DELETE | /api/todos/:id | Required | Delete a todo |

### C. Extension Message Protocol

| Message Type | Direction | Purpose |
|---|---|---|
| GET_SESSION_METADATA | Panel → Background | Request current tab and session stats |
| SESSION_METADATA_UPDATE | Background → Panel | Push live stats on every tab switch |
| UPDATE_CONFIG | Panel → Background | Sync companion settings to service worker and persist to chrome.storage.local |
| COMPANION_NUDGE | Background → Panel | Show in-panel nudge banner for 8 seconds |
| LAUNCH_WORKSPACE | Panel → Background | Open all workspace URLs in a new Chrome window |
| POPUP_CREATED | Panel → Background | Notify background that popup opened; trigger side panel close |
| OPEN_SIDEPANEL | Popup → Background | Re-open side panel and close popup |

### D. Design Tokens

| Token | Hex | Usage |
|---|---|---|
| Deep Brown | #5e3023 | Primary actions, headings |
| Warm Brown | #895737 | Secondary accents |
| Tan | #c08552 | Borders, highlights |
| Soft Sand | #dab49d | Muted text, badges |
| Cream | #f3e9dc | Backgrounds, cards |
