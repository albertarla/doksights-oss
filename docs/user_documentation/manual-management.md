# Manual Management

At the heart of DokSights is your library of manuals. Whether you have legacy PDFs or want to create modern, web-native documentation, DokSights handles it all.

## 📁 Manual Types

DokSights supports two primary formats:

### 1. PDF Manuals
The classic format. Simply upload your PDF file, and DokSights will:
- Extract all text and structure.
- Chunk the content for AI retrieval.
- Generate a concise summary.
- Provide a high-performance web viewer for your users.

### 2. Web Manuals
Web Manuals allow you to create structured, section-based content directly within DokSights.
- **Sections**: Break your manual into logical parts (e.g., "Introduction", "Installation", "Safety").
- **Rich Content**: Each section supports text and images.
- **Dynamic Updates**: Edit sections on the fly without needing to re-upload files.

## 📤 Adding Content

1. Navigate to **Manuals Management**.
2. Click the **"New Manual"** button.
3. Choose between **PDF** or **Web Manual**.
4. Fill in the title and description.
5. **PDF**: Upload your file.
6. **Web Manual**: Start adding sections.
7. Set the **Public** toggle:
   - **Public**: Visible on your company portal.
   - **Private**: Only visible to authenticated team members.

## 🏷️ Organizing with Folders

Folders help you categorize manuals by product line, document type, or any other criteria.
- Create folders with a name and optional description.
- Assign manuals to folders during creation or by editing them later.
- Drag and drop (or use the display order) to organize how folders and manuals appear on your portal.

## 🔍 AI Indexing (RAG)

Once a manual is uploaded or created, DokSights initiates the **RAG (Retrieval-Augmented Generation)** pipeline.
- **Status**: You can see the status (`Pending`, `Processing`, `Completed`, or `Error`) in the manual list.
- **AI Chat**: AI features are only available once the status is `Completed`.
- **Summaries**: DokSights automatically generates a summary of the manual which is used by the Discovery AI to recommend relevant content.

## 🛠️ Editing and Deleting

- **Editing**: You can update titles, descriptions, folder assignments, and visibility at any time.
- **Deleting**: Deleting a manual will remove all its chunks from the AI index and delete any associated files from storage. This action is permanent.

---

> [!TIP]
> Use high-quality, text-searchable PDFs for the best AI chat experience. Scanned images without OCR may not perform as well.
