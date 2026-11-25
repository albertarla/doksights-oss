import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatService, ChatService } from './chatService';
import { manualService } from './manualService';

// ── chatService ──────────────────────────────────────────────────────────

// Helper that creates a mock SSE ReadableStream from an array of data lines
function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

describe('ChatService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ChatService.getInstance returns a singleton', () => {
    const a = ChatService.getInstance();
    const b = ChatService.getInstance();
    expect(a).toBe(b);
  });

  describe('sendMessage', () => {
    it('calls onChunk for each content chunk in the SSE stream', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createSSEStream([
          'data: {"content": "Hello"}',
          'data: {"content": " world"}',
          'data: [DONE]',
        ]),
      });

      const onChunk = vi.fn();
      const onError = vi.fn();
      const onComplete = vi.fn();

      await chatService.sendMessage(
        { messages: [{ role: 'user', content: 'Hi' }], manualId: 'm1' },
        'token-abc',
        onChunk,
        onError,
        onComplete
      );

      expect(onChunk).toHaveBeenCalledWith('Hello');
      expect(onChunk).toHaveBeenCalledWith(' world');
      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('sends Authorization header when token is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createSSEStream([]),
      });

      await chatService.sendMessage(
        { messages: [], manualId: 'm1' },
        'my-token',
        vi.fn(), vi.fn(), vi.fn()
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer my-token');
    });

    it('does NOT send Authorization header when token is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createSSEStream([]),
      });

      await chatService.sendMessage(
        { messages: [], manualId: 'm1', linkId: 'link-1' },
        null,
        vi.fn(), vi.fn(), vi.fn()
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('calls onError when the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const onError = vi.fn();
      await chatService.sendMessage(
        { messages: [], manualId: 'm1' },
        null,
        vi.fn(), onError, vi.fn()
      );

      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Request failed: 401')
      );
    });

    it('calls onError when fetch throws a network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const onError = vi.fn();
      await chatService.sendMessage(
        { messages: [], manualId: 'm1' },
        'token',
        vi.fn(), onError, vi.fn()
      );

      expect(onError).toHaveBeenCalledWith('Network failure');
    });

    it('calls onError for SSE error chunks', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createSSEStream(['data: {"error": "Something went wrong"}']),
      });

      const onError = vi.fn();
      await chatService.sendMessage(
        { messages: [], manualId: 'm1' },
        'token',
        vi.fn(), onError, vi.fn()
      );

      expect(onError).toHaveBeenCalledWith('Something went wrong');
    });
  });

  describe('discoverManuals', () => {
    it('calls onError immediately when no token and no company_slug', async () => {
      const onError = vi.fn();
      await chatService.discoverManuals(
        { messages: [] },
        null,
        vi.fn(), onError, vi.fn()
      );

      expect(onError).toHaveBeenCalledWith(
        'Authentication or company slug required for manual discovery'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('proceeds with company_slug even when token is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createSSEStream(['data: {"content": "Result"}']),
      });

      const onChunk = vi.fn();
      await chatService.discoverManuals(
        { messages: [], company_slug: 'acme' },
        null,
        onChunk, vi.fn(), vi.fn()
      );

      expect(onChunk).toHaveBeenCalledWith('Result');
    });
  });
});

// ── manualService ────────────────────────────────────────────────────────

describe('manualService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the correct endpoint with Authorization header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'processing' }),
    });

    await manualService.processManual('manual-1', 'token-abc');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/manuals/manual-1/process');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer token-abc');
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Unprocessable Entity',
    });

    await expect(manualService.processManual('m1', 'tok')).rejects.toThrow(
      'Failed to trigger manual processing: Unprocessable Entity'
    );
  });
});
