# DHeer — Engineering Reference

This document records the technical architecture, stack decisions, alternatives considered, and implementation details for every major subsystem.

---

## 1. Project Structure

```
dheer/
├── client/              # React frontend (Vite)
│   └── src/
│       ├── components/  # Shared UI components (shadcn/ui + custom)
│       ├── hooks/       # Custom React hooks (use-bookmarks, use-auth, …)
│       ├── lib/         # queryClient, apiRequest helper
│       └── pages/       # Route-level page components
├── server/              # Express backend
│   ├── index.ts         # Entry point — attaches middleware, starts server
│   ├── routes.ts        # All API route handlers
│   ├── storage.ts       # IStorage interface + PostgresStorage implementation
│   └── auth.ts          # Passport.js / OpenID Connect setup
├── shared/              # Code shared between client and server
│   ├── schema.ts        # Drizzle table definitions + Zod insert schemas
│   └── routes.ts        # Typed API route definitions
└── extension/           # Chrome Extension (Manifest V3)
    ├── manifest.json
    ├── background.js    # Service worker
    ├── sidepanel.html   # Side panel / popup UI
    └── sidepanel.js     # Side panel script
```

---

## 2. Tech Stack

### Frontend
| Concern | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript | Component model, large ecosystem, team familiarity |
| Build | Vite | Sub-second HMR; native ESM; simpler config than Webpack |
| Routing | Wouter | Tiny (~1 kB) drop-in for simple SPA routing; no need for React Router's complexity |
| Server state | TanStack Query v5 | Declarative fetching, automatic caching, optimistic updates out of the box |
| UI primitives | shadcn/ui (Radix UI) | Accessible, unstyled primitives; copy-paste ownership model avoids version lock-in |
| Styling | Tailwind CSS | Utility-first; co-located styles; no CSS file proliferation |
| Animations | Framer Motion | Declarative spring/tween API; integrates cleanly with React render cycle |

### Backend
| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js + Express | Familiar, minimal, easy to extend |
| Language | TypeScript (ESM) | End-to-end type safety shared with frontend via `shared/` |
| ORM | Drizzle ORM | SQL-first; lightweight; schema-as-code with full TypeScript inference |
| Validation | Zod + drizzle-zod | Single source of truth — DB schema generates Zod validators automatically |
| Auth | Passport.js + openid-client | Battle-tested; OpenID Connect is the standard for Replit Auth |
| Sessions | express-session + connect-pg-simple | PostgreSQL-backed sessions survive server restarts |

### Database
| Concern | Choice | Why |
|---|---|---|
| Engine | PostgreSQL | ACID, full-text search via ILIKE, JSON support, Replit-native |
| Migrations | drizzle-kit push | Fast iteration in development; schema diffs applied directly |

---

## 3. Architectural Decisions

### 3.1 Shared `schema.ts`
**Decision:** Single schema file imported by both client and server.
**Why:** Eliminates type drift between API response shapes and UI expectations. Insert types, select types, and Zod validators are all derived from one source.
**Alternatives considered:** Separate DTO files on each side — rejected because it creates a maintenance burden keeping them in sync.

### 3.2 Storage Interface Pattern
**Decision:** All DB access goes through an `IStorage` interface in `server/storage.ts`. Routes call the interface; they never touch Drizzle directly.
**Why:** Swappable implementations (e.g. in-memory for tests). Routes stay thin and readable.
**Alternatives considered:** Direct Drizzle calls in routes — rejected because it scatters query logic across the codebase.

### 3.3 Chrome Extension — Service Worker vs Extension Page for `chrome.windows.create`
**Decision:** The pop-out popup window is created directly from `sidepanel.js` (an extension page), not from `background.js` (the service worker).
**Why:** Service workers in Manifest V3 are ephemeral and have no stable window context. `chrome.windows.create` called from a service worker is unreliable. Extension pages have a stable context and the call succeeds consistently.
**Alternatives considered:**
- Calling `chrome.windows.create` from the service worker — tried, popup never opened due to missing window context.
- Two-message pattern (sidepanel → background → create) — same root failure.

### 3.4 Side Panel Close Strategy
**Decision:** Use `chrome.sidePanel.setOptions({ enabled: false })` **without** a `tabId` to close the panel.
**Why:** The panel is opened via `setPanelBehavior({ openPanelOnActionClick: true })` which is a global (window-level) setting. Tab-specific `setOptions({ tabId, enabled: false })` targets a separate per-tab override layer and has no effect on a globally-opened panel. Omitting `tabId` targets the global context that Chrome is actually using.
**Alternatives considered:**
- Tab-specific `setOptions` — tried three times with various timings; never worked because of the global/tab context mismatch.
- Immediate re-enable without delay — Chrome processed both calls atomically so the panel never visually closed; 300 ms delay added.

### 3.5 Search — Database vs In-Memory Filtering
**Decision:** Search uses SQL `ILIKE` with an `OR` across title, URL, notes, and a correlated `EXISTS` subquery for tag names.
**Why:** Filtering at the DB level means only matching rows are transferred over the wire. In-memory filtering on a large bookmark set would be slow and memory-intensive.
**Alternatives considered:** JavaScript `Array.filter` after fetching all bookmarks — rejected for performance reasons.

---

## 4. Feature Implementation Details

### 4.1 Authentication Flow
1. User clicks "Sign in" → redirected to Replit's OpenID Connect endpoint.
2. Replit returns an auth code → `server/auth.ts` exchanges it for tokens via `openid-client`.
3. User record is upserted in the `users` table (id, email, first_name, last_name, profile_image_url).
4. Session is written to the `sessions` table via `connect-pg-simple`.
5. All subsequent requests carry the session cookie; `isAuthenticated` middleware checks it.

### 4.2 Public Feed Author Attribution
Implemented as a correlated subquery in `getPublicBookmarks`:
```sql
SELECT b.*,
  (SELECT CONCAT_WS(' ', u.first_name, u.last_name) FROM users u WHERE u.id = b.user_id) AS author_name,
  (SELECT u.profile_image_url FROM users u WHERE u.id = b.user_id) AS author_avatar
FROM bookmarks b
WHERE b.is_public = true
```
Avoids a JOIN that would complicate the existing Drizzle query composition.

### 4.3 Tag Search (EXISTS Subquery)
```sql
WHERE EXISTS (
  SELECT 1 FROM bookmark_tags bt
  JOIN tags t ON t.id = bt.tag_id
  WHERE bt.bookmark_id = b.id
  AND t.name ILIKE '%query%'
)
```
Allows tag-name search without flattening tags into the main bookmark row.

### 4.4 Extension Nudge Pipeline
1. `chrome.idle.onStateChanged` fires when user is idle ≥ `idleThreshold` seconds.
2. `tabs.onCreated` fires and checks if `tabCount ≥ tabCountThreshold`.
3. Both paths call `sendNudge(message)`.
4. `sendNudge` does two things simultaneously:
   - `chrome.notifications.create` → OS desktop notification.
   - `chrome.runtime.sendMessage({ type: 'COMPANION_NUDGE' })` → in-panel banner for 8 s.
5. A `nudgeCooldown` (default 10 min) prevents notification spam.
