---
name: responsive-review
description: Audits and fixes mobile-first layout in DokSights pages (header overflow, panels that lose state when hidden, ResizablePanelGroup on mobile). Use after any frontend layout change, new page or new side panel, before finishing.
---

# Responsive review (ADR-009)

Goal: every page works at 375px wide, nothing overflows horizontally, and toggling a panel never loses its state.

## 1. Static check of the changed files

- **Headers and toolbars:** `flex-wrap` and `gap-*` on the outer container; button labels hidden on small screens
  (`<span className="hidden sm:inline">Back</span>`); icons always visible; long titles `truncate`.
- **Stateful panels stay mounted.** `AIChatPanel`, `DiscoveryChat`, search results:

  ```tsx
  // ❌ loses chat history when closed
  {chatOpen && <AIChatPanel isOpen={chatOpen} />}

  // ✅ keeps state, only hides it
  <div className={!chatOpen ? "hidden" : ""}>
    <AIChatPanel isOpen={chatOpen} />
  </div>
  ```

- **No `ResizablePanelGroup` on mobile.** Branch on `useIsMobile()` (`@/hooks/use-mobile`, < 768px) and render the
  side panel as an overlay (`absolute inset-0 z-50 bg-background`).
- No `overflow: scroll` on `html`/`body`; scroll inside containers with `overflow-y-auto`.
- Icon-only buttons have an `aria-label` or `title`.

## 2. Check it in a browser

With the app running (`docker compose up` or `npm run dev`), open the page in the browser at **375 × 812**:

- no horizontal scrollbar on the main layout;
- every action reachable;
- open the chat, type a message, close it, reopen it: the text and history are still there;
- then check desktop width again for regressions.

Use the built-in browser's viewport presets if you have them; otherwise say this step was not done.

## 3. Tests

The page's test file has a case with `useIsMobile` mocked to `true` that renders the page and asserts the mobile-only
elements. Add it if missing (`frontend-tests` skill).

## Report

List each issue found as `file:line — problem — fix applied`, or "No responsive issues found", and say whether the
browser check (step 2) was done.
