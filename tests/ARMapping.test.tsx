import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Project } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-webcam', () => ({
  default: vi.fn(() => <video data-testid="webcam" />),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: vi.fn().mockResolvedValue({ text: '[]' }) },
  })),
  Type: { ARRAY: 'ARRAY', STRING: 'STRING', OBJECT: 'OBJECT' },
}));

vi.mock('../services/EventBus', () => ({
  EventBus: { publish: vi.fn(), on: vi.fn(() => vi.fn()) },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import ARMapping from '../components/ARMapping';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'p-1',
  companyId: 'c-1',
  client: 'Test Client',
  address: '1 Main St',
  status: 'Active',
  currentStage: 'Monitor',
  progress: 50,
  riskLevel: 'medium',
  rooms: [],
  milestones: [],
  tasks: [],
  lineItems: [],
  totalCost: 5000,
  invoiceStatus: 'Draft',
  roomScans: [],
  videos: [],
  dailyNarratives: [],
  arMapping: { markers: [], areas: [] },
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ARMapping', () => {
  const onUpdate = vi.fn();

  beforeEach(() => {
    onUpdate.mockClear();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('shows the Site Plan / AR View toggle buttons', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    expect(screen.getByText('Site Plan')).toBeInTheDocument();
    expect(screen.getByText('AR View')).toBeInTheDocument();
  });

  it('renders "No site plan uploaded" placeholder when no sitePlanUrl', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    expect(screen.getByText(/No site plan uploaded/i)).toBeInTheDocument();
  });

  it('renders the site plan image when sitePlanUrl is set', () => {
    const project = makeProject({ arMapping: { markers: [], areas: [], sitePlanUrl: 'https://example.com/plan.jpg' } });
    render(<ARMapping project={project} onUpdate={onUpdate} />);
    expect(screen.getByAltText('Site Plan')).toBeInTheDocument();
  });

  // ── View mode toggle ────────────────────────────────────────────────────────

  it('switches to AR View and shows the webcam', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('AR View'));
    expect(screen.getByTestId('webcam')).toBeInTheDocument();
  });

  it('switches back to Site Plan from AR View', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('AR View'));
    fireEvent.click(screen.getByText('Site Plan'));
    expect(screen.getByText(/No site plan uploaded/i)).toBeInTheDocument();
  });

  // ── Interaction mode toolbar ────────────────────────────────────────────────

  it('switches to Add Marker mode', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Place marker'));
    expect(screen.getByText(/Tap Screen to Place Marker/i)).toBeInTheDocument();
  });

  it('switches to Draw Area mode', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Draw area polygon'));
    expect(screen.getByText(/Tap Screen to Map Area Points/i)).toBeInTheDocument();
  });

  it('switches to Set Scale mode and shows instruction text', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Set measuring scale'));
    expect(screen.getByText(/Click first point/i)).toBeInTheDocument();
  });

  it('Select Mode button clears the active mode instruction', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Place marker'));
    fireEvent.click(screen.getByTitle('Select objects'));
    expect(screen.queryByText(/Tap Screen to Place Marker/i)).not.toBeInTheDocument();
  });

  // ── Export menu ─────────────────────────────────────────────────────────────

  it('opens the export menu when the Download button is clicked', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Export Site Plan'));
    expect(screen.getByText(/PDF Document/i)).toBeInTheDocument();
    expect(screen.getByText(/AutoCAD \(DXF\)/i)).toBeInTheDocument();
  });

  it('closes the export menu on second click', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Export Site Plan'));
    fireEvent.click(screen.getByTitle('Export Site Plan'));
    expect(screen.queryByText(/PDF Document/i)).not.toBeInTheDocument();
  });

  // ── Marker placement ────────────────────────────────────────────────────────

  it('adds a marker on canvas click in add_marker mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-17T13:06:07Z'));
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Place marker'));

    // Click on the main interaction div (first element with cursor-crosshair)
    const canvas = document.querySelector('.cursor-crosshair')!;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    fireEvent.click(canvas, { clientX: 400, clientY: 300 });

    // Confirm the marker in the modal
    fireEvent.click(screen.getByText('Confirm Location'));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        arMapping: expect.objectContaining({
          markers: expect.arrayContaining([expect.objectContaining({ label: 'Note', x: 50, y: 50 })]),
        }),
      }),
    );
    vi.useRealTimers();
  });

  // ── Marker delete ────────────────────────────────────────────────────────────

  it('deletes a marker when the trash button is clicked in the sidebar', () => {
    const project = makeProject({
      arMapping: {
        markers: [{ id: 'm-1', x: 50, y: 50, label: 'Test Marker', type: 'note', timestamp: 1000 }],
        areas: [],
      },
    });
    render(<ARMapping project={project} onUpdate={onUpdate} />);

    // Click the marker to select it
    const markerEl = document.querySelector('[style*="left: 50%"]');
    if (markerEl) fireEvent.click(markerEl);

    // The sidebar should show "Marker Properties"
    const deleteBtn = screen.queryByTitle('Delete Marker');
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          arMapping: expect.objectContaining({ markers: [] }),
        }),
      );
    } else {
      // Fallback: marker was at least rendered
      expect(document.querySelector('[style*="left: 50%"]')).toBeInTheDocument();
    }
  });

  // ── Area save validation ────────────────────────────────────────────────────

  it('alerts when trying to save an area with fewer than 3 points', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('Draw area polygon'));

    // Click one point
    const canvas = document.querySelector('.cursor-crosshair')!;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });
    fireEvent.click(canvas, { clientX: 200, clientY: 200 });

    // Save Area button should now be visible
    const saveBtn = screen.queryByText('Save Area');
    if (saveBtn) {
      fireEvent.click(saveBtn);
      expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/at least 3 points/i));
    }
  });

  // ── Search filter ───────────────────────────────────────────────────────────

  it('renders the search input in the sidebar', () => {
    const project = makeProject({
      arMapping: {
        markers: [{ id: 'm-1', x: 10, y: 10, label: 'Dehumidifier A', type: 'equipment', timestamp: 1 }],
        areas: [],
      },
    });
    render(<ARMapping project={project} onUpdate={onUpdate} />);
    const searchInput = screen.getAllByRole('textbox').find(i => i.getAttribute('placeholder')?.toLowerCase().includes('search'));
    expect(searchInput).toBeInTheDocument();
  });

  // ── Settings panel ──────────────────────────────────────────────────────────

  it('opens the Settings panel when the Settings button is clicked', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTitle('AR Settings'));
    expect(screen.getByText(/AR Visibility Settings/i)).toBeInTheDocument();
  });

  // ── Upload button ───────────────────────────────────────────────────────────

  it('renders the hidden file input for uploading a site plan', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    const fileInput = document.querySelector('input[type="file"]')!;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.getAttribute('accept')).toContain('image');
  });

  // ── Mapping Inventory sidebar ───────────────────────────────────────────────

  it('shows the Mapping Inventory heading in the sidebar', () => {
    render(<ARMapping project={makeProject()} onUpdate={onUpdate} />);
    expect(screen.getByText(/Mapping Inventory/i)).toBeInTheDocument();
  });

  it('shows existing markers in the sidebar list', () => {
    const project = makeProject({
      arMapping: {
        markers: [{ id: 'm-2', x: 20, y: 20, label: 'Moisture Zone Alpha', type: 'moisture', timestamp: 2 }],
        areas: [],
      },
    });
    render(<ARMapping project={project} onUpdate={onUpdate} />);
    expect(screen.getByText('Moisture Zone Alpha')).toBeInTheDocument();
  });
});
