import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { ImageUploader } from '@/components/ImageUploader'
import { DrawingToolbar } from '@/components/Toolbar'
import { DrawingLayer } from '@/components/Canvas/DrawingLayer'
import { TextInputDialog } from '@/components/TextInputDialog'
import { useImage } from '@/hooks/useImage'
import { useHistory } from '@/hooks/useHistory'
import { useDrawing } from '@/hooks/useDrawing'
import { useDrawingContext } from '@/contexts/DrawingContext'
import { calculateImageFit } from '@/utils/imageHelpers'
import { saveStageState, restoreStageState } from '@/utils/stageHelpers'
import { DrawingTool, type Point, type TextShape } from '@/types/drawing'

function App() {
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const stageRef = useRef<Konva.Stage>(null)
  const { imageData, loadImage, clearImage } = useImage()
  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null)
  const { shapes, activeTool, clearSelection, addShape, updateShape, currentStyle } = useDrawing()
  const { state: drawingState, setShapes } = useDrawingContext()
  
  // Text dialog state
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [textPosition, setTextPosition] = useState<Point | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const { 
    canUndo, 
    canRedo, 
    pushState, 
    undo, 
    redo, 
    getCurrentState,
    currentIndex 
  } = useHistory()

  // Load image when imageData changes
  useEffect(() => {
    if (imageData) {
      const img = new window.Image()
      img.src = imageData.src
      img.onload = () => {
        setKonvaImage(img)
      }
    }
  }, [imageData])

  const handleImageUpload = async (file: File) => {
    await loadImage(file)
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) {
          undo()
        }
      }
      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z for redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (canRedo) {
          redo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [canUndo, canRedo, undo, redo])

  // Track if we're in the middle of history navigation
  const isHistoryNavigationRef = useRef(false)
  const lastShapesRef = useRef<string>('')

  // Initialize history with empty state
  useEffect(() => {
    if (getCurrentState() === null) {
      pushState(JSON.stringify({ shapes: [] }), 'Initial state')
    }
  }, [])

  // Save shapes to history when they change (but not on history navigation)
  useEffect(() => {
    if (!isHistoryNavigationRef.current) {
      const currentShapesJson = JSON.stringify({ shapes: drawingState.shapes })
      
      // Only push if state actually changed
      if (currentShapesJson !== lastShapesRef.current) {
        lastShapesRef.current = currentShapesJson
        // Only push to history if we have shapes or if this is clearing shapes
        if (drawingState.shapes.length > 0 || 
            (drawingState.shapes.length === 0 && lastShapesRef.current && JSON.parse(lastShapesRef.current).shapes?.length > 0)) {
          pushState(currentShapesJson, 'Shape change')
        }
      }
    }
    isHistoryNavigationRef.current = false
  }, [drawingState.shapes, pushState])

  // Apply history state when currentIndex changes (undo/redo)
  useEffect(() => {
    const currentState = getCurrentState()
    if (currentState) {
      try {
        const { shapes } = JSON.parse(currentState.data)
        const currentShapesJson = JSON.stringify({ shapes: drawingState.shapes })
        
        // Only update if shapes are different
        if (JSON.stringify({ shapes }) !== currentShapesJson) {
          isHistoryNavigationRef.current = true
          setShapes(shapes)
        }
      } catch (error) {
        console.error('Failed to restore shapes:', error)
      }
    }
  }, [currentIndex, getCurrentState, setShapes, drawingState.shapes])

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#333',
        color: 'white',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Image Markup Tool</h1>
      </header>

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        padding: '1rem'
      }}>
        {/* Toolbar */}
        <aside style={{
          width: '200px',
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 5rem)'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Tools</h2>
          {imageData ? (
            <>
              <div style={{ 
                display: 'flex', 
                gap: '0.5rem', 
                marginBottom: '1rem' 
              }}>
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    backgroundColor: canUndo ? '#f0f0f0' : '#fafafa',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: canUndo ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    opacity: canUndo ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ↶ Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Y)"
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    backgroundColor: canRedo ? '#f0f0f0' : '#fafafa',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: canRedo ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    opacity: canRedo ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ↷ Redo
                </button>
              </div>
              
              <button
                onClick={() => {
                  clearImage();
                  setKonvaImage(null);
                  clearSelection();
                  setShapes([]);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginBottom: '1rem',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Upload New Image
              </button>
              
              <hr style={{ 
                margin: '1rem 0', 
                border: 'none', 
                borderTop: '1px solid #eee' 
              }} />
              
              <DrawingToolbar />
            </>
          ) : (
            <p style={{ color: '#666' }}>Upload an image to get started</p>
          )}
        </aside>

        {/* Canvas Area */}
        <section style={{
          flex: 1,
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          {!imageData ? (
            <ImageUploader onImageUpload={handleImageUpload} />
          ) : (
            <Stage
              width={stageSize.width}
              height={stageSize.height}
              ref={stageRef}
              style={{
                border: '1px solid #ddd',
                backgroundColor: '#fafafa',
                cursor: activeTool === 'select' ? 'default' : 'crosshair'
              }}
            >
              <Layer>
                {konvaImage && imageData && (() => {
                  const fit = calculateImageFit(imageData, stageSize);
                  return (
                    <KonvaImage
                      image={konvaImage}
                      x={fit.x}
                      y={fit.y}
                      width={fit.width}
                      height={fit.height}
                    />
                  );
                })()}
              </Layer>
              
              {/* Drawing Layer for annotations */}
              <DrawingLayer 
                stageRef={stageRef} 
                onTextClick={(pos) => {
                  setTextPosition(pos);
                  setEditingTextId(null);
                  setTextDialogOpen(true);
                }}
                onTextEdit={(shapeId) => {
                  const shape = shapes.find(s => s.id === shapeId);
                  if (shape && shape.type === DrawingTool.TEXT) {
                    setEditingTextId(shapeId);
                    setTextPosition({ x: shape.x, y: shape.y });
                    setTextDialogOpen(true);
                  }
                }}
              />
            </Stage>
          )}
        </section>
      </main>
      
      {/* Text Input Dialog - rendered outside canvas */}
      <TextInputDialog
        isOpen={textDialogOpen}
        initialText={editingTextId ? (shapes.find(s => s.id === editingTextId) as TextShape)?.text || '' : ''}
        initialFontSize={editingTextId ? (shapes.find(s => s.id === editingTextId) as TextShape)?.fontSize || 16 : 16}
        initialFontFamily={editingTextId ? (shapes.find(s => s.id === editingTextId) as TextShape)?.fontFamily || 'Arial' : currentStyle.fontFamily || 'Arial'}
        onSubmit={(text, fontSize, fontFamily) => {
          if (editingTextId) {
            // Update existing text
            updateShape(editingTextId, {
              text: text,
              fontSize: fontSize,
              fontFamily: fontFamily,
              updatedAt: Date.now(),
            });
          } else if (textPosition) {
            // Create new text
            const textShape: Omit<TextShape, 'zIndex'> = {
              id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: DrawingTool.TEXT,
              x: textPosition.x,
              y: textPosition.y,
              text: text,
              fontSize: fontSize,
              fontFamily: currentStyle.fontFamily || 'Arial',
              style: {
                stroke: currentStyle.stroke,
                strokeWidth: 0,
                opacity: currentStyle.opacity,
              },
              visible: true,
              locked: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            addShape(textShape);
          }
          
          setTextDialogOpen(false);
          setTextPosition(null);
          setEditingTextId(null);
        }}
        onCancel={() => {
          setTextDialogOpen(false);
          setTextPosition(null);
          setEditingTextId(null);
        }}
      />
    </div>
  )
}

export default App