import React, { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type { Rectangle } from '@/types/drawing';

interface ResultOverlayProps {
  imageData: string; // Base64 PNG
  bounds: Rectangle;
}

export const ResultOverlay: React.FC<ResultOverlayProps> = ({ imageData, bounds }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.src = imageData;
    img.onload = () => {
      setImage(img);
    };

    return () => {
      setImage(null);
    };
  }, [imageData]);

  if (!image) return null;

  return (
    <KonvaImage
      image={image}
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      opacity={0.9}
      listening={false}
    />
  );
};
