import { useEffect, useRef } from 'react';
import type { DrawingState } from '@/types/drawing';

interface HistorySyncOptions {
  drawingState: DrawingState;
  pushState: (state: string, label: string) => void;
  getCurrentState: () => { data: string } | null;
  currentIndex: number;
  setShapes: (shapes: DrawingState['shapes']) => void;
}

export function useHistorySync({
  drawingState,
  pushState,
  getCurrentState,
  currentIndex,
  setShapes,
}: HistorySyncOptions): void {
  const isHistoryNavigationRef = useRef(false);
  const lastShapesRef = useRef('');

  useEffect(() => {
    if (!isHistoryNavigationRef.current) {
      const currentShapesJson = JSON.stringify({ shapes: drawingState.shapes });

      if (currentShapesJson !== lastShapesRef.current) {
        const previousState = lastShapesRef.current ? JSON.parse(lastShapesRef.current) : { shapes: [] };
        lastShapesRef.current = currentShapesJson;

        if (
          drawingState.shapes.length > 0 ||
          (drawingState.shapes.length === 0 && previousState.shapes?.length > 0)
        ) {
          pushState(currentShapesJson, 'Shape change');
        }
      }
    }

    isHistoryNavigationRef.current = false;
  }, [drawingState.shapes, pushState]);

  useEffect(() => {
    const currentState = getCurrentState();
    if (!currentState) {
      return;
    }

    try {
      const parsed = JSON.parse(currentState.data) as { shapes: DrawingState['shapes'] };
      const currentShapesJson = JSON.stringify({ shapes: drawingState.shapes });

      if (JSON.stringify(parsed) !== currentShapesJson) {
        isHistoryNavigationRef.current = true;
        setShapes(parsed.shapes);
      }
    } catch (error) {
      console.error('Failed to restore shapes from history:', error);
    }
  }, [currentIndex, getCurrentState, setShapes, drawingState.shapes]);
}
