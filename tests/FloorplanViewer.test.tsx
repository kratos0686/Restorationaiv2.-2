import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloorplanViewer from '../components/FloorplanViewer';
import { Project } from '../types';

describe('FloorplanViewer & Moisture Map Pins', () => {
  const mockProject: Project = {
    id: 'proj-1',
    companyId: 'comp-1',
    name: 'Main St Loss',
    currentStage: 'Monitor',
    dryingMonitor: [
      {
        id: 'mat-1',
        name: 'Drywall East',
        type: 'Drywall',
        location: 'Living Room',
        dryGoal: 12,
        initialReading: 35,
        pinNumber: 1,
        pinX: 0.35,
        pinY: 0.45,
        status: 'Wet',
        readings: [
          { timestamp: 1, date: '10/12', value: 25 },
          { timestamp: 2, date: '10/13', value: 20 }
        ]
      }
    ],
    rooms: [
      {
        id: 'room-1',
        name: 'Living Room',
        dimensions: { length: 20, width: 15, height: 8 },
        photos: []
      }
    ]
  };

  it('renders without crashing in default state', () => {
    const { container } = render(<FloorplanViewer />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders the 2D floorplan view with interactive moisture map pins bar', () => {
    render(<FloorplanViewer project={mockProject} />);
    expect(screen.getByText(/Moisture Map & Floor Plan/i)).toBeInTheDocument();
    expect(screen.getByText(/2D Plan & Pins/i)).toBeInTheDocument();
  });

  it('displays existing numbered pins with moisture status', () => {
    render(<FloorplanViewer project={mockProject} />);
    // Check that Pin #1 is shown
    expect(screen.getByTestId('pin-badge-1')).toBeInTheDocument();
  });

  it('opens material history and reading input when tapping an existing pin', () => {
    render(<FloorplanViewer project={mockProject} />);
    const pin = screen.getByTestId('pin-badge-1');
    fireEvent.click(pin);

    // Should open modal with material details and reading history
    expect(screen.getByText(/Log New Moisture/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Drywall East/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Dry Standard/i)).toBeInTheDocument();
    expect(screen.getAllByText(/12%/i).length).toBeGreaterThan(0);
  });

  it('allows logging a new moisture reading for the pinned material', () => {
    const onUpdateMock = vi.fn();
    render(<FloorplanViewer project={mockProject} onUpdate={onUpdateMock} />);
    
    // Open pin
    const pin = screen.getByTestId('pin-badge-1');
    fireEvent.click(pin);

    // Find reading input and add reading
    const input = screen.getByPlaceholderText(/e\.g\. 14\.5/i);
    fireEvent.change(input, { target: { value: '11.5' } });

    const saveBtn = screen.getByText(/Add Reading/i);
    fireEvent.click(saveBtn);

    expect(onUpdateMock).toHaveBeenCalled();
  });
});
