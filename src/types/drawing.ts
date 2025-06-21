// Drawing tool types
export const DrawingTool = {
  SELECT: 'select',
  PEN: 'pen',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  ARROW: 'arrow',
  TEXT: 'text'
} as const;

export type DrawingTool = typeof DrawingTool[keyof typeof DrawingTool];

// Drawing modes
export const DrawingMode = {
  NONE: 'none',
  DRAWING: 'drawing',
  EDITING: 'editing',
  MOVING: 'moving',
  RESIZING: 'resizing'
} as const;

export type DrawingMode = typeof DrawingMode[keyof typeof DrawingMode];

// Layer operations
export const LayerOperation = {
  BRING_TO_FRONT: 'bringToFront',
  BRING_FORWARD: 'bringForward',
  SEND_BACKWARD: 'sendBackward',
  SEND_TO_BACK: 'sendToBack'
} as const;

export type LayerOperation = typeof LayerOperation[keyof typeof LayerOperation];

// Point type
export interface Point {
  x: number;
  y: number;
}

// Style properties
export interface DrawingStyle {
  stroke: string;
  strokeWidth: number;
  fill?: string;
  opacity: number;
  lineCap?: 'round' | 'square' | 'butt';
  lineJoin?: 'round' | 'bevel' | 'miter';
  dash?: number[];
  fontFamily?: string; // For text shapes
}

// Base shape interface - includes z-order
export interface BaseShape {
  id: string;
  type: DrawingTool;
  style: DrawingStyle;
  visible: boolean;
  locked: boolean;
  zIndex: number; // Layer order - higher numbers are on top
  createdAt: number;
  updatedAt: number;
}

// Specific shape types
export interface PenShape extends BaseShape {
  type: typeof DrawingTool.PEN;
  points: number[]; // [x1, y1, x2, y2, ...]
  tension?: number;
}

export interface RectShape extends BaseShape {
  type: typeof DrawingTool.RECTANGLE;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
  rotation?: number;
}

export interface CircleShape extends BaseShape {
  type: typeof DrawingTool.CIRCLE;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation?: number;
}

export interface ArrowShape extends BaseShape {
  type: typeof DrawingTool.ARROW;
  points: [number, number, number, number]; // [x1, y1, x2, y2]
  pointerLength?: number;
  pointerWidth?: number;
}

export interface TextShape extends BaseShape {
  type: typeof DrawingTool.TEXT;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle?: string;
  align?: string;
  width?: number;
  rotation?: number;
}


// Union type for all shapes
export type Shape = PenShape | RectShape | CircleShape | ArrowShape | TextShape;

// Drawing state
export interface DrawingState {
  // Current tool and mode
  activeTool: DrawingTool;
  drawingMode: DrawingMode;
  
  // Style settings
  currentStyle: DrawingStyle;
  
  // Shape being drawn
  activeShape: Shape | null;
  tempPoints: Point[];
  
  // All shapes (sorted by zIndex)
  shapes: Shape[];
  
  // Selection
  selectedShapeIds: string[];
  
  // Canvas state
  isDrawing: boolean;
  startPoint: Point | null;
  lastPoint: Point | null;
  
  // Z-order management
  maxZIndex: number; // Track highest z-index for new shapes
}

// Helper functions for z-order management
export const sortShapesByZIndex = (shapes: Shape[]): Shape[] => {
  return [...shapes].sort((a, b) => a.zIndex - b.zIndex);
};

export const getNextZIndex = (shapes: Shape[]): number => {
  if (shapes.length === 0) return 0;
  return Math.max(...shapes.map(s => s.zIndex)) + 1;
};

export const reorderShapes = (
  shapes: Shape[],
  shapeId: string,
  operation: LayerOperation
): Shape[] => {
  const shapesCopy = [...shapes];
  const shapeIndex = shapesCopy.findIndex(s => s.id === shapeId);
  
  if (shapeIndex === -1) return shapes;
  
  const shape = shapesCopy[shapeIndex];
  const sortedShapes = sortShapesByZIndex(shapesCopy);
  const sortedIndex = sortedShapes.findIndex(s => s.id === shapeId);
  
  switch (operation) {
    case LayerOperation.BRING_TO_FRONT:
      shape.zIndex = getNextZIndex(shapes);
      break;
      
    case LayerOperation.SEND_TO_BACK:
      // Shift all other shapes up
      shapesCopy.forEach(s => {
        if (s.id !== shapeId && s.zIndex < shape.zIndex) {
          s.zIndex++;
        }
      });
      shape.zIndex = 0;
      break;
      
    case LayerOperation.BRING_FORWARD:
      if (sortedIndex < sortedShapes.length - 1) {
        const nextShape = sortedShapes[sortedIndex + 1];
        const tempZ = shape.zIndex;
        shape.zIndex = nextShape.zIndex;
        nextShape.zIndex = tempZ;
      }
      break;
      
    case LayerOperation.SEND_BACKWARD:
      if (sortedIndex > 0) {
        const prevShape = sortedShapes[sortedIndex - 1];
        const tempZ = shape.zIndex;
        shape.zIndex = prevShape.zIndex;
        prevShape.zIndex = tempZ;
      }
      break;
  }
  
  return shapesCopy;
};