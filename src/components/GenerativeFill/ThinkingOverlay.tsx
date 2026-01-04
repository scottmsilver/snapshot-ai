import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  /** Whether to show the rainbow border animation */
  showRainbowBorder?: boolean;
}

/**
 * ThinkingOverlay Component
 *
 * Displays an animated gradient border around the canvas when the AI is processing.
 * Features:
 * - Rotating warm red/orange glow that zips around the border
 * - Rough inner edge glow with pulsing animation
 * - Initial flash wash when thinking starts
 * - Shimmer particles floating across the canvas
 * - Semi-transparent iteration images as they arrive
 */
export const ThinkingOverlay: React.FC<ThinkingOverlayProps> = ({
  status,
  canvasWidth,
  canvasHeight,
  zoomLevel = 1,
  image = null,
  showRainbowBorder = false,
}) => {
  // Track flash animation state
  const [showFlash, setShowFlash] = useState(false);
  const prevStatusRef = useRef<ThinkingStatus>('idle');

  // Trigger flash when transitioning to thinking
  useEffect(() => {
    if (status === 'thinking' && prevStatusRef.current !== 'thinking') {
      setShowFlash(true);
      // Remove flash class after animation completes
      const timer = setTimeout(() => setShowFlash(false), 700);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Generate shimmer particles with randomized positions (only when thinking)
  // IMPORTANT: This must be called before any early returns (React hooks rule)
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
    if (showRainbowBorder) {
      borderClass += ' thinking';
    }
  } else if (status === 'accepted') {
    borderClass += ' accepted';
  } else if (status === 'rejected') {
    borderClass += ' rejected';
  }
  const shouldRenderBorder = status !== 'thinking' || showRainbowBorder;

  // Wrapper class with flash state (only flash if rainbow border is enabled)
  const wrapperClass = `thinking-overlay-wrapper${showFlash && showRainbowBorder ? ' flash-active' : ''}`;

  return (
    <div
      className={wrapperClass}
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
      {/* Initial flash wash effect */}
      <div
        className="thinking-flash"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      />

      {/* Animated gradient border with rotating glow */}
      {shouldRenderBorder && (
        <div
          className={borderClass}
          style={{
            width: `${width}px`,
            height: `${height}px`,
          }}
        />
      )}

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
