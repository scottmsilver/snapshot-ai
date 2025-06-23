import type { Point } from '@/types/drawing';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CubicBezierControlPoints {
  control1: Point;
  control2: Point;
}

/**
 * Calculates optimal control points for a cubic Bezier curve that avoids rectangle intersection
 * 
 * @param basePoint - Starting point of the arrow (on rectangle perimeter)
 * @param arrowTip - End point of the arrow
 * @param textBox - Rectangle to avoid
 * @returns Two control points for cubic Bezier curve
 */
export function calculateOptimalCubicControlPoints(
  basePoint: Point,
  arrowTip: Point,
  textBox: Rectangle
): CubicBezierControlPoints {
  // Step 1: Check if direct path is clear
  if (!checkLineRectIntersection(basePoint, arrowTip, textBox)) {
    // Direct path works - place control points at 1/3 and 2/3 along the line
    const dx = arrowTip.x - basePoint.x;
    const dy = arrowTip.y - basePoint.y;
    
    return {
      control1: {
        x: basePoint.x + dx / 3,
        y: basePoint.y + dy / 3
      },
      control2: {
        x: basePoint.x + 2 * dx / 3,
        y: basePoint.y + 2 * dy / 3
      }
    };
  }

  // Step 2: Determine which edge the base point is on
  const edge = getEdgePosition(basePoint, textBox);
  
  // Step 3: Calculate perpendicular exit direction
  const exitDirection = getPerpendicularExitDirection(edge);
  
  // Step 4: Determine bypass strategy based on relative positions
  const rect = {
    left: textBox.x,
    right: textBox.x + textBox.width,
    top: textBox.y,
    bottom: textBox.y + textBox.height,
    centerX: textBox.x + textBox.width / 2,
    centerY: textBox.y + textBox.height / 2
  };

  // Initial control point offset from base (perpendicular to edge)
  const initialOffset = 50;
  const control1 = {
    x: basePoint.x + exitDirection.x * initialOffset,
    y: basePoint.y + exitDirection.y * initialOffset
  };

  // Determine bypass direction and second control point
  let control2: Point;
  
  const dx = arrowTip.x - basePoint.x;
  const dy = arrowTip.y - basePoint.y;
  const isVertical = Math.abs(dx) < Math.abs(dy);
  const isHorizontal = Math.abs(dy) < Math.abs(dx);

  if (isVertical && Math.abs(dx) < 10) {
    // Nearly vertical movement - need to go around left or right
    const goLeft = basePoint.x > rect.centerX || 
                   (basePoint.x === rect.centerX && arrowTip.x < rect.centerX);
    
    const sideX = goLeft ? rect.left - 60 : rect.right + 60;
    const midY = (basePoint.y + arrowTip.y) / 2;
    
    // Adjust control points for smooth curve around the side
    control1.x = basePoint.x + (sideX - basePoint.x) * 0.3;
    control2 = {
      x: sideX,
      y: midY
    };
  } else if (isHorizontal && Math.abs(dy) < 10) {
    // Nearly horizontal movement - need to go around top or bottom
    const goTop = basePoint.y > rect.centerY || 
                  (basePoint.y === rect.centerY && arrowTip.y < rect.centerY);
    
    const sideY = goTop ? rect.top - 60 : rect.bottom + 60;
    const midX = (basePoint.x + arrowTip.x) / 2;
    
    // Adjust control points for smooth curve around top/bottom
    control1.y = basePoint.y + (sideY - basePoint.y) * 0.3;
    control2 = {
      x: midX,
      y: sideY
    };
  } else {
    // Diagonal movement - use corner-based bypass
    const candidates = generateBypassCandidates(basePoint, arrowTip, textBox);
    
    // Find best candidate for control2
    let bestCandidate = candidates[0];
    let minLength = Infinity;
    
    for (const candidate of candidates) {
      const testControl2 = candidate;
      
      // Check if this creates a valid path
      if (!cubicBezierIntersectsRectangle(basePoint, control1, testControl2, arrowTip, textBox)) {
        const length = cubicBezierLength(basePoint, control1, testControl2, arrowTip);
        
        if (length < minLength) {
          minLength = length;
          bestCandidate = candidate;
        }
      }
    }
    
    control2 = bestCandidate;
  }

  // Step 5: Refine control points to ensure no intersection
  const refined = refineControlPoints(basePoint, control1, control2, arrowTip, textBox);
  
  return refined;
}

// Determine which edge a point is on
function getEdgePosition(point: Point, rect: Rectangle): 'top' | 'right' | 'bottom' | 'left' {
  const tolerance = 2;
  
  if (Math.abs(point.y - rect.y) < tolerance) return 'top';
  if (Math.abs(point.x - (rect.x + rect.width)) < tolerance) return 'right';
  if (Math.abs(point.y - (rect.y + rect.height)) < tolerance) return 'bottom';
  if (Math.abs(point.x - rect.x) < tolerance) return 'left';
  
  // Default based on closest edge
  const distances = [
    { edge: 'top' as const, dist: Math.abs(point.y - rect.y) },
    { edge: 'right' as const, dist: Math.abs(point.x - (rect.x + rect.width)) },
    { edge: 'bottom' as const, dist: Math.abs(point.y - (rect.y + rect.height)) },
    { edge: 'left' as const, dist: Math.abs(point.x - rect.x) }
  ];
  
  return distances.sort((a, b) => a.dist - b.dist)[0].edge;
}

// Get perpendicular exit direction for an edge
function getPerpendicularExitDirection(edge: 'top' | 'right' | 'bottom' | 'left'): Point {
  switch (edge) {
    case 'top': return { x: 0, y: -1 };
    case 'right': return { x: 1, y: 0 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
  }
}

// Generate bypass candidates for diagonal movement
function generateBypassCandidates(basePoint: Point, arrowTip: Point, rect: Rectangle): Point[] {
  const candidates: Point[] = [];
  const clearance = 60;
  
  // Corner positions
  const corners = [
    { x: rect.x - clearance, y: rect.y - clearance },             // Top-left
    { x: rect.x + rect.width + clearance, y: rect.y - clearance }, // Top-right
    { x: rect.x + rect.width + clearance, y: rect.y + rect.height + clearance }, // Bottom-right
    { x: rect.x - clearance, y: rect.y + rect.height + clearance } // Bottom-left
  ];
  
  // Add corners
  candidates.push(...corners);
  
  // Add edge midpoints
  candidates.push(
    { x: rect.x + rect.width / 2, y: rect.y - clearance },         // Top
    { x: rect.x + rect.width + clearance, y: rect.y + rect.height / 2 }, // Right
    { x: rect.x + rect.width / 2, y: rect.y + rect.height + clearance }, // Bottom
    { x: rect.x - clearance, y: rect.y + rect.height / 2 }         // Left
  );
  
  return candidates;
}

// Refine control points to ensure smooth, non-intersecting curve
function refineControlPoints(
  p0: Point,
  c1: Point,
  c2: Point,
  p3: Point,
  rect: Rectangle
): CubicBezierControlPoints {
  let control1 = { ...c1 };
  let control2 = { ...c2 };
  
  // Check if current control points create valid path
  if (!cubicBezierIntersectsRectangle(p0, control1, control2, p3, rect)) {
    return { control1, control2 };
  }
  
  // If not, adjust control points
  // Strategy: Move control points further from rectangle
  const rect_center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
  
  // Move control1 away from rectangle center
  const d1 = normalize({
    x: control1.x - rect_center.x,
    y: control1.y - rect_center.y
  });
  
  // Move control2 away from rectangle center
  const d2 = normalize({
    x: control2.x - rect_center.x,
    y: control2.y - rect_center.y
  });
  
  // Try increasing distances
  for (let scale = 1.2; scale <= 3.0; scale += 0.2) {
    control1 = {
      x: rect_center.x + d1.x * rect.width * scale,
      y: rect_center.y + d1.y * rect.height * scale
    };
    
    control2 = {
      x: rect_center.x + d2.x * rect.width * scale,
      y: rect_center.y + d2.y * rect.height * scale
    };
    
    if (!cubicBezierIntersectsRectangle(p0, control1, control2, p3, rect)) {
      break;
    }
  }
  
  return { control1, control2 };
}

// Check if cubic Bezier curve intersects rectangle
export function cubicBezierIntersectsRectangle(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  rect: Rectangle
): boolean {
  const samples = 100;
  
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = cubicBezierPoint(p0, p1, p2, p3, t);
    
    if (point.x >= rect.x && 
        point.x <= rect.x + rect.width &&
        point.y >= rect.y && 
        point.y <= rect.y + rect.height) {
      return true;
    }
  }
  
  return false;
}

// Calculate point on cubic Bezier curve
function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const oneMinusTCubed = oneMinusTSquared * oneMinusT;
  const tSquared = t * t;
  const tCubed = tSquared * t;
  
  return {
    x: oneMinusTCubed * p0.x + 
       3 * oneMinusTSquared * t * p1.x + 
       3 * oneMinusT * tSquared * p2.x + 
       tCubed * p3.x,
    y: oneMinusTCubed * p0.y + 
       3 * oneMinusTSquared * t * p1.y + 
       3 * oneMinusT * tSquared * p2.y + 
       tCubed * p3.y
  };
}

// Calculate cubic Bezier length
function cubicBezierLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
  let length = 0;
  let prevPoint = p0;
  const steps = 50;
  
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const point = cubicBezierPoint(p0, p1, p2, p3, t);
    length += distance(prevPoint, point);
    prevPoint = point;
  }
  
  return length;
}

// Helper functions
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalize(v: Point): Point {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function checkLineRectIntersection(
  lineStart: Point,
  lineEnd: Point,
  rect: Rectangle
): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  
  // If both points are on same side, no intersection
  if ((lineStart.x < left && lineEnd.x < left) ||
      (lineStart.x > right && lineEnd.x > right) ||
      (lineStart.y < top && lineEnd.y < top) ||
      (lineStart.y > bottom && lineEnd.y > bottom)) {
    return false;
  }
  
  // Check if either point is inside
  if ((lineStart.x >= left && lineStart.x <= right && lineStart.y >= top && lineStart.y <= bottom) ||
      (lineEnd.x >= left && lineEnd.x <= right && lineEnd.y >= top && lineEnd.y <= bottom)) {
    return true;
  }
  
  // Check edge intersections
  return true; // Simplified - would need full line-line intersection checks
}

// Auto-adjust control points when base or tip moves
export function autoAdjustCubicControlPoints(
  basePoint: Point,
  arrowTip: Point,
  currentControl1: Point,
  currentControl2: Point,
  textBox: Rectangle
): CubicBezierControlPoints {
  // Check if current control points still create a valid path
  if (!cubicBezierIntersectsRectangle(basePoint, currentControl1, currentControl2, arrowTip, textBox)) {
    return { control1: currentControl1, control2: currentControl2 };
  }
  
  // Need to find new optimal control points
  return calculateOptimalCubicControlPoints(basePoint, arrowTip, textBox);
}