import { describe, it, expect } from 'vitest';
import {
  calculatePixelDistance,
  calculatePixelsPerUnit,
  pixelsToMeasurement,
  formatMeasurement,
  convertMeasurement,
  isValidUnit,
  parseMeasurementString,
  calculateLineAngle,
  shouldFlipText,
  calculateTextPosition,
  type MeasurementUnit
} from './measurementUtils';

describe('measurementUtils', () => {
  describe('calculatePixelDistance', () => {
    it('should calculate distance between two points', () => {
      expect(calculatePixelDistance(0, 0, 3, 4)).toBe(5);
      expect(calculatePixelDistance(0, 0, 0, 10)).toBe(10);
      expect(calculatePixelDistance(0, 0, 10, 0)).toBe(10);
    });

    it('should handle negative coordinates', () => {
      expect(calculatePixelDistance(-5, -5, -2, -1)).toBe(5);
      expect(calculatePixelDistance(-10, 0, 10, 0)).toBe(20);
    });

    it('should return 0 for same point', () => {
      expect(calculatePixelDistance(5, 5, 5, 5)).toBe(0);
    });
  });

  describe('calculatePixelsPerUnit', () => {
    it('should calculate pixels per mm correctly', () => {
      // 100 pixels = 10 cm = 100 mm
      expect(calculatePixelsPerUnit(100, 10, 'cm')).toBe(1); // 1 pixel per mm
      
      // 200 pixels = 2 inches = 50.8 mm
      expect(calculatePixelsPerUnit(200, 2, 'in')).toBeCloseTo(3.937, 3);
    });

    it('should handle different units', () => {
      const pixelDistance = 300;
      
      expect(calculatePixelsPerUnit(pixelDistance, 30, 'mm')).toBe(10);
      expect(calculatePixelsPerUnit(pixelDistance, 3, 'cm')).toBe(10);
      expect(calculatePixelsPerUnit(pixelDistance, 0.03, 'm')).toBe(10);
    });

    it('should throw error for invalid values', () => {
      expect(() => calculatePixelsPerUnit(0, 10, 'cm')).toThrow();
      expect(() => calculatePixelsPerUnit(100, 0, 'cm')).toThrow();
      expect(() => calculatePixelsPerUnit(-100, 10, 'cm')).toThrow();
    });
  });

  describe('pixelsToMeasurement', () => {
    it('should convert pixels to measurement correctly', () => {
      const pixelsPerMm = 2; // 2 pixels = 1 mm
      
      expect(pixelsToMeasurement(20, pixelsPerMm, 'mm')).toBe(10);
      expect(pixelsToMeasurement(20, pixelsPerMm, 'cm')).toBe(1);
      expect(pixelsToMeasurement(200, pixelsPerMm, 'cm')).toBe(10);
    });

    it('should handle unit conversions', () => {
      const pixelsPerMm = 3.937; // ~100 DPI
      
      expect(pixelsToMeasurement(100, pixelsPerMm, 'in')).toBeCloseTo(1, 2);
      expect(pixelsToMeasurement(1200, pixelsPerMm, 'ft')).toBeCloseTo(1, 2);
    });

    it('should throw error for invalid calibration', () => {
      expect(() => pixelsToMeasurement(100, 0, 'cm')).toThrow();
      expect(() => pixelsToMeasurement(100, -1, 'cm')).toThrow();
    });
  });

  describe('formatMeasurement', () => {
    it('should format measurements with appropriate precision', () => {
      expect(formatMeasurement(5.123, 'mm')).toBe('5.1 mm');
      expect(formatMeasurement(15.567, 'mm')).toBe('16 mm');
      expect(formatMeasurement(2.345, 'cm')).toBe('2.35 cm');
      expect(formatMeasurement(15.789, 'cm')).toBe('15.8 cm');
      expect(formatMeasurement(1.23456, 'm')).toBe('1.23 m');
      expect(formatMeasurement(0.5, 'in')).toBe('0.500 in');
      expect(formatMeasurement(5.789, 'in')).toBe('5.79 in');
      expect(formatMeasurement(3.456, 'ft')).toBe('3.46 ft');
    });
  });

  describe('convertMeasurement', () => {
    it('should return same value for same unit', () => {
      expect(convertMeasurement(10, 'cm', 'cm')).toBe(10);
    });

    it('should convert between metric units', () => {
      expect(convertMeasurement(10, 'mm', 'cm')).toBe(1);
      expect(convertMeasurement(100, 'cm', 'm')).toBe(1);
      expect(convertMeasurement(1, 'm', 'mm')).toBe(1000);
    });

    it('should convert between imperial units', () => {
      expect(convertMeasurement(12, 'in', 'ft')).toBeCloseTo(1, 10);
      expect(convertMeasurement(1, 'ft', 'in')).toBeCloseTo(12, 10);
    });

    it('should convert between metric and imperial', () => {
      expect(convertMeasurement(1, 'in', 'mm')).toBeCloseTo(25.4, 1);
      expect(convertMeasurement(1, 'ft', 'cm')).toBeCloseTo(30.48, 2);
      expect(convertMeasurement(100, 'mm', 'in')).toBeCloseTo(3.937, 3);
    });
  });

  describe('isValidUnit', () => {
    it('should validate measurement units', () => {
      expect(isValidUnit('mm')).toBe(true);
      expect(isValidUnit('cm')).toBe(true);
      expect(isValidUnit('m')).toBe(true);
      expect(isValidUnit('in')).toBe(true);
      expect(isValidUnit('ft')).toBe(true);
      expect(isValidUnit('km')).toBe(false);
      expect(isValidUnit('yard')).toBe(false);
      expect(isValidUnit('')).toBe(false);
    });
  });

  describe('parseMeasurementString', () => {
    it('should parse valid measurement strings', () => {
      expect(parseMeasurementString('10 cm')).toEqual({ value: 10, unit: 'cm' });
      expect(parseMeasurementString('5.5 mm')).toEqual({ value: 5.5, unit: 'mm' });
      expect(parseMeasurementString('3.14159 m')).toEqual({ value: 3.14159, unit: 'm' });
      expect(parseMeasurementString('12in')).toEqual({ value: 12, unit: 'in' });
    });

    it('should return null for invalid strings', () => {
      expect(parseMeasurementString('abc')).toBe(null);
      expect(parseMeasurementString('10')).toBe(null);
      expect(parseMeasurementString('cm')).toBe(null);
      expect(parseMeasurementString('10 km')).toBe(null);
      expect(parseMeasurementString('-5 cm')).toBe(null);
      expect(parseMeasurementString('')).toBe(null);
    });
  });

  describe('calculateLineAngle', () => {
    it('should calculate angle in degrees', () => {
      expect(calculateLineAngle(0, 0, 10, 0)).toBe(0); // Right
      expect(calculateLineAngle(0, 0, 0, 10)).toBe(90); // Down
      expect(calculateLineAngle(0, 0, -10, 0)).toBe(180); // Left
      expect(calculateLineAngle(0, 0, 0, -10)).toBe(270); // Up
    });

    it('should handle diagonal angles', () => {
      expect(calculateLineAngle(0, 0, 10, 10)).toBe(45);
      expect(calculateLineAngle(0, 0, -10, 10)).toBe(135);
      expect(calculateLineAngle(0, 0, -10, -10)).toBe(225);
      expect(calculateLineAngle(0, 0, 10, -10)).toBe(315);
    });

    it('should normalize angles to 0-360 range', () => {
      const angle = calculateLineAngle(0, 0, 10, 0);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(360);
    });
  });

  describe('shouldFlipText', () => {
    it('should flip text when upside down', () => {
      expect(shouldFlipText(0)).toBe(false);
      expect(shouldFlipText(45)).toBe(false);
      expect(shouldFlipText(90)).toBe(false);
      expect(shouldFlipText(91)).toBe(true);
      expect(shouldFlipText(180)).toBe(true);
      expect(shouldFlipText(269)).toBe(true);
      expect(shouldFlipText(270)).toBe(false);
      expect(shouldFlipText(315)).toBe(false);
    });
  });

  describe('calculateTextPosition', () => {
    it('should calculate text position at midpoint with offset', () => {
      const result = calculateTextPosition(0, 0, 10, 0, 5);
      
      expect(result.x).toBe(5); // Midpoint X
      expect(result.y).toBe(-5); // Offset above horizontal line
      expect(result.angle).toBe(0);
    });

    it('should flip text angle when line is upside down', () => {
      const result = calculateTextPosition(10, 0, 0, 0); // Line pointing left
      
      expect(result.angle).toBe(0); // Flipped from 180 to 0
    });

    it('should handle vertical lines', () => {
      const result = calculateTextPosition(0, 0, 0, 10, 5);
      
      expect(result.x).toBeCloseTo(5, 1); // Offset to the right for downward line
      expect(result.y).toBeCloseTo(5, 10); // Midpoint Y
      expect(result.angle).toBe(90);
    });

    it('should use default offset when not specified', () => {
      const result1 = calculateTextPosition(0, 0, 10, 0);
      const result2 = calculateTextPosition(0, 0, 10, 0, 15);
      
      expect(result1.y).toBe(-15); // Default offset
      expect(result2.y).toBe(-15); // Explicit offset
    });
  });
});