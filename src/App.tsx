import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { ImageUploader } from '@/components/ImageUploader'
import { DrawingToolbar } from '@/components/Toolbar'
import { DrawingLayer } from '@/components/Canvas/DrawingLayer'
import { useImage } from '@/hooks/useImage'
import { useHistory } from '@/hooks/useHistory'
import { useDrawing } from '@/hooks/useDrawing'
import { calculateImageFit } from '@/utils/imageHelpers'
import { saveStageState, restoreStageState } from '@/utils/stageHelpers'

function App() {
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const stageRef = useRef<Konva.Stage>(null)
  const { imageData, loadImage, clearImage } = useImage()
  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null)
  const { shapes, activeTool } = useDrawing()
  const { 
    canUndo, 
    canRedo, 
    pushState, 
    undo, 
    redo, 
    getCurrentState 
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

  // Apply history state to stage when it changes
  useEffect(() => {
    const currentState = getCurrentState()
    if (currentState && stageRef.current) {
      try {
        const stageData = JSON.parse(currentState.data)
        // We'll implement stage restoration after we have drawing tools
        console.log('Would restore stage:', stageData)
      } catch (error) {
        console.error('Failed to restore stage:', error)
      }
    }
  }, [getCurrentState])

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
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
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
              <DrawingLayer stageRef={stageRef} />
            </Stage>
          )}
        </section>
      </main>
    </div>
  )
}

export default App