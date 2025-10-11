import { useEffect } from 'react';
import Konva from 'konva';
import { DrawingTool, type Shape } from '@/types/drawing';

interface ScreenshotCaptureOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
  canvasSize: { width: number; height: number } | null;
  shapes: Shape[];
  addShape: (shape: Shape | Omit<Shape, 'zIndex'>) => void;
  setActiveTool: (tool: DrawingTool) => void;
  selectShape: (id: string) => void;
}

export function useScreenshotCapture({
  stageRef,
  canvasSize,
  shapes,
  addShape,
  setActiveTool,
  selectShape,
}: ScreenshotCaptureOptions): void {
  useEffect(() => {
    const generateId = (): string => `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const handleScreenshotAreaSelected = async (event: Event): Promise<void> => {
      const bounds = (event as CustomEvent<{ x: number; y: number; width: number; height: number }>).detail;
      if (!stageRef.current || !bounds || bounds.width < 10 || bounds.height < 10 || !canvasSize) {
        return;
      }

      try {
        const scale = stageRef.current.scaleX();

        const dataURL = stageRef.current.toDataURL({
          x: bounds.x * scale,
          y: bounds.y * scale,
          width: bounds.width * scale,
          height: bounds.height * scale,
          pixelRatio: 1 / scale,
        });

        const maxZ = shapes.reduce((acc, shape) => Math.max(acc, shape.zIndex ?? 0), 0);

        const imageShape: Shape = {
          id: generateId(),
          type: DrawingTool.IMAGE,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          imageData: dataURL,
          style: {
            stroke: 'transparent',
            strokeWidth: 0,
            opacity: 1,
          },
          visible: true,
          locked: false,
          zIndex: maxZ + 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as Shape;

        addShape(imageShape);
        setActiveTool(DrawingTool.SELECT);

        setTimeout(() => {
          selectShape(imageShape.id);
        }, 150);
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
      }
    };

    window.addEventListener('screenshot-area-selected', handleScreenshotAreaSelected as EventListener);
    return () => {
      window.removeEventListener('screenshot-area-selected', handleScreenshotAreaSelected as EventListener);
    };
  }, [stageRef, canvasSize, shapes, addShape, setActiveTool, selectShape]);
}
