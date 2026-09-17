import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PsychrometricCalculator from '../components/PsychrometricCalculator';

// Mock calculation utility
vi.mock('../utils/psychrometrics', () => ({
  calculatePsychrometricsFromDryBulb: vi.fn().mockReturnValue({
    gpp: 64.3,
    dewPoint: 55.1,
    vaporPressure: 0.44,
    enthalpy: 28.12,
  }),
}));

// Mock useAppContext
vi.mock('../context/AppContext', () => ({
  useAppContext: vi.fn(() => ({
    settings: {
      units: {
        temperature: 'Fahrenheit',
        humidity: 'Grains / Pound',
      },
    },
  })),
}));

describe('PsychrometricCalculator', () => {
  it('renders the calculator heading', () => {
    render(<PsychrometricCalculator />);
    expect(screen.getByText(/Psychrometric Calculator/i)).toBeInTheDocument();
  });

  it('renders the three input fields', () => {
    render(<PsychrometricCalculator />);
    // The labels don't use htmlFor, so find inputs by their placeholder/default values
    expect(screen.getByDisplayValue('75')).toBeInTheDocument();   // Dry Bulb
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();   // RH
    expect(screen.getByDisplayValue('29.92')).toBeInTheDocument(); // Pressure
  });

  it('removes the "shows default values" duplication — inputs show defaults', () => {
    render(<PsychrometricCalculator />);
    // All three inputs are verified by the test above; just assert one here for coverage
    expect(screen.getByDisplayValue('29.92')).toBeInTheDocument();
  });

  it('renders result cards with mocked values', () => {
    render(<PsychrometricCalculator />);
    expect(screen.getByText('64.3')).toBeInTheDocument(); // GPP
    expect(screen.getByText('55.1')).toBeInTheDocument(); // Dew Point
    expect(screen.getByText('0.4')).toBeInTheDocument(); // Vapor Pressure (0.44.toFixed(1) = 0.4)
    expect(screen.getByText('28.1')).toBeInTheDocument(); // Enthalpy (28.12.toFixed(1) = 28.1)
  });

  it('updates the dry bulb input on change', () => {
    render(<PsychrometricCalculator />);
    const dryBulbInput = screen.getByDisplayValue('75');
    fireEvent.change(dryBulbInput, { target: { value: '80' } });
    expect(screen.getByDisplayValue('80')).toBeInTheDocument();
  });

  it('updates the RH input on change', () => {
    render(<PsychrometricCalculator />);
    const rhInput = screen.getByDisplayValue('50');
    fireEvent.change(rhInput, { target: { value: '60' } });
    expect(screen.getByDisplayValue('60')).toBeInTheDocument();
  });

  it('renders the unit labels for each result card', () => {
    render(<PsychrometricCalculator />);
    expect(screen.getByText('GPP')).toBeInTheDocument();
    expect(screen.getByText('°F')).toBeInTheDocument();
    expect(screen.getByText('inHg')).toBeInTheDocument();
    expect(screen.getByText('BTU/lb')).toBeInTheDocument();
  });
});
