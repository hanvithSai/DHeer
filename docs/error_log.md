# DHeer — Error Log

This document is a running log of every critical bug encountered in DHeer. Each entry records what the bug was, why it occurred, all resolution attempts (including failed ones and why they failed), the final fix, and how to prevent recurrence.

---

## Log Format

```
### [ERR-XXX] Short title
- **Date discovered:**
- **Severity:** Critical / High / Medium
- **Area:** Extension / Backend / Frontend / Database
- **Reported by:**

**What was the bug?**
Describe the observable symptom.

**Why did it occur? (Root Cause)**
The underlying technical reason.

**Resolution attempts**
1. Attempt — What was tried, why it failed.
2. Attempt — What was tried, why it failed.

**Final fix**
What actually resolved it.

**How to avoid going forward**
Rule or pattern to prevent recurrence.
```

---

## Entries

---

### [ERR-001] Pop-out window not opening
- **Date discovered:** 2026-05
- **Severity:** Critical
- **Area:** Extension
- **Reported by:** User testing

**What was the bug?**
Clicking the "Pop out" button in the Chrome side panel did nothing — no popup window appeared.

**Why did it occur? (Root Cause)**
`chrome.windows.create` was being called from `background.js` (the service worker). Manifest V3 service workers are ephemeral and have no stable window context. Chrome silently failed to create the window because the service worker had no browsing context to attach the new window to.

**Resolution attempts**
1. **Pass `sourceWindowId` from side panel → background** — Side panel called `chrome.windows.getCurrent()` and sent the window ID to background. Background still called `chrome.windows.create` from the service worker context. Failed — the root problem was not the window ID but where the API was called from.
2. **Create popup first, then query tab** — Changed order: background created popup first (no tab query needed), then looked up source tab to disable side panel. Still failed — `chrome.windows.create` from the service worker remained unreliable regardless of call order.

**Final fix**
Moved `chrome.windows.create` into `sidepanel.js` (an extension page with a stable browsing context). Extension pages can reliably call `chrome.windows.create`. Background.js now only receives a `POPUP_CREATED` message and handles side panel state management — it no longer creates windows.

**How to avoid going forward**
Never call `chrome.windows.create` or any window-manipulation API from a Manifest V3 service worker. Perform all window and DOM operations from extension pages (side panel, popup, options page).

---

### [ERR-002] Side panel not closing after pop-out
- **Date discovered:** 2026-05
- **Severity:** High
- **Area:** Extension
- **Reported by:** User testing

**What was the bug?**
After the popup window opened successfully, the side panel remained visible — it did not auto-close.

**Why did it occur? (Root Cause)**
The panel was opened via `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` — a **global** (window-level) setting. The close attempt used `chrome.sidePanel.setOptions({ tabId: X, enabled: false })`, which targets the **tab-specific** override layer. These are two independent configuration contexts in Chrome's side panel API. A tab-specific override has zero effect on a globally-opened panel.

**Resolution attempts**
1. **Tab-specific `setOptions({ tabId, enabled: false })`** — Called with the correct tab ID. No effect because the panel was opened globally, not per-tab.
2. **Same call + 800 ms delay** — Added delay thinking Chrome needed time to process. Same root cause; the API call targeted the wrong context regardless of timing.
3. **Immediate disable then re-enable** — Called `setOptions({ tabId, enabled: false })` then immediately `setOptions({ tabId, enabled: true })`. Chrome processed both atomically; panel never closed.

**Final fix**
Call `chrome.sidePanel.setOptions({ enabled: false })` **without a `tabId`** to target the global context. Wait 300 ms to let Chrome render the close, then call `setOptions({ enabled: true })` (without tabId) to re-enable — allowing the user to reopen the panel alongside the popup if desired.

**How to avoid going forward**
When the side panel is opened via `setPanelBehavior` (global), always use `setOptions` **without** `tabId` to close it. Only use `tabId` in `setOptions` when managing a tab-specifically opened panel.

---

_Add new entries below this line._

