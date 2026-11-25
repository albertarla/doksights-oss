# ADR-009: Mobile-First Responsive Architecture and State Preservation

> **Rule of thumb:** Mobile-first: below 768px (`useIsMobile`) side panels are absolute overlays, never `ResizablePanelGroup`; chat panels stay mounted and are hidden with `hidden`, never conditionally rendered.

**Date:** 2026-03-28 | **Status:** Accepted

**Context:** The application was initially designed for desktop-sized viewports, using `ResizablePanelGroup` for sidebars (AI Chat, Discovery). On mobile devices, these multi-column layouts collapsed poorly, and unmounting chat panels to switch views caused loss of conversation state, frustrating users who needed to reference the document and chat intermittently.

**Decision:**
- Adopt a **Mobile-First** responsiveness strategy using Tailwind's `sm:` and `md:` prefixes across all administrative and portal headers.
- Implement a `useIsMobile` hook (breakpoint: 768px) to toggle layout logic programmatically.
- **Bypass ResizablePanels on Mobile**: On small screens, sidebars (AIChat, DiscoveryChat) are rendered as absolute-positioned overlays (`absolute inset-0 z-50`) instead of flex-basis panels.
- **State Preservation via CSS Visibility**: Instead of conditionally mounting chat components (`{isOpen && <Chat />}`), keep them permanently mounted and toggle visibility using Tailwind's `hidden` class. This ensures React state and scroll positions are preserved when the user toggles the chat interface.
- **Text Truncation & Icon-Only Fallbacks**: Headers now hide textual labels (e.g., "Back", "AI Chat") on mobile, showing only icons to prevent horizontal overflow.

**Consequences:**
- Improved UX on mobile devices (e.g., iPhone/Android) with full-screen focus.
- Seamless "switching" between reading a manual and chatting with AI without losing context.
- Increased DOM size (slightly) as components stay mounted, but performance remains high due to efficient React reconciliation.
- Consistent branding and navigation across all screen sizes.
