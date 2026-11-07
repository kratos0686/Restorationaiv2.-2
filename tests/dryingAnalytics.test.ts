import { describe, it, expect } from 'vitest';
import { 
  computePinStatus, 
  getPinStatusTheme, 
  formatPinStatusLabel, 
  validatePinCoordinate 
} from '../utils/dryingAnalytics';
import { TrackedMaterial } from '../types';

describe('Feature 2: Moisture Map Pins & Drying Analytics', () => {
  it('identifies material as "dry" if marked status is Dry', () => {
    const mat: TrackedMaterial = {
      id: 'mat-1',
      name: 'Drywall',
      type: 'Drywall',
      location: 'Living Room East',
      dryGoal: 12,
      initialReading: 35,
      readings: [{ timestamp: 1, date: 'Day 1', value: 12 }],
      status: 'Dry'
    };

    expect(computePinStatus(mat)).toBe('dry');
  });

  it('marks material as "dry" if within 10% of dry standard (e.g. reading <= dryGoal * 1.10)', () => {
    const mat: TrackedMaterial = {
      id: 'mat-2',
      name: 'Hardwood Subfloor',
      type: 'Subfloor',
      location: 'Hallway',
      dryGoal: 10,
      initialReading: 28,
      readings: [
        { timestamp: 1, date: 'Day 1', value: 25 },
        { timestamp: 2, date: 'Day 2', value: 10.8 } // 10.8 is within 10% of 10.0 (10 * 1.10 = 11.0)
      ],
      status: 'Wet'
    };

    expect(computePinStatus(mat)).toBe('dry');
  });

  it('marks material as "stalled" when moisture reading stops decreasing', () => {
    const mat: TrackedMaterial = {
      id: 'mat-3',
      name: 'Baseboard Framing',
      type: 'Wood',
      location: 'Kitchen',
      dryGoal: 12,
      initialReading: 30,
      readings: [
        { timestamp: 1, date: 'Day 1', value: 24 },
        { timestamp: 2, date: 'Day 2', value: 24 } // Same reading, no drop!
      ],
      status: 'Wet'
    };

    expect(computePinStatus(mat)).toBe('stalled');

    // Also stalled if reading increased
    mat.readings.push({ timestamp: 3, date: 'Day 3', value: 25 });
    expect(computePinStatus(mat)).toBe('stalled');
  });

  it('marks material as "drying" when latest reading drops from previous', () => {
    const mat: TrackedMaterial = {
      id: 'mat-4',
      name: 'Plaster Wall',
      type: 'Drywall',
      location: 'Dining Room',
      dryGoal: 10,
      initialReading: 40,
      readings: [
        { timestamp: 1, date: 'Day 1', value: 32 },
        { timestamp: 2, date: 'Day 2', value: 26 } // Significant drop, still above dryGoal
      ],
      status: 'Wet'
    };

    expect(computePinStatus(mat)).toBe('drying');
  });

  it('marks material as "wet" when elevated with no progress yet', () => {
    const mat: TrackedMaterial = {
      id: 'mat-5',
      name: 'Carpet Pad',
      type: 'Carpet',
      location: 'Master Bedroom',
      dryGoal: 12,
      initialReading: 65,
      readings: [],
      status: 'Wet'
    };

    expect(computePinStatus(mat)).toBe('wet');
  });

  it('provides distinct glass-card theme styles for all 4 pin statuses', () => {
    const statuses = ['wet', 'drying', 'dry', 'stalled'] as const;
    statuses.forEach(status => {
      const theme = getPinStatusTheme(status);
      expect(theme).toHaveProperty('bg');
      expect(theme).toHaveProperty('border');
      expect(theme).toHaveProperty('text');
      expect(theme).toHaveProperty('badge');
      expect(formatPinStatusLabel(status)).toBeDefined();
    });
  });

  it('clamps and validates pin coordinates between 0 and 1 fractions of the plan', () => {
    expect(validatePinCoordinate(0.45)).toBe(0.45);
    expect(validatePinCoordinate(-0.2)).toBe(0);
    expect(validatePinCoordinate(1.5)).toBe(1);
    expect(validatePinCoordinate(Number.NaN)).toBe(0.5);
  });
});
