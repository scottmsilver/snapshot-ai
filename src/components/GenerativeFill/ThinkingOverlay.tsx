import React, { useMemo } from 'react';
import type { ThinkingStatus } from '@/types/aiProgress';
import './ThinkingOverlay.css';

interface ThinkingOverlayProps {
  /** Current status of the thinking process */
  status: ThinkingStatus;
  /** Canvas dimensions to frame the border around */
  canvasWidth: number;
  canvasHeight: number;
  /** Zoom level for proper positioning */
  zoomLevel?: number;
  /** Interim image to show as semi-transparent overlay (base64 string) */
  image?: string | null;
}

/**
 * ThinkingOverlay Component
 *
 * Displays an Apple Intelligence-style animated gradient border around the canvas
 * when the AI is processing. The border:
 * - Shows a rotating rainbow/prismatic gradient (~3-4 second cycle)
 * - Frames the entire canvas area (not just a specific region)
 * - Uses CSS animations (conic-gradient with rotation)
 * - Appears when status is 'thinking', 'accepted', or 'rejected'
 * - Hides when status is 'idle' (fixes the visibility bug)
 *
 * This replaces the previous Konva-based implementation which couldn't
 * support CSS animations properly.
 */
export const ThinkingOverlay: React.FC<ThinkingOverlayProps> = ({
  status,
  canvasWidth,
  canvasHeight,
  zoomLevel = 1,
  image = null,
}) => {
  // DEBUG - Log props to verify component receives correct data
  console.log('🎨 ThinkingOverlay:', { status, hasImage: !!image, canvasWidth, canvasHeight });

  // Don't render if status is idle
  if (status === 'idle') {
    return null;
  }

  // Calculate the actual dimensions with zoom
  const width = canvasWidth * zoomLevel;
  const height = canvasHeight * zoomLevel;

  // Determine the border style based on status
  let borderClass = 'apple-intelligence-border';
  if (status === 'thinking') {
    borderClass += ' thinking';
  } else if (status === 'accepted') {
    borderClass += ' accepted';
  } else if (status === 'rejected') {
    borderClass += ' rejected';
  }

  // Generate shimmer particles with randomized positions (only when thinking)
  // More particles, larger sizes for better visibility
  const particles = useMemo(() => {
    if (status !== 'thinking') return [];

    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      animationDelay: Math.random() * 2,
      animationDuration: 1.5 + Math.random() * 1.5,
      size: 4 + Math.random() * 6, // 4-10px instead of 2-4px
    }));
  }, [status]);

  return (
    <div
      className="thinking-overlay-wrapper"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {/* Animated gradient border - inset on top of canvas */}
      <div
        className={borderClass}
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      />

      {/* Semi-transparent interim image overlay */}
      {image && (
        <img
          src={image}
          alt="AI iteration preview"
          className="thinking-overlay-image"
          style={{
            width: `${width}px`,
            height: `${height}px`,
          }}
        />
      )}

      {/* Shimmer particles (only during thinking) */}
      {status === 'thinking' && (
        <div
          className="shimmer-particles-container"
          style={{
            width: `${width}px`,
            height: `${height}px`,
          }}
        >
          {particles.map(particle => (
            <div
              key={particle.id}
              className="shimmer-particle"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay: `${particle.animationDelay}s`,
                animationDuration: `${particle.animationDuration}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
