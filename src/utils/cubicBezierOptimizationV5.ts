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
 * More reasonable cubic Bezier optimization that creates natural-looking curves
 */
export function calculateOptimalCubicControlPoints(
  basePoint: Point,
  arrowTip: Point,
  textBox: Rectangle
): CubicBezierControlPoints {
  // Step 1: Quick check for direct path
  if (!doesLineIntersectRectangle(basePoint, arrowTip, textBox)) {
    // Direct path is clear - use subtle curve
    const dx = arrowTip.x - basePoint.x;
    const dy = arrowTip.y - basePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Control points at 1/3 and 2/3 along the line with slight offset
    const offsetAmount = Math.min(20, distance * 0.1); // Max 20px offset
    const perpX = -dy / distance * offsetAmount;
    const perpY = dx / distance * offsetAmount;
    
    return {
      control1: { 
        x: basePoint.x + dx * 0.33 + perpX, 
        y: basePoint.y + dy * 0.33 + perpY 
      },
      control2: { 
        x: basePoint.x + dx * 0.67 + perpX, 
        y: basePoint.y + dy * 0.67 + perpY 
      }
    };
  }

  // Step 2: Path needs to avoid rectangle
  const baseEdge = getEdgeInfo(basePoint, textBox);
  const tipEdge = getEdgeInfo(arrowTip, textBox);
  
  // Calculate reasonable control distances
  const totalDist = distance(basePoint, arrowTip);
  const baseControlDist = Math.min(totalDist * 0.4, 80); // Max 80px from base
  const tipControlDist = Math.min(totalDist * 0.4, 80);  // Max 80px from tip
  
  let control1: Point, control2: Point;
  
  // Step 3: Calculate control points based on edge positions
  if (baseEdge.onEdge && tipEdge.onEdge) {
    // Both points on edges - need careful handling
    control1 = {
      x: basePoint.x + baseEdge.normal.x * baseControlDist,
      y: basePoint.y + baseEdge.normal.y * baseControlDist
    };
    
    control2 = {
      x: arrowTip.x - tipEdge.normal.x * tipControlDist,
      y: arrowTip.y - tipEdge.normal.y * tipControlDist
    };
    
    // Special case: opposite edges
    if ((baseEdge.edge === 'top' && tipEdge.edge === 'bottom') ||
        (baseEdge.edge === 'bottom' && tipEdge.edge === 'top')) {
      // Vertical alignment - create S-curve
      const goLeft = basePoint.x > textBox.x + textBox.width / 2;
      const sideOffset = textBox.width / 2 + 40;
      const xTarget = goLeft ? textBox.x - sideOffset : textBox.x + textBox.width + sideOffset;
      
      control1 = {
        x: basePoint.x + (xTarget - basePoint.x) * 0.3,
        y: basePoint.y + baseEdge.normal.y * baseControlDist
      };
      
      control2 = {
        x: arrowTip.x + (xTarget - arrowTip.x) * 0.3,
        y: arrowTip.y - tipEdge.normal.y * tipControlDist
      };
    } else if ((baseEdge.edge === 'left' && tipEdge.edge === 'right') ||
               (baseEdge.edge === 'right' && tipEdge.edge === 'left')) {
      // Horizontal alignment - create S-curve
      const goTop = basePoint.y > textBox.y + textBox.height / 2;
      const sideOffset = textBox.height / 2 + 40;
      const yTarget = goTop ? textBox.y - sideOffset : textBox.y + textBox.height + sideOffset;
      
      control1 = {
        x: basePoint.x + baseEdge.normal.x * baseControlDist,
        y: basePoint.y + (yTarget - basePoint.y) * 0.3
      };
      
      control2 = {
        x: arrowTip.x - tipEdge.normal.x * tipControlDist,
        y: arrowTip.y + (yTarget - arrowTip.y) * 0.3
      };
    }
  } else if (baseEdge.onEdge) {
    // Only base on edge
    control1 = {
      x: basePoint.x + baseEdge.normal.x * baseControlDist,
      y: basePoint.y + baseEdge.normal.y * baseControlDist
    };
    
    // Control2 points toward base control point
    const dx = control1.x - arrowTip.x;
    const dy = control1.y - arrowTip.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    control2 = {
      x: arrowTip.x + (dx / len) * tipControlDist,
      y: arrowTip.y + (dy / len) * tipControlDist
    };
  } else if (tipEdge.onEdge) {
    // Only tip on edge
    control2 = {
      x: arrowTip.x - tipEdge.normal.x * tipControlDist,
      y: arrowTip.y - tipEdge.normal.y * tipControlDist
    };
    
    // Control1 points toward tip control point
    const dx = control2.x - basePoint.x;
    const dy = control2.y - basePoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    control1 = {
      x: basePoint.x + (dx / len) * baseControlDist,
      y: basePoint.y + (dy / len) * baseControlDist
    };
  } else {
    // Neither on edge - find bypass route
    const centerX = textBox.x + textBox.width / 2;
    const centerY = textBox.y + textBox.height / 2;
    
    // Determine which side to go around
    const baseAngle = Math.atan2(basePoint.y - centerY, basePoint.x - centerX);
    const tipAngle = Math.atan2(arrowTip.y - centerY, arrowTip.x - centerX);
    
    // Create control points that go around the chosen side
    let bypassX: number, bypassY: number;
    
    if (Math.abs(basePoint.x - arrowTip.x) > Math.abs(basePoint.y - arrowTip.y)) {
      // More horizontal - go around top or bottom
      bypassY = (basePoint.y + arrowTip.y) / 2 < centerY ? 
        textBox.y - 40 : textBox.y + textBox.height + 40;
      bypassX = (basePoint.x + arrowTip.x) / 2;
    } else {
      // More vertical - go around left or right
      bypassX = (basePoint.x + arrowTip.x) / 2 < centerX ? 
        textBox.x - 40 : textBox.x + textBox.width + 40;
      bypassY = (basePoint.y + arrowTip.y) / 2;
    }
    
    control1 = {
      x: basePoint.x + (bypassX - basePoint.x) * 0.5,
      y: basePoint.y + (bypassY - basePoint.y) * 0.5
    };
    
    control2 = {
      x: arrowTip.x + (bypassX - arrowTip.x) * 0.5,
      y: arrowTip.y + (bypassY - arrowTip.y) * 0.5
    };
  }
  
  // Step 4: Validate and refine if needed
  if (cubicBezierIntersectsRectangle(basePoint, control1, control2, arrowTip, textBox)) {
    // If still intersecting, push control points further out
    const pushFactor = 1.5;
    const midX = (control1.x + control2.x) / 2;
    const midY = (control1.y + control2.y) / 2;
    
    control1 = {
      x: midX + (control1.x - midX) * pushFactor,
      y: midY + (control1.y - midY) * pushFactor
    };
    
    control2 = {
      x: midX + (control2.x - midX) * pushFactor,
      y: midY + (control2.y - midY) * pushFactor
    };
  }
  
  return { control1, control2 };
}

interface EdgeInfo {
  onEdge: boolean;
  edge?: 'top' | 'right' | 'bottom' | 'left';
  normal: Point;
}

function getEdgeInfo(point: Point, rect: Rectangle): EdgeInfo {
  const tolerance = 2;
  
  // Check each edge with tolerance
  if (Math.abs(point.y - rect.y) < tolerance && 
      point.x >= rect.x - tolerance && 
      point.x <= rect.x + rect.width + tolerance) {
    return { onEdge: true, edge: 'top', normal: { x: 0, y: -1 } };
  }
  
  if (Math.abs(point.x - (rect.x + rect.width)) < tolerance && 
      point.y >= rect.y - tolerance && 
      point.y <= rect.y + rect.height + tolerance) {
    return { onEdge: true, edge: 'right', normal: { x: 1, y: 0 } };
  }
  
  if (Math.abs(point.y - (rect.y + rect.height)) < tolerance && 
      point.x >= rect.x - tolerance && 
      point.x <= rect.x + rect.width + tolerance) {
    return { onEdge: true, edge: 'bottom', normal: { x: 0, y: 1 } };
  }
  
  if (Math.abs(point.x - rect.x) < tolerance && 
      point.y >= rect.y - tolerance && 
      point.y <= rect.y + rect.height + tolerance) {
    return { onEdge: true, edge: 'left', normal: { x: -1, y: 0 } };
  }
  
  return { onEdge: false, normal: { x: 0, y: 0 } };
}

function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function doesLineIntersectRectangle(start: Point, end: Point, rect: Rectangle): boolean {
  // Check if line segment intersects rectangle interior
  const samples = 50;
  
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    
    if (x > rect.x && x < rect.x + rect.width &&
        y > rect.y && y < rect.y + rect.height) {
      return true;
    }
  }
  
  return false;
}

export function cubicBezierIntersectsRectangle(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  rect: Rectangle
): boolean {
  const samples = 100;
  
  // Skip endpoints if they're on edges
  const startEdge = getEdgeInfo(p0, rect);
  const endEdge = getEdgeInfo(p3, rect);
  
  const startT = startEdge.onEdge ? 0.01 : 0;
  const endT = endEdge.onEdge ? 0.99 : 1;
  
  for (let i = 0; i <= samples; i++) {
    const t = startT + (endT - startT) * i / samples;
    const point = cubicBezierPoint(p0, p1, p2, p3, t);
    
    // Check strict interior
    if (point.x > rect.x + 1 && 
        point.x < rect.x + rect.width - 1 &&
        point.y > rect.y + 1 && 
        point.y < rect.y + rect.height - 1) {
      return true;
    }
  }
  
  return false;
}

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

export function autoAdjustCubicControlPoints(
  basePoint: Point,
  arrowTip: Point,
  currentControl1: Point,
  currentControl2: Point,
  textBox: Rectangle
): CubicBezierControlPoints {
  if (!cubicBezierIntersectsRectangle(basePoint, currentControl1, currentControl2, arrowTip, textBox)) {
    return { control1: currentControl1, control2: currentControl2 };
  }
  
  return calculateOptimalCubicControlPoints(basePoint, arrowTip, textBox);
}