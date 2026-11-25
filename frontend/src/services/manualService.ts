
import { CHAT_API_CONFIG } from '@/config/chatApi';

export const manualService = {
    /**
     * Triggers the backend to process (index) a manual for RAG.
     * This involves downloading the PDF, extracting text, and generating embeddings.
     */
    processManual: async (manualId: string, accessToken: string) => {
        const response = await fetch(`${CHAT_API_CONFIG.BASE_URL}/manuals/${manualId}/process`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to trigger manual processing: ${response.statusText}`);
        }

        return response.json();
    }
};
