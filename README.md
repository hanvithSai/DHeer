# DHeer 🦌

DHeer is a bookmark manager built for people who actually use their saved links.
Save URLs from the web or your browser, organize them with tags, launch full
workspaces with one click, and let your virtual deer companion keep you on track
while you browse.

---

## What is DHeer?

Most bookmark managers are digital graveyards — links go in and never come out.
DHeer is different. It pairs a clean bookmark library with a productivity
companion that watches your browsing habits (privately, on your own machine)
and gently nudges you when you have too many tabs open or you've gone idle.

Think of it as a bookmark manager with a conscience.

---

## Features

### Bookmark Library
- Save any URL with a title and personal note
- Tag bookmarks for instant filtering
- Search across titles, URLs, and notes in real time
- Mark bookmarks public or private
- See whether a link was saved from the web app or the browser extension

### Tags
- Create tags on the fly while saving a bookmark
- Rename or delete tags at any time
- Filter your entire library by clicking a tag in the sidebar

### Public Feed
- Browse bookmarks shared publicly by the community
- No account required to view the public feed

### Workspaces
- Group sets of URLs under a named workspace (e.g. "Morning Routine", "Project Alpha")
- Launch an entire workspace with one click — opens all URLs at once
- Works from both the web app and the browser extension

### DHeer Companion
The companion lives in your browser sidebar and watches your session locally:

- **Tab overload alerts** — get a notification when you exceed your tab limit
- **Idle nudges** — a gentle reminder to refocus or take a break
- **Session insights** — see your tab count, tab switches, and most-visited domains
- **Configurable** — set your own tab threshold, idle timeout, and nudge frequency
- All tracking is 100% local. Nothing is sent to any server.

---

## Who is DHeer for?

| You are... | DHeer helps you... |
|---|---|
| A researcher | Save and tag dozens of links per session without losing track |
| A focused worker | Use workspaces to switch contexts cleanly and get nudged when distracted |
| A curator | Share your best finds publicly and discover what others are saving |
| A power browser | Keep tabs under control with overload alerts and session stats |

---

## How it works

DHeer has two parts that work together:

### 1. Web App
A full-stack React application you sign in to with your account. This is where
you manage your bookmark library, create workspaces, and configure your companion
settings. Everything is stored in a PostgreSQL database tied to your account.

### 2. Chrome Extension
A browser side panel that sits alongside any page you visit. Use it to:
- Save the current tab as a bookmark without leaving the page
- View your recent bookmarks
- See live session stats from your companion
- Launch workspaces directly into a new Chrome window

The extension talks to the web app's backend using your session, so your data
stays in sync across both.

---

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- A Replit account (for authentication in the current version)

### Run locally

```bash
# Install dependencies
npm install

# Set environment variables
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-here

# Push the database schema
npm run db:push

# Start the app
npm run dev
