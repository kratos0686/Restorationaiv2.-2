import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../services/api', () => ({
  addProject: vi.fn(),
}));

vi.mock('../services/AIRouterClient', () => ({
  AIRouterClient: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ text: '{}' }),
  })),
}));

vi.mock('../services/EventBus', () => ({
  EventBus: { publish: vi.fn(), on: vi.fn(() => vi.fn()) },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import NewProject from '../components/NewProject';
import { useAppContext } from '../context/AppContext';
import { addProject } from '../services/api';
import type { Project } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCtx = {
  setActiveTab: vi.fn(),
  setSelectedProjectId: vi.fn(),
  currentUser: { id: 'u-1', companyId: 'c-1', name: 'Alice', role: 'Technician', email: 'a@a.com', permissions: [] },
  isOnline: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NewProject', () => {
  beforeEach(() => {
    vi.mocked(useAppContext).mockReturnValue(mockCtx as unknown as ReturnType<typeof useAppContext>);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  it('renders the "Loss Intake" heading', () => {
    render(<NewProject />);
    expect(screen.getByText('Loss Intake')).toBeInTheDocument();
  });

  it('renders the "Start Job" button', () => {
    render(<NewProject />);
    expect(screen.getByRole('button', { name: /Start Job/i })).toBeInTheDocument();
  });

  it('renders the AI Scribe section', () => {
    render(<NewProject />);
    expect(screen.getByText(/Intelligent Scribe/i)).toBeInTheDocument();
  });

  it('back button navigates to losses', () => {
    render(<NewProject />);
    const backBtn = screen.getAllByRole('button').find(
      b => b.querySelector('svg.lucide-arrow-left'),
    );
    fireEvent.click(backBtn!);
    expect(mockCtx.setActiveTab).toHaveBeenCalledWith('losses');
  });

  it('shows validation alert when required fields are empty', async () => {
    render(<NewProject />);
    fireEvent.click(screen.getByRole('button', { name: /Start Job/i }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/required fields/i));
  });

  it('calls addProject and navigates when required fields are filled', async () => {
    vi.mocked(addProject).mockResolvedValue({
      id: 'new-p',
      client: 'Test Client',
      address: '1 Main St',
    } as unknown as Project);

    render(<NewProject />);

    // Fill in the location and client name using real placeholder text
    const locationInput = screen.getByPlaceholderText('123 Example St');
    const clientInput = screen.getByPlaceholderText('Jane Doe');
    fireEvent.change(locationInput, { target: { value: '99 Oak Ave, Springfield' } });
    fireEvent.change(clientInput, { target: { value: 'John Doe' } });

    fireEvent.click(screen.getByRole('button', { name: /Start Job/i }));

    await waitFor(() => expect(addProject).toHaveBeenCalled());
    expect(mockCtx.setSelectedProjectId).toHaveBeenCalledWith('new-p');
    expect(mockCtx.setActiveTab).toHaveBeenCalledWith('loss-detail');
  });

  it('renders the Risk Address and Client Name inputs', () => {
    render(<NewProject />);
    expect(screen.getByPlaceholderText('123 Example St')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Jane Doe')).toBeInTheDocument();
  });

  it('renders the GPS / Use My Location button', () => {
    render(<NewProject />);
    // The button has title="Use My Location"
    expect(screen.getByTitle('Use My Location')).toBeInTheDocument();
  });

  it('uses geolocation on GPS button click (geolocation success path)', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 34.05, longitude: -118.25 } } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: mockGetCurrentPosition } });

    render(<NewProject />);
    fireEvent.click(screen.getByTitle('Use My Location'));
    await waitFor(() => expect(mockGetCurrentPosition).toHaveBeenCalled());
  });
});
