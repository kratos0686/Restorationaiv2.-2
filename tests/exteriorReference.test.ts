import { describe, it, expect } from 'vitest';
import { 
  createReferenceReading, 
  evaluateGppDropAlert, 
  fetchOutdoorWeather 
} from '../utils/exteriorReference';
import { ReferenceReading } from '../types';

describe('Feature 1: Reference and HVAC Readings & IICRC S500 GPP Alerts', () => {
  it('creates reference reading with accurate GPP and dew point using psychrometrics', () => {
    // 80°F, 50% RH
    const ref = createReferenceReading('outside', 80, 50, {
      notes: 'Sunny clear day outside control baseline',
      photoId: 'photo-123'
    });

    expect(ref.zone).toBe('outside');
    expect(ref.temp).toBe(80);
    expect(ref.rh).toBe(50);
    expect(ref.photoId).toBe('photo-123');
    expect(ref.notes).toBe('Sunny clear day outside control baseline');
    // At 80°F and 50% RH, GPP should be around 77-78 grains/lb and dew point ~60°F
    expect(ref.gpp).toBeGreaterThan(70);
    expect(ref.gpp).toBeLessThan(85);
    expect(ref.dewPoint).toBeGreaterThan(55);
    expect(ref.dewPoint).toBeLessThan(65);
    expect(ref.id).toBeDefined();
    expect(ref.timestamp).toBeGreaterThan(0);
  });

  it('supports all 4 required zones: outside, unaffected, unaffected-hvac, and affected-hvac', () => {
    const zones = ['outside', 'unaffected', 'unaffected-hvac', 'affected-hvac'] as const;
    zones.forEach(zone => {
      const entry = createReferenceReading(zone, 72, 45);
      expect(entry.zone).toBe(zone);
      expect(entry.gpp).toBeGreaterThan(0);
      expect(entry.dewPoint).toBeGreaterThan(0);
    });
  });

  it('evaluates GPP drop alert correctly between unaffected control and affected chamber', () => {
    const readings: ReferenceReading[] = [
      createReferenceReading('unaffected', 70, 40), // Low baseline (~44 GPP)
      createReferenceReading('outside', 85, 70),     // High outdoor ambient
    ];

    // Case A: Affected chamber is 95 GPP (way higher than unaffected 44 GPP)
    const severeAlert = evaluateGppDropAlert(95, readings);
    expect(severeAlert.isAlert).toBe(true);
    expect(severeAlert.severity).toBe('warning');
    expect(severeAlert.message).toMatch(/High moisture differential/i);

    // Case B: Affected chamber is within 5 GPP of unaffected control and outside is mild
    const mildReadings: ReferenceReading[] = [
      createReferenceReading('unaffected', 70, 40), // Low baseline (~44 GPP)
      createReferenceReading('outside', 68, 40),     // Mild outdoor ambient (~40 GPP)
    ];
    const goodProgress = evaluateGppDropAlert(46, mildReadings);
    expect(goodProgress.isAlert).toBe(false);
    expect(goodProgress.message).toMatch(/optimal/i);
  });

  it('evaluates HVAC supply vs return drop for affected-hvac zone', () => {
    const readings: ReferenceReading[] = [
      createReferenceReading('affected-hvac', 68, 30), // Supply air coming out of HVAC (~30 GPP)
    ];

    // If affected room is 60 GPP and HVAC supply is 30 GPP, HVAC grain depression is 30 GPP (excellent)
    const hvacCheck = evaluateGppDropAlert(60, readings);
    expect(hvacCheck.hvacGrainDepression).toBeGreaterThan(20);
    expect(hvacCheck.isAlert).toBe(false);
  });

  it('fetchOutdoorWeather returns a fallback or weather result gracefully', async () => {
    const result = await fetchOutdoorWeather('33101');
    expect(result).toHaveProperty('temp');
    expect(result).toHaveProperty('rh');
    expect(result).toHaveProperty('source');
    expect(typeof result.temp).toBe('number');
    expect(typeof result.rh).toBe('number');
  });
});
