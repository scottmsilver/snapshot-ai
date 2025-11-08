# Generative Fill / Inpainting Feature - Implementation Plan

## Overview

This document outlines the complete implementation plan for adding a Generative Fill/Inpainting feature to the image markup application. This feature allows users to select regions of an image and use AI to modify, extend, or replace content based on freeform text prompts.

---

## User Experience Flow

1. **Load image** → User has their 3D rendering/architectural image loaded
2. **Activate "Generative Fill"** → Click new tool button in toolbar (like other drawing tools)
3. **Choose selection method** → Subtoolbar appears with 3 options:
   - 🖌️ **Brush** - Paint over existing element + extension area
   - ▭ **Rectangle** - Drag box encompassing element + new space
   - ⚬ **Lasso** - Freehand outline for complex shapes
4. **Make selection** → User selects existing element AND the space to extend/modify
5. **Enter prompt** → Dialog appears with freeform textarea for instructions
6. **Generate** → Sends image region + mask + prompt to AI API (Gemini/Stability AI)
7. **Review & Apply** → Preview result, accept, regenerate, or cancel

---

## Key Concepts

### The Critical Selection Concept
The selection mask includes BOTH:
- The existing element (e.g., the current window)
- The empty/target space where changes should occur
- This combined mask tells the AI what region to process

### Freeform Prompting
Users can type ANY instruction - not just "fill" or "extend":
- "Extend the window to fill this selected area"
- "Replace with a wooden door maintaining architectural style"
- "Add a balcony with glass railings"
- "Remove the window and fill with brick wall"
- "Change the material to brushed metal"

---

## Architecture Integration

### Current Codebase Structure
- **State Management**: DrawingContext with reducer pattern
- **Canvas**: Konva.js for rendering shapes
- **Tool System**: Extensible tool enum and toolbar
- **Dialogs**: Portal-based dialog pattern (TextInputDialog)
- **Services**: Google Drive service shows API integration pattern

### Where This Feature Fits
- New tool type in DrawingTool enum
- Extends DrawingState with generative fill mode
- New actions in DrawingActionType
- New dialog component following existing pattern
- New service for AI API calls
- New utilities for mask generation and compositing

---

## Technical Implementation Details

### 1. Mask Generation System

#### Brush Tool / Freeform Selection

**How it works:**
```typescript
// User paints with brush over existing window + extension area
// As user drags, collect points like the PEN tool does
brushStrokePoints: Point[] = [
  { x: 100, y: 200 },
  { x: 102, y: 201 },
  // ... continuous points as user drags
]
```

**Convert to mask:**
```typescript
1. Create offscreen canvas (same size as source image)
2. Fill entire canvas black (background)
3. Set strokeStyle = 'white' (selection color)
4. Draw brush strokes using collected points with configurable width
5. Result: White pixels = selected area, Black = not selected
6. Extract as ImageData for API
```

**Visual feedback:**
- Semi-transparent overlay (e.g., blue tint at 40% opacity) shows painted area in real-time
- Renders as user drags brush (similar to PEN tool tempPoints)
- Brush width configurable (like current pen strokeWidth)
- Additive behavior: multiple strokes combine into single mask

#### Rectangle Selection

**How it works:**
```typescript
// User clicks and drags to create rectangle
rectangleBounds = {
  x: startPoint.x,
  y: startPoint.y,
  width: currentPoint.x - startPoint.x,
  height: currentPoint.y - startPoint.y
}
```

**Convert to mask:**
```typescript
1. Create offscreen canvas
2. Fill entire canvas black
3. fillRect(x, y, width, height) in white
4. Result: White rectangle = selected area
5. Extract as ImageData for API
```

**Visual feedback:**
- Shows stroke outline while dragging (like current RECTANGLE tool)
- Fills with semi-transparent overlay when complete
- Snap to grid option (optional enhancement)

#### Lasso Tool

**How it works:**
```typescript
// User draws freehand closed polygon
lassoPoints: Point[] = [
  { x: 100, y: 200 },
  { x: 150, y: 210 },
  // ... user's freehand path
]

// Auto-close on mouse up (connect last point to first)
```

**Convert to mask:**
```typescript
1. Create offscreen canvas
2. Fill black background
3. beginPath() → moveTo(first point)
4. Loop through points with lineTo()
5. closePath() → fill with white
6. Result: White polygon = selected area
7. Extract as ImageData for API
```

**Visual feedback:**
- Show path outline while drawing
- Fill with semi-transparent overlay when closed
- Optional: show "close path" indicator when mouse near start point

---

### 2. Mask Export Implementation

```typescript
// In src/utils/maskRendering.ts

interface MaskExport {
  // The bounding box of the selection
  bounds: { x: number; y: number; width: number; height: number };

  // Binary mask: white = selected, black = not selected
  // Cropped to bounds for efficiency
  maskImageData: ImageData;

  // Source image region (same dimensions as mask)
  sourceImageData: ImageData;
}

function generateMaskFromSelection(
  sourceCanvas: HTMLCanvasElement,
  selectionTool: 'brush' | 'rectangle' | 'lasso',
  selectionData: Point[] | Rectangle | Point[],
  brushWidth?: number
): MaskExport {
  // 1. Create mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  const maskCtx = maskCanvas.getContext('2d')!;

  // 2. Fill black background
  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  // 3. Draw selection in white
  maskCtx.fillStyle = 'white';
  maskCtx.strokeStyle = 'white';

  if (selectionTool === 'brush') {
    // Draw strokes
    const points = selectionData as Point[];
    maskCtx.lineWidth = brushWidth || 10;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.beginPath();
    maskCtx.moveTo(points[0].x, points[0].y);
    points.forEach(p => maskCtx.lineTo(p.x, p.y));
    maskCtx.stroke();
  } else if (selectionTool === 'rectangle') {
    // Fill rectangle
    const rect = selectionData as Rectangle;
    maskCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
  } else if (selectionTool === 'lasso') {
    // Fill polygon
    const points = selectionData as Point[];
    maskCtx.beginPath();
    maskCtx.moveTo(points[0].x, points[0].y);
    points.forEach(p => maskCtx.lineTo(p.x, p.y));
    maskCtx.closePath();
    maskCtx.fill();
  }

  // 4. Find bounding box of white pixels (optimization)
  const bounds = findMaskBounds(maskCanvas);

  // 5. Extract cropped mask and source regions
  const maskImageData = maskCtx.getImageData(
    bounds.x, bounds.y, bounds.width, bounds.height
  );

  const sourceCtx = sourceCanvas.getContext('2d')!;
  const sourceImageData = sourceCtx.getImageData(
    bounds.x, bounds.y, bounds.width, bounds.height
  );

  return { bounds, maskImageData, sourceImageData };
}

function findMaskBounds(maskCanvas: HTMLCanvasElement): Rectangle {
  // Scan pixels to find bounding box of white pixels
  // Returns minimal rectangle containing all selected area
  // Optimization: reduces API payload size
}

function imageDataToBase64(imageData: ImageData): string {
  // Convert ImageData to base64 PNG
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function base64ToImageData(base64: string): Promise<ImageData> {
  // Convert base64 PNG back to ImageData
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.src = base64;
  });
}
```

---

### 3. State Management Extensions

```typescript
// In src/types/drawing.ts

// Add to DrawingTool enum
export enum DrawingTool {
  // ... existing tools
  GENERATIVE_FILL = 'generativeFill',
}

// New type for selection tool within generative fill mode
export enum GenerativeFillSelectionTool {
  BRUSH = 'brush',
  RECTANGLE = 'rectangle',
  LASSO = 'lasso',
}

// Extend DrawingState
interface DrawingState {
  // ... existing properties
  generativeFillMode: {
    isActive: boolean;
    selectionTool: GenerativeFillSelectionTool | null;
    selectionPoints: Point[];  // For brush and lasso
    selectionRectangle: Rectangle | null;  // For rectangle
    brushWidth: number;  // For brush tool
    maskPreview: ImageData | null;  // Generated mask preview
    promptInput: string;
    isGenerating: boolean;  // API call in progress
    generatedResult: {
      imageData: ImageData;
      bounds: Rectangle;
    } | null;
  } | null;
}

// New actions
enum DrawingActionType {
  // ... existing actions
  START_GENERATIVE_FILL = 'START_GENERATIVE_FILL',
  SET_GENERATIVE_FILL_SELECTION_TOOL = 'SET_GENERATIVE_FILL_SELECTION_TOOL',
  UPDATE_GENERATIVE_FILL_SELECTION = 'UPDATE_GENERATIVE_FILL_SELECTION',
  COMPLETE_GENERATIVE_FILL_SELECTION = 'COMPLETE_GENERATIVE_FILL_SELECTION',
  SET_GENERATIVE_FILL_PROMPT = 'SET_GENERATIVE_FILL_PROMPT',
  START_GENERATIVE_FILL_GENERATION = 'START_GENERATIVE_FILL_GENERATION',
  COMPLETE_GENERATIVE_FILL_GENERATION = 'COMPLETE_GENERATIVE_FILL_GENERATION',
  APPLY_GENERATIVE_FILL_RESULT = 'APPLY_GENERATIVE_FILL_RESULT',
  CANCEL_GENERATIVE_FILL = 'CANCEL_GENERATIVE_FILL',
}
```

---

### 4. API Service Implementation

```typescript
// In src/services/generativeApi.ts

interface InpaintRequest {
  sourceImage: string;  // Base64 PNG
  maskImage: string;    // Base64 PNG (binary: white=selected, black=not)
  prompt: string;       // Freeform user instruction
}

interface InpaintResponse {
  generatedImage: string;  // Base64 PNG
  error?: string;
}

class GenerativeInpaintService {
  private apiKey: string;
  private apiEndpoint: string;

  constructor(apiKey: string, apiEndpoint: string) {
    this.apiKey = apiKey;
    this.apiEndpoint = apiEndpoint;
  }

  async inpaint(
    sourceImage: ImageData,
    maskImage: ImageData,
    prompt: string
  ): Promise<ImageData> {
    // Convert ImageData to base64
    const sourceBase64 = imageDataToBase64(sourceImage);
    const maskBase64 = imageDataToBase64(maskImage);

    // Prepare request payload
    const requestBody: InpaintRequest = {
      sourceImage: sourceBase64,
      maskImage: maskBase64,
      prompt: prompt,
    };

    // Call AI API (Gemini/Stability AI/Replicate)
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const result: InpaintResponse = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    // Convert result back to ImageData
    const generatedImage = await base64ToImageData(result.generatedImage);

    return generatedImage;
  }
}

export default GenerativeInpaintService;
```

**API Integration Options:**
- Google Gemini Imagen API
- Stability AI Inpainting
- Replicate (SDXL Inpainting)
- OpenAI DALL-E (if inpainting supported)

**Note:** API endpoint and key should be configurable (environment variables or settings UI)

---

### 5. Image Composition

```typescript
// In src/utils/imageComposition.ts

/**
 * Composites the AI-generated result back into the original canvas
 * at the exact location of the selection bounds
 */
function compositeInpaintResult(
  originalCanvas: HTMLCanvasElement,
  generatedImage: ImageData,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  const ctx = originalCanvas.getContext('2d')!;

  // Place generated image at exact bounds location
  // This replaces the pixels in that region
  ctx.putImageData(generatedImage, bounds.x, bounds.y);
}

/**
 * Optionally add the result as an ImageShape to the drawing context
 * so it becomes part of the editable layer (can be moved, deleted, etc.)
 */
function addResultAsImageShape(
  generatedImage: ImageData,
  bounds: Rectangle,
  drawingContext: DrawingContextType
): void {
  // Convert ImageData to base64 for storage
  const base64 = imageDataToBase64(generatedImage);

  const imageShape: ImageShape = {
    id: generateId(),
    type: DrawingTool.IMAGE,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    imageData: base64,
    style: { /* default style */ },
    visible: true,
    locked: false,
    zIndex: getNextZIndex(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  drawingContext.addShape(imageShape);
}
```

---

### 6. UI Components

#### GenerativeFillToolbar
```typescript
// In src/components/Toolbar/GenerativeFillToolbar.tsx

interface GenerativeFillToolbarProps {
  selectedTool: GenerativeFillSelectionTool;
  brushWidth: number;
  onSelectTool: (tool: GenerativeFillSelectionTool) => void;
  onBrushWidthChange: (width: number) => void;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * Sub-toolbar that appears when Generative Fill mode is active
 * Shows selection tool options and controls
 */
export function GenerativeFillToolbar(props: GenerativeFillToolbarProps) {
  return (
    <div className="generative-fill-toolbar">
      <ToolButtonGroup>
        <ToolButton
          active={props.selectedTool === 'brush'}
          onClick={() => props.onSelectTool('brush')}
          icon={<BrushIcon />}
          label="Brush"
        />
        <ToolButton
          active={props.selectedTool === 'rectangle'}
          onClick={() => props.onSelectTool('rectangle')}
          icon={<RectangleIcon />}
          label="Rectangle"
        />
        <ToolButton
          active={props.selectedTool === 'lasso'}
          onClick={() => props.onSelectTool('lasso')}
          icon={<LassoIcon />}
          label="Lasso"
        />
      </ToolButtonGroup>

      {props.selectedTool === 'brush' && (
        <SliderControl
          label="Brush Size"
          value={props.brushWidth}
          min={5}
          max={100}
          onChange={props.onBrushWidthChange}
        />
      )}

      <ActionButtons>
        <Button onClick={props.onComplete}>Continue</Button>
        <Button onClick={props.onCancel} variant="secondary">Cancel</Button>
      </ActionButtons>
    </div>
  );
}
```

#### GenerativeFillDialog
```typescript
// In src/components/Dialogs/GenerativeFillDialog.tsx

interface GenerativeFillDialogProps {
  isOpen: boolean;
  isGenerating: boolean;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}

/**
 * Dialog for entering freeform text prompt after selection is made
 * Follows pattern of TextInputDialog
 */
export function GenerativeFillDialog(props: GenerativeFillDialogProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    if (prompt.trim()) {
      props.onSubmit(prompt);
    }
  };

  return (
    <Dialog isOpen={props.isOpen} onClose={props.onCancel}>
      <DialogHeader>Generative Fill</DialogHeader>
      <DialogBody>
        <p>Describe what you want to do with the selected area:</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Extend the window to fill this area, maintaining architectural style"
          rows={4}
          autoFocus
          disabled={props.isGenerating}
        />

        <ExamplePrompts>
          <p>Example prompts:</p>
          <ul>
            <li>"Extend the window to fill this selected area"</li>
            <li>"Replace with a wooden door maintaining architectural style"</li>
            <li>"Add a balcony with glass railings"</li>
            <li>"Remove the window and fill with brick wall"</li>
          </ul>
        </ExamplePrompts>
      </DialogBody>
      <DialogActions>
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || props.isGenerating}
        >
          {props.isGenerating ? 'Generating...' : 'Generate'}
        </Button>
        <Button
          onClick={props.onCancel}
          variant="secondary"
          disabled={props.isGenerating}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

#### Result Preview Component
```typescript
// In src/components/GenerativeFill/ResultPreview.tsx

interface ResultPreviewProps {
  originalImage: ImageData;
  generatedImage: ImageData;
  bounds: Rectangle;
  onAccept: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

/**
 * Shows before/after preview of AI result
 * User can accept, regenerate with new prompt, or cancel
 */
export function ResultPreview(props: ResultPreviewProps) {
  const [showComparison, setShowComparison] = useState(true);

  return (
    <div className="result-preview-overlay">
      <div className="preview-container">
        <div className="preview-header">
          <h3>Preview Result</h3>
          <ToggleButton
            checked={showComparison}
            onChange={setShowComparison}
            label="Show Before/After"
          />
        </div>

        <div className="preview-canvas">
          {showComparison ? (
            <BeforeAfterSlider
              before={props.originalImage}
              after={props.generatedImage}
            />
          ) : (
            <Canvas imageData={props.generatedImage} />
          )}
        </div>

        <div className="preview-actions">
          <Button onClick={props.onAccept} variant="primary">
            Accept
          </Button>
          <Button onClick={props.onRegenerate} variant="secondary">
            Regenerate
          </Button>
          <Button onClick={props.onCancel} variant="secondary">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

### 7. DrawingLayer Integration

```typescript
// In src/components/Canvas/DrawingLayer.tsx

// Add special rendering for generative fill mode
function DrawingLayer(props: DrawingLayerProps) {
  const { generativeFillMode } = useDrawing();

  // ... existing rendering

  // Render generative fill selection overlay
  if (generativeFillMode?.isActive) {
    return (
      <>
        {/* Existing shapes */}
        {/* ... */}

        {/* Generative fill selection overlay */}
        <GenerativeFillSelectionOverlay
          selectionTool={generativeFillMode.selectionTool}
          selectionPoints={generativeFillMode.selectionPoints}
          selectionRectangle={generativeFillMode.selectionRectangle}
          brushWidth={generativeFillMode.brushWidth}
        />

        {/* Generated result preview (if available) */}
        {generativeFillMode.generatedResult && (
          <GeneratedResultOverlay
            imageData={generativeFillMode.generatedResult.imageData}
            bounds={generativeFillMode.generatedResult.bounds}
          />
        )}
      </>
    );
  }

  // ... rest of rendering
}
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Add GENERATIVE_FILL to DrawingTool enum in `src/types/drawing.ts`
- [ ] Create GenerativeFillSelectionTool enum
- [ ] Extend DrawingState with generativeFillMode
- [ ] Add new DrawingActionType actions for generative fill workflow
- [ ] Update drawingReducer to handle new actions
- [ ] Add generative fill button to DrawingToolbar

### Phase 2: Selection Tools
- [ ] Create `src/utils/maskRendering.ts` with mask generation utilities
- [ ] Implement brush selection: point collection + stroke rendering
- [ ] Implement rectangle selection: bounds tracking + fill rendering
- [ ] Implement lasso selection: path collection + polygon rendering
- [ ] Add visual overlay for selection feedback (semi-transparent highlight)
- [ ] Create GenerativeFillToolbar component for selection tool switching

### Phase 3: Mask Export
- [ ] Implement `generateMaskFromSelection()` in maskRendering.ts
- [ ] Implement `findMaskBounds()` for optimization
- [ ] Implement `imageDataToBase64()` conversion
- [ ] Implement `base64ToImageData()` conversion
- [ ] Test mask generation for all three selection tools

### Phase 4: UI Components
- [ ] Create GenerativeFillDialog component with freeform textarea
- [ ] Add example prompts in dialog
- [ ] Create ResultPreview component with before/after comparison
- [ ] Add accept/regenerate/cancel controls
- [ ] Integrate dialogs with DrawingLayer rendering

### Phase 5: API Integration
- [ ] Create `src/services/generativeApi.ts`
- [ ] Implement GenerativeInpaintService class
- [ ] Add API endpoint and key configuration (env vars)
- [ ] Implement request/response handling
- [ ] Add error handling for API failures
- [ ] Add loading states during API calls

### Phase 6: Composition & Finalization
- [ ] Create `src/utils/imageComposition.ts`
- [ ] Implement `compositeInpaintResult()` to apply result to canvas
- [ ] Implement `addResultAsImageShape()` for editable layer
- [ ] Add to drawing history for undo/redo support
- [ ] Update WorkspaceCanvas to handle composited results

### Phase 7: Complete Workflow
- [ ] Wire up complete flow: activate → select → prompt → generate → preview → apply
- [ ] Add keyboard shortcuts (e.g., 'G' for generative fill, Enter to submit, Esc to cancel)
- [ ] Test brush selection end-to-end
- [ ] Test rectangle selection end-to-end
- [ ] Test lasso selection end-to-end
- [ ] Test error cases (API failure, invalid selection, etc.)

### Phase 8: Polish & Testing
- [ ] Add loading indicators during generation
- [ ] Add tooltips and help text
- [ ] Optimize mask bounds calculation
- [ ] Add analytics/telemetry (optional)
- [ ] Write unit tests for mask generation
- [ ] Write integration tests for full workflow
- [ ] Performance testing with large images
- [ ] Documentation and user guide

---

## File Structure

```
src/
├── types/
│   └── drawing.ts                              (add GENERATIVE_FILL tool & types)
│
├── services/
│   └── generativeApi.ts                        (NEW - AI API integration)
│
├── utils/
│   ├── maskRendering.ts                        (NEW - selection → mask conversion)
│   └── imageComposition.ts                     (NEW - composite results to canvas)
│
├── components/
│   ├── Toolbar/
│   │   ├── DrawingToolbar.tsx                  (add generative fill button)
│   │   └── GenerativeFillToolbar.tsx           (NEW - selection tool subtoolbar)
│   │
│   ├── Dialogs/
│   │   └── GenerativeFillDialog.tsx            (NEW - prompt input dialog)
│   │
│   ├── GenerativeFill/
│   │   ├── ResultPreview.tsx                   (NEW - before/after preview)
│   │   ├── SelectionOverlay.tsx                (NEW - visual selection feedback)
│   │   └── GeneratedResultOverlay.tsx          (NEW - result preview overlay)
│   │
│   └── Canvas/
│       └── DrawingLayer.tsx                    (add generative fill rendering)
│
├── hooks/
│   ├── useDrawing.ts                           (add generative fill methods)
│   └── useGenerativeFill.ts                    (NEW - workflow orchestration)
│
├── contexts/
│   ├── DrawingContext.tsx                      (add generative fill state)
│   └── DrawingProvider.tsx                     (wire up new actions)
│
└── App.tsx                                     (add dialog state management)
```

---

## Technical Decisions & Rationale

### Why Binary Masks (White/Black)?
- Standard in AI inpainting APIs
- Simple to generate and validate
- Efficient for API transmission
- Clear semantic: white = modify, black = preserve

### Why Crop to Bounds?
- Reduces API payload size
- Faster API processing
- Lower costs (some APIs charge by pixel count)
- Still maintains positional accuracy through bounds metadata

### Why Three Selection Tools?
- **Brush**: Precise control for irregular shapes and partial selections
- **Rectangle**: Fast for straight architectural elements (windows, doors)
- **Lasso**: Flexibility for complex outlines

### Why Freeform Prompts?
- Maximum flexibility for users
- Not limited to "fill" or "extend" operations
- Leverages full capabilities of AI models
- Natural language is more intuitive than predefined options

### Why Preview Before Apply?
- AI results can be unpredictable
- Users may want to regenerate with different prompts
- Prevents unwanted changes to original image
- Follows standard image editor patterns (Photoshop, etc.)

---

## Future Enhancements

### Phase 2 Features (Post-MVP)
- [ ] Multiple prompt suggestions based on selection context
- [ ] Strength/creativity slider for AI generation
- [ ] Negative prompts (what NOT to include)
- [ ] Style presets (photorealistic, sketch, artistic, etc.)
- [ ] Batch processing multiple selections
- [ ] History of prompts for quick reuse
- [ ] AI-suggested prompts based on image analysis
- [ ] Export mask as separate layer
- [ ] Import custom masks

### Advanced Features
- [ ] Outpainting (extend beyond image bounds)
- [ ] Multi-region selection (combine multiple areas)
- [ ] Blend modes for compositing results
- [ ] Iterative refinement (use result as new input)
- [ ] Local model support (Stable Diffusion WebGPU)
- [ ] Collaborative prompting (share prompts with team)

---

## API Configuration

### Environment Variables
```env
# .env.local
VITE_GENERATIVE_API_ENDPOINT=https://api.example.com/v1/inpaint
VITE_GENERATIVE_API_KEY=your_api_key_here
```

### Supported API Providers

#### Option 1: Stability AI
```typescript
endpoint: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image/masking'
headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
```

#### Option 2: Replicate
```typescript
endpoint: 'https://api.replicate.com/v1/predictions'
model: 'stability-ai/sdxl:inpainting'
```

#### Option 3: Google Gemini Imagen
```typescript
endpoint: 'https://generativelanguage.googleapis.com/v1/models/imagen:inpaint'
```

---

## Testing Strategy

### Unit Tests
- Mask generation from brush strokes
- Mask generation from rectangles
- Mask generation from lasso paths
- Bounds calculation accuracy
- ImageData ↔ Base64 conversion

### Integration Tests
- Complete workflow: select → prompt → generate → apply
- State transitions in DrawingContext
- Dialog open/close flows
- Error handling and recovery

### Manual Testing Checklist
- [ ] Brush selection on various image sizes
- [ ] Rectangle selection precision
- [ ] Lasso path closing behavior
- [ ] Prompt submission and cancellation
- [ ] API success responses
- [ ] API error responses (timeout, invalid key, etc.)
- [ ] Result preview rendering
- [ ] Accept/reject/regenerate flows
- [ ] Undo/redo after applying result
- [ ] Performance with large selections

---

## Success Metrics

### MVP Success Criteria
- User can activate generative fill mode
- User can make selections with all three tools
- Selection mask accurately captures selected area
- Prompt dialog appears and accepts freeform text
- API call succeeds with valid credentials
- Result composites correctly into original image
- User can accept or reject results

### Performance Targets
- Selection rendering: < 16ms (60fps)
- Mask generation: < 100ms
- API response: < 10s (dependent on provider)
- Result composition: < 200ms

### Quality Targets
- Mask accuracy: 100% pixel-perfect for rectangle/lasso
- Brush smoothness: Comparable to existing PEN tool
- API success rate: > 95% (with valid credentials)
- User satisfaction: Positive feedback on workflow intuitiveness

---

## Open Questions / Decisions Needed

1. **API Provider**: Which AI service should be the default?
   - Stability AI (most established)
   - Google Gemini (latest tech)
   - Replicate (easiest setup)

2. **API Key Storage**: How should users provide API keys?
   - Environment variables (dev-friendly)
   - Settings UI (user-friendly)
   - Cloud configuration (team-friendly)

3. **Result Storage**: Should generated results be:
   - Flattened into background image (destructive)
   - Added as ImageShape (non-destructive)
   - Both options available

4. **Pricing Transparency**: Should we show estimated API costs?
   - Display cost per generation
   - Show running total
   - Warn when approaching limits

5. **Offline Support**: Should we support local models?
   - Stable Diffusion WebGPU
   - ONNX Runtime Web
   - Trade-offs: quality vs. privacy/cost

---

## Timeline Estimate

### Week 1: Foundation & Selection Tools
- Days 1-2: State management setup, toolbar integration
- Days 3-5: Implement all three selection tools + visual overlays

### Week 2: Mask Export & API Integration
- Days 1-2: Mask generation utilities + testing
- Days 3-5: API service implementation + error handling

### Week 3: UI Components & Workflow
- Days 1-2: Dialogs (prompt input, result preview)
- Days 3-5: Complete workflow integration + composition

### Week 4: Testing & Polish
- Days 1-3: Comprehensive testing (unit + integration + manual)
- Days 4-5: Bug fixes, performance optimization, documentation

**Total: ~4 weeks for MVP**

---

## References & Resources

### AI Inpainting APIs
- [Stability AI Documentation](https://platform.stability.ai/docs/api-reference#tag/v1generation/operation/masking)
- [Replicate Inpainting Models](https://replicate.com/collections/image-inpainting)
- [Google Imagen API](https://cloud.google.com/vertex-ai/docs/generative-ai/image/edit-images)

### Existing Implementations (for reference)
- Adobe Photoshop Generative Fill
- Canva Magic Edit
- GIMP Resynthesizer plugin

### Technical Resources
- [Canvas API - Clipping Paths](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing)
- [ImageData documentation](https://developer.mozilla.org/en-US/docs/Web/API/ImageData)
- [Konva.js Filters & Masking](https://konvajs.org/docs/filters/Custom_Filter.html)

---

## Appendix: Example Workflows

### Example 1: Extending a Window
1. User loads architectural rendering
2. Clicks "Generative Fill" tool
3. Selects "Rectangle" from subtoolbar
4. Drags rectangle over existing window + 10 feet to the right
5. Clicks "Continue"
6. Dialog appears, types: "Extend the window to fill the selected area, maintaining the glass and frame style"
7. Clicks "Generate"
8. Waits 5-8 seconds
9. Preview shows extended window
10. Clicks "Accept"
11. Extended window is now part of the image

### Example 2: Replacing an Element
1. User has image with a door
2. Activates Generative Fill
3. Uses Lasso to carefully outline the door
4. Prompt: "Replace with a modern glass sliding door"
5. Generates result
6. Not satisfied, clicks "Regenerate"
7. Refines prompt: "Replace with a modern glass sliding door, frosted glass, black metal frame"
8. Accepts second result

### Example 3: Adding New Elements
1. User has blank wall in rendering
2. Uses Brush to paint over section of wall
3. Prompt: "Add a large decorative mirror with ornate gold frame"
4. Accepts result
5. Later uses Undo to revert if needed (preserved in history)

---

## End of Implementation Plan

This document should be updated as implementation progresses and new decisions are made.
