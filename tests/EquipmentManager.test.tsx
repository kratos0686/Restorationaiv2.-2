import { describe, it, expect } from 'vitest';
import { 
  calculateRoomEquipmentSizing, 
  normalizeLossClass, 
  calculateDehumidifierCapacity, 
  calculateAirMoverCount 
} from '../utils/equipmentSizing';

describe('IICRC S500 Equipment Sizing Calculations', () => {
  it('normalizes various loss class representations to standard IICRC Class 1-4', () => {
    expect(normalizeLossClass('Class 1 (Least)')).toBe('Class 1');
    expect(normalizeLossClass('CLASS_1')).toBe('Class 1');
    expect(normalizeLossClass('Class 2')).toBe('Class 2');
    expect(normalizeLossClass('Class 3 (Greatest)')).toBe('Class 3');
    expect(normalizeLossClass('Class 4 (Specialty)')).toBe('Class 4');
  });

  it('calculates dehumidifier AHAM pints-per-day correctly by cubic footage and class divisor', () => {
    // 10,000 cu. ft. room
    // Class 1 (divisor 50) -> 200 pints
    expect(calculateDehumidifierCapacity(10000, 'Class 1').ahamPints).toBe(200);
    expect(calculateDehumidifierCapacity(10000, 'Class 1').divisor).toBe(50);

    // Class 2 (divisor 40) -> 250 pints
    expect(calculateDehumidifierCapacity(10000, 'Class 2').ahamPints).toBe(250);
    expect(calculateDehumidifierCapacity(10000, 'Class 2').divisor).toBe(40);

    // Class 3 (divisor 30) -> 334 pints (ceil)
    expect(calculateDehumidifierCapacity(10000, 'Class 3').ahamPints).toBe(334);
    expect(calculateDehumidifierCapacity(10000, 'Class 3').divisor).toBe(30);

    // Class 4 (divisor 25) -> 400 pints
    expect(calculateDehumidifierCapacity(10000, 'Class 4').ahamPints).toBe(400);
    expect(calculateDehumidifierCapacity(10000, 'Class 4').divisor).toBe(25);
  });

  it('calculates air mover counts based on square footage (1 per 50-70 SF)', () => {
    // 300 sq. ft. room -> optimal is ceil(300 / 50) = 6 units
    const sizing = calculateAirMoverCount(300);
    expect(sizing.recommended).toBe(6);
    expect(sizing.min).toBe(5); // ceil(300 / 70) = 5
  });

  it('generates comprehensive S500 recommendations for room chambers', () => {
    const rec = calculateRoomEquipmentSizing(
      'Basement Living Room', 
      { length: 20, width: 20, height: 8 }, 
      'Class 2', 
      { useLGR: true }
    );

    expect(rec.sqFt).toBe(400);
    expect(rec.cuFt).toBe(3200);
    expect(rec.dehumidifier.divisor).toBe(40);
    expect(rec.dehumidifier.ahamPintsPerDay).toBe(80); // 3200 / 40
    expect(rec.airMovers.recommendedCount).toBe(8); // 400 / 50
    expect(rec.airScrubbers.airChangesPerHour).toBe(6);
  });
});
