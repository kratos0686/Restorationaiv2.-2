import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Mock Three.js and React Three Fiber
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props} data-testid={(props['data-testid'] as string) || "canvas"}>{children}</div>,
  useFrame: vi.fn(),
  useLoader: vi.fn(),
  useThree: vi.fn(() => ({
    size: { width: 800, height: 600 },
    viewport: { width: 8, height: 6 },
    camera: { position: [0, 0, 5] },
  })),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => <div data-testid="orbit-controls" />,
  Html: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="html-overlay">{children}</div>,
  useTexture: vi.fn(() => ({})),
  useGLTF: vi.fn(() => ({ scene: { children: [] } })),
}));

vi.mock('three', async () => {
  const actual = await vi.importActual('three') as Record<string, unknown>;
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});
