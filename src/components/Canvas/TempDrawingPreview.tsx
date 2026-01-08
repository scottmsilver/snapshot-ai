import React from 'react';
import { Line, Rect, Circle, Arrow, Text, Group, Path, Star, RegularPolygon } from 'react-konva';
import { DrawingTool, type Point, type DrawingStyle } from '@/types/drawing';
import {
  perimeterOffsetToPoint,
  getArrowPathString,
  calculateArrowHeadRotation,
  calculateInitialPerimeterOffset,
  getOptimalControlPoints
} from '@/utils/calloutGeometry';
import { pixelsToMeasurement, formatMeasurement, type MeasurementUnit } from '@/utils/measurementUtils';

export interface MeasurementCalibration {
  pixelsPerUnit: number | null;
  unit: string;
  calibrationLineId: string | null;
}

export interface TempDrawingPreviewProps {
  activeTool: DrawingTool;
  tempPoints: Point[];
  currentStyle: DrawingStyle;
  zoomLevel: number;
  measurementCalibration: MeasurementCalibration;
  isDrawing: boolean;
}

/**
 * Renders a preview of the shape being drawn before it's committed.
 * This component displays temporary shapes during the drawing interaction.
 */
export const TempDrawingPreview: React.FC<TempDrawingPreviewProps> = ({
  activeTool,
  tempPoints,
  currentStyle,
  zoomLevel,
  measurementCalibration,
  isDrawing,
}) => {
  if (!isDrawing || tempPoints.length === 0) return null;

  switch (activeTool) {
    case DrawingTool.PEN:
      if (tempPoints.length < 2) return null;
      const penPoints = tempPoints.flatMap(p => [p.x, p.y]);
      return (
        <Line
          points={penPoints}
          stroke={currentStyle.stroke}
          strokeWidth={currentStyle.strokeWidth}
          opacity={currentStyle.opacity}
          lineCap={currentStyle.lineCap}
          lineJoin={currentStyle.lineJoin}
          tension={0.5}
          globalCompositeOperation="source-over"
          listening={false}
        />
      );

    case DrawingTool.RECTANGLE:
      if (tempPoints.length < 2) return null;
      const rectStart = tempPoints[0];
      const rectEnd = tempPoints[1];
      const rectX = Math.min(rectStart.x, rectEnd.x);
      const rectY = Math.min(rectStart.y, rectEnd.y);
      const rectWidth = Math.abs(rectEnd.x - rectStart.x);
      const rectHeight = Math.abs(rectEnd.y - rectStart.y);

      return (
        <Rect
          x={rectX}
          y={rectY}
          width={rectWidth}
          height={rectHeight}
          stroke={currentStyle.stroke}
          strokeWidth={currentStyle.strokeWidth}
          fill={currentStyle.fill}
          opacity={currentStyle.opacity}
          listening={false}
        />
      );

    case DrawingTool.CIRCLE:
      if (tempPoints.length < 2) return null;
      const circleStart = tempPoints[0];
      const circleEnd = tempPoints[1];
      // Calculate distance from start point to end point
      const dx = circleEnd.x - circleStart.x;
      const dy = circleEnd.y - circleStart.y;
      // Use the larger dimension to create a perfect circle
      const radius = Math.max(Math.abs(dx), Math.abs(dy)) / 2;
      // Center based on the start point and the direction of drag
      const centerX = circleStart.x + (dx > 0 ? radius : -radius);
      const centerY = circleStart.y + (dy > 0 ? radius : -radius);

      return (
        <Circle
          x={centerX}
          y={centerY}
          radius={radius}
          stroke={currentStyle.stroke}
          strokeWidth={currentStyle.strokeWidth}
          fill={currentStyle.fill}
          opacity={currentStyle.opacity}
          listening={false}
        />
      );

    case DrawingTool.ARROW:
      if (tempPoints.length < 2) return null;
      const arrowStart = tempPoints[0];
      const arrowEnd = tempPoints[1];

      return (
        <Arrow
          points={[arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y]}
          stroke={currentStyle.stroke}
          strokeWidth={currentStyle.strokeWidth}
          opacity={currentStyle.opacity}
          pointerLength={10 / zoomLevel}
          pointerWidth={10 / zoomLevel}
          listening={false}
        />
      );

    case DrawingTool.CALLOUT:
      if (tempPoints.length < 2) return null;
      const calloutStart = tempPoints[0]; // Arrow tip (what we're pointing at)
      const calloutEnd = tempPoints[1];   // Where text box will be

      // Calculate text box dimensions and position - compensate for zoom
      const textPadding = 10 / zoomLevel;
      const textWidth = 120 / zoomLevel;
      const textHeight = 40 / zoomLevel;
      const bgWidth = textWidth;
      const bgHeight = textHeight;

      // Calculate text box position based on drag
      const minDistance = 50 / zoomLevel;
      const calloutDx = calloutEnd.x - calloutStart.x;
      const calloutDy = calloutEnd.y - calloutStart.y;
      const distance = Math.sqrt(calloutDx * calloutDx + calloutDy * calloutDy);

      let textX: number, textY: number;

      if (distance < minDistance) {
        // If drag is too short, position with minimum distance
        const angle = Math.atan2(calloutDy, calloutDx);
        textX = calloutStart.x + Math.cos(angle) * minDistance - bgWidth / 2;
        textY = calloutStart.y + Math.sin(angle) * minDistance - bgHeight / 2;
      } else {
        // Position text box centered at cursor
        textX = calloutEnd.x - bgWidth / 2;
        textY = calloutEnd.y - bgHeight / 2;
      }

      // Calculate perimeter-based arrow for preview
      const previewTextBox = {
        x: textX,
        y: textY,
        width: bgWidth,
        height: bgHeight
      };
      const previewPerimeterOffset = calculateInitialPerimeterOffset(previewTextBox, calloutStart);
      const previewBasePoint = perimeterOffsetToPoint(previewTextBox, previewPerimeterOffset);
      const previewControlPoints = getOptimalControlPoints(previewBasePoint, calloutStart, previewTextBox);

      return (
        <Group>
          {/* Background rectangle */}
          <Rect
            x={textX}
            y={textY}
            width={bgWidth}
            height={bgHeight}
            fill="#ffffff"
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            cornerRadius={4}
            opacity={0.8}
            shadowColor="rgba(0, 0, 0, 0.1)"
            shadowBlur={3}
            shadowOffset={{ x: 1, y: 1 }}
            listening={false}
          />

          {/* Curved arrow using Path */}
          <Path
            data={getArrowPathString(
              previewBasePoint,
              previewControlPoints.control1,
              previewControlPoints.control2,
              calloutStart  // Arrow points to start point
            )}
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            opacity={currentStyle.opacity}
            listening={false}
          />

          {/* Arrow head */}
          <RegularPolygon
            sides={3}
            radius={5}
            x={calloutStart.x}  // Arrow head at start point
            y={calloutStart.y}
            rotation={calculateArrowHeadRotation(previewControlPoints.control2, calloutStart)}
            fill={currentStyle.stroke}
            listening={false}
          />

          {/* Text preview */}
          <Text
            x={textX + textPadding}
            y={textY + textPadding}
            text="Callout"
            fontSize={16 / zoomLevel}
            fontFamily={currentStyle.fontFamily || 'Arial'}
            fill={currentStyle.stroke}
            width={textWidth - textPadding * 2}
            listening={false}
          />
        </Group>
      );

    case DrawingTool.STAR:
      if (tempPoints.length < 2) return null;
      const starStart = tempPoints[0];
      const starEnd = tempPoints[1];
      // Calculate radius from center to cursor
      const starDx = starEnd.x - starStart.x;
      const starDy = starEnd.y - starStart.y;
      const starRadius = Math.sqrt(starDx * starDx + starDy * starDy);

      return (
        <Star
          x={starStart.x}
          y={starStart.y}
          numPoints={5}
          outerRadius={starRadius}
          innerRadius={starRadius * 0.4}
          stroke={currentStyle.stroke}
          strokeWidth={currentStyle.strokeWidth}
          fill={currentStyle.fill}
          opacity={currentStyle.opacity}
          rotation={-18} // Rotate to point upward
          listening={false}
        />
      );

    case DrawingTool.MEASURE:
      if (tempPoints.length < 2) return null;
      const measureStart = tempPoints[0];
      const measureEnd = tempPoints[tempPoints.length - 1];

      const measureDx = measureEnd.x - measureStart.x;
      const measureDy = measureEnd.y - measureStart.y;
      const measureDistance = Math.sqrt(measureDx * measureDx + measureDy * measureDy);
      const measureAngle = Math.atan2(measureDy, measureDx) * (180 / Math.PI);

      return (
        <Group listening={false}>
          <Line
            points={[measureStart.x, measureStart.y, measureEnd.x, measureEnd.y]}
            stroke={currentStyle.stroke || '#000000'}
            strokeWidth={Math.max(currentStyle.strokeWidth || 2, 2)}
            opacity={1}
            dash={[5, 5]}
            listening={false}
            perfectDrawEnabled={false}
            shadowColor="rgba(0, 0, 0, 0.5)"
            shadowBlur={2}
            shadowOffset={{ x: 1, y: 1 }}
          />
          {/* Preview label with background */}
          <Group
            x={(measureStart.x + measureEnd.x) / 2}
            y={(measureStart.y + measureEnd.y) / 2}
            rotation={(measureAngle > 90 || measureAngle < -90) ? measureAngle + 180 : measureAngle}
            listening={false}
          >
            {(() => {
              const labelText = measurementCalibration.pixelsPerUnit
                ? formatMeasurement(
                    pixelsToMeasurement(
                      measureDistance,
                      measurementCalibration.pixelsPerUnit,
                      measurementCalibration.unit as MeasurementUnit
                    ),
                    measurementCalibration.unit as MeasurementUnit
                  )
                : `${Math.round(measureDistance)}px`;

              return (
                <>
                  {/* Background rectangle */}
                  <Rect
                    x={-50}
                    y={-30}
                    width={100}
                    height={20}
                    fill="#ffffff"
                    opacity={0.85}
                    cornerRadius={2}
                    listening={false}
                  />
                  {/* Text */}
                  <Text
                    x={0}
                    y={-26}
                    text={labelText}
                    fontSize={12 / zoomLevel}
                    fontFamily="Arial"
                    fill="#666"
                    align="center"
                    listening={false}
                    ref={(node) => {
                      if (node) {
                        const textWidth = node.width();
                        const boxWidth = textWidth + 8;

                        node.x(-textWidth / 2);

                        const parent = node.getParent();
                        if (parent) {
                          const bgRect = parent.findOne('Rect');
                          if (bgRect) {
                            bgRect.setAttrs({
                              x: -boxWidth / 2,
                              width: boxWidth,
                            });
                          }
                        }
                      }
                    }}
                  />
                </>
              );
            })()}
          </Group>
        </Group>
      );

    case DrawingTool.CALIBRATE:
      if (tempPoints.length < 2) return null;
      const calibrateStart = tempPoints[0];
      const calibrateEnd = tempPoints[tempPoints.length - 1];
      const calibrateDx = calibrateEnd.x - calibrateStart.x;
      const calibrateDy = calibrateEnd.y - calibrateStart.y;
      const calibrateDistance = Math.sqrt(calibrateDx * calibrateDx + calibrateDy * calibrateDy);
      const calibrateAngle = Math.atan2(calibrateDy, calibrateDx) * (180 / Math.PI);

      return (
        <Group>
          <Line
            points={[calibrateStart.x, calibrateStart.y, calibrateEnd.x, calibrateEnd.y]}
            stroke="#4a90e2"
            strokeWidth={2}
            opacity={0.8}
            dash={[5, 5]}
            listening={false}
          />
          {/* Preview label with background */}
          <Group
            x={(calibrateStart.x + calibrateEnd.x) / 2}
            y={(calibrateStart.y + calibrateEnd.y) / 2}
            rotation={(calibrateAngle > 90 || calibrateAngle < -90) ? calibrateAngle + 180 : calibrateAngle}
            listening={false}
          >
            {(() => {
              const labelText = `${Math.round(calibrateDistance)}px - Set Reference`;
              return (
                <>
                  {/* Background rectangle */}
                  <Rect
                    x={-80}
                    y={-30}
                    width={160}
                    height={20}
                    fill="#ffffff"
                    opacity={0.85}
                    cornerRadius={2}
                  />
                  {/* Text */}
                  <Text
                    x={0}
                    y={-26}
                    text={labelText}
                    fontSize={12 / zoomLevel}
                    fontFamily="Arial"
                    fill="#4a90e2"
                    align="center"
                    ref={(node) => {
                      if (node) {
                        const textWidth = node.width();
                        const boxWidth = textWidth + 8;

                        node.x(-textWidth / 2);

                        const parent = node.getParent();
                        if (parent) {
                          const bgRect = parent.findOne('Rect');
                          if (bgRect) {
                            bgRect.setAttrs({
                              x: -boxWidth / 2,
                              width: boxWidth,
                            });
                          }
                        }
                      }
                    }}
                  />
                </>
              );
            })()}
          </Group>
        </Group>
      );

    case DrawingTool.SCREENSHOT:
      if (tempPoints.length < 2) return null;
      const screenshotStart = tempPoints[0];
      const screenshotEnd = tempPoints[tempPoints.length - 1];

      return (
        <Rect
          x={Math.min(screenshotStart.x, screenshotEnd.x)}
          y={Math.min(screenshotStart.y, screenshotEnd.y)}
          width={Math.abs(screenshotEnd.x - screenshotStart.x)}
          height={Math.abs(screenshotEnd.y - screenshotStart.y)}
          stroke="#4a90e2"
          strokeWidth={2}
          dash={[10, 5]}
          fill="rgba(74, 144, 226, 0.1)"
          listening={false}
        />
      );

    case DrawingTool.IMAGE:
      if (tempPoints.length < 2) return null;
      const imageStart = tempPoints[0];
      const imageEnd = tempPoints[tempPoints.length - 1];
      const imageX = Math.min(imageStart.x, imageEnd.x);
      const imageY = Math.min(imageStart.y, imageEnd.y);
      const imageWidth = Math.abs(imageEnd.x - imageStart.x);
      const imageHeight = Math.abs(imageEnd.y - imageStart.y);

      return (
        <Group>
          <Rect
            x={imageX}
            y={imageY}
            width={imageWidth}
            height={imageHeight}
            stroke={currentStyle.stroke}
            strokeWidth={currentStyle.strokeWidth}
            fill="#f0f0f0"
            opacity={0.7}
            listening={false}
          />
          <Text
            x={imageX + imageWidth / 2}
            y={imageY + imageHeight / 2}
            text="Drop Image"
            fontSize={Math.min(imageWidth / 8, imageHeight / 4, 24)}
            fontFamily="Arial"
            fill="#666"
            align="center"
            verticalAlign="middle"
            offsetX={40}
            offsetY={12}
            listening={false}
          />
        </Group>
      );

    default:
      return null;
  }
};
