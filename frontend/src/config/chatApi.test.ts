import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('CHAT_API_CONFIG URL normalization', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('keeps the /api/v1 suffix when VITE_API_URL already includes it', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1');
        const { CHAT_API_CONFIG } = await import('./chatApi');
        expect(CHAT_API_CONFIG.BASE_URL).toBe('https://api.example.com/api/v1');
    });

    it('appends /api/v1 when VITE_API_URL is bare domain', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.example.com');
        const { CHAT_API_CONFIG } = await import('./chatApi');
        expect(CHAT_API_CONFIG.BASE_URL).toBe('https://api.example.com/api/v1');
    });

    it('appends /api/v1 when VITE_API_URL has trailing slash', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
        const { CHAT_API_CONFIG } = await import('./chatApi');
        expect(CHAT_API_CONFIG.BASE_URL).toBe('https://api.example.com/api/v1');
    });

    it('uses localhost default when VITE_API_URL is not set', async () => {
        vi.stubEnv('VITE_API_URL', '');
        const { CHAT_API_CONFIG } = await import('./chatApi');
        // The empty string falls back to the default
        expect(CHAT_API_CONFIG.BASE_URL).toBe('http://localhost:8000/api/v1');
    });

    it('handles bare domains by prepending https://', async () => {
        vi.stubEnv('VITE_API_URL', 'DokSights-staging.up.railway.app');
        const { CHAT_API_CONFIG } = await import('./chatApi');
        expect(CHAT_API_CONFIG.BASE_URL).toBe('https://DokSights-staging.up.railway.app/api/v1');
    });

    it('exposes the correct CHAT_STREAM and DISCOVER endpoint constants', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1');
        const { CHAT_API_CONFIG } = await import('./chatApi');
        expect(CHAT_API_CONFIG.ENDPOINTS.CHAT_STREAM).toBe('/chat/stream');
        expect(CHAT_API_CONFIG.ENDPOINTS.DISCOVER).toBe('/chat/discover');
    });
});
