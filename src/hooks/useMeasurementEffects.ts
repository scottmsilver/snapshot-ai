import { useEffect } from 'react';
import { DrawingTool, type MeasurementLineShape, type Shape } from '@/types/drawing';
import type { UseMeasurementReturn } from '@/hooks/useMeasurement';

interface MeasurementEffectsOptions {
  shapes: Shape[];
  measurement: UseMeasurementReturn;
  updateShapes: (updates: Array<{ id: string; updates: Partial<Shape> }>) => void;
  onCalibrationLineDetected: (line: MeasurementLineShape) => void;
  setActiveTool: (tool: DrawingTool) => void;
}

export function useMeasurementEffects({
  shapes,
  measurement,
  updateShapes,
  onCalibrationLineDetected,
  setActiveTool,
}: MeasurementEffectsOptions): void {
  useEffect(() => {
    const measurementLines = shapes.filter(
      shape => shape.type === DrawingTool.MEASURE,
    ) as MeasurementLineShape[];

    const newCalibrationLine = measurementLines.find(
      line =>
        line.isCalibration &&
        !line.measurement &&
        Date.now() - line.createdAt < 1000,
    );

    if (newCalibrationLine) {
      onCalibrationLineDetected(newCalibrationLine);
      measurement.cancelCalibration();
      setActiveTool(DrawingTool.SELECT);
    }

    const newMeasurementLine = measurementLines.find(
      line =>
        !line.isCalibration &&
        !line.measurement &&
        Date.now() - line.createdAt < 1000,
    );

    if (newMeasurementLine && measurement.isCalibrated) {
      const updates = measurement.getMeasurementUpdates([newMeasurementLine]);
      if (updates.length > 0) {
        updateShapes(updates);
      }
    }
  }, [shapes, measurement, updateShapes, onCalibrationLineDetected, setActiveTool]);

  useEffect(() => {
    if (
      measurement.isCalibrated &&
      shapes.some(shape => shape.type === DrawingTool.MEASURE && !shape.isCalibration)
    ) {
      const updates = measurement.getMeasurementUpdates(shapes);
      if (updates.length > 0) {
        updateShapes(updates);
      }
    }
  }, [measurement, shapes, updateShapes]);
}
