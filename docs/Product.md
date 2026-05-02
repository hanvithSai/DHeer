# DHeer — Product Tracker

Single source of truth for the Product Team. Tracks sprint progress, feature status, decisions, and open questions.

---

## Product Vision

DHeer is a modern bookmark manager designed for knowledge workers who need to save, organise, and rediscover URLs quickly — with a companion tool that promotes focused, mindful browsing.

---

## Current Status

| Area | Status |
|---|---|
| Web App (Bookmark CRUD, Search, Public Feed) | ✅ Shipped |
| Chrome Extension (Side Panel, Companion, Todos) | ✅ Shipped |
| Pop-out Chat Window | ✅ Shipped |
| Nudge System (idle + tab overload) | ✅ Shipped |
| Workspace Launcher | ✅ Shipped |
| Mobile Hamburger Navigation | ✅ Shipped |
| Documentation Branch | 🔄 In Progress |

---

## Sprint Log

### Sprint 1 — Core Feature Completion
All 11 sprint tasks completed:

| # | Task | Outcome |
|---|---|---|
| T001 | manifest.json — idle + notifications permissions | ✅ Done |
| T002 | Public feed user attribution | ✅ Done |
| T003 | Companion panel setting controls | ✅ Done |
| T004 | Session duration + top domain display | ✅ Done |
| T005 | Extension inline nudge settings | ✅ Done |
| T006 | Extension COMPANION_NUDGE banner | ✅ Done |
| T007 | Inline workspace form (replace window.prompt) | ✅ Done |
| T008 | Mobile hamburger sidebar toggle | ✅ Done |
| T009 | Public feed empty state + count | ✅ Done |
| T010 | data-testid audit | ✅ Done |
| T011 | Search SQL ILIKE migration | ✅ Done |

---

## Feature Backlog

| Priority | Feature | Notes |
|---|---|---|
| High | — | — |
| Medium | — | — |
| Low | — | — |

---

## Open Questions

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | Should public bookmarks be paginated? | Product | Open |
| 2 | Should workspaces support nested folders? | Product | Open |
| 3 | Should the extension support Firefox? | Engineering | Open |

---

## Key Product Decisions

| Date | Decision | Rationale |
|---|---|---|
| — | Pop-out window closes side panel on first open | Prevents layout confusion; user can reopen both if desired |
| — | Public feed shows author name + avatar | Adds community accountability and discovery value |
| — | Nudge system is opt-in (toggle off by default in DB) | Avoids notification fatigue for new users |

---

## Notes
_Use this section for meeting notes, stakeholder feedback, and ad-hoc observations._

