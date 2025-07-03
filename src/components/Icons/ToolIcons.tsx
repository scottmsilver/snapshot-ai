import React from 'react';
import { 
  MousePointer2, 
  Pen, 
  Square, 
  Circle, 
  ArrowRight,
  Type,
  MessageSquare,
  Star,
  Ruler,
  Crop,
  Image
} from 'lucide-react';

interface IconProps {
  size?: number;
  color?: string;
}

// Re-export Lucide icons with consistent props
export const SelectIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <MousePointer2 size={size} color={color} />
);

export const PenIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Pen size={size} color={color} />
);

export const RectangleIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Square size={size} color={color} />
);

export const CircleIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Circle size={size} color={color} />
);

export const ArrowIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <ArrowRight size={size} color={color} />
);

export const TextIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Type size={size} color={color} />
);

export const CalloutIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <MessageSquare size={size} color={color} />
);

export const StarIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Star size={size} color={color} />
);

export const MeasureIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Ruler size={size} color={color} />
);

export const ScreenshotIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Crop size={size} color={color} />
);

export const ImageIcon: React.FC<IconProps> = ({ size = 24, color = 'currentColor' }) => (
  <Image size={size} color={color} />
);