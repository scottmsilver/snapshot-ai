/**
 * Image annotation utility for AI Reference mode
 * Draws labeled circles and arrows on images to help AI understand spatial relationships
 */

export interface AnnotationPoint {
  label: string;
  x: number;
  y: number;
}

export interface AnnotationArrow {
  from: string;  // label of source point
  to: string;    // label of destination point
}

export interface AnnotationOptions {
  points: AnnotationPoint[];
  arrows?: AnnotationArrow[];
  circleRadius?: number;
  circleColor?: string;
  arrowColor?: string;
  fontSize?: number;
}

const DEFAULT_OPTIONS = {
  circleRadius: 15,
  circleColor: '#2196f3',
  arrowColor: '#2196f3',
  fontSize: 14,
};

/**
 * Annotate an image with labeled circles at specified points and optional arrows
 * @param imageData - Base64 PNG image data (data:image/png;base64,...)
 * @param options - Annotation options including points and arrows
 * @returns Promise<string> - Annotated image as base64 PNG
 */
export async function annotateImage(
  imageData: string,
  options: AnnotationOptions
): Promise<string> {
  const { points, arrows = [] } = options;
  const circleRadius = options.circleRadius ?? DEFAULT_OPTIONS.circleRadius;
  const circleColor = options.circleColor ?? DEFAULT_OPTIONS.circleColor;
  const arrowColor = options.arrowColor ?? DEFAULT_OPTIONS.arrowColor;
  const fontSize = options.fontSize ?? DEFAULT_OPTIONS.fontSize;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Create canvas at image size
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Create point lookup for arrows
      const pointMap = new Map<string, AnnotationPoint>();
      points.forEach(p => pointMap.set(p.label, p));

      // Draw arrows first (behind circles)
      arrows.forEach(arrow => {
        const fromPoint = pointMap.get(arrow.from);
        const toPoint = pointMap.get(arrow.to);
        if (fromPoint && toPoint) {
          drawArrow(ctx, fromPoint, toPoint, circleRadius, arrowColor);
        }
      });

      // Draw circles with labels
      points.forEach(point => {
        drawLabeledCircle(ctx, point, circleRadius, circleColor, fontSize);
      });

      // Export as base64
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for annotation'));
    };

    img.src = imageData;
  });
}

/**
 * Draw a map-style pin at a point
 * The pin has a rounded head with a pointed bottom that indicates the exact location
 */
function drawLabeledCircle(
  ctx: CanvasRenderingContext2D,
  point: AnnotationPoint,
  radius: number,
  color: string,
  fontSize: number
): void {
  const { x, y, label } = point;

  // Pin dimensions
  const pinRadius = radius;
  const pinHeight = pinRadius * 2.2;
  const headCenterY = y - pinHeight + pinRadius;

  ctx.save();

  // Draw shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // Draw the pin shape (teardrop)
  ctx.beginPath();
  // Start at the point (bottom of pin)
  ctx.moveTo(x, y);
  // Curve up to the left side of the head
  ctx.bezierCurveTo(
    x - pinRadius * 0.6, y - pinHeight * 0.4,
    x - pinRadius, headCenterY + pinRadius * 0.3,
    x - pinRadius, headCenterY
  );
  // Arc around the top (head of pin)
  ctx.arc(x, headCenterY, pinRadius, Math.PI, 0, false);
  // Curve down to the point
  ctx.bezierCurveTo(
    x + pinRadius, headCenterY + pinRadius * 0.3,
    x + pinRadius * 0.6, y - pinHeight * 0.4,
    x, y
  );
  ctx.closePath();

  // Fill with color
  ctx.fillStyle = color;
  ctx.fill();

  // White border
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  // Draw label text in the head
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';
  ctx.fillText(label, x, headCenterY);

  // Draw small dot at exact location
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
}

/**
 * Draw an arrow from one pin to another
 * Arrow connects the pin heads (not the points)
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: AnnotationPoint,
  to: AnnotationPoint,
  pinRadius: number,
  color: string
): void {
  // Pin head positions (above the point)
  const pinHeight = pinRadius * 2.2;
  const fromHeadY = from.y - pinHeight + pinRadius;
  const toHeadY = to.y - pinHeight + pinRadius;

  // Calculate angle between pin heads
  const dx = to.x - from.x;
  const dy = toHeadY - fromHeadY;
  const angle = Math.atan2(dy, dx);
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Start from edge of source pin head, end at edge of destination pin head
  const offset = pinRadius + 5;

  const startX = from.x + Math.cos(angle) * offset;
  const startY = fromHeadY + Math.sin(angle) * offset;
  const endX = to.x - Math.cos(angle) * offset;
  const endY = toHeadY - Math.sin(angle) * offset;

  // Skip if pins are too close
  if (distance < offset * 2 + 20) {
    return;
  }

  ctx.save();

  // Draw line with shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw arrowhead
  const headLength = 12;
  const headAngle = Math.PI / 6; // 30 degrees

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLength * Math.cos(angle - headAngle),
    endY - headLength * Math.sin(angle - headAngle)
  );
  ctx.lineTo(
    endX - headLength * Math.cos(angle + headAngle),
    endY - headLength * Math.sin(angle + headAngle)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

/**
 * Parse a command to detect move-related keywords and extract source/destination labels
 * Returns arrow definitions for visualization
 */
export function parseCommandForArrows(
  command: string,
  availableLabels: string[]
): AnnotationArrow[] {
  const arrows: AnnotationArrow[] = [];

  // Patterns to detect move commands
  const movePatterns = [
    /move\s+(\w)\s+to\s+(\w)/gi,           // "move A to B"
    /move\s+(\w)\s+to\s+where\s+(\w)/gi,   // "move A to where B is"
    /place\s+(\w)\s+at\s+(\w)/gi,          // "place A at B"
    /put\s+(\w)\s+at\s+(\w)/gi,            // "put A at B"
    /relocate\s+(\w)\s+to\s+(\w)/gi,       // "relocate A to B"
  ];

  // Swap pattern (bidirectional arrows)
  const swapPattern = /swap\s+(\w)\s+(?:and|with)\s+(\w)/gi;

  // Check move patterns
  for (const pattern of movePatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(command)) !== null) {
      const from = match[1].toUpperCase();
      const to = match[2].toUpperCase();
      if (availableLabels.includes(from) && availableLabels.includes(to)) {
        arrows.push({ from, to });
      }
    }
  }

  // Check swap pattern
  let swapMatch;
  swapPattern.lastIndex = 0;
  while ((swapMatch = swapPattern.exec(command)) !== null) {
    const labelA = swapMatch[1].toUpperCase();
    const labelB = swapMatch[2].toUpperCase();
    if (availableLabels.includes(labelA) && availableLabels.includes(labelB)) {
      arrows.push({ from: labelA, to: labelB });
      arrows.push({ from: labelB, to: labelA });
    }
  }

  return arrows;
}
