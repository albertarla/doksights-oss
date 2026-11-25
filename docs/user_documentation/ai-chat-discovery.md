# AI Chat & Discovery

DokSights uses advanced AI to make your manuals interactive. Instead of searching for keywords, your users can ask natural language questions and get precise answers based on your content.

## 💬 AI Chat (Manual-Specific)

When a user opens a specific manual, they can access the **AI Chat Panel**.
- **Context-Aware**: The AI only answers based on the content of the *current* manual.
- **Source Citations**: (Future Feature) The AI will soon point to the exact page or section it retrieved information from.
- **Natural Language**: Users can ask complex questions like "How do I troubleshoot error code 404?" or "Summarize the safety precautions for installation."

## 🔍 Manual Discovery

The **Discovery Search** on the portal home page helps users find the right manual when they aren't sure where to look.
- **Natural Language Query**: Instead of typing "X-100 Manual", a user can type "I need to know how to clean my coffee machine."
- **AI Recommendation**: The Discovery AI analyzes all your public manuals and recommends the top 3 most relevant ones.
- **Interactive Sidebar**: Recommendations appear in a chat-like sidebar, allowing users to jump straight to the manual they need.

## 🤖 How it Works (RAG)

DokSights uses a technology called **RAG (Retrieval-Augmented Generation)**:
1. **Indexing**: We break your manuals into small "chunks" and convert them into mathematical vectors (embeddings).
2. **Retrieval**: When a user asks a question, we find the most relevant chunks from your library.
3. **Generation**: We send those chunks along with the user's question to a Large Language Model (like Gemini or GPT-4) to generate a helpful response.

## 🧠 AI Models

DokSights is powered by industry-leading AI models. Your system administrator can configure which provider (Google or OpenAI) is used to ensure the best balance of speed and accuracy.

---

> [!TIP]
> Encourage your users to ask complete questions. The more context they provide, the more accurate the AI's response will be.
