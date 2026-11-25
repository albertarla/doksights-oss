// Ensure the base URL always includes the /api/v1 prefix.
// VITE_API_URL should be the full base including prefix, e.g. https://api.example.com/api/v1
// This guard also handles the case where only the domain was configured (legacy).
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// 1. Strip trailing slash
let base = rawApiUrl.replace(/\/$/, '');

// 2. Prepend protocol if missing (e.g. bare Railway domain)
if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'https://' + base;
}

// 3. Ensure the /api/v1 suffix is present
const normalizedBaseUrl = base.endsWith('/api/v1')
    ? base
    : base + '/api/v1';

export const CHAT_API_CONFIG = {
    BASE_URL: normalizedBaseUrl,
    ENDPOINTS: {
        CHAT_STREAM: '/chat/stream',
        DISCOVER: '/chat/discover',
    },
};
