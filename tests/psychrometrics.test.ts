import { describe, it, expect } from 'vitest';
import {
  calcSaturationVaporPressure,
  calculatePsychrometricsFromDryBulb,
  calculatePsychrometricsFromWetBulb,
  findDryBulbFromWetBulbAndRh,
} from '../utils/psychrometrics';

// ─── calcSaturationVaporPressure ──────────────────────────────────────────────

describe('calcSaturationVaporPressure', () => {
  it('returns ~6.112 hPa at 0°C (Magnus formula anchor point)', () => {
    expect(calcSaturationVaporPressure(0)).toBeCloseTo(6.112, 2);
  });

  it('returns ~23.37 hPa at 20°C', () => {
    // Known value from psychrometric tables
    expect(calcSaturationVaporPressure(20)).toBeCloseTo(23.37, 1);
  });

  it('returns a higher value for higher temperatures', () => {
    expect(calcSaturationVaporPressure(30)).toBeGreaterThan(calcSaturationVaporPressure(20));
  });

  it('returns a positive value for sub-zero temperatures', () => {
    expect(calcSaturationVaporPressure(-10)).toBeGreaterThan(0);
  });
});

// ─── calculatePsychrometricsFromDryBulb ───────────────────────────────────────

describe('calculatePsychrometricsFromDryBulb', () => {
  it('returns zero-valued result for zero RH', () => {
    const result = calculatePsychrometricsFromDryBulb(72, 0);
    expect(result.gpp).toBe(0);
    expect(result.dewPoint).toBe(0);
  });

  it('returns zero-valued result for NaN inputs', () => {
    const result = calculatePsychrometricsFromDryBulb(NaN, 50);
    expect(result.gpp).toBe(0);
  });

  it('calculates positive GPP at 72°F and 50% RH', () => {
    const result = calculatePsychrometricsFromDryBulb(72, 50);
    expect(result.gpp).toBeGreaterThan(0);
  });

  it('dew point is always lower than dry bulb temperature (< 100% RH)', () => {
    const result = calculatePsychrometricsFromDryBulb(72, 50);
    expect(result.dewPoint).toBeLessThan(72);
  });

  it('higher RH produces higher GPP at the same temperature', () => {
    const low = calculatePsychrometricsFromDryBulb(72, 30);
    const high = calculatePsychrometricsFromDryBulb(72, 70);
    expect(high.gpp).toBeGreaterThan(low.gpp);
  });

  it('higher temperature produces higher GPP at the same RH', () => {
    const cool = calculatePsychrometricsFromDryBulb(60, 50);
    const warm = calculatePsychrometricsFromDryBulb(80, 50);
    expect(warm.gpp).toBeGreaterThan(cool.gpp);
  });

  it('vapor pressure is positive', () => {
    const result = calculatePsychrometricsFromDryBulb(72, 50);
    expect(result.vaporPressure).toBeGreaterThan(0);
  });

  it('enthalpy is positive at typical restoration conditions', () => {
    const result = calculatePsychrometricsFromDryBulb(72, 50);
    expect(result.enthalpy).toBeGreaterThan(0);
  });

  it('respects a custom pressure argument (higher pressure → slightly different GPP)', () => {
    const standard = calculatePsychrometricsFromDryBulb(72, 50, 1013.25);
    const highAlt = calculatePsychrometricsFromDryBulb(72, 50, 850);
    // At lower pressure, more moisture can be held → higher GPP
    expect(highAlt.gpp).toBeGreaterThan(standard.gpp);
  });
});

// ─── findDryBulbFromWetBulbAndRh ─────────────────────────────────────────────

describe('findDryBulbFromWetBulbAndRh', () => {
  it('returns wet bulb temp when RH is 100%', () => {
    expect(findDryBulbFromWetBulbAndRh(65, 100)).toBeCloseTo(65, 0);
  });

  it('returns NaN for RH <= 0', () => {
    expect(findDryBulbFromWetBulbAndRh(65, 0)).toBeNaN();
  });

  it('returns NaN for NaN inputs', () => {
    expect(findDryBulbFromWetBulbAndRh(NaN, 50)).toBeNaN();
  });

  it('dry bulb is >= wet bulb for any valid RH < 100', () => {
    const dryBulb = findDryBulbFromWetBulbAndRh(65, 50);
    expect(dryBulb).toBeGreaterThanOrEqual(65);
  });

  it('produces a larger dry/wet bulb spread at lower RH', () => {
    const high = findDryBulbFromWetBulbAndRh(65, 80) - 65;
    const low = findDryBulbFromWetBulbAndRh(65, 30) - 65;
    expect(low).toBeGreaterThan(high);
  });
});

// ─── calculatePsychrometricsFromWetBulb ──────────────────────────────────────

describe('calculatePsychrometricsFromWetBulb', () => {
  it('returns a zero result for invalid RH', () => {
    const result = calculatePsychrometricsFromWetBulb(65, 0);
    expect(result.dryBulb).toBe(0);
    expect(result.gpp).toBe(0);
  });

  it('returns positive dryBulb, GPP, dewPoint, and enthalpy for valid inputs', () => {
    const result = calculatePsychrometricsFromWetBulb(65, 50);
    expect(result.dryBulb).toBeGreaterThan(0);
    expect(result.gpp).toBeGreaterThan(0);
    expect(result.dewPoint).toBeGreaterThan(0);
    expect(result.enthalpy).toBeGreaterThan(0);
  });

  it('dryBulb equals wet bulb temp when RH is 100%', () => {
    const result = calculatePsychrometricsFromWetBulb(65, 100);
    expect(result.dryBulb).toBeCloseTo(65, 0);
  });
});
