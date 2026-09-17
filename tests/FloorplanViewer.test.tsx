import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FloorplanViewer from '../components/FloorplanViewer';

describe('FloorplanViewer', () => {
  it('renders without crashing', () => {
    const { container } = render(<FloorplanViewer />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders the Canvas element', () => {
    render(<FloorplanViewer />);
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
  });

  it('shows the navigation hint text', () => {
    render(<FloorplanViewer />);
    expect(screen.getByText(/Drag to rotate/i)).toBeInTheDocument();
  });

  it('accepts a custom url prop without throwing', () => {
    expect(() =>
      render(<FloorplanViewer url="https://cdn.example.com/model.gltf" />),
    ).not.toThrow();
  });
});
