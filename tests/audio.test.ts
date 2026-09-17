import { describe, it, expect } from 'vitest';
import { encode, decode, decodeAudioData } from '../utils/audio';

// ─── encode / decode ──────────────────────────────────────────────────────────

describe('encode', () => {
  it('encodes a Uint8Array to a base64 string', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(encode(bytes)).toBe(btoa('Hello'));
  });

  it('returns an empty string when given empty bytes', () => {
    expect(encode(new Uint8Array(0))).toBe('');
  });

  it('handles all 256 byte values without throwing', () => {
    const all = new Uint8Array(256);
    all.forEach((_, i) => { all[i] = i; });
    expect(() => encode(all)).not.toThrow();
  });
});

describe('decode', () => {
  it('decodes a base64 string back to Uint8Array', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]);
    const b64 = encode(original);
    const decoded = decode(b64);
    expect(decoded).toEqual(original);
  });

  it('returns empty Uint8Array for empty base64 string', () => {
    expect(decode('')).toEqual(new Uint8Array(0));
  });
});

describe('encode / decode round-trip', () => {
  it('encode then decode is identity', () => {
    const input = new Uint8Array([1, 2, 3, 255, 0, 128, 64]);
    expect(decode(encode(input))).toEqual(input);
  });

  it('handles a 1024-byte random-ish payload', () => {
    const data = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) data[i] = i % 256;
    expect(decode(encode(data))).toEqual(data);
  });
});

// ─── decodeAudioData ──────────────────────────────────────────────────────────

describe('decodeAudioData', () => {
  const makeCtx = (sampleRate = 24000) => {
    const buffers: Float32Array[] = [];
    return {
      sampleRate,
      createBuffer: (numChannels: number, frameCount: number, sr: number) => {
        const buf = {
          numberOfChannels: numChannels,
          sampleRate: sr,
          length: frameCount,
          _channels: Array.from({ length: numChannels }, () => new Float32Array(frameCount)),
          getChannelData(ch: number) { return buf._channels[ch]; },
        };
        buffers.push(buf._channels[0]);
        return buf;
      },
      _buffers: buffers,
    };
  };

  it('creates an AudioBuffer with the correct frame count (mono)', async () => {
    // 4 Int16 samples → 4 frames
    const samples = new Int16Array([0, 16384, -16384, 32767]);
    const data = new Uint8Array(samples.buffer);
    const ctx = makeCtx();
    const buf = await decodeAudioData(data, ctx as unknown as AudioContext, 24000, 1);
    expect(buf.length).toBe(4);
  });

  it('normalises Int16 values to [-1, 1] range', async () => {
    // 32768 → -1.0, 0 → 0.0, 32767 → ~+1.0
    const samples = new Int16Array([-32768, 0, 32767]);
    const data = new Uint8Array(samples.buffer);
    const ctx = makeCtx();
    const buf = await decodeAudioData(data, ctx as unknown as AudioContext, 24000, 1);
    const ch = buf.getChannelData(0);
    expect(ch[0]).toBeCloseTo(-1.0, 4);
    expect(ch[1]).toBe(0);
    expect(ch[2]).toBeGreaterThan(0.99);
  });

  it('handles stereo interleaved data', async () => {
    // 4 interleaved stereo samples → 2 frames per channel
    // L0, R0, L1, R1
    const samples = new Int16Array([100, 200, 300, 400]);
    const data = new Uint8Array(samples.buffer);
    const ctx = makeCtx();
    const buf = await decodeAudioData(data, ctx as unknown as AudioContext, 24000, 2);
    expect(buf.length).toBe(2); // 4 samples / 2 channels = 2 frames
    expect(buf.getChannelData(0)[0]).toBeCloseTo(100 / 32768, 5);
    expect(buf.getChannelData(1)[0]).toBeCloseTo(200 / 32768, 5);
  });
});
