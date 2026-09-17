import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Use the REAL EventBus singleton so EventToast and tests share the same instance
import EventToast from '../components/EventToast';
import { EventBus } from '../services/EventBus';

// Helper to wipe listeners between tests
const clearBus = () => {
  (EventBus as unknown as { listeners: Record<string, unknown[]> }).listeners = {};
};

// Mock useAppContext
vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(() => ({
    setActiveTab: vi.fn(),
    setSelectedProjectId: vi.fn(),
    markNotificationAsRead: vi.fn(),
  })),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EventToast', () => {
  beforeEach(() => {
    clearBus();
  });

  it('renders an empty toast container initially', () => {
    const { container } = render(<EventToast />);
    // No toast items — no slide-in containers
    expect(container.querySelectorAll('[class*="animate-in"]')).toHaveLength(0);
  });

  it('displays a toast when an event with ui data is published', async () => {
    render(<EventToast />);
    act(() => {
      EventBus.publish(
        'com.restorationai.test.event',
        {},
        undefined,
        'Project saved successfully',
        'success',
      );
    });
    expect(await screen.findByText('Project saved successfully')).toBeInTheDocument();
  });

  it('uses the last segment of the event type as the toast title', async () => {
    render(<EventToast />);
    act(() => {
      EventBus.publish('com.restorationai.project.updated', {}, undefined, 'Some message', 'info');
    });
    // Title is "UPDATED"
    expect(await screen.findByText('UPDATED')).toBeInTheDocument();
  });

  it('does NOT show a toast for events that have no ui payload', () => {
    render(<EventToast />);
    act(() => {
      // Publish without a uiMessage → no ui payload
      EventBus.publish('com.restorationai.silent.event', {});
    });
    // No toast title elements
    expect(screen.queryByText(/SILENT/i)).toBeNull();
  });

  it('removes the toast after the dismiss button is clicked', async () => {
    render(<EventToast />);
    act(() => {
      EventBus.publish('com.restorationai.test', {}, undefined, 'Dismiss me', 'warning');
    });
    await screen.findByText('Dismiss me');
    // The X dismiss button is the last button in the DOM at this point
    const buttons = screen.getAllByRole('button');
    const xBtn = buttons[buttons.length - 1];
    fireEvent.click(xBtn);
    await waitFor(() =>
      expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument(),
    );
  });

  it('shows a maximum of 4 toasts at once', async () => {
    render(<EventToast />);
    act(() => {
      for (let i = 1; i <= 6; i++) {
        EventBus.publish(`com.restorationai.test.${i}`, {}, undefined, `Message ${i}`, 'info');
      }
    });
    // Only 4 titles visible (capped at slice 0..4)
    await waitFor(() => {
      const titles = screen.getAllByText(/MESSAGE \d+/i);
      expect(titles.length).toBeLessThanOrEqual(4);
    });
  });
});
