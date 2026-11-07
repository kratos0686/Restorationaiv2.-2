import { TrackedMaterial, MoisturePinStatus } from '../types';

/**
 * Computes pin status according to IICRC S500 standards and prompt rules:
 * - dry: within 10% of the dry standard counts as dry (e.g. reading <= dryGoal * 1.10) or status is Dry
 * - stalled: reading did not decrease compared to previous reading and is not dry
 * - drying: reading decreased toward dry goal but is not yet dry
 * - wet: elevated moisture with no recorded reduction
 */
export function computePinStatus(material: TrackedMaterial): MoisturePinStatus {
  // If explicitly flagged or dry standard reached
  if (material.status === 'Dry') {
    return 'dry';
  }

  const goal = material.dryGoal;
  const readings = material.readings || [];

  // Determine latest reading value
  const latestValue = readings.length > 0 
    ? readings[readings.length - 1].value 
    : material.initialReading;

  // 1. Dry check: within 10% of dry standard counts as dry
  if (goal !== undefined && !isNaN(goal) && latestValue !== undefined && !isNaN(latestValue)) {
    if (latestValue <= goal * 1.10) {
      return 'dry';
    }
  }

  // 2. Stalled check:
  // If we have at least 2 readings and latest is >= previous reading
  if (readings.length >= 2) {
    const current = readings[readings.length - 1].value;
    const previous = readings[readings.length - 2].value;
    if (current >= previous) {
      return 'stalled';
    }
  } else if (readings.length === 1 && material.initialReading !== undefined) {
    if (readings[0].value >= material.initialReading) {
      return 'stalled';
    }
  }

  // 3. Drying check:
  // If readings show downward progress compared to initial or previous reading
  if (readings.length > 0 && material.initialReading !== undefined) {
    if (latestValue < material.initialReading) {
      return 'drying';
    }
  }

  // 4. Fallback to wet
  return 'wet';
}

export interface PinStatusTheme {
  status: MoisturePinStatus;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  ringClass: string;
  hexColor: string;
  bg?: string;
  border?: string;
  text?: string;
  badge?: string;
}

export function getPinStatusTheme(status: MoisturePinStatus): PinStatusTheme {
  switch (status) {
    case 'dry':
      return {
        status: 'dry',
        label: 'Dry (Goal Met)',
        bgClass: 'bg-emerald-500',
        textClass: 'text-white',
        borderClass: 'border-emerald-400',
        ringClass: 'ring-emerald-400/50',
        hexColor: '#10b981',
        bg: 'bg-emerald-500',
        border: 'border-emerald-400',
        text: 'text-white',
        badge: 'bg-emerald-500/20 text-emerald-300'
      };
    case 'drying':
      return {
        status: 'drying',
        label: 'Actively Drying',
        bgClass: 'bg-sky-500',
        textClass: 'text-white',
        borderClass: 'border-sky-400',
        ringClass: 'ring-sky-400/50',
        hexColor: '#0ea5e9',
        bg: 'bg-sky-500',
        border: 'border-sky-400',
        text: 'text-white',
        badge: 'bg-sky-500/20 text-sky-300'
      };
    case 'stalled':
      return {
        status: 'stalled',
        label: 'Drying Stalled',
        bgClass: 'bg-amber-500',
        textClass: 'text-slate-950',
        borderClass: 'border-amber-400',
        ringClass: 'ring-amber-400/50',
        hexColor: '#f59e0b',
        bg: 'bg-amber-500',
        border: 'border-amber-400',
        text: 'text-slate-950',
        badge: 'bg-amber-500/20 text-amber-300'
      };
    case 'wet':
    default:
      return {
        status: 'wet',
        label: 'Elevated / Wet',
        bgClass: 'bg-rose-500',
        textClass: 'text-white',
        borderClass: 'border-rose-400',
        ringClass: 'ring-rose-400/50',
        hexColor: '#f43f5e',
        bg: 'bg-rose-500',
        border: 'border-rose-400',
        text: 'text-white',
        badge: 'bg-rose-500/20 text-rose-300'
      };
  }
}

/**
 * Returns formatted human-readable label for a pin status
 */
export function formatPinStatusLabel(status: MoisturePinStatus): string {
  return getPinStatusTheme(status).label;
}

/**
 * Validates and clamps pin coordinates to 0 to 1 fraction of floor plan
 */
export function validatePinCoordinate(coord: number): number {
  if (isNaN(coord)) return 0.5;
  return Math.max(0, Math.min(1, coord));
}
