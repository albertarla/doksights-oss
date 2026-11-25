# PDF Viewer
**Status:** Stable
**Last Updated:** 2026-03-28
**Related ADR:** ADR-009

## Objective
Provide authenticated users with a full-featured in-browser PDF reading experience for their company's manuals, with integrated AI chat for Q&A while reading.

## User Stories
- As a user, I want to read a PDF manual in the browser without downloading it, so that access is immediate.
- As a user, I want to navigate pages, zoom, and rotate the PDF, so that I can read it comfortably.
- As a user, I want to search within the PDF, so that I can find specific content quickly.
- As a user, I want to open an AI chat panel while reading, so that I can ask questions without leaving the page.

## Functional Requirements
- Accessible only to authenticated users (`user_id` must match the manual's `user_id` via RLS).
- A **1-hour signed URL** is generated from the Supabase `manuals` storage bucket to serve the PDF securely.
- PDF rendered client-side using a PDF library (components: `PDFDocument`, `PDFControls`, `PDFSearch`, `PageThumbnails`).
- Controls:
  - Page navigation (prev/next, direct page number input).
  - Zoom in / out (range: 0.5× – 3.0×, step 0.25).
  - Rotate (90° increments).
  - Download (triggers signed URL download).
  - Fullscreen toggle.
- **Page thumbnail sidebar** for visual page navigation.
- **In-page search** (`PDFSearch` component): navigate to matching pages.
- **AI Chat panel** (`AIChatPanel` component): slides in from the right, streams AI answers for the current manual using the AI Chat feature.
- **Mobile Responsiveness**:
  - The viewer uses a mobile-first responsive layout (programmatic view toggling).
  - Heavy desktop components like `ResizablePanelGroup` are bypassed on mobile in favor of absolute overlays.
  - Chat state and PDF scroll/page position are preserved when toggling UI visibility on mobile.
  - Interactive elements (buttons) use icon-only fallbacks on small screens to prevent overflow.

## API Surface

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/chat/stream` | JWT | AI Q&A streaming for the manual being viewed |

> PDF loading uses Supabase Storage signed URLs (no backend endpoint).

## Data Model

- **Table `manuals`:** Read for `id`, `title`, `description`, `file_path` (used to generate signed URL).
- **Storage Bucket `manuals`:** Private. Signed URL created client-side via Supabase SDK (1-hour TTL).

## Acceptance Criteria
- [ ] Only the manual's owner (`user_id` match) can open the viewer.
- [ ] A signed URL is generated and the PDF renders in the browser.
- [ ] Zoom in and out adjusts the scale within 0.5–3× bounds.
- [ ] Rotation increments by 90° per click.
- [ ] The AI chat panel slides in and can stream answers about the current manual.
- [ ] Clicking a page thumbnail scrolls the viewer to that page.
- [ ] No horizontal scroll/overflow on mobile devices (e.g. iPhone 17 viewport).
- [ ] Chat conversation persists when closing and reopening the chat panel.
