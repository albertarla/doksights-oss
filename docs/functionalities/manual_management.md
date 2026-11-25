# Manual Management
**Status:** Stable
**Last Updated:** 2026-04-26
**Related ADR:** N/A

## Objective
Allow company administrators to create and manage documentation. This includes uploading PDF product manuals and authoring Markdown-based Web Manuals with images and cross-section links. Manuals can be organized into folders, toggled between public and private visibility, and size tracking is maintained for all assets.

## User Stories
- As an admin, I want to upload a PDF manual, so that it becomes searchable and chat-enabled.
- As an admin, I want to create a Web Manual and author Markdown sections, so that I can maintain documentation directly within DokSights.
- As an admin, I want to upload images into a Web Manual's Image Library, so that I can embed them visually into any section.
- As an admin, I want to link from one section to another using `[text](#section-ID)` syntax, so that users can navigate the manual contextually.
- As an admin, I want to see the total size of a manual (text + images), so that I understand its storage footprint.
- As an admin, I want to organize manuals into folders, so that the portal structure is clear.
- As an admin, I want to toggle a manual's public visibility, so that I control what users see.
- As an admin, I want to track the `rag_status` of each manual, so that I know when it is ready.

## Functional Requirements
- Requires `page.manuals` permission. Unauthorized users are redirected to `/dashboard`.
- Admins can upload PDF files directly to Supabase Storage bucket `manuals` (`manual_type = 'pdf'`).
- Admins can create Web Manuals (`manual_type = 'web'`) and author them using a Markdown editor, managing drag-and-drop sections in the `DocBuilder`.
- After upload or after publishing a Web Manual, RAG indexing is triggered (status: `pending` → `processing` → `completed` | `failed`).
- The list of manuals updates in real-time using Supabase subscriptions to reflect `rag_status` changes.
- Admins can manually retry processing a failed manual using the "Retry AI Processing" action in the `ManualCard`.
- The manual card shows `rag_status` and `rag_error` if applicable.
- Admins can edit a manual's title and description.
- **Deletion (cascade)**:
  - For PDF manuals: the single `file_path` file is deleted from Supabase Storage before the DB row is removed.
  - For Web Manuals: all images registered in `web_manual_images` are bulk-deleted from storage before the DB row is removed.
  - The DB row deletion cascades to `manual_sections`, `manual_chunks`, and `web_manual_images` rows automatically via FK `ON DELETE CASCADE`.
- Admins can toggle `is_public` per manual (inline, no dialog).
- Admins can assign a manual to a folder or leave it uncategorized.
- **Image Library (Web Manuals only)**:
  - Images are uploaded from the `DocBuilder` sidebar's "Images" tab to the public `web_images` bucket under `{user_id}/{manual_id}/`.
  - Each uploaded image is registered in `web_manual_images` (path, filename, size).
  - `manuals.file_size` is incremented on upload and decremented on delete, reflecting total storage used.
  - Admins can insert an image into the active section (pastes `![filename](url)` at the cursor).
  - Admins can delete an image from the library; a warning is shown that existing markdown references will break.
  - Images persist in the library independently of which sections reference them.
- **Internal Section Linking (Web Manuals)**:
  - Any section link `[text](#section-ID)` in the Markdown is intercepted in the viewer.
  - Clicking such a link switches the active section without a page reload.
  - A "Copy Section Link" button on each sidebar item copies `#section-{id}` to the clipboard.
- **Draft Persistence**: Section edits are auto-saved to `localStorage` every 2 seconds with a restore/discard banner on return.
- **Folder management** is embedded on the same page (`FolderManagement` component):
  - Create, rename, and delete folders.
  - Folders have a `display_order` for custom ordering.
  - A `set_company_id_from_user` trigger automatically assigns `company_id` on insert.
- The dashboard's read-only overview shows the same folder/manual structure.

## API Surface

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/manuals/{id}/index` | JWT | Trigger RAG indexing for a manual |

> Upload, edit, delete, and folder management are handled directly via Supabase client (RLS-gated).

## Data Model

- **Table `manuals`:** `id`, `user_id`, `company_id`, `folder_id`, `title`, `description`, `manual_type` (`pdf` or `web`), `file_path` (nullable), `file_name` (nullable), `file_size` (bigint — PDF byte size for PDFs; aggregate image size for web manuals), `page_count`, `is_public`, `display_order`, `extraction_status`, `rag_status`, `rag_error`, `summary`, `summary_embedding VECTOR(1536)`, `created_at`, `updated_at`.
- **Table `manual_sections`:** `id`, `manual_id`, `title`, `content`, `display_order`, `created_at`, `updated_at`. Contains the Markdown content for Web Manuals. Deleted via `ON DELETE CASCADE` when the manual is deleted.
- **Table `web_manual_images`:** `id`, `manual_id` (FK → `manuals`, `ON DELETE CASCADE`), `storage_path`, `file_name`, `file_size` (bigint). Tracks each image uploaded to the Image Library. DB rows cascade on manual delete; storage files must be explicitly deleted before the DB delete.
- **Table `folders`:** `id`, `user_id`, `company_id`, `name`, `description`, `display_order`, `created_at`, `updated_at`.
- **Storage Bucket `manuals`:** Private. PDF files stored as `{user_id}/{filename}`. RLS restricts access to company members.
- **Storage Bucket `web_images`:** Public. Web Manual images stored as `{user_id}/{manual_id}/{timestamp}_{filename}`. Publicly accessible to allow portal visitors to view images embedded in markdown.

## Acceptance Criteria
- [ ] Admin can upload a PDF and see it appear in the list with `rag_status: pending`.
- [ ] `rag_status` transitions correctly to `completed` or `failed` with a readable error.
- [ ] Deleting a PDF manual removes its storage file and DB row (cascades chunks).
- [ ] Deleting a Web Manual removes all image files from storage then the DB row (cascades sections, chunks, image rows).
- [ ] Toggling `is_public` updates the value and reflects immediately in the UI.
- [ ] Moving a manual to a folder updates `folder_id` and reorganizes the view.
- [ ] A user without `page.manuals` is blocked from accessing this page.
- [ ] Uploading an image to the Image Library increments `manuals.file_size`.
- [ ] Deleting an image from the Image Library decrements `manuals.file_size` and removes the storage file.
- [ ] Inserting an image from the library pastes `![filename](url)` at the cursor position in the textarea.
- [ ] A `#section-{id}` link in the viewer navigates to the target section without a page reload.
- [ ] The "Copy Section Link" button copies `#section-{id}` to the clipboard.
