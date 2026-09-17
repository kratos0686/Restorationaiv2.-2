import { describe, it, expect, vi, afterEach } from 'vitest';
import { blobToBase64 } from '../utils/photoutils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a FileReader class mock whose readAsDataURL fires onloadend (or
 * onerror) asynchronously with the provided result.
 */
function makeFileReaderClass(result: string | null, fail = false) {
  return class MockFileReader {
    result = result;
    onloadend: (() => void) | undefined;
    onerror: ((e: unknown) => void) | undefined;

    readAsDataURL(blob: Blob) {
      void blob; // used by real FileReader; parameter required by interface
      if (fail) {
        setTimeout(() => this.onerror?.(new Error('read error')), 0);
      } else {
        setTimeout(() => this.onloadend?.(), 0);
      }
    }
  };
}

describe('blobToBase64', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('strips the data-URI prefix and returns only the base64 content', async () => {
    vi.stubGlobal('FileReader', makeFileReaderClass('data:image/jpeg;base64,/9j/4AAQ'));

    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    const result = await blobToBase64(blob);
    expect(result).toBe('/9j/4AAQ');
  });

  it('rejects when the FileReader fires an error', async () => {
    vi.stubGlobal('FileReader', makeFileReaderClass(null, true));

    const blob = new Blob(['bad']);
    await expect(blobToBase64(blob)).rejects.toBeInstanceOf(Error);
  });

  it('handles a data-URI with multiple commas — split(",")[1] is the second array element', async () => {
    // JavaScript split(',') splits on every comma, so:
    // 'data:text/plain;base64,abc,def'.split(',')
    //   → ['data:text/plain;base64', 'abc', 'def']
    // [1] is 'abc' (not 'abc,def')
    vi.stubGlobal('FileReader', makeFileReaderClass('data:text/plain;base64,abc,def'));

    const blob = new Blob(['test'], { type: 'text/plain' });
    const result = await blobToBase64(blob);
    // split(',')[1] → 'abc' (the second element in the split array, not 'abc,def')
    expect(result).toBe('abc');
  });
});
