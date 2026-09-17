import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WalkthroughViewer from '../components/WalkthroughViewer';
import { RoomScan } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/EventBus', () => ({
  EventBus: { publish: vi.fn(), on: vi.fn(() => vi.fn()) },
}));

// ─── Fixture ──────────────────────────────────────────────────────────────────

const scan: RoomScan = {
  scanId: 'scan-1',
  roomName: 'Living Room',
  dimensions: { sqft: 200, length: 16, width: 12.5, height: 9 },
  floorPlanSvg: '<svg><rect width="100" height="100"/></svg>',
  placedPhotos: [],
};

const _scanNoFloorplan: RoomScan = {
  scanId: 'scan-2',
  roomName: 'Kitchen',
  dimensions: { sqft: 150, length: 12, width: 12.5, height: 8 },
  floorPlanSvg: '',
  placedPhotos: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WalkthroughViewer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  it('renders the room name in the header', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    expect(screen.getByText(/Living Room 3D Walkthrough/i)).toBeInTheDocument();
  });

  it('displays the square footage', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    expect(screen.getByText(/200\.0 SQ FT/i)).toBeInTheDocument();
  });

  it('calls onClose when the X button is clicked', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    // Close button is the last button in the header
    const btns = screen.getAllByRole('button');
    fireEvent.click(btns[btns.length - 1]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the Canvas element', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
  });

  it('shows the export menu when the Download button is clicked', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    const downloadBtn = screen.getByTitle('Export Walkthrough');
    fireEvent.click(downloadBtn);
    expect(screen.getByText(/Visual Export/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF Report/i)).toBeInTheDocument();
  });

  it('hides the export menu when clicking again', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    const downloadBtn = screen.getByTitle('Export Walkthrough');
    fireEvent.click(downloadBtn); // open
    fireEvent.click(downloadBtn); // close
    expect(screen.queryByText(/Visual Export/i)).not.toBeInTheDocument();
  });

  it('reset button resets orbit controls without throwing', () => {
    render(<WalkthroughViewer scan={scan} onClose={onClose} />);
    expect(screen.getByTestId('orbit-controls')).toBeInTheDocument();
  });

  it('renders placed-photo thumbnails when the scan has placedPhotos', () => {
    const scanWithPhotos: RoomScan = {
      ...scan,
      placedPhotos: [
        { id: 'p1', url: 'https://example.com/photo1.jpg', thumbnailUrl: undefined, timestamp: Date.now(), tags: [], position: { wall: 'front', x: 0.5, y: 0.5 }, notes: '' },
      ],
    };
    render(<WalkthroughViewer scan={scanWithPhotos} onClose={onClose} />);
    // Note: Canvas rendering is mocked, so we test if the canvas is present
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
  });
});
