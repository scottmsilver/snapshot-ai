# Measurement UI Improvements

## Changes Made

### 1. Moved Calibration to Global Level
- Added `CalibrationStatus` component to the main toolbar
- Removed `MeasurementPanel` from properties panel
- Calibration is now a prerequisite for measurements, not a tool property

### 2. Created Dedicated Calibration Workflow
- Added new `CALIBRATE` tool type (internal use only)
- "Set Scale" button initiates calibration mode
- User draws a reference line and enters known measurement
- Calibration is saved globally and persists across tool changes

### 3. Disabled Measurement Tool Until Calibrated
- Measurement tool button is grayed out when no calibration exists
- Tooltip shows "Set scale first to use measurements"
- Forces users to calibrate before measuring

### 4. Improved UI/UX Flow
- Clear visual indicator of calibration status in toolbar
- Unit selector integrated into calibration status
- "Change Scale" button for recalibration
- No more confusing mode switching within measurement tool

## New User Workflow

1. Upload an image
2. Click "Set Scale" button in toolbar (or notice the "No scale set" warning)
3. Draw a line on something with known dimensions
4. Enter the real-world measurement in the dialog
5. Measurement tool becomes available
6. All subsequent measurements use the calibrated scale
7. Can change units or recalibrate at any time from the toolbar

## Technical Implementation

- `DrawingTool.CALIBRATE` - Internal tool for calibration mode
- `CalibrationStatus` component - Shows scale and provides calibration controls
- Modified `DrawingToolbar` to check calibration status
- Updated `useDrawing` hook to handle CALIBRATE tool
- Calibration lines are stored as measurement shapes with `isCalibration: true`

## Benefits

- Clearer separation of concerns
- More intuitive workflow
- Prevents confusion about measurement modes
- Global calibration status always visible
- Better discoverability of calibration requirement