export type MeasurementUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export const MEASUREMENT_UNITS: Record<MeasurementUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft'
};

// Unit conversion factors to millimeters (base unit)
const TO_MM: Record<MeasurementUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8
};

/**
 * Calculate the pixel distance between two points
 */
export function calculatePixelDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate pixels per unit based on a known measurement
 */
export function calculatePixelsPerUnit(
  pixelDistance: number,
  knownValue: number,
  knownUnit: MeasurementUnit
): number {
  if (knownValue <= 0 || pixelDistance <= 0) {
    throw new Error('Values must be positive');
  }
  
  // Convert known value to mm
  const knownValueInMm = knownValue * TO_MM[knownUnit];
  
  // Calculate pixels per mm
  return pixelDistance / knownValueInMm;
}

/**
 * Convert a pixel distance to a measurement value
 */
export function pixelsToMeasurement(
  pixelDistance: number,
  pixelsPerMm: number,
  targetUnit: MeasurementUnit
): number {
  if (pixelsPerMm <= 0) {
    throw new Error('Invalid calibration');
  }
  
  // Convert pixels to mm
  const distanceInMm = pixelDistance / pixelsPerMm;
  
  // Convert mm to target unit
  return distanceInMm / TO_MM[targetUnit];
}

/**
 * Format a measurement value with appropriate precision
 */
export function formatMeasurement(value: number, unit: MeasurementUnit): string {
  // Determine decimal places based on unit and value
  let decimals: number;
  
  switch (unit) {
    case 'mm':
      decimals = value < 10 ? 1 : 0;
      break;
    case 'cm':
      decimals = value < 10 ? 2 : 1;
      break;
    case 'm':
      decimals = 2;
      break;
    case 'in':
      decimals = value < 1 ? 3 : 2;
      break;
    case 'ft':
      decimals = 2;
      break;
    default:
      decimals = 2;
  }
  
  return `${value.toFixed(decimals)} ${unit}`;
}

/**
 * Convert measurement from one unit to another
 */
export function convertMeasurement(
  value: number,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit
): number {
  if (fromUnit === toUnit) return value;
  
  // Convert to mm first
  const valueInMm = value * TO_MM[fromUnit];
  
  // Convert to target unit
  return valueInMm / TO_MM[toUnit];
}

/**
 * Validate if a string is a valid measurement unit
 */
export function isValidUnit(unit: string): unit is MeasurementUnit {
  return unit in MEASUREMENT_UNITS;
}

/**
 * Parse a measurement string (e.g., "10.5 cm") into value and unit
 */
export function parseMeasurementString(measurement: string): { value: number; unit: MeasurementUnit } | null {
  const match = measurement.match(/^(\d+\.?\d*)\s*(\w+)$/);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  if (isNaN(value) || !isValidUnit(unit)) return null;
  
  return { value, unit };
}

/**
 * Calculate the angle of a line in degrees
 */
export function calculateLineAngle(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = angleRad * (180 / Math.PI);
  
  // Normalize to 0-360 range
  return (angleDeg + 360) % 360;
}

/**
 * Determine if text should be flipped for better readability
 */
export function shouldFlipText(angle: number): boolean {
  // Flip text if it would be upside down (between 90 and 270 degrees)
  return angle > 90 && angle < 270;
}

/**
 * Calculate text position for a measurement line
 */
export function calculateTextPosition(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offset: number = 15
): { x: number; y: number; angle: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = calculateLineAngle(x1, y1, x2, y2);
  
  // Calculate perpendicular offset
  const perpAngle = (angle + 90) * (Math.PI / 180);
  const offsetX = Math.cos(perpAngle) * offset;
  const offsetY = Math.sin(perpAngle) * offset;
  
  // Adjust angle for text readability
  let textAngle = angle;
  if (shouldFlipText(angle)) {
    textAngle = (angle + 180) % 360;
  }
  
  return {
    x: midX - offsetX,
    y: midY - offsetY,
    angle: textAngle
  };
}