# Measurement Feature Test Plan

## Testing the Measurement Tool

### 1. Basic Tool Access
- [ ] Press 'M' key to activate the measurement tool
- [ ] Click the ruler icon (📏) in the toolbar
- [ ] Verify the measurement panel appears in the properties panel

### 2. First-Time Calibration Flow
- [ ] With no calibration, the panel should show "Not Calibrated" status
- [ ] Select "Calibrate Reference" radio button
- [ ] Draw a line on something with known dimensions
- [ ] Verify the calibration dialog appears showing the pixel distance
- [ ] Enter a measurement value (e.g., "10") and select unit (e.g., "cm")
- [ ] Click "Set Reference"
- [ ] Verify the calibration line appears as a blue dashed line with measurement label
- [ ] Verify the panel now shows "Calibrated" status with scale info

### 3. Creating Measurements
- [ ] After calibration, the tool should automatically switch to "Measure" mode
- [ ] Draw measurement lines on the image
- [ ] Verify each line shows its calculated measurement based on calibration
- [ ] Verify measurement labels rotate to stay readable
- [ ] Verify end caps appear on measurement lines

### 4. Unit Conversion
- [ ] With measurements on screen, change the display unit in the dropdown
- [ ] Verify all measurements update to show the new unit
- [ ] Verify the calibration scale updates

### 5. Recalibration
- [ ] Click "Recalibrate Reference" radio button
- [ ] Draw a new calibration line
- [ ] Set a different scale
- [ ] Verify all existing measurements update based on new calibration
- [ ] Verify the old calibration line is replaced

### 6. Selection and Editing
- [ ] Switch to Select tool (V)
- [ ] Click on measurement lines to select them
- [ ] Verify selected measurement lines can be:
  - [ ] Moved (drag)
  - [ ] Deleted (Delete key)
  - [ ] Styled (color, width)
- [ ] Verify calibration line has special styling (blue, dashed)

### 7. Persistence
- [ ] Save a project with calibration and measurements
- [ ] Clear the canvas and reload the project
- [ ] Verify calibration is restored
- [ ] Verify all measurements display correctly

### 8. Edge Cases
- [ ] Cancel calibration dialog - verify the line is deleted
- [ ] Draw very short measurement lines - verify labels remain readable
- [ ] Draw diagonal lines - verify text rotation works correctly
- [ ] Clear calibration - verify all measurements show pixels instead

### 9. Visual Indicators
- [ ] Calibration line has blue color and dashed style
- [ ] Calibration line shows calibration icon (📐)
- [ ] Regular measurement lines are solid with end caps
- [ ] Hover effects work on measurement lines
- [ ] Selection highlights work properly

### 10. Keyboard Shortcuts
- [ ] M - activates measurement tool
- [ ] V - returns to select tool
- [ ] Delete - removes selected measurements
- [ ] Escape - cancels current measurement drawing

## Expected Behaviors

1. **Calibration Required**: First use requires calibration before measurements
2. **Auto-Switch**: After calibration, automatically enters measurement mode
3. **Live Preview**: While drawing, shows pixel distance
4. **Smart Labels**: Measurement labels avoid being upside down
5. **Unit Memory**: Remembers selected unit across sessions
6. **Protection**: Calibration line style indicates it's special

## Common Issues to Check

1. Drawing measurement lines before calibration
2. Changing units without calibration
3. Multiple calibration lines (only latest should be active)
4. Very long measurement lines (performance)
5. Overlapping measurement labels