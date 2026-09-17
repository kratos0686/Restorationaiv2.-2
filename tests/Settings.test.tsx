import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import Settings from '../components/Settings';
import { useAppContext } from '../context/AppContext';
import { AppSettings } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseSettings: AppSettings = {
  language: 'English (US)',
  dateFormat: 'Month/Day/Year',
  timeFormat: 'Twelve Hours (AM/PM)',
  units: {
    temperature: 'Fahrenheit',
    dimension: 'Inches',
    humidity: 'Grains / Pound',
    volume: 'Pint',
  },
  copyPhotosToGallery: true,
  defaultView: 'Timeline',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Settings', () => {
  const mockSetActiveTab = vi.fn();
  const mockUpdateSettings = vi.fn();

  beforeEach(() => {
    vi.mocked(useAppContext).mockReturnValue({
      setActiveTab: mockSetActiveTab,
      settings: baseSettings,
      updateSettings: mockUpdateSettings,
    } as unknown as ReturnType<typeof useAppContext>);
    mockSetActiveTab.mockClear();
    mockUpdateSettings.mockClear();
  });

  it('renders the "System Intelligence" heading', () => {
    render(<Settings />);
    expect(screen.getByText(/System Intelligence/i)).toBeInTheDocument();
  });

  it('displays the current language setting', () => {
    render(<Settings />);
    expect(screen.getByText('English (US)')).toBeInTheDocument();
  });

  it('displays the current date format', () => {
    render(<Settings />);
    expect(screen.getByText('Month/Day/Year')).toBeInTheDocument();
  });

  it('displays the current temperature unit', () => {
    render(<Settings />);
    expect(screen.getByText(/Fahrenheit/i)).toBeInTheDocument();
  });

  it('calls setActiveTab("dashboard") when the back button is clicked', () => {
    render(<Settings />);
    // The only ArrowLeft button in the header
    const backBtn = screen.getAllByRole('button')[0];
    fireEvent.click(backBtn);
    expect(mockSetActiveTab).toHaveBeenCalledWith('dashboard');
  });

  it('calls updateSettings to toggle the copyPhotosToGallery preference', () => {
    render(<Settings />);
    // The text in the UI is "Device Gallery Auto-Save"
    const toggleBtn = screen.getByText('Device Gallery Auto-Save').closest('div')?.nextElementSibling;
    fireEvent.click(toggleBtn!);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ copyPhotosToGallery: false });
  });
});
