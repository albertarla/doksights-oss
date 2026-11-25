import { CHAT_API_CONFIG } from '@/config/chatApi';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatRequest {
    messages: ChatMessage[];
    manualId: string;
    manualTitle?: string;
    manualDescription?: string | null;
    linkId?: string;
    sessionId?: string;
}

export class ChatService {
    private static instance: ChatService;

    private constructor() { }

    public static getInstance(): ChatService {
        if (!ChatService.instance) {
            ChatService.instance = new ChatService();
        }
        return ChatService.instance;
    }

    async sendMessage(
        request: ChatRequest,
        token: string | null,
        onChunk: (content: string) => void,
        onError: (error: string) => void,
        onComplete: () => void
    ): Promise<void> {
        try {
            // Validate: Must have either token OR linkId
            if (!token && !request.linkId && !request.manualId) {
                // Note: manualId is always present, but we need linkId for public access
                // If we are in public mode (no token), we effectively rely on manual_id + link_id
                // For now, let's allow it to proceed and let the backend reject if authorized.
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            // If no token, we don't send Authorization header. Backend handles public access via link_id.

            const response = await fetch(
                `${CHAT_API_CONFIG.BASE_URL}${CHAT_API_CONFIG.ENDPOINTS.CHAT_STREAM}`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        messages: request.messages,
                        manual_id: request.manualId,
                        manual_title: request.manualTitle,
                        manual_description: request.manualDescription,
                        link_id: request.linkId,
                        session_id: request.sessionId,
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Request failed: ${response.status} ${errorText}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let textBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                textBuffer += decoder.decode(value, { stream: true });

                // Process buffer line by line
                let newlineIndex: number;
                while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
                    const line = textBuffer.slice(0, newlineIndex);
                    textBuffer = textBuffer.slice(newlineIndex + 1);

                    if (!line.trim() || !line.startsWith('data: ')) continue;

                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            onChunk(parsed.content);
                        } else if (parsed.error) {
                            const errorMsg = parsed.message || (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error));
                            onError(errorMsg);
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE chunk:', data);
                    }
                }
            }

            onComplete();

        } catch (error) {
            onError(error instanceof Error ? error.message : 'Unknown error occurred');
        }
    }

    async discoverManuals(
        request: { messages: ChatMessage[]; company_slug?: string; sessionId?: string; },
        token: string | null,
        onChunk: (content: string) => void,
        onError: (error: string) => void,
        onComplete: () => void
    ): Promise<void> {
        try {
            // Public mode doesn't require token if company_slug is provided
            if (!token && !request.company_slug) {
                onError('Authentication or company slug required for manual discovery');
                return;
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(
                `${CHAT_API_CONFIG.BASE_URL}${CHAT_API_CONFIG.ENDPOINTS.DISCOVER}`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        messages: request.messages,
                        company_slug: request.company_slug,
                        session_id: request.sessionId,
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Request failed: ${response.status} ${errorText}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let textBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                textBuffer += decoder.decode(value, { stream: true });

                // Process buffer line by line
                let newlineIndex: number;
                while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
                    const line = textBuffer.slice(0, newlineIndex);
                    textBuffer = textBuffer.slice(newlineIndex + 1);

                    if (!line.trim() || !line.startsWith('data: ')) continue;

                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            onChunk(parsed.content);
                        } else if (parsed.error) {
                            const errorMsg = parsed.message || (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error));
                            onError(errorMsg);
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE chunk:', data);
                    }
                }
            }

            onComplete();

        } catch (error) {
            onError(error instanceof Error ? error.message : 'Unknown error occurred');
        }
    }
}

export const chatService = ChatService.getInstance();
