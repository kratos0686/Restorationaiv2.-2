import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../services/api', () => ({
  getProjects: vi.fn().mockResolvedValue([]),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import Reporting from '../components/Reporting';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Reporting', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  it('renders the "Reporting Center" heading', async () => {
    render(<Reporting />);
    expect(await screen.findByText(/Reporting Center/i)).toBeInTheDocument();
  });

  it('renders all four report cards', async () => {
    render(<Reporting />);
    expect(await screen.findByText('Quarterly Financial Summary')).toBeInTheDocument();
    expect(screen.getByText('Equipment Utilization')).toBeInTheDocument();
    expect(screen.getByText('Team Productivity')).toBeInTheDocument();
    expect(screen.getByText('All Projects Export')).toBeInTheDocument();
  });

  it('calls window.alert for non-CSV report types', async () => {
    render(<Reporting />);
    // Wait for async effect to settle
    await screen.findByText(/Reporting Center/i);
    // Buttons contain SVG + text nodes, use a custom query
    const buttons = screen.getAllByRole('button').filter(
      b => (b.textContent ?? '').includes('Generate Report'),
    );
    fireEvent.click(buttons[0]);
    expect(window.alert).toHaveBeenCalled();
  });

  it('shows four "Generate Report" buttons', async () => {
    render(<Reporting />);
    await screen.findByText(/Reporting Center/i);
    const buttons = screen.getAllByRole('button').filter(
      b => (b.textContent ?? '').includes('Generate Report'),
    );
    expect(buttons).toHaveLength(4);
  });

  it('triggers a CSV download (appending a link) when clicking the "All Projects Export" button', async () => {
    render(<Reporting />);
    await screen.findByText(/Reporting Center/i);

    // Spy after render so the DOM is populated
    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el.nodeName === 'A') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });
    vi.spyOn(document.body, 'removeChild').mockReturnValue(undefined as unknown as ChildNode);

    const buttons = screen.getAllByRole('button').filter(
      b => (b.textContent ?? '').includes('Generate Report'),
    );
    // The "All Projects Export" card is the 4th
    fireEvent.click(buttons[3]);

    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    appendSpy.mockRestore();
  });
});
