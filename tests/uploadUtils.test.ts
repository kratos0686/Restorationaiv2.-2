import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadFileInChunks } from '../utils/uploadUtils';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('uploadFileInChunks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Creates a fake File of the given size (filled with zeros).
   */
  const makeFile = (sizeBytes: number) =>
    new File([new Uint8Array(sizeBytes)], 'upload.bin', { type: 'application/octet-stream' });

  it('returns true when server responds 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null } }));
    const result = await uploadFileInChunks(makeFile(100), 'https://example.com/session');
    expect(result).toBe(true);
  });

  it('returns true when server responds 201', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 201, headers: { get: () => null } }));
    const result = await uploadFileInChunks(makeFile(100), 'https://example.com/session');
    expect(result).toBe(true);
  });

  it('uses the correct HTTP method (PUT)', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null } });
    vi.stubGlobal('fetch', spy);
    await uploadFileInChunks(makeFile(50), 'https://example.com/session');
    expect(spy).toHaveBeenCalledWith('https://example.com/session', expect.objectContaining({ method: 'PUT' }));
  });

  it('sends the correct Content-Range header for a single-chunk upload', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null } });
    vi.stubGlobal('fetch', spy);
    await uploadFileInChunks(makeFile(100), 'https://example.com/session');
    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Range']).toBe('bytes 0-99/100');
  });

  it('sends multiple requests when the file exceeds the chunk size', async () => {
    // Each chunk is 5 MB; file is 6 MB → expect 2 PUT requests
    const CHUNK = 5 * 1024 * 1024;
    const FILE_SIZE = CHUNK + 1024; // slightly over one chunk

    const spy = vi
      .fn()
      // first call: 308 with Range header indicating full first chunk committed
      .mockResolvedValueOnce({
        status: 308,
        headers: { get: () => `bytes=0-${CHUNK - 1}` },
      })
      // second call: 200 – upload complete
      .mockResolvedValue({ status: 200, headers: { get: () => null } });

    vi.stubGlobal('fetch', spy);
    const result = await uploadFileInChunks(makeFile(FILE_SIZE), 'https://example.com/session');
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('continues looping on network error (error is caught, not re-thrown)', async () => {
    // Simulate one network error then a successful 200 to verify the catch+retry path
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0; }); // skip 2 s wait
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ status: 200, headers: { get: () => null } });
    }));

    const result = await uploadFileInChunks(makeFile(1), 'https://example.com/session');
    // After one error the loop retries and gets 200 → true
    expect(result).toBe(true);
    expect(calls).toBe(2);
  });

  it('handles 308 without a Range header by advancing startByte by chunk size', async () => {
    const CHUNK = 5 * 1024 * 1024;
    const FILE_SIZE = CHUNK + 100;

    const spy = vi
      .fn()
      .mockResolvedValueOnce({ status: 308, headers: { get: () => null } }) // no Range header
      .mockResolvedValue({ status: 200, headers: { get: () => null } });

    vi.stubGlobal('fetch', spy);
    const result = await uploadFileInChunks(makeFile(FILE_SIZE), 'https://example.com/session');
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
