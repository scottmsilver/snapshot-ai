import Konva from 'konva';
import { 
  DrawingTool, 
  type Shape, 
  type PenShape, 
  type RectShape, 
  type CircleShape, 
  type ArrowShape, 
  type TextShape, 
  type CalloutShape, 
  type StarShape, 
  type MeasurementLineShape,
  type ImageShape 
} from '@/types/drawing';
import { 
  perimeterOffsetToPoint, 
  getArrowPathString, 
  calculateArrowHeadRotation,
} from '@/utils/calloutGeometry';
import { formatMeasurement, type MeasurementUnit } from '@/utils/measurementUtils';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Check if a shape intersects with the screenshot bounds
function shapeIntersectsBounds(shape: Shape, bounds: Bounds): boolean {
  void shape;
  void bounds;
  // This is a simplified check - you might need more sophisticated intersection logic
  // For now, we'll render all shapes and let Konva clip them
  return true;
}

// Render a shape for offscreen capture (no interaction, no preview)
export async function renderShapeOffscreen(
  shape: Shape, 
  bounds: Bounds
): Promise<Konva.Shape | Konva.Group | null> {
  if (!shapeIntersectsBounds(shape, bounds)) {
    return null;
  }

  // Adjust coordinates relative to screenshot bounds
  const offsetX = -bounds.x;
  const offsetY = -bounds.y;

  switch (shape.type) {
    case DrawingTool.PEN: {
      const penShape = shape as PenShape;
      const adjustedPoints = penShape.points.map((point, index) => 
        index % 2 === 0 ? point + offsetX : point + offsetY
      );
      
      return new Konva.Line({
        points: adjustedPoints,
        stroke: penShape.style.stroke,
        strokeWidth: penShape.style.strokeWidth,
        opacity: penShape.style.opacity,
        lineCap: penShape.style.lineCap,
        lineJoin: penShape.style.lineJoin,
        tension: penShape.tension || 0.5,
        globalCompositeOperation: 'source-over',
      });
    }

    case DrawingTool.RECTANGLE: {
      const rectShape = shape as RectShape;
      return new Konva.Rect({
        x: rectShape.x + offsetX,
        y: rectShape.y + offsetY,
        width: rectShape.width,
        height: rectShape.height,
        stroke: rectShape.style.stroke,
        strokeWidth: rectShape.style.strokeWidth,
        fill: rectShape.style.fill,
        opacity: rectShape.style.opacity,
        cornerRadius: rectShape.cornerRadius,
        rotation: rectShape.rotation || 0,
      });
    }

    case DrawingTool.CIRCLE: {
      const circleShape = shape as CircleShape;
      return new Konva.Circle({
        x: circleShape.x + offsetX,
        y: circleShape.y + offsetY,
        radius: circleShape.radiusX,
        stroke: circleShape.style.stroke,
        strokeWidth: circleShape.style.strokeWidth,
        fill: circleShape.style.fill,
        opacity: circleShape.style.opacity,
        rotation: circleShape.rotation || 0,
      });
    }

    case DrawingTool.ARROW: {
      const arrowShape = shape as ArrowShape;
      const adjustedPoints = arrowShape.points.map((point, index) => 
        index % 2 === 0 ? point + offsetX : point + offsetY
      );
      
      return new Konva.Arrow({
        points: adjustedPoints,
        stroke: arrowShape.style.stroke,
        strokeWidth: arrowShape.style.strokeWidth,
        opacity: arrowShape.style.opacity,
        pointerLength: arrowShape.pointerLength,
        pointerWidth: arrowShape.pointerWidth,
      });
    }

    case DrawingTool.TEXT: {
      const textShape = shape as TextShape;
      return new Konva.Text({
        x: textShape.x + offsetX,
        y: textShape.y + offsetY,
        text: textShape.text,
        fontSize: textShape.fontSize,
        fontFamily: textShape.fontFamily,
        fontStyle: textShape.fontStyle,
        fill: textShape.style.stroke,
        align: textShape.align,
        width: textShape.width,
        rotation: textShape.rotation || 0,
      });
    }

    case DrawingTool.CALLOUT: {
      const calloutShape = shape as CalloutShape;
      const group = new Konva.Group();
      
      // Background rectangle
      const bgWidth = calloutShape.textWidth || 120;
      const bgHeight = calloutShape.textHeight || 40;
      
      const rect = new Konva.Rect({
        x: calloutShape.textX + offsetX,
        y: calloutShape.textY + offsetY,
        width: bgWidth,
        height: bgHeight,
        fill: calloutShape.backgroundColor || '#ffffff',
        stroke: calloutShape.style.stroke,
        strokeWidth: calloutShape.style.strokeWidth,
        cornerRadius: calloutShape.borderRadius || 4,
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowBlur: 3,
        shadowOffset: { x: 1, y: 1 },
      });
      group.add(rect);
      
      // Calculate arrow path
      const textBox = {
        x: calloutShape.textX,
        y: calloutShape.textY,
        width: bgWidth,
        height: bgHeight
      };
      
      const basePoint = perimeterOffsetToPoint(textBox, calloutShape.perimeterOffset);
      const arrowTip = {
        x: calloutShape.arrowX,
        y: calloutShape.arrowY
      };
      
      const control1 = {
        x: calloutShape.curveControl1X || basePoint.x,
        y: calloutShape.curveControl1Y || basePoint.y
      };
      
      const control2 = {
        x: calloutShape.curveControl2X || arrowTip.x,
        y: calloutShape.curveControl2Y || arrowTip.y
      };
      
      // Arrow path
      const path = new Konva.Path({
        data: getArrowPathString(
          { x: basePoint.x + offsetX, y: basePoint.y + offsetY },
          { x: control1.x + offsetX, y: control1.y + offsetY },
          { x: control2.x + offsetX, y: control2.y + offsetY },
          { x: arrowTip.x + offsetX, y: arrowTip.y + offsetY }
        ),
        stroke: calloutShape.style.stroke,
        strokeWidth: calloutShape.style.strokeWidth,
        opacity: calloutShape.style.opacity,
      });
      group.add(path);
      
      // Arrow head
      const arrowHead = new Konva.RegularPolygon({
        sides: 3,
        radius: 5,
        x: arrowTip.x + offsetX,
        y: arrowTip.y + offsetY,
        rotation: calculateArrowHeadRotation(control2, arrowTip),
        fill: calloutShape.style.stroke,
      });
      group.add(arrowHead);
      
      // Text
      const text = new Konva.Text({
        x: calloutShape.textX + calloutShape.padding + offsetX,
        y: calloutShape.textY + calloutShape.padding + offsetY,
        text: calloutShape.text,
        fontSize: calloutShape.fontSize,
        fontFamily: calloutShape.fontFamily,
        fill: calloutShape.style.stroke,
        width: bgWidth - calloutShape.padding * 2,
      });
      group.add(text);
      
      return group;
    }

    case DrawingTool.STAR: {
      const starShape = shape as StarShape;
      return new Konva.Star({
        x: starShape.x + offsetX,
        y: starShape.y + offsetY,
        numPoints: starShape.points || 5,
        outerRadius: starShape.radius,
        innerRadius: starShape.innerRadius || starShape.radius * 0.4,
        stroke: starShape.style.stroke,
        strokeWidth: starShape.style.strokeWidth,
        fill: starShape.style.fill,
        opacity: starShape.style.opacity,
        rotation: starShape.rotation || -18,
      });
    }

    case DrawingTool.MEASURE: {
      const measureShape = shape as MeasurementLineShape;
      const [x1, y1, x2, y2] = measureShape.points;
      const group = new Konva.Group();
      
      // Main line
      const line = new Konva.Line({
        points: [x1 + offsetX, y1 + offsetY, x2 + offsetX, y2 + offsetY],
        stroke: measureShape.isCalibration ? '#4a90e2' : measureShape.style.stroke,
        strokeWidth: measureShape.style.strokeWidth,
        opacity: measureShape.style.opacity,
        dash: measureShape.isCalibration ? [5, 5] : undefined,
      });
      group.add(line);
      
      // End caps
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      const cap1 = new Konva.Line({
        points: [
          x1 + offsetX - 5 * Math.sin(angle * Math.PI / 180), 
          y1 + offsetY + 5 * Math.cos(angle * Math.PI / 180),
          x1 + offsetX + 5 * Math.sin(angle * Math.PI / 180), 
          y1 + offsetY - 5 * Math.cos(angle * Math.PI / 180)
        ],
        stroke: measureShape.isCalibration ? '#4a90e2' : measureShape.style.stroke,
        strokeWidth: measureShape.style.strokeWidth,
        opacity: measureShape.style.opacity,
      });
      group.add(cap1);
      
      const cap2 = new Konva.Line({
        points: [
          x2 + offsetX - 5 * Math.sin(angle * Math.PI / 180), 
          y2 + offsetY + 5 * Math.cos(angle * Math.PI / 180),
          x2 + offsetX + 5 * Math.sin(angle * Math.PI / 180), 
          y2 + offsetY - 5 * Math.cos(angle * Math.PI / 180)
        ],
        stroke: measureShape.isCalibration ? '#4a90e2' : measureShape.style.stroke,
        strokeWidth: measureShape.style.strokeWidth,
        opacity: measureShape.style.opacity,
      });
      group.add(cap2);
      
      // Label with background
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const textAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;
      
      const measurementLabel = measureShape.measurement 
        ? formatMeasurement(measureShape.measurement.value, measureShape.measurement.unit as MeasurementUnit)
        : `${Math.round(Math.sqrt(dx * dx + dy * dy))}px`;
      
      // Create a group for the label and background
      const labelGroup = new Konva.Group({
        x: midX + offsetX,
        y: midY + offsetY,
        rotation: textAngle,
      });
      
      // Measure text to create background
      const tempText = new Konva.Text({
        text: measurementLabel,
        fontSize: 12,
        fontFamily: 'Arial',
      });
      const textWidth = tempText.width();
      tempText.destroy();
      
      // Background rectangle
      const labelBg = new Konva.Rect({
        x: -textWidth / 2 - 4,
        y: -30,
        width: textWidth + 8,
        height: 20,
        fill: '#ffffff',
        opacity: 0.85,
        cornerRadius: 2,
      });
      labelGroup.add(labelBg);
      
      // Text
      const label = new Konva.Text({
        x: -textWidth / 2,
        y: -26,
        text: measurementLabel,
        fontSize: 12,
        fontFamily: 'Arial',
        fill: measureShape.isCalibration ? '#4a90e2' : '#333333',
        align: 'center',
      });
      labelGroup.add(label);
      
      group.add(labelGroup);
      
      return group;
    }

    case DrawingTool.IMAGE: {
      const imageShape = shape as ImageShape;
      
      // For images, we need to load them first
      return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const imageNode = new Konva.Image({
            image: img,
            x: imageShape.x + offsetX,
            y: imageShape.y + offsetY,
            width: imageShape.width,
            height: imageShape.height,
            rotation: imageShape.rotation || 0,
            opacity: imageShape.style.opacity,
          });
          resolve(imageNode);
        };
        img.onerror = () => resolve(null);
        img.src = imageShape.imageData;
      });
    }

    default:
      return null;
  }
}