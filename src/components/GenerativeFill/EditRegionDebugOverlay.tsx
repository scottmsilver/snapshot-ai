import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface EditRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  pixelCount: number;
}

interface DebugData {
  originalImage: string;
  resultImage: string;
  editRegions: EditRegion[];
  imageWidth: number;
  imageHeight: number;
  totalChangedPixels: number;
  percentChanged: number;
}

interface EditRegionDebugOverlayProps {
  debugData: DebugData;
  onClose: () => void;
}

type ViewMode = 'side-by-side' | 'before' | 'after' | 'diff';

export const EditRegionDebugOverlay: React.FC<EditRegionDebugOverlayProps> = ({
  debugData,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [mousePos, setMousePos] = useState<{ x: number; y: number; imageX: number; imageY: number } | null>(null);
  const [scale, setScale] = useState(1);
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);

  // Calculate scale to fit images on screen
  useEffect(() => {
    const maxWidth = window.innerWidth * 0.4;
    const maxHeight = window.innerHeight * 0.7;
    const scaleX = maxWidth / debugData.imageWidth;
    const scaleY = maxHeight / debugData.imageHeight;
    setScale(Math.min(scaleX, scaleY, 1));
  }, [debugData.imageWidth, debugData.imageHeight]);

  // Draw diff visualization on canvas
  useEffect(() => {
    const canvas = diffCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = debugData.imageWidth;
      canvas.height = debugData.imageHeight;

      // Draw the result image as base
      ctx.drawImage(img, 0, 0);

      // Draw semi-transparent overlay on changed regions
      ctx.fillStyle = 'rgba(255, 107, 0, 0.4)';
      ctx.strokeStyle = '#FF6B00';
      ctx.lineWidth = 2;

      for (const region of debugData.editRegions) {
        ctx.fillRect(region.x, region.y, region.width, region.height);
        ctx.strokeRect(region.x, region.y, region.width, region.height);

        // Draw center marker
        ctx.beginPath();
        ctx.arc(region.centerX, region.centerY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FF0000';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 107, 0, 0.4)';
        ctx.strokeStyle = '#FF6B00';
        ctx.lineWidth = 2;
      }
    };
    img.src = debugData.resultImage;
  }, [debugData]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>, imageRef: React.RefObject<HTMLDivElement | null>) => {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imageX = Math.round(x / scale);
    const imageY = Math.round(y / scale);

    setMousePos({
      x: e.clientX,
      y: e.clientY,
      imageX: Math.max(0, Math.min(imageX, debugData.imageWidth - 1)),
      imageY: Math.max(0, Math.min(imageY, debugData.imageHeight - 1)),
    });
  }, [scale, debugData.imageWidth, debugData.imageHeight]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  // Find which region (if any) the cursor is in
  const getRegionAtPoint = (x: number, y: number): EditRegion | null => {
    for (const region of debugData.editRegions) {
      if (x >= region.x && x < region.x + region.width &&
          y >= region.y && y < region.y + region.height) {
        return region;
      }
    }
    return null;
  };

  const hoveredRegion = mousePos ? getRegionAtPoint(mousePos.imageX, mousePos.imageY) : null;

  const scaledWidth = debugData.imageWidth * scale;
  const scaledHeight = debugData.imageHeight * scale;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
        overflow: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '1200px',
          marginBottom: '16px',
        }}
      >
        <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>
          Edit Region Debug View
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* View mode toggles */}
          {(['side-by-side', 'before', 'after', 'diff'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: viewMode === mode ? '#2196f3' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'side-by-side' ? 'Side by Side' : mode}
            </button>
          ))}
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '16px',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          marginBottom: '16px',
          color: 'rgba(255,255,255,0.8)',
          fontSize: '13px',
        }}
      >
        <span>Image: {debugData.imageWidth} x {debugData.imageHeight}</span>
        <span>Regions: {debugData.editRegions.length}</span>
        <span>Changed: {debugData.totalChangedPixels.toLocaleString()} px ({debugData.percentChanged.toFixed(1)}%)</span>
      </div>

      {/* Images */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Before image */}
        {(viewMode === 'side-by-side' || viewMode === 'before') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginBottom: '8px' }}>
              BEFORE (Original)
            </div>
            <div
              ref={beforeRef}
              onMouseMove={(e) => handleMouseMove(e, beforeRef)}
              onMouseLeave={handleMouseLeave}
              style={{
                position: 'relative',
                width: scaledWidth,
                height: scaledHeight,
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: 'crosshair',
              }}
            >
              <img
                src={debugData.originalImage}
                alt="Before"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                draggable={false}
              />
              {/* Region overlays */}
              {debugData.editRegions.map((region, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: region.x * scale,
                    top: region.y * scale,
                    width: region.width * scale,
                    height: region.height * scale,
                    border: '2px dashed rgba(255, 107, 0, 0.8)',
                    backgroundColor: 'rgba(255, 107, 0, 0.1)',
                    pointerEvents: 'none',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* After image */}
        {(viewMode === 'side-by-side' || viewMode === 'after') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginBottom: '8px' }}>
              AFTER (Result)
            </div>
            <div
              ref={afterRef}
              onMouseMove={(e) => handleMouseMove(e, afterRef)}
              onMouseLeave={handleMouseLeave}
              style={{
                position: 'relative',
                width: scaledWidth,
                height: scaledHeight,
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: 'crosshair',
              }}
            >
              <img
                src={debugData.resultImage}
                alt="After"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                draggable={false}
              />
              {/* Region overlays */}
              {debugData.editRegions.map((region, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: region.x * scale,
                    top: region.y * scale,
                    width: region.width * scale,
                    height: region.height * scale,
                    border: '2px solid #FF6B00',
                    backgroundColor: 'rgba(255, 107, 0, 0.3)',
                    pointerEvents: 'none',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Diff view */}
        {viewMode === 'diff' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginBottom: '8px' }}>
              DIFF (Changed regions highlighted)
            </div>
            <div
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const imageX = Math.round(x / scale);
                const imageY = Math.round(y / scale);
                setMousePos({
                  x: e.clientX,
                  y: e.clientY,
                  imageX: Math.max(0, Math.min(imageX, debugData.imageWidth - 1)),
                  imageY: Math.max(0, Math.min(imageY, debugData.imageHeight - 1)),
                });
              }}
              onMouseLeave={handleMouseLeave}
              style={{
                position: 'relative',
                width: scaledWidth,
                height: scaledHeight,
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: 'crosshair',
              }}
            >
              <canvas
                ref={diffCanvasRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Region list */}
      <div
        style={{
          marginTop: '20px',
          maxWidth: '800px',
          width: '100%',
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div style={{ color: 'white', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
          Detected Edit Regions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {debugData.editRegions.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
              No changed regions detected
            </div>
          ) : (
            debugData.editRegions.map((region, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '16px',
                  padding: '8px 12px',
                  backgroundColor: hoveredRegion === region ? 'rgba(255, 107, 0, 0.2)' : 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'monospace',
                  border: hoveredRegion === region ? '1px solid #FF6B00' : '1px solid transparent',
                }}
              >
                <span style={{ color: '#FF6B00', fontWeight: 600 }}>#{i + 1}</span>
                <span>Top-left: ({region.x}, {region.y})</span>
                <span>Size: {region.width} x {region.height}</span>
                <span>Center: ({region.centerX}, {region.centerY})</span>
                <span>{region.pixelCount.toLocaleString()} px</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Coordinate tooltip */}
      {mousePos && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 15,
            top: mousePos.y + 15,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 100001,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <div>x: {mousePos.imageX}, y: {mousePos.imageY}</div>
          {hoveredRegion && (
            <div style={{ color: '#FF6B00', marginTop: '4px' }}>
              In region #{debugData.editRegions.indexOf(hoveredRegion) + 1}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
