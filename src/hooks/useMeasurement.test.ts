import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeasurement } from './useMeasurement';
import type { Shape, MeasurementLineShape } from '@/types/drawing';

describe('useMeasurement', () => {
  const createMeasurementLine = (
    id: string,
    points: [number, number, number, number],
    isCalibration = false
  ): MeasurementLineShape => ({
    id,
    type: 'measure',
    points,
    isCalibration,
    style: {
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 1,
    },
    visible: true,
    locked: false,
    zIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  describe('initial state', () => {
    it('should start uncalibrated', () => {
      const { result } = renderHook(() => useMeasurement([]));
      
      expect(result.current.isCalibrated).toBe(false);
      expect(result.current.isCalibrating).toBe(false);
      expect(result.current.calibration.pixelsPerUnit).toBe(null);
      expect(result.current.calibration.unit).toBe('cm');
      expect(result.current.calibrationLine).toBe(null);
    });
  });

  describe('calibration flow', () => {
    it('should start and cancel calibration', () => {
      const { result } = renderHook(() => useMeasurement([]));
      
      act(() => {
        result.current.startCalibration();
      });
      
      expect(result.current.isCalibrating).toBe(true);
      
      act(() => {
        result.current.cancelCalibration();
      });
      
      expect(result.current.isCalibrating).toBe(false);
    });

    it('should set calibration correctly', () => {
      const shapes: Shape[] = [
        createMeasurementLine('cal-1', [0, 0, 100, 0], true),
      ];
      const onUpdateShapes = vi.fn();
      const { result } = renderHook(() => useMeasurement(shapes, onUpdateShapes));
      
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      expect(result.current.isCalibrated).toBe(true);
      expect(result.current.isCalibrating).toBe(false);
      expect(result.current.calibration.pixelsPerUnit).toBe(1); // 100 pixels = 10 cm = 100 mm, so 1 pixel/mm
      expect(result.current.calibration.unit).toBe('cm');
      expect(result.current.calibration.calibrationLineId).toBe('cal-1');
    });

    it('should get calibration line from shapes', () => {
      const calibrationLine = createMeasurementLine('cal-1', [0, 0, 100, 0], true);
      const shapes: Shape[] = [
        calibrationLine,
        createMeasurementLine('measure-1', [0, 100, 100, 100], false),
      ];
      
      const { result } = renderHook(() => useMeasurement(shapes));
      
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      expect(result.current.calibrationLine).toEqual(calibrationLine);
    });

    it('should clear calibration', () => {
      const shapes: Shape[] = [
        createMeasurementLine('cal-1', [0, 0, 100, 0], true),
      ];
      const onUpdateShapes = vi.fn();
      const { result } = renderHook(() => useMeasurement(shapes, onUpdateShapes));
      
      // Set calibration first
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      // Clear it
      act(() => {
        result.current.clearCalibration();
      });
      
      expect(result.current.isCalibrated).toBe(false);
      expect(result.current.calibration.pixelsPerUnit).toBe(null);
      expect(result.current.calibration.calibrationLineId).toBe(null);
      expect(onUpdateShapes).toHaveBeenCalled();
    });
  });

  describe('unit changes', () => {
    it('should change unit', () => {
      const shapes: Shape[] = [];
      const { result } = renderHook(() => useMeasurement(shapes));
      
      act(() => {
        result.current.changeUnit('mm');
      });
      
      expect(result.current.calibration.unit).toBe('mm');
    });

    it('should update shapes when changing unit after calibration', () => {
      const shapes: Shape[] = [
        createMeasurementLine('cal-1', [0, 0, 100, 0], true),
        createMeasurementLine('measure-1', [0, 100, 100, 100], false),
      ];
      const onUpdateShapes = vi.fn();
      const { result } = renderHook(() => useMeasurement(shapes, onUpdateShapes));
      
      // Calibrate first
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      onUpdateShapes.mockClear();
      
      // Change unit
      act(() => {
        result.current.changeUnit('mm');
      });
      
      expect(onUpdateShapes).toHaveBeenCalled();
    });
  });

  describe('measurement calculations', () => {
    it('should calculate measurement when calibrated', () => {
      const { result } = renderHook(() => useMeasurement([]));
      
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      const measurement = result.current.calculateMeasurement(0, 0, 50, 0);
      expect(measurement).toBe('5.00 cm');
    });

    it('should return null when not calibrated', () => {
      const { result } = renderHook(() => useMeasurement([]));
      
      const measurement = result.current.calculateMeasurement(0, 0, 50, 0);
      expect(measurement).toBe(null);
    });

    it('should handle different units correctly', () => {
      const { result } = renderHook(() => useMeasurement([]));
      
      act(() => {
        result.current.setCalibration(100, 100, 'mm', 'cal-1');
      });
      
      // 100 pixels = 100 mm, so 50 pixels = 50 mm
      const measurement = result.current.calculateMeasurement(0, 0, 50, 0);
      expect(measurement).toBe('50 mm');
    });
  });

  describe('getMeasurementLabel', () => {
    it('should format calibration line label', () => {
      const calibrationLine: MeasurementLineShape = {
        ...createMeasurementLine('cal-1', [0, 0, 100, 0], true),
        measurement: {
          value: 10,
          unit: 'cm',
          pixelDistance: 100,
        },
      };
      
      const { result } = renderHook(() => useMeasurement([calibrationLine]));
      
      const label = result.current.getMeasurementLabel(calibrationLine);
      expect(label).toBe('10.0 cm');
    });

    it('should calculate measurement line label when calibrated', () => {
      const measurementLine = createMeasurementLine('measure-1', [0, 0, 50, 0], false);
      const shapes: Shape[] = [measurementLine];
      
      const { result } = renderHook(() => useMeasurement(shapes));
      
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      const label = result.current.getMeasurementLabel(measurementLine);
      expect(label).toBe('5.00 cm');
    });

    it('should show pixels when not calibrated', () => {
      const measurementLine = createMeasurementLine('measure-1', [0, 0, 100, 0], false);
      const { result } = renderHook(() => useMeasurement([measurementLine]));
      
      const label = result.current.getMeasurementLabel(measurementLine);
      expect(label).toBe('100px');
    });

    it('should handle diagonal measurements', () => {
      const measurementLine = createMeasurementLine('measure-1', [0, 0, 30, 40], false);
      const { result } = renderHook(() => useMeasurement([measurementLine]));
      
      const label = result.current.getMeasurementLabel(measurementLine);
      expect(label).toBe('50px'); // 3-4-5 triangle
    });
  });

  describe('updateMeasurementLabels', () => {
    it('should update measurement shapes with calculated values', () => {
      const shapes: Shape[] = [
        createMeasurementLine('cal-1', [0, 0, 100, 0], true),
        createMeasurementLine('measure-1', [0, 100, 100, 100], false),
        createMeasurementLine('measure-2', [0, 200, 50, 200], false),
        // Add a non-measurement shape
        {
          id: 'rect-1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          style: { stroke: '#000', strokeWidth: 1, opacity: 1 },
          visible: true,
          locked: false,
          zIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      
      const { result } = renderHook(() => useMeasurement(shapes));
      
      // Calibrate: 100 pixels = 10 cm
      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });
      
      const updated = result.current.updateMeasurementLabels(shapes);
      
      // Check first measurement line
      const measure1 = updated.find(s => s.id === 'measure-1') as MeasurementLineShape;
      expect(measure1.measurement).toEqual({
        value: 10,
        unit: 'cm',
        pixelDistance: 100,
      });
      
      // Check second measurement line
      const measure2 = updated.find(s => s.id === 'measure-2') as MeasurementLineShape;
      expect(measure2.measurement).toEqual({
        value: 5,
        unit: 'cm',
        pixelDistance: 50,
      });
      
      // Check that calibration line is unchanged
      const cal1 = updated.find(s => s.id === 'cal-1') as MeasurementLineShape;
      expect(cal1.measurement).toBeUndefined();
      
      // Check that non-measurement shape is unchanged
      const rect1 = updated.find(s => s.id === 'rect-1');
      expect(rect1?.type).toBe('rectangle');
    });

    it('should return shapes unchanged when not calibrated', () => {
      const shapes: Shape[] = [
        createMeasurementLine('measure-1', [0, 100, 100, 100], false),
      ];
      
      const { result } = renderHook(() => useMeasurement(shapes));
      
      const updated = result.current.updateMeasurementLabels(shapes);
      expect(updated).toEqual(shapes);
    });
  });

  describe('getMeasurementUpdates', () => {
    it('should produce updates for measurement lines when calibrated', () => {
      const calibrationLine = createMeasurementLine('cal-1', [0, 0, 100, 0], true);
      const measurementLine = createMeasurementLine('measure-1', [0, 100, 100, 100], false);
      const shapes: Shape[] = [calibrationLine, measurementLine];

      const onUpdateShapes = vi.fn();
      const { result } = renderHook(() => useMeasurement(shapes, onUpdateShapes));

      act(() => {
        result.current.setCalibration(100, 10, 'cm', 'cal-1');
      });

      const updates = result.current.getMeasurementUpdates(shapes);

      expect(updates).toEqual([
        {
          id: 'measure-1',
          updates: {
            measurement: {
              value: 10,
              unit: 'cm',
              pixelDistance: 100,
            },
          },
        },
      ]);
    });

    it('should return empty array when not calibrated', () => {
      const measurementLine = createMeasurementLine('measure-1', [0, 0, 50, 0], false);
      const shapes: Shape[] = [measurementLine];

      const { result } = renderHook(() => useMeasurement(shapes));

      const updates = result.current.getMeasurementUpdates(shapes);
      expect(updates).toEqual([]);
    });
  });
});