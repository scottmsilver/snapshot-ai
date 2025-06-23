import type { Point } from '@/types/drawing';
import { 
  calculateOptimalCubicControlPoints, 
  autoAdjustCubicControlPoints,
  cubicBezierIntersectsRectangle,
  type CubicBezierControlPoints 
} from './cubicBezierOptimizationV5';

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowPath {
  exitPoint: Point;
  exitSide: 'left' | 'right' | 'top' | 'bottom';
  controlPoint: Point;
  needsCurve: boolean;
}

// Convert perimeter offset (0-1) to x,y coordinates on rectangle perimeter
export function perimeterOffsetToPoint(textBox: TextBox, offset: number): Point {
  // Normalize offset to 0-1 range
  const normalizedOffset = ((offset % 1) + 1) % 1;
  
  // Calculate perimeter length
  const width = textBox.width;
  const height = textBox.height;
  const perimeter = 2 * (width + height);
  
  // Convert offset to distance along perimeter
  const distance = normalizedOffset * perimeter;
  
  // Determine which edge we're on and calculate position
  if (distance < width) {
    // Top edge (left to right)
    return {
      x: textBox.x + distance,
      y: textBox.y
    };
  } else if (distance < width + height) {
    // Right edge (top to bottom)
    const edgeDistance = distance - width;
    return {
      x: textBox.x + width,
      y: textBox.y + edgeDistance
    };
  } else if (distance < 2 * width + height) {
    // Bottom edge (right to left)
    const edgeDistance = distance - width - height;
    return {
      x: textBox.x + width - edgeDistance,
      y: textBox.y + height
    };
  } else {
    // Left edge (bottom to top)
    const edgeDistance = distance - 2 * width - height;
    return {
      x: textBox.x,
      y: textBox.y + height - edgeDistance
    };
  }
}

// Convert x,y point to nearest perimeter offset on rectangle
export function pointToPerimeterOffset(textBox: TextBox, point: Point): number {
  // Find the closest point on the perimeter
  const closestPoint = getClosestPointOnPerimeter(textBox, point);
  
  // Calculate which edge the closest point is on
  const width = textBox.width;
  const height = textBox.height;
  const perimeter = 2 * (width + height);
  
  let distance = 0;
  
  // Determine the distance along the perimeter
  const epsilon = 0.001; // Small value for floating point comparison
  
  if (Math.abs(closestPoint.y - textBox.y) < epsilon) {
    // Top edge
    distance = closestPoint.x - textBox.x;
  } else if (Math.abs(closestPoint.x - (textBox.x + width)) < epsilon) {
    // Right edge
    distance = width + (closestPoint.y - textBox.y);
  } else if (Math.abs(closestPoint.y - (textBox.y + height)) < epsilon) {
    // Bottom edge
    distance = width + height + (textBox.x + width - closestPoint.x);
  } else {
    // Left edge
    distance = 2 * width + height + (textBox.y + height - closestPoint.y);
  }
  
  return distance / perimeter;
}

// Get the closest point on the rectangle perimeter to a given point
export function getClosestPointOnPerimeter(textBox: TextBox, point: Point): Point {
  const left = textBox.x;
  const right = textBox.x + textBox.width;
  const top = textBox.y;
  const bottom = textBox.y + textBox.height;
  
  // Clamp the point to the rectangle bounds
  const clampedX = Math.max(left, Math.min(right, point.x));
  const clampedY = Math.max(top, Math.min(bottom, point.y));
  
  // If the point is inside the rectangle, project it to the nearest edge
  if (clampedX > left && clampedX < right && clampedY > top && clampedY < bottom) {
    // Calculate distances to each edge
    const distToLeft = clampedX - left;
    const distToRight = right - clampedX;
    const distToTop = clampedY - top;
    const distToBottom = bottom - clampedY;
    
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    
    if (minDist === distToLeft) {
      return { x: left, y: clampedY };
    } else if (minDist === distToRight) {
      return { x: right, y: clampedY };
    } else if (minDist === distToTop) {
      return { x: clampedX, y: top };
    } else {
      return { x: clampedX, y: bottom };
    }
  }
  
  // Point is outside, so the clamped point is on the perimeter
  return { x: clampedX, y: clampedY };
}

// Calculate initial perimeter offset based on arrow tip position
export function calculateInitialPerimeterOffset(textBox: TextBox, arrowTip: Point): number {
  // Find the angle from center to arrow tip
  const centerX = textBox.x + textBox.width / 2;
  const centerY = textBox.y + textBox.height / 2;
  const angle = Math.atan2(arrowTip.y - centerY, arrowTip.x - centerX);
  
  // Convert angle to perimeter offset
  // Map angle to 0-1 where 0 is top-left corner going clockwise
  // -π to -π/2 (top-left quadrant) maps to 0.75 to 1
  // -π/2 to 0 (top-right quadrant) maps to 0 to 0.25
  // 0 to π/2 (bottom-right quadrant) maps to 0.25 to 0.5
  // π/2 to π (bottom-left quadrant) maps to 0.5 to 0.75
  
  let normalizedAngle = (angle + Math.PI) / (2 * Math.PI); // 0 to 1
  // Adjust to start from top-left corner
  normalizedAngle = (normalizedAngle + 0.25) % 1;
  
  return normalizedAngle;
}

// Check if a line segment intersects with a rectangle
export function checkLineRectIntersection(
  lineStart: Point,
  lineEnd: Point,
  rect: TextBox
): boolean {
  // Check if both points are outside the rectangle on the same side
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  
  // If both points are on the same side of the rectangle, no intersection
  if ((lineStart.x < left && lineEnd.x < left) ||
      (lineStart.x > right && lineEnd.x > right) ||
      (lineStart.y < top && lineEnd.y < top) ||
      (lineStart.y > bottom && lineEnd.y > bottom)) {
    return false;
  }
  
  // Check if the line is completely inside the rectangle
  if (lineStart.x >= left && lineStart.x <= right &&
      lineStart.y >= top && lineStart.y <= bottom &&
      lineEnd.x >= left && lineEnd.x <= right &&
      lineEnd.y >= top && lineEnd.y <= bottom) {
    return true;
  }
  
  // Check intersection with each edge of the rectangle
  const edges = [
    { start: { x: left, y: top }, end: { x: right, y: top } },     // Top edge
    { start: { x: right, y: top }, end: { x: right, y: bottom } }, // Right edge
    { start: { x: right, y: bottom }, end: { x: left, y: bottom } }, // Bottom edge
    { start: { x: left, y: bottom }, end: { x: left, y: top } }     // Left edge
  ];
  
  return edges.some(edge => doLineSegmentsIntersect(lineStart, lineEnd, edge.start, edge.end));
}

// Helper function to check if two line segments intersect
function doLineSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  if (d1 === 0 && onSegment(p3, p1, p4)) return true;
  if (d2 === 0 && onSegment(p3, p2, p4)) return true;
  if (d3 === 0 && onSegment(p1, p3, p2)) return true;
  if (d4 === 0 && onSegment(p1, p4, p2)) return true;
  
  return false;
}

// Calculate the direction of the turn
function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

// Check if point q lies on segment pr
function onSegment(p: Point, q: Point, r: Point): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
         q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

// Calculate default control point for arrow (midpoint between base and tip)
export function getDefaultControlPoint(base: Point, tip: Point): Point {
  return {
    x: (base.x + tip.x) / 2,
    y: (base.y + tip.y) / 2
  };
}

// Convert cubic bezier curve to SVG path string for Konva Path
export function getArrowPathString(
  start: Point,
  control1: Point,
  control2: Point,
  end: Point
): string {
  return `M ${start.x},${start.y} C ${control1.x},${control1.y} ${control2.x},${control2.y} ${end.x},${end.y}`;
}

// Calculate arrow head rotation based on the last segment of the curve
export function calculateArrowHeadRotation(
  control2: Point,
  end: Point
): number {
  const angle = Math.atan2(end.y - control2.y, end.x - control2.x);
  return (angle * 180 / Math.PI) + 90; // Add 90 degrees because arrow points up by default
}

// Auto-adjust control points for cubic Bezier curve to avoid intersection
export function autoAdjustControlPoint(
  basePoint: Point,
  arrowTip: Point,
  currentControl1: Point,
  currentControl2: Point,
  textBox: TextBox
): CubicBezierControlPoints {
  return autoAdjustCubicControlPoints(
    basePoint, 
    arrowTip, 
    currentControl1, 
    currentControl2, 
    textBox
  );
}

// Check if cubic Bezier curve is valid (doesn't intersect rectangle)
export function isValidControlPoint(
  basePoint: Point,
  control1: Point,
  control2: Point,
  arrowTip: Point,
  textBox: TextBox
): boolean {
  return !cubicBezierIntersectsRectangle(
    basePoint,
    control1,
    control2,
    arrowTip,
    textBox
  );
}

// Get optimal control points for initial cubic Bezier curve
export function getOptimalControlPoints(
  basePoint: Point,
  arrowTip: Point,
  textBox: TextBox
): CubicBezierControlPoints {
  return calculateOptimalCubicControlPoints(basePoint, arrowTip, textBox);
}

