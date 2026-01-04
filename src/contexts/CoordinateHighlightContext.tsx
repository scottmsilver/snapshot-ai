import React, { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Highlighted coordinate (point)
 */
export interface HighlightedPoint {
  type: 'point';
  x: number;
  y: number;
  /** Source image to show (base64 data URL) - optional, used for reference */
  sourceImage?: string;
}

/**
 * Highlighted region (bounding box)
 */
export interface HighlightedRegion {
  type: 'region';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Source image to show (base64 data URL) - optional, used for reference */
  sourceImage?: string;
}

/**
 * Highlighted coordinate state - can be a point or a region
 */
export type HighlightedCoordinate = HighlightedPoint | HighlightedRegion;

/**
 * Context type for coordinate highlighting
 */
export interface CoordinateHighlightContextType {
  /** Currently highlighted coordinate (null if none) */
  highlightedCoord: HighlightedCoordinate | null;
  /** Set the highlighted coordinate */
  setHighlightedCoord: (coord: HighlightedCoordinate | null) => void;
  /** The source image dimensions for coordinate mapping */
  sourceImageSize: { width: number; height: number } | null;
  /** Set the source image size */
  setSourceImageSize: (size: { width: number; height: number } | null) => void;
}

const CoordinateHighlightContext = createContext<CoordinateHighlightContextType | undefined>(undefined);

/**
 * Provider for coordinate highlighting
 */
export const CoordinateHighlightProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [highlightedCoord, setHighlightedCoord] = useState<HighlightedCoordinate | null>(null);
  const [sourceImageSize, setSourceImageSize] = useState<{ width: number; height: number } | null>(null);

  return (
    <CoordinateHighlightContext.Provider
      value={{
        highlightedCoord,
        setHighlightedCoord,
        sourceImageSize,
        setSourceImageSize,
      }}
    >
      {children}
    </CoordinateHighlightContext.Provider>
  );
};

/**
 * Hook to access coordinate highlight context
 */
export const useCoordinateHighlight = (): CoordinateHighlightContextType => {
  const context = useContext(CoordinateHighlightContext);
  if (!context) {
    throw new Error('useCoordinateHighlight must be used within a CoordinateHighlightProvider');
  }
  return context;
};

/**
 * Optional hook that returns null if outside provider (for components that might not be wrapped)
 */
export const useCoordinateHighlightOptional = (): CoordinateHighlightContextType | null => {
  return useContext(CoordinateHighlightContext) ?? null;
};
