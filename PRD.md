# DHeer — Product Requirements Document

**Version:** 1.1  
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

## 11. Replit Platform Dependencies — Full Audit & Migration Guide

This section catalogues every component that is tightly coupled to the Replit platform today, the risk it creates for portability, and a concrete, self-contained replacement for each one.

---

### 11.1 Dependency Map

| # | Dependency | Type | Risk | Files Affected |
|---|---|---|---|---|
| D1 | Replit OpenID Connect (OIDC) auth | **Critical** | App cannot authenticate users anywhere else | `server/replit_integrations/auth/replitAuth.ts` |
| D2 | `REPL_ID` environment variable | **Critical** | Used as the OIDC client ID; missing on any non-Replit host | `server/replit_integrations/auth/replitAuth.ts` |
| D3 | `ISSUER_URL` environment variable | **Critical** | Hard-defaults to `https://replit.com/oidc` | `server/replit_integrations/auth/replitAuth.ts` |
| D4 | Replit-provisioned PostgreSQL (`DATABASE_URL`) | **High** | DB is managed by Replit; not portable as-is | `server/db.ts`, `drizzle.config.ts` |
| D5 | `SESSION_SECRET` environment variable | **Medium** | Must be re-created on any new host, but is generic | `server/replit_integrations/auth/replitAuth.ts` |
| D6 | Hardcoded Replit app URL in extension | **High** | Extension always calls the Replit-hosted backend | `extension/sidepanel.js` line 3 |
| D7 | `@replit/vite-plugin-runtime-error-modal` | **Low** | Dev-only error overlay; adds no production value | `vite.config.ts` |
| D8 | `@replit/vite-plugin-cartographer` | **Low** | Replit-only dev tool; guarded by `REPL_ID` check | `vite.config.ts` |
| D9 | `@replit/vite-plugin-dev-banner` | **Low** | Replit-only dev banner; guarded by `REPL_ID` check | `vite.config.ts` |
| D10 | `shared/models/auth.ts` table comments | **Trivial** | Comments say "mandatory for Replit Auth"; code works fine without Replit | `shared/models/auth.ts` |

---

### 11.2 Detailed Analysis & Self-Contained Solutions

---

#### D1 — Replit OIDC Authentication (Critical)

**What it does today:**  
The entire login flow goes through Replit's OpenID Connect provider (`https://replit.com/oidc`). Passport.js uses `openid-client` configured against Replit's discovery endpoint. Users must have a Replit account.

**Problem when migrating:**  
Replit's OIDC server is not available outside Replit. No other host can serve as the identity provider, so every non-Replit deployment has zero working authentication.

**Self-contained solution — Local email/password auth:**

Replace `server/replit_integrations/auth/replitAuth.ts` with a local Passport.js `LocalStrategy`:

```ts
// server/auth/localAuth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

export function setupAuth(app) {
  const PgStore = connectPg(session);
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    store: new PgStore({ conString: process.env.DATABASE_URL, tableName: "sessions" }),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.passwordHash) return done(null, false);
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? done(null, user) : done(null, false);
  }));

  passport.serializeUser((user: any, cb) => cb(null, user.id));
  passport.deserializeUser(async (id: string, cb) => {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    cb(null, user ?? false);
  });

  // Register: POST /api/register  { email, password, name }
  // Login:    POST /api/login      { email, password }
  // Logout:   GET  /api/logout
}
```

Add `passwordHash varchar` to the `users` table in `shared/models/auth.ts`.  
Add `bcryptjs` and `passport-local` to package dependencies.  
Remove `openid-client` and `memoizee` from dependencies.

**Alternative — Third-party OIDC (zero lock-in):**  
Replace `ISSUER_URL` and `REPL_ID` with any standard OIDC provider:

| Provider | `ISSUER_URL` | Notes |
|---|---|---|
| Auth0 | `https://<tenant>.auth0.com` | Free tier available |
| Google | `https://accounts.google.com` | OAuth 2.0 OIDC-compatible |
| Keycloak (self-hosted) | `https://your-host/realms/<realm>` | Fully self-hosted, no vendor lock |
| Clerk | `https://<app>.clerk.accounts.dev` | Dev-friendly; has its own SDK |

The existing `openid-client` code already supports any OIDC-compliant issuer. Only the two environment variables need changing — no code changes required for this path.

---

#### D2 & D3 — `REPL_ID` and `ISSUER_URL` Environment Variables (Critical)

**What they do today:**
- `REPL_ID` is passed as the OIDC `client_id` to Replit's auth server.
- `ISSUER_URL` defaults to `https://replit.com/oidc` if not set.

**Problem when migrating:**  
`REPL_ID` only exists on Replit infrastructure. On any other host it is undefined, crashing the OIDC client setup.

**Self-contained solution:**

Rename these to generic variables and add validation:

```ts
// In auth setup, replace:
process.env.REPL_ID!
// With:
process.env.OIDC_CLIENT_ID!

// Replace the default:
process.env.ISSUER_URL ?? "https://replit.com/oidc"
// With:
process.env.OIDC_ISSUER_URL   // No default — fail explicitly if missing
```

Required environment variables on any host:

```env
OIDC_ISSUER_URL=https://accounts.google.com   # or any OIDC provider
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret         # add if provider requires it
SESSION_SECRET=any-random-32+-char-string
DATABASE_URL=postgresql://user:pass@host/db
```

---

#### D4 — Replit-Provisioned PostgreSQL (High)

**What it does today:**  
The database is provisioned automatically by Replit and injected as `DATABASE_URL`. The connection string points to Replit's internal Neon PostgreSQL cluster.

**Problem when migrating:**  
The Neon cluster is tied to the Replit account. On other hosts, `DATABASE_URL` is undefined and the app crashes on startup (`server/db.ts` throws on missing variable).

**Self-contained solution:**

The code itself (`server/db.ts`, Drizzle ORM) is already 100% portable — it only needs a valid PostgreSQL connection string. No code changes are required. The migration steps are:

1. Export existing data: `pg_dump $DATABASE_URL > dheer_backup.sql`
2. Provision a new PostgreSQL database on any of:
   - **Supabase** (free tier, managed)
   - **Railway** (simple deploy + DB combo)
   - **Render** (Postgres + web service in one dashboard)
   - **Neon.tech** (serverless Postgres, same tech Replit uses internally)
   - **Self-hosted** (Docker: `postgres:16-alpine`)
3. Restore: `psql $NEW_DATABASE_URL < dheer_backup.sql`
4. Run schema sync: `npm run db:push`
5. Set the new `DATABASE_URL` on the new host.

The `sessions` and `users` tables must exist before the app starts (they are created by `db:push` — no manual SQL needed).

---

#### D5 — `SESSION_SECRET` Environment Variable (Medium)

**What it does today:**  
Signs and verifies session cookies. Currently set as a Replit secret.

**Problem when migrating:**  
It doesn't exist on the new host until you set it. If missing, `express-session` throws at startup.

**Self-contained solution:**  
Generate a new secret and set it as an environment variable on the new host:

```bash
# Generate a cryptographically strong secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `SESSION_SECRET=<output>` in your hosting provider's environment variables panel. No code changes needed.

Note: Changing the secret invalidates all existing sessions (users will need to log in again). This is expected and safe.

---

#### D6 — Hardcoded Replit App URL in Chrome Extension (High)

**What it does today:**  
`extension/sidepanel.js` line 3 contains:
```js
const API_BASE_URL = 'https://d-heer--hanvithsaia.replit.app';
```
Every API call from the extension is hard-wired to this Replit domain.

**Problem when migrating:**  
After moving to a new host, the extension continues to call the old Replit URL. It will break as soon as the Replit deployment is shut down.

**Self-contained solution — Extension options page:**

Add an extension options page where users set their own backend URL, saved to `chrome.storage.sync`:

```js
// extension/sidepanel.js — replace hardcoded URL with:
let API_BASE_URL = 'https://d-heer--hanvithsaia.replit.app'; // fallback default

chrome.storage.sync.get(['apiBaseUrl'], (result) => {
  if (result.apiBaseUrl) API_BASE_URL = result.apiBaseUrl;
});
```

```html
<!-- extension/options.html -->
<label>Backend URL: <input id="url" type="url" /></label>
<button id="save">Save</button>
<script>
  chrome.storage.sync.get(['apiBaseUrl'], (r) => { document.getElementById('url').value = r.apiBaseUrl || ''; });
  document.getElementById('save').onclick = () => {
    chrome.storage.sync.set({ apiBaseUrl: document.getElementById('url').value });
  };
</script>
```

Add to `manifest.json`:
```json
"options_page": "options.html",
"permissions": ["storage"]
```

This makes the extension work with any deployment of DHeer regardless of where it is hosted.

---

#### D7, D8, D9 — Replit Vite Plugins (Low)

**What they do today:**

| Plugin | Purpose |
|---|---|
| `@replit/vite-plugin-runtime-error-modal` | Overlays runtime errors in the Replit browser preview during development |
| `@replit/vite-plugin-cartographer` | Provides Replit's AI with a map of the project's component tree |
| `@replit/vite-plugin-dev-banner` | Shows a "Running on Replit" banner in the dev preview |

All three are loaded only when `process.env.REPL_ID !== undefined` (D8 and D9 are already guarded). They add zero functionality in production builds.

**Problem when migrating:**  
These packages are in `devDependencies`. If `REPL_ID` is not set, D8 and D9 are never loaded. D7 (`runtimeErrorOverlay`) is always instantiated but only activates in development — it is harmless but wastes a package install.

**Self-contained solution:**

Remove the three Replit plugins from `vite.config.ts` and uninstall the packages:

```ts
// vite.config.ts — simplified, no Replit plugins
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
```

Packages to uninstall:
```
@replit/vite-plugin-runtime-error-modal
@replit/vite-plugin-cartographer
@replit/vite-plugin-dev-banner
```

---

#### D10 — `shared/models/auth.ts` Comments (Trivial)

**What they do today:**  
Comments on the `sessions` and `users` table definitions say "IMPORTANT: This table is mandatory for Replit Auth, don't drop it."

**Problem when migrating:**  
No functional impact. Misleading to future developers who have replaced Replit Auth.

**Self-contained solution:**  
Update the comments to reflect that these tables support the generic session-based auth system, not specifically Replit.

---

### 11.3 Migration Checklist

Use this checklist when moving DHeer to any non-Replit host:

#### Phase 1 — Database
- [ ] Export data: `pg_dump $DATABASE_URL > dheer_backup.sql`
- [ ] Provision a new PostgreSQL instance (Supabase / Railway / Render / self-hosted)
- [ ] Restore data: `psql $NEW_DATABASE_URL < dheer_backup.sql`
- [ ] Set `DATABASE_URL` on new host

#### Phase 2 — Authentication
- [ ] **Option A (keep OIDC):** Register DHeer as an OAuth app with Google / Auth0 / Keycloak; get `client_id` and `client_secret`; set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`; rename env vars in `replitAuth.ts`
- [ ] **Option B (local auth):** Implement `passport-local` with email + bcrypt password; add `passwordHash` column to `users`; add `/api/register` endpoint; remove `openid-client` dependency

#### Phase 3 — Session
- [ ] Generate new `SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- [ ] Set `SESSION_SECRET` on new host

#### Phase 4 — Chrome Extension
- [ ] Add options page to extension with editable backend URL field
- [ ] Store URL in `chrome.storage.sync`
- [ ] Load stored URL at sidepanel startup with fallback to default
- [ ] Publish updated extension or load unpacked with new backend URL set

#### Phase 5 — Build Tooling
- [ ] Remove `@replit/vite-plugin-*` from `vite.config.ts`
- [ ] Uninstall the three Replit Vite packages
- [ ] Verify `npm run build` succeeds without `REPL_ID` in environment

#### Phase 6 — Comments & Docs
- [ ] Update comments in `shared/models/auth.ts` (remove Replit-specific warnings)
- [ ] Update `replit.md` → rename to `README.md` or keep both

---

### 11.4 Recommended Hosting Stack (Fully Independent)

| Layer | Recommended Option | Why |
|---|---|---|
| Web + API server | **Railway** or **Render** | One-click Node.js deploy; managed PostgreSQL included |
| Database | **Neon.tech** or **Supabase** | Serverless Postgres; free tier; standard connection strings |
| Authentication | **Google OAuth** (OIDC-compliant) | No vendor lock-in; uses existing `openid-client` code as-is |
| Chrome Extension | Chrome Web Store or self-distributed `.crx` | Independent of any web host |
| Secrets management | Host-native env vars panel | All major hosts support this natively |

---

## 12. Future Considerations (Out of Scope for v1)

- Import/export bookmarks (JSON, HTML browser format)
- Folder/collection hierarchy beyond flat tags
- Bookmark sorting options (by date, title, domain)
- Shared workspaces across multiple users
- Mobile companion app (iOS/Firefox extension)
- AI-powered bookmark suggestions based on domain frequency
- Weekly digest email of top browsing insights
- Firefox extension support (WebExtension API is largely compatible)
