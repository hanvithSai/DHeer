# DHeer - Bookmark Manager

## Overview

DHeer is a modern bookmark web application with a companion browser extension. Users can save URLs with notes and tags, organize their bookmarks, and optionally share them publicly. The application features seamless authentication across both the web app and Chrome extension sidebar.

**Core Features:**
- User authentication via Replit Auth (OpenID Connect)
- Bookmark CRUD operations with tags and public/private visibility
- Search and filter bookmarks by title, URL, notes, and tags
- Bookmark import from URL list or browser HTML export
- Public feed showing community bookmarks with author attribution
- Todo management with custom statuses and priorities
- **Productivity dashboard** at `/productivity` — live tab analytics, per-domain time tracking, per-tab breakdown, session stats (pulls from Chrome extension)
- Chrome extension with side panel for quick bookmark saving

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight client-side routing)
- **State Management:** TanStack Query (React Query) for server state
- **Styling:** Tailwind CSS with shadcn/ui components (New York style)
- **Animations:** Framer Motion for page transitions and UI effects
- **Build Tool:** Vite with custom path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime:** Node.js with Express
- **Language:** TypeScript (ESM modules)
- **API Design:** RESTful endpoints under /api/ prefix with Zod validation
- **Session Management:** express-session with PostgreSQL store (connect-pg-simple)

### Database Layer
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with drizzle-zod for schema validation
- **Schema Location:** shared/schema.ts (shared between client and server)
- **Migrations:** Drizzle Kit with push command (db:push)

### Authentication
- **Provider:** Replit Auth (OpenID Connect)
- **Session Storage:** PostgreSQL sessions table
- **User Storage:** PostgreSQL users table with id, email, name, profile image
- **Implementation:** Passport.js with openid-client strategy

### Shared Code Structure
- **shared/schema.ts:** Database table definitions (bookmarks, tags, bookmark_tags, users, sessions)
- **shared/routes.ts:** API route definitions with Zod input/output schemas
- **shared/models/auth.ts:** User and session table definitions for Replit Auth

### Browser Extension
- **Type:** Chrome Extension (Manifest V3)
- **Features:** Side panel for quick bookmark saving from any page
- **Auth:** Relies on session cookies from main app (requires same-origin or token-based auth for production)

### Key Design Patterns
- Optimistic UI updates for fast interactions
- Shared route definitions between frontend and backend for type safety
- Component composition with Radix UI primitives via shadcn/ui
- Custom hooks for data fetching (use-bookmarks, use-tags, use-auth)

## External Dependencies

### Database
- PostgreSQL (required, configured via DATABASE_URL environment variable)

### Authentication
- Replit Auth (OpenID Connect via ISSUER_URL)
- Required environment variables: DATABASE_URL, SESSION_SECRET, REPL_ID

### UI Component Library
- shadcn/ui components (Radix UI primitives)
- Full component set in client/src/components/ui/

### Key NPM Packages
- drizzle-orm + drizzle-kit: Database ORM and migrations
- @tanstack/react-query: Server state management
- express-session + connect-pg-simple: Session management
- passport + openid-client: Authentication
- zod + drizzle-zod: Schema validation
- framer-motion: Animations
- lucide-react: Icons