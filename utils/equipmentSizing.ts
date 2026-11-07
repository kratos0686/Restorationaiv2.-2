import { LossClass } from '../types';

export interface SizingOptions {
  ceilingHeight?: number; // default 8ft
  useLGR?: boolean; // default true for modern LGR dehumidifiers
  insetCount?: number; // closets or offsets
}

export interface EquipmentSizingRecommendation {
  roomName: string;
  sqFt: number;
  cuFt: number;
  lossClass: string;
  dehumidifier: {
    ahamPintsPerDay: number;
    formula: string;
    divisor: number;
    conventionalPintsPerDay: number;
    recommendedUnits: {
      standard70Pt: number;
      large110Pt: number;
      extraLarge150Pt: number;
    };
  };
  airMovers: {
    recommendedCount: number;
    minCount: number;
    maxCount: number;
    formula: string;
  };
  airScrubbers: {
    cfmRequired: number;
    recommendedUnits: number;
    airChangesPerHour: number;
  };
}

/**
 * Normalizes LossClass string to 'Class 1', 'Class 2', 'Class 3', or 'Class 4'
 */
export function normalizeLossClass(lossClass?: LossClass | string): 'Class 1' | 'Class 2' | 'Class 3' | 'Class 4' {
  if (!lossClass) return 'Class 2';
  const str = String(lossClass).toLowerCase();
  if (str.includes('1') || str.includes('least')) return 'Class 1';
  if (str.includes('3') || str.includes('greatest')) return 'Class 3';
  if (str.includes('4') || str.includes('specialty')) return 'Class 4';
  return 'Class 2';
}

/**
 * Calculates IICRC S500 compliant dehumidifier capacity (AHAM Pints/Day)
 * based on chamber cubic feet and Class of Loss.
 *
 * IICRC S500 Divisors for LGR:
 * - Class 1: cuFt / 50
 * - Class 2: cuFt / 40
 * - Class 3: cuFt / 30
 * - Class 4: cuFt / 25
 *
 * Divisors for Conventional:
 * - Class 1: cuFt / 100
 * - Class 2: cuFt / 50
 * - Class 3: cuFt / 40
 * - Class 4: cuFt / 30
 */
export function calculateDehumidifierCapacity(
  cuFt: number,
  lossClassInput?: LossClass | string,
  useLGR = true
): { ahamPints: number; divisor: number; formula: string } {
  const normClass = normalizeLossClass(lossClassInput);
  
  let divisor: number;
  if (useLGR) {
    switch (normClass) {
      case 'Class 1': divisor = 50; break;
      case 'Class 2': divisor = 40; break;
      case 'Class 3': divisor = 30; break;
      case 'Class 4': divisor = 25; break;
    }
  } else {
    switch (normClass) {
      case 'Class 1': divisor = 100; break;
      case 'Class 2': divisor = 50; break;
      case 'Class 3': divisor = 40; break;
      case 'Class 4': divisor = 30; break;
    }
  }

  const ahamPints = Math.max(1, Math.ceil(cuFt / divisor));
  const formula = `${cuFt.toLocaleString()} cu.ft. ÷ ${divisor} (IICRC S500 ${normClass} ${useLGR ? 'LGR' : 'Conventional'})`;

  return { ahamPints, divisor, formula };
}

/**
 * Calculates IICRC S500 compliant Air Mover counts.
 * Standard S500 guideline: 1 air mover for every 50–70 sq ft of affected floor/wall boundary,
 * plus 1 for each distinct room inset/closet.
 */
export function calculateAirMoverCount(
  sqFt: number,
  insetCount = 0
): { recommended: number; min: number; max: number; formula: string } {
  if (sqFt <= 0) {
    return { recommended: 1, min: 1, max: 1, formula: 'Minimum 1 air mover per chamber' };
  }

  // 1 per 50 sq ft (aggressive) to 1 per 70 sq ft (conservative)
  const min = Math.max(1, Math.ceil(sqFt / 70) + insetCount);
  const max = Math.max(1, Math.ceil(sqFt / 50) + insetCount);
  const recommended = max; // Standard mitigation practice sizes to upper bound of boundary coverage

  const formula = `1 unit per 50–70 SF (${sqFt} SF ÷ 50${insetCount > 0 ? ` + ${insetCount} insets` : ''})`;

  return { recommended, min, max, formula };
}

/**
 * Calculates complete S500 equipment recommendations for a room or entire drying chamber.
 */
export function calculateRoomEquipmentSizing(
  roomName: string,
  dimensions: { length?: number; width?: number; height?: number },
  lossClassInput?: LossClass | string,
  options?: SizingOptions
): EquipmentSizingRecommendation {
  const length = dimensions.length || 0;
  const width = dimensions.width || 0;
  const height = dimensions.height || options?.ceilingHeight || 8;

  const sqFt = length > 0 && width > 0 ? length * width : 200; // fallback standard 200 SF
  const cuFt = sqFt * height;

  const normClass = normalizeLossClass(lossClassInput);

  // Dehumidifier calculations
  const lgrResult = calculateDehumidifierCapacity(cuFt, normClass, true);
  const convResult = calculateDehumidifierCapacity(cuFt, normClass, false);

  // Recommended unit groupings (standard 70-pint, 110-pint large, 150-pint XL)
  const standard70Pt = Math.ceil(lgrResult.ahamPints / 70);
  const large110Pt = Math.ceil(lgrResult.ahamPints / 110);
  const extraLarge150Pt = Math.ceil(lgrResult.ahamPints / 150);

  // Air mover calculations
  const amResult = calculateAirMoverCount(sqFt, options?.insetCount || 0);

  // Air Scrubber: 4-6 air changes per hour (ACH)
  const ach = 6;
  const cfmRequired = Math.ceil((cuFt * ach) / 60);
  const recommendedScrubbers = Math.max(1, Math.ceil(cfmRequired / 500)); // standard 500 CFM HEPA

  return {
    roomName,
    sqFt,
    cuFt,
    lossClass: normClass,
    dehumidifier: {
      ahamPintsPerDay: lgrResult.ahamPints,
      formula: lgrResult.formula,
      divisor: lgrResult.divisor,
      conventionalPintsPerDay: convResult.ahamPints,
      recommendedUnits: {
        standard70Pt,
        large110Pt,
        extraLarge150Pt
      }
    },
    airMovers: {
      recommendedCount: amResult.recommended,
      minCount: amResult.min,
      maxCount: amResult.max,
      formula: amResult.formula
    },
    airScrubbers: {
      cfmRequired,
      recommendedUnits: recommendedScrubbers,
      airChangesPerHour: ach
    }
  };
}
