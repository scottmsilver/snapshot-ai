import { useState, useCallback, useMemo } from 'react';
import { DrawingTool } from '@/types/drawing';
import { 
  calculatePixelDistance, 
  calculatePixelsPerUnit, 
  pixelsToMeasurement,
  formatMeasurement,
  type MeasurementUnit 
} from '@/utils/measurementUtils';
import type { MeasurementLineShape, Shape } from '@/types/drawing';

export interface MeasurementCalibration {
  pixelsPerUnit: number | null;
  unit: MeasurementUnit | string;
  calibrationLineId: string | null;
}

export interface UseMeasurementReturn {
  calibration: MeasurementCalibration;
  isCalibrated: boolean;
  isCalibrating: boolean;
  calibrationLine: MeasurementLineShape | null;
  
  // Actions
  startCalibration: () => void;
  cancelCalibration: () => void;
  setCalibration: (pixelDistance: number, value: number, unit: MeasurementUnit, lineId: string) => void;
  clearCalibration: () => void;
  changeUnit: (unit: MeasurementUnit) => void;
  
  // Measurement calculations
  calculateMeasurement: (x1: number, y1: number, x2: number, y2: number) => string | null;
  getMeasurementLabel: (shape: MeasurementLineShape) => string;
  updateMeasurementLabels: (shapes: Shape[]) => Shape[];
  getMeasurementUpdates: (shapes: Shape[]) => Array<{ id: string; updates: Partial<Shape> }>;
}

export function useMeasurement(
  shapes: Shape[],
  onUpdateShapes?: (shapes: Shape[]) => void,
  initialCalibration?: MeasurementCalibration
): UseMeasurementReturn {
  const [calibration, setCalibrationState] = useState<MeasurementCalibration>(
    initialCalibration || {
      pixelsPerUnit: null,
      unit: 'cm' as MeasurementUnit,
      calibrationLineId: null,
    }
  );
  
  const [isCalibrating, setIsCalibrating] = useState(false);
  
  // Get the calibration line shape if it exists
  const calibrationLine = useMemo(() => {
    if (!calibration.calibrationLineId) return null;
    
    const line = shapes.find(s => s.id === calibration.calibrationLineId);
    return line?.type === 'measure' ? line as MeasurementLineShape : null;
  }, [shapes, calibration.calibrationLineId]);
  
  const isCalibrated = calibration.pixelsPerUnit !== null;

  const getMeasurementUpdates = useCallback((shapesToUpdate: Shape[]): Array<{ id: string; updates: Partial<Shape> }> => {
    if (!isCalibrated || !calibration.pixelsPerUnit) return [];

    const updates: Array<{ id: string; updates: Partial<Shape> }> = [];

    shapesToUpdate.forEach(shape => {
      if (shape.type !== DrawingTool.MEASURE) {
        return;
      }

      const measureShape = shape as MeasurementLineShape;
      if (measureShape.isCalibration) {
        return;
      }

      const [x1, y1, x2, y2] = measureShape.points;
      const pixelDistance = calculatePixelDistance(x1, y1, x2, y2);
      const value = pixelsToMeasurement(
        pixelDistance,
        calibration.pixelsPerUnit!,
        calibration.unit as MeasurementUnit
      );

      const existingMeasurement = measureShape.measurement;
      if (
        !existingMeasurement ||
        existingMeasurement.value !== value ||
        existingMeasurement.unit !== calibration.unit ||
        existingMeasurement.pixelDistance !== pixelDistance
      ) {
        updates.push({
          id: measureShape.id,
          updates: {
            measurement: {
              value,
              unit: calibration.unit,
              pixelDistance,
            },
          },
        });
      }
    });

    return updates;
  }, [isCalibrated, calibration]);

  // Update all measurement line labels
  const updateMeasurementLabels = useCallback((shapesToUpdate: Shape[]): Shape[] => {
    if (!isCalibrated || !calibration.pixelsPerUnit) return shapesToUpdate;

    const updates = getMeasurementUpdates(shapesToUpdate);
    if (updates.length === 0) {
      return shapesToUpdate;
    }

    const updateMap = new Map(updates.map(update => [update.id, update.updates]));
    const timestamp = Date.now();

    return shapesToUpdate.map(shape => {
      const updatesForShape = updateMap.get(shape.id);
      if (!updatesForShape) {
        return shape;
      }

      return {
        ...shape,
        ...updatesForShape,
        updatedAt: timestamp,
      } as Shape;
    });
  }, [calibration, getMeasurementUpdates, isCalibrated]);
  
  // Start calibration mode
  const startCalibration = useCallback(() => {
    setIsCalibrating(true);
  }, []);
  
  // Cancel calibration mode
  const cancelCalibration = useCallback(() => {
    setIsCalibrating(false);
  }, []);
  
  // Set calibration from a measurement
  const setCalibration = useCallback((
    pixelDistance: number,
    value: number,
    unit: MeasurementUnit,
    lineId: string
  ) => {
    const pixelsPerUnit = calculatePixelsPerUnit(pixelDistance, value, unit);
    
    setCalibrationState({
      pixelsPerUnit,
      unit,
      calibrationLineId: lineId,
    });
    
    setIsCalibrating(false);
    
    // Update all measurement lines with new calibration
    if (onUpdateShapes) {
      const updatedShapes = updateMeasurementLabels(shapes);
      onUpdateShapes(updatedShapes);
    }
  }, [shapes, onUpdateShapes, updateMeasurementLabels]);
  
  // Clear calibration
  const clearCalibration = useCallback(() => {
    setCalibrationState({
      pixelsPerUnit: null,
      unit: 'cm' as MeasurementUnit,
      calibrationLineId: null,
    });
    
    // Update shapes to remove measurement labels
    if (onUpdateShapes) {
      const updatedShapes = shapes.map(shape => {
        if (shape.type === 'measure' && !shape.isCalibration) {
          return {
            ...shape,
            measurement: undefined,
          } as MeasurementLineShape;
        }
        return shape;
      });
      onUpdateShapes(updatedShapes);
    }
  }, [shapes, onUpdateShapes]);
  
  // Change display unit
  const changeUnit = useCallback((unit: MeasurementUnit) => {
    setCalibrationState(prev => ({ ...prev, unit }));
    
    // Update all measurement labels with new unit
    if (onUpdateShapes && isCalibrated) {
      const updatedShapes = updateMeasurementLabels(shapes);
      onUpdateShapes(updatedShapes);
    }
  }, [shapes, onUpdateShapes, isCalibrated, updateMeasurementLabels]);
  
  // Calculate measurement for given coordinates
  const calculateMeasurement = useCallback((
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): string | null => {
    if (!isCalibrated || !calibration.pixelsPerUnit) return null;
    
    const pixelDistance = calculatePixelDistance(x1, y1, x2, y2);
    const measurementValue = pixelsToMeasurement(
      pixelDistance,
      calibration.pixelsPerUnit,
      calibration.unit as MeasurementUnit
    );
    
    return formatMeasurement(measurementValue, calibration.unit as MeasurementUnit);
  }, [isCalibrated, calibration]);
  
  // Get formatted measurement label for a shape
  const getMeasurementLabel = useCallback((shape: MeasurementLineShape): string => {
    if (shape.isCalibration && shape.measurement) {
      return formatMeasurement(shape.measurement.value, shape.measurement.unit as MeasurementUnit);
    }
    
    if (!shape.isCalibration && isCalibrated) {
      const [x1, y1, x2, y2] = shape.points;
      return calculateMeasurement(x1, y1, x2, y2) || '';
    }
    
    // If not calibrated, show pixel distance
    const [x1, y1, x2, y2] = shape.points;
    const pixels = Math.round(calculatePixelDistance(x1, y1, x2, y2));
    return `${pixels}px`;
  }, [isCalibrated, calculateMeasurement]);
  
  return {
    calibration,
    isCalibrated,
    isCalibrating,
    calibrationLine,
    startCalibration,
    cancelCalibration,
    setCalibration,
    clearCalibration,
    changeUnit,
    calculateMeasurement,
    getMeasurementLabel,
    updateMeasurementLabels,
    getMeasurementUpdates,
  };
}