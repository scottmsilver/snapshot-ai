import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { ImageUploader } from '@/components/ImageUploader'
import { DrawingToolbar } from '@/components/Toolbar'
import { DrawingLayer } from '@/components/Canvas/DrawingLayer'
import { TextInputDialog } from '@/components/TextInputDialog'
import { UserMenu } from '@/components/Auth/UserMenu'
import { FileMenu } from '@/components/FileMenu/FileMenu'
import { useImage } from '@/hooks/useImage'
import { useHistory } from '@/hooks/useHistory'
import { useDrawing } from '@/hooks/useDrawing'
import { useDrawingContext } from '@/contexts/DrawingContext'
import { useAuth } from '@/contexts/AuthContext'
import { calculateImageFit } from '@/utils/imageHelpers'
import { copyCanvasToClipboard, downloadCanvasAsImage } from '@/utils/exportUtils'
import { DrawingTool, type Point, type TextShape } from '@/types/drawing'

function App() {
  const [stageSize] = useState({ width: 800, height: 600 })
  const stageRef = useRef<Konva.Stage | null>(null)
  const { imageData, loadImage, clearImage } = useImage()
  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null)
  const { shapes, activeTool, clearSelection, addShape, updateShape, currentStyle, selectedShapeIds, selectShape, setActiveTool } = useDrawing()
  const { state: drawingState, setShapes } = useDrawingContext()
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100%
  
  // Get selected shapes
  const selectedShapes = shapes.filter(shape => selectedShapeIds.includes(shape.id))
  
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

  // Track if we're in the middle of history navigation
  const isHistoryNavigationRef = useRef(false)
  const lastShapesRef = useRef<string>('')

  // Export functions
  const handleCopyToClipboard = async () => {
    if (!stageRef.current) return;
    
    try {
      await copyCanvasToClipboard(stageRef.current);
      // You could add a toast notification here
      console.log('Canvas copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard. Your browser may not support this feature.');
    }
  };

  const handleDownloadImage = () => {
    if (!stageRef.current) return;
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    downloadCanvasAsImage(stageRef.current, `markup-${timestamp}.png`);
  };

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
      // Ctrl/Cmd + C for copy to clipboard (when not in text input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleCopyToClipboard();
        }
      }
      // Ctrl/Cmd + S for download
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleDownloadImage();
      }
      // Ctrl/Cmd + = or + for zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoomLevel(prev => Math.min(4, prev + 0.25));
      }
      // Ctrl/Cmd + - for zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoomLevel(prev => Math.max(0.1, prev - 0.25));
      }
      // Ctrl/Cmd + 0 for reset zoom
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [canUndo, canRedo, undo, redo, zoomLevel])

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
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
        padding: '0 1rem',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        {/* Left: Logo and File Name */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ fontSize: '1.25rem' }}>🎨</span>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1rem',
            fontWeight: '600',
            color: '#333'
          }}>
            {imageData ? imageData.name : 'No image loaded'}
          </h1>
        </div>

        {/* Right: Quick Actions */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem',
          alignItems: 'center'
        }}>
          <FileMenu stageRef={stageRef} imageData={imageData} />
          {imageData && (
            <>
              <button
                onClick={() => {
                  clearImage();
                  setKonvaImage(null);
                  clearSelection();
                  setShapes([]);
                }}
                title="New Image"
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: 'transparent',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📄 New
              </button>
              <button
                onClick={handleCopyToClipboard}
                title="Copy to Clipboard (Ctrl+C)"
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: 'transparent',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📋 Copy
              </button>
              <button
                onClick={handleDownloadImage}
                title="Download Image (Ctrl+S)"
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#357abd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4a90e2';
                }}
              >
                💾 Export
              </button>
            </>
          )}
          <UserMenu />
        </div>
      </header>

      {/* Horizontal Toolbar */}
      {imageData && (
        <div style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e0e0e0',
          padding: '0.25rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          {/* Undo/Redo Group */}
          <div style={{
            display: 'flex',
            gap: '0.125rem',
            paddingRight: '0.5rem',
            borderRight: '1px solid #e0e0e0'
          }}>
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              style={{
                padding: '0.25rem 0.375rem',
                backgroundColor: canUndo ? 'transparent' : 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                cursor: canUndo ? 'pointer' : 'not-allowed',
                opacity: canUndo ? 1 : 0.3,
                display: 'flex',
                alignItems: 'center',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (canUndo) e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ↶
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              style={{
                padding: '0.25rem 0.375rem',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                cursor: canRedo ? 'pointer' : 'not-allowed',
                opacity: canRedo ? 1 : 0.3,
                display: 'flex',
                alignItems: 'center',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (canRedo) e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ↷
            </button>
          </div>

          {/* Drawing Tools */}
          <div style={{ 
            display: 'flex', 
            gap: '0.25rem',
            flex: 1
          }}>
            {/* Tools will be rendered here */}
            <DrawingToolbar horizontal={true} />
          </div>

          {/* Select Last Shape Button */}
          <div style={{
            paddingLeft: '0.5rem',
            borderLeft: '1px solid #e0e0e0'
          }}>
            <button
              onClick={() => {
                if (shapes.length > 0) {
                  const lastShape = shapes[shapes.length - 1];
                  selectShape(lastShape.id);
                  // Also switch to select tool to see the selection
                  if (activeTool !== DrawingTool.SELECT) {
                    setActiveTool(DrawingTool.SELECT);
                  }
                }
              }}
              disabled={shapes.length === 0}
              title="Select Last Drawn Shape"
              style={{
                padding: '0.25rem 0.75rem',
                backgroundColor: 'transparent',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: shapes.length > 0 ? 'pointer' : 'not-allowed',
                opacity: shapes.length > 0 ? 1 : 0.3,
                fontSize: '0.75rem',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              onMouseEnter={(e) => {
                if (shapes.length > 0) e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Select Last
            </button>
          </div>

          {/* Zoom Controls */}
          <div style={{
            display: 'flex',
            gap: '0.125rem',
            alignItems: 'center',
            paddingLeft: '0.5rem',
            borderLeft: '1px solid #e0e0e0'
          }}>
            <button
              onClick={() => setZoomLevel(Math.max(0.1, zoomLevel - 0.25))}
              disabled={zoomLevel <= 0.1}
              title="Zoom Out"
              style={{
                padding: '0.25rem',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                cursor: zoomLevel > 0.1 ? 'pointer' : 'not-allowed',
                opacity: zoomLevel > 0.1 ? 1 : 0.3,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                width: '28px',
                height: '28px',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (zoomLevel > 0.1) e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              －
            </button>
            
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              title="Zoom Level"
              style={{
                padding: '0.25rem 0.375rem',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                color: '#666',
                minWidth: '65px',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.125rem center',
                backgroundSize: '14px',
                paddingRight: '1.25rem',
                height: '28px'
              }}
            >
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
              <option value="3">300%</option>
              <option value="4">400%</option>
            </select>
            
            <button
              onClick={() => setZoomLevel(Math.min(4, zoomLevel + 0.25))}
              disabled={zoomLevel >= 4}
              title="Zoom In"
              style={{
                padding: '0.25rem',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                borderRadius: '4px',
                cursor: zoomLevel < 4 ? 'pointer' : 'not-allowed',
                opacity: zoomLevel < 4 ? 1 : 0.3,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                width: '28px',
                height: '28px',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (zoomLevel < 4) e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ＋
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        padding: '1rem'
      }}>
        {/* Properties Panel */}
        {imageData && (
          <aside style={{
            position: 'relative',
            transition: 'width 0.3s ease',
            width: propertiesPanelOpen ? '200px' : '40px',
          }}>
            {/* Toggle Button */}
            <button
              onClick={() => setPropertiesPanelOpen(!propertiesPanelOpen)}
              style={{
                position: 'absolute',
                left: propertiesPanelOpen ? '200px' : '40px',
                top: '1rem',
                transform: 'translateX(-50%)',
                width: '24px',
                height: '48px',
                backgroundColor: 'white',
                border: '1px solid #e0e0e0',
                borderRadius: '0 4px 4px 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                color: '#666',
                boxShadow: '1px 0 2px rgba(0,0,0,0.05)',
                zIndex: 10,
                padding: 0,
                transition: 'left 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              {propertiesPanelOpen ? '◀' : '▶'}
            </button>
            
            {/* Panel Content */}
            <div style={{
              width: propertiesPanelOpen ? '200px' : '40px',
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: propertiesPanelOpen ? '1rem' : '0.5rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: 'calc(100vh - 96px)', // Adjusted for header + toolbar
              transition: 'all 0.3s ease'
            }}>
              {propertiesPanelOpen ? (
                <DrawingToolbar selectedShapes={selectedShapes} />
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem',
                  marginTop: '3rem'
                }}>
                  {/* Minimized indicators */}
                  {selectedShapes.length > 0 && (
                    <div style={{
                      fontSize: '0.625rem',
                      color: '#666',
                      textAlign: 'center'
                    }}>
                      {selectedShapes.length}<br/>selected
                    </div>
                  )}
                  <div 
                    title={`Stroke: ${currentStyle.stroke}`}
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: currentStyle.stroke,
                      borderRadius: '4px',
                      border: '1px solid #ddd'
                    }} 
                  />
                  <div 
                    title={`Width: ${currentStyle.strokeWidth}px`}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: '#666'
                    }}
                  >
                    {currentStyle.strokeWidth}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

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
              scaleX={zoomLevel}
              scaleY={zoomLevel}
              style={{
                border: '1px solid #ddd',
                backgroundColor: '#fafafa',
                cursor: activeTool === 'select' ? 'default' : 'crosshair'
              }}
              onMouseDown={(e) => {
                // Check if we clicked on empty space (the stage itself)
                if (e.target === e.target.getStage()) {
                  if (activeTool === DrawingTool.SELECT) {
                    clearSelection();
                  }
                }
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