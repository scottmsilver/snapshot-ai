import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { DrawingProvider } from './DrawingProvider';
import { useDrawingContext } from './DrawingContext';
import { DrawingTool } from '@/types/drawing';

describe('DrawingContext - Measurement Features', () => {
  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <DrawingProvider>{children}</DrawingProvider>
  );

  describe('measurement calibration', () => {
    it('should have initial measurement calibration state', () => {
      const { result } = renderHook(() => useDrawingContext(), { wrapper });

      expect(result.current.state.measurementCalibration).toEqual({
        pixelsPerUnit: null,
        unit: 'cm',
        calibrationLineId: null,
      });
    });

    it('should set measurement calibration', () => {
      const { result } = renderHook(() => useDrawingContext(), { wrapper });

      const calibration = {
        pixelsPerUnit: 2.5,
        unit: 'mm',
        calibrationLineId: 'cal-123',
      };

      act(() => {
        result.current.setMeasurementCalibration(calibration);
      });

      expect(result.current.state.measurementCalibration).toEqual(calibration);
    });

    it('should clear measurement calibration', () => {
      const { result } = renderHook(() => useDrawingContext(), { wrapper });

      // Set calibration first
      act(() => {
        result.current.setMeasurementCalibration({
          pixelsPerUnit: 2.5,
          unit: 'mm',
          calibrationLineId: 'cal-123',
        });
      });

      // Clear it
      act(() => {
        result.current.setMeasurementCalibration({
          pixelsPerUnit: null,
          unit: 'cm',
          calibrationLineId: null,
        });
      });

      expect(result.current.state.measurementCalibration.pixelsPerUnit).toBe(null);
      expect(result.current.state.measurementCalibration.calibrationLineId).toBe(null);
    });

    it('should preserve other state when setting calibration', () => {
      const { result } = renderHook(() => useDrawingContext(), { wrapper });

      // Set some other state first
      act(() => {
        result.current.setActiveTool(DrawingTool.ARROW);
        result.current.updateStyle({ stroke: '#ff0000' });
      });

      // Set calibration
      act(() => {
        result.current.setMeasurementCalibration({
          pixelsPerUnit: 1.5,
          unit: 'in',
          calibrationLineId: 'cal-456',
        });
      });

      // Check that other state is preserved
      expect(result.current.state.activeTool).toBe(DrawingTool.ARROW);
      expect(result.current.state.currentStyle.stroke).toBe('#ff0000');
      expect(result.current.state.measurementCalibration.unit).toBe('in');
    });
  });
});
