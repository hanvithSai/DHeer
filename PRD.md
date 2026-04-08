# DHeer — Product Requirements Document

**Version:** 1.0  
**Date:** April 2026  
**Status:** Living Document

---

## 1. Product Overview

DHeer is a full-stack bookmark manager with an integrated Chrome extension. It helps users save, organize, and discover URLs while a virtual deer mascot companion monitors browsing habits and nudges users toward healthier productivity patterns.

### Vision

Give every user a smart, private, and delightful place to save what matters on the web — plus a friendly companion that helps them stay focused without feeling surveilled.

### Design Language

DHeer uses a warm "Deer Brown" palette throughout all surfaces:

| Token | Hex | Usage |
|---|---|---|
| Deep Brown | `#5e3023` | Primary actions, headers |
| Warm Brown | `#895737` | Secondary accents |
| Tan | `#c08552` | Borders, highlights |
| Soft Sand | `#dab49d` | Muted text, badges |
| Cream | `#f3e9dc` | Backgrounds, cards |

---

## 2. User Personas

| Persona | Description |
|---|---|
| **The Researcher** | Saves dozens of links per session; needs fast tagging and search |
| **The Focused Worker** | Values focus nudges; uses workspaces to context-switch cleanly |
| **The Curator** | Makes bookmarks public and enjoys browsing the community feed |
| **The Extension User** | Saves links without leaving the current page via Chrome side panel |

---

## 3. Functional Requirements

### 3.1 Authentication

| ID | Feature | Detail |
|---|---|---|
| AUTH-01 | Sign in via Replit OIDC | One-click login using the user's existing Replit account |
| AUTH-02 | Persistent sessions | Sessions stored in PostgreSQL via `connect-pg-simple`; survive page reloads |
| AUTH-03 | User profile | Stores `id`, `email`, `name`, and `profileImageUrl` |
| AUTH-04 | Protected routes | All bookmark, tag, workspace, and companion APIs require an active session |
| AUTH-05 | Logout | Terminates session and redirects to landing/login page |

---

### 3.2 Bookmark Management

| ID | Feature | Detail |
|---|---|---|
| BM-01 | Create bookmark | Save a URL with an optional title and note |
| BM-02 | Edit bookmark | Update URL, title, note, tags, or public/private status |
| BM-03 | Delete bookmark | Permanently remove a bookmark and its tag associations |
| BM-04 | View bookmark list | Paginated/scrollable list sorted by creation date (newest first) |
| BM-05 | Full-text search | Filter by title, URL, or note in real time |
| BM-06 | Tag filter | Click a tag in the sidebar to show only bookmarks with that tag |
| BM-07 | Public/private toggle | Each bookmark is individually public or private |
| BM-08 | Source tracking | Records whether a bookmark was saved from `web` or `extension` |
| BM-09 | Timestamps | `createdAt` and `updatedAt` maintained automatically |

**Data model:**
```
bookmarks(id, userId, url, title, note, isPublic, createdAt, updatedAt, savedFrom)
```

---

### 3.3 Tags & Organization

| ID | Feature | Detail |
|---|---|---|
| TAG-01 | Add tags on save | Tags entered when creating or editing a bookmark |
| TAG-02 | Auto-create tags | New tag names are created on the fly; no separate tag-creation step |
| TAG-03 | Many-to-many | One bookmark can have multiple tags; one tag can span many bookmarks |
| TAG-04 | Sidebar tag list | All user tags listed in the left sidebar for quick filtering |
| TAG-05 | Rename tag | Update a tag name; change propagates to all associated bookmarks |
| TAG-06 | Delete tag | Remove a tag; bookmarks remain but lose that association |
| TAG-07 | Badge display | Tags shown as colored badges on each bookmark card |

**Data models:**
```
tags(id, userId, name)
bookmark_tags(id, bookmarkId, tagId)
```

---

### 3.4 Public Feed

| ID | Feature | Detail |
|---|---|---|
| PF-01 | Community page | `/public` route shows all bookmarks marked public, across all users |
| PF-02 | No auth required | Public feed is accessible without logging in |
| PF-03 | Attribution | Each public bookmark shows the saving user's name/avatar |

---

### 3.5 Workspaces

Workspaces let users group related URLs and launch them all at once.

| ID | Feature | Detail |
|---|---|---|
| WS-01 | Create workspace | Named collection of one or more URLs |
| WS-02 | Delete workspace | Permanently removes the workspace (URLs are not bookmarks) |
| WS-03 | Launch workspace (web) | Opens every URL in the workspace as new browser tabs |
| WS-04 | Launch workspace (extension) | Opens a new Chrome window with all workspace URLs loaded simultaneously |
| WS-05 | Persistence | Workspaces stored in PostgreSQL as a `jsonb` URL array |

**Data model:**
```
workspaces(id, userId, name, urls[], createdAt)
```

---

### 3.6 DHeer Companion

The Companion is a virtual deer mascot living in the sidebar and Chrome extension. It observes browsing behavior locally and provides optional nudges.

#### 3.6.1 Productivity Tracking (Extension — background.js)

| ID | Feature | Detail |
|---|---|---|
| CP-01 | Tab count tracking | Counts all open Chrome tabs in real time; updated on create/remove/update events |
| CP-02 | Tab switch counting | Increments a switch counter every time the active tab changes |
| CP-03 | Domain frequency | Tracks how often each domain is visited in the current session |
| CP-04 | Session timer | Records session start time to calculate session duration |
| CP-05 | Idle detection | Uses Chrome's `idle` API to detect when the user stops interacting |
| CP-06 | Real-time broadcast | Broadcasts `SESSION_METADATA_UPDATE` to the side panel on every tab switch |

#### 3.6.2 Nudges

| ID | Feature | Detail |
|---|---|---|
| NU-01 | Tab overload alert | Chrome notification fires when open tabs exceed the user's threshold |
| NU-02 | Nudge cooldown | Minimum 10-minute gap between tab-overload notifications |
| NU-03 | Idle nudge | Encourages a break or re-engagement after the user is idle |
| NU-04 | Enable/disable nudges | User can globally toggle all nudges on or off |
| NU-05 | Tab count threshold | User sets the tab count that triggers overload alerts (default: 10) |
| NU-06 | Idle threshold | Configurable idle detection window (default: 300 seconds / 5 minutes) |
| NU-07 | Nudge frequency | Three levels — Low, Medium, High — controlling notification aggressiveness |

#### 3.6.3 Companion Settings

Stored per user in the database and synced to the extension at runtime.

| Field | Type | Default | Description |
|---|---|---|---|
| `trackingEnabled` | boolean | `true` | Master switch for all companion tracking |
| `nudgesEnabled` | boolean | `true` | Master switch for all nudge notifications |
| `tabCountThreshold` | integer | `10` | Open-tab count that triggers an overload nudge |
| `idleThreshold` | integer | `300` | Seconds of inactivity before idle nudge |
| `nudgeFrequency` | string | `"medium"` | Nudge aggressiveness: `low`, `medium`, `high` |

**Data model:**
```
companion_settings(id, userId, trackingEnabled, nudgesEnabled, tabCountThreshold, idleThreshold, nudgeFrequency)
```

---

## 4. Chrome Extension

### 4.1 Manifest V3 Architecture

| Component | File | Purpose |
|---|---|---|
| Background service worker | `background.js` | Tracks tabs, runs idle detection, sends nudges |
| Side panel UI | `sidepanel.html` + `sidepanel.js` | Dual-tab interface: Bookmarks + Companion |
| Action icon | `assets/icon*.png` | Clicking the toolbar icon opens the side panel |

### 4.2 Side Panel Features

| Tab | Feature | Detail |
|---|---|---|
| Bookmarks | Save current tab | One-click save of the active tab's URL and title |
| Bookmarks | Recent bookmarks | Shows the user's most recent saved links |
| Companion | Live session stats | Tab count, tab switches, session duration — updated in real time |
| Companion | Top domain | Most-visited domain in the current session |
| Companion | Workspaces | Lists all workspaces with a "Launch" button each |
| Companion | Nudge settings | Toggle nudges and adjust tab threshold inline |

### 4.3 Extension ↔ Background Messaging

| Message Type | Direction | Payload | Purpose |
|---|---|---|---|
| `GET_SESSION_METADATA` | Panel → BG | — | Request current tracking stats |
| `SESSION_METADATA_UPDATE` | BG → Panel | `sessionMetadata` | Push live stats on each tab switch |
| `UPDATE_CONFIG` | Panel → BG | `config` object | Sync companion settings to background |
| `COMPANION_NUDGE` | BG → Panel | `message` string | Display a nudge in the panel UI |
| `LAUNCH_WORKSPACE` | Panel → BG | `urls[]` | Open workspace in a new Chrome window |

---

## 5. API Reference

All API routes live under the `/api/` prefix. Protected routes require an authenticated session.

### Bookmarks

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/bookmarks` | Required | List bookmarks; supports `?search=` and `?tag=` query params |
| `POST` | `/api/bookmarks` | Required | Create a bookmark (body: `url`, `title?`, `note?`, `isPublic?`, `tags?[]`) |
| `GET` | `/api/bookmarks/:id` | Required | Get a single bookmark by ID |
| `PUT` | `/api/bookmarks/:id` | Required | Update a bookmark |
| `DELETE` | `/api/bookmarks/:id` | Required | Delete a bookmark |

### Tags

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tags` | Required | List all tags for the current user |
| `PATCH` | `/api/tags/:id` | Required | Rename a tag |
| `DELETE` | `/api/tags/:id` | Required | Delete a tag |

### Public Feed

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/public` | None | List all public bookmarks |

### Workspaces

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces` | Required | List workspaces for the current user |
| `POST` | `/api/workspaces` | Required | Create a workspace (body: `name`, `urls[]`) |
| `DELETE` | `/api/workspaces/:id` | Required | Delete a workspace |

### Companion Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/companion/settings` | Required | Get companion settings for current user |
| `PATCH` | `/api/companion/settings` | Required | Update one or more companion settings |

---

## 6. Frontend Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | Home | Authenticated bookmark library with search, filter, and tag sidebar |
| `/public` | Public Feed | Community bookmarks; accessible without login |
| `/login` (or redirect) | Auth | Replit OIDC sign-in entry point |

---

## 7. Key UI Components

| Component | Location | Description |
|---|---|---|
| `Sidebar` | `client/src/components/sidebar.tsx` | Left-side navigation; tag list, mascot status, CompanionPanel trigger |
| `BookmarkCard` | `client/src/components/bookmark-card.tsx` | Displays one bookmark with tags, action buttons, and Framer Motion animations |
| `AddBookmarkDialog` | `client/src/components/add-bookmark-dialog.tsx` | Modal for creating/editing a bookmark; tag autocomplete |
| `CompanionPanel` | `client/src/components/companion-panel.tsx` | Sheet panel: Insights dashboard, Workspaces manager, Nudge Settings |
| `ShinyButton` | `client/src/components/shiny-button.tsx` | Branded CTA button with a shimmer effect |

---

## 8. Technology Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Routing | Wouter |
| State / Data fetching | TanStack Query v5 |
| Styling | Tailwind CSS + shadcn/ui (Radix UI, New York style) |
| Animations | Framer Motion |
| Icons | Lucide React |
| Build tool | Vite |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express |
| Validation | Zod + drizzle-zod |
| Authentication | Passport.js + openid-client (Replit OIDC) |
| Session store | express-session + connect-pg-simple |

### Database
| Layer | Technology |
|---|---|
| Engine | PostgreSQL |
| ORM | Drizzle ORM |
| Migrations | Drizzle Kit (`db:push`) |
| Schema location | `shared/schema.ts` |

### Chrome Extension
| Layer | Technology |
|---|---|
| Manifest | V3 |
| Background | Service Worker (`background.js`) |
| UI | Vanilla HTML/CSS/JS (`sidepanel.html`, `sidepanel.js`) |
| APIs used | `chrome.tabs`, `chrome.idle`, `chrome.notifications`, `chrome.sidePanel`, `chrome.windows`, `chrome.runtime` |

---

## 9. Data Privacy & Security

| Concern | Implementation |
|---|---|
| Companion data is local | All tab tracking and session data lives entirely in the Chrome extension's memory — never sent to the server |
| Auth-gated APIs | Every user-specific API endpoint validates the session before returning data |
| Ownership checks | Bookmark read/update/delete routes verify `bookmark.userId === currentUser.id` |
| Session secret | Stored as an environment secret (`SESSION_SECRET`); never in source code |
| No third-party analytics | No external tracking scripts in the web app |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Real-time extension UI | Companion stats refresh on every tab switch event (< 100 ms perceived) |
| Optimistic UI | Bookmark mutations update the UI immediately before server confirmation |
| Search latency | Full-text search filters results within a single render cycle on the client |
| Zero-auth public feed | `/public` and `/api/public` respond without a session |
| Extension nudge cooldown | No more than one tab-overload notification per 10-minute window |

---

## 11. Future Considerations (Out of Scope for v1)

- Import/export bookmarks (JSON, HTML browser format)
- Folder/collection hierarchy beyond flat tags
- Bookmark sorting options (by date, title, domain)
- Shared workspaces across multiple users
- Mobile companion app (iOS/Firefox extension)
- AI-powered bookmark suggestions based on domain frequency
- Weekly digest email of top browsing insights
