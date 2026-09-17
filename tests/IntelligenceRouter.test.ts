import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @google/genai before importing the router ───────────────────────────

const mockGenerateContent = vi.fn();
const mockGenerateVideos = vi.fn();
const mockOperations = { get: vi.fn() };

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
      generateVideos: mockGenerateVideos,
    };
    operations = mockOperations;
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      ARRAY: 'ARRAY',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
    },
  };
});

import { IntelligenceRouter, TaskComplexity } from '../services/IntelligenceRouter';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IntelligenceRouter', () => {
  let router: IntelligenceRouter;

  beforeEach(() => {
    router = new IntelligenceRouter();
    mockGenerateContent.mockResolvedValue({ text: () => '{}' });
    mockGenerateVideos.mockResolvedValue({ operation: { name: 'op-1' } });
  });

  // ── Model selection ─────────────────────────────────────────────────────────

  describe('model routing (via execute)', () => {
    const complexities: { complexity: TaskComplexity; expected: string }[] = [
      { complexity: 'FAST_ANALYSIS', expected: 'gemini-3-flash-preview' },
      { complexity: 'DEEP_REASONING', expected: 'gemini-3-pro-preview' },
      { complexity: 'VISION_ANALYSIS', expected: 'gemini-3-pro-image-preview' },
      { complexity: 'CREATIVE_EDIT', expected: 'gemini-2.5-flash-image' },
      { complexity: 'LOCATION_SERVICES', expected: 'gemini-2.5-flash' },
    ];

    for (const { complexity, expected } of complexities) {
      it(`routes ${complexity} to model "${expected}"`, async () => {
        await router.execute(complexity, 'test prompt');
        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({ model: expected }),
        );
        mockGenerateContent.mockClear();
      });
    }
  });

  // ── execute() ───────────────────────────────────────────────────────────────

  describe('execute()', () => {
    it('throws when called with VIDEO_GENERATION complexity', async () => {
      await expect(router.execute('VIDEO_GENERATION', 'make a video')).rejects.toThrow(
        /video generation/i,
      );
    });

    it('passes string contents wrapped in a parts array', async () => {
      await router.execute('FAST_ANALYSIS', 'my prompt');
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: { parts: [{ text: 'my prompt' }] },
        }),
      );
    });

    it('passes object contents as-is', async () => {
      const contents = { parts: [{ text: 'structured' }] };
      await router.execute('FAST_ANALYSIS', contents);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ contents }),
      );
    });

    it('applies thinkingConfig for DEEP_REASONING when thinkingBudget is set', async () => {
      await router.execute('DEEP_REASONING', 'deep prompt', { thinkingBudget: 1024 });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            thinkingConfig: { thinkingBudget: 1024 },
          }),
        }),
      );
    });

    it('does NOT apply thinkingConfig for FAST_ANALYSIS', async () => {
      await router.execute('FAST_ANALYSIS', 'fast prompt', { thinkingBudget: 1024 });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({ thinkingConfig: expect.anything() }),
        }),
      );
    });

    it('forwards responseMimeType in config', async () => {
      await router.execute('FAST_ANALYSIS', 'test', { responseMimeType: 'application/json' });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ responseMimeType: 'application/json' }),
        }),
      );
    });
  });

  // ── generateVideo() ─────────────────────────────────────────────────────────

  describe('generateVideo()', () => {
    it('calls generateVideos with the veo model', async () => {
      await router.generateVideo('Aerial flyover of flooded room');
      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'veo-3.1-fast-generate-preview' }),
      );
    });

    it('attaches image payload when base64 image is supplied', async () => {
      const fakeBase64 = 'data:image/png;base64,abc123';
      await router.generateVideo('Panoramic view', fakeBase64);
      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          image: { imageBytes: 'abc123', mimeType: 'image/png' },
        }),
      );
    });

    it('does not attach image payload when no image is provided', async () => {
      await router.generateVideo('Simple prompt');
      const call = mockGenerateVideos.mock.calls[0][0];
      expect(call.image).toBeUndefined();
    });
  });

  // ── getOperationsClient() ───────────────────────────────────────────────────

  describe('getOperationsClient()', () => {
    it('returns the operations client from the underlying AI instance', () => {
      expect(router.getOperationsClient()).toBe(mockOperations);
    });
  });

  // ── Higher-level methods ────────────────────────────────────────────────────

  describe('generateTasks() � removed in local refactor', () => {
    it('calls execute with FAST_ANALYSIS', async () => {
      await router.generateTasks('project context');
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
      );
    });
  });

  describe('generateScope()', () => {
    it('calls execute with DEEP_REASONING', async () => {
      await router.generateScope('room data');
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-pro-preview' }),
      );
    });
  });

  describe('generateNarrative()', () => {
    it('calls execute with DEEP_REASONING', async () => {
      await router.generateNarrative({ currentStage: 'Monitor' });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-pro-preview' }),
      );
    });
  });

  describe('parseFieldIntent()', () => {
    it('calls execute with FAST_ANALYSIS', async () => {
      await router.parseFieldIntent('temp 75 rh 50', {});
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
      );
    });
  });
});
