import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { ImageUploader } from '@/components/ImageUploader'
import { useImage } from '@/hooks/useImage'
import { calculateImageFit } from '@/utils/imageHelpers'

function App() {
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const stageRef = useRef<Konva.Stage>(null)
  const { imageData, loadImage, clearImage } = useImage()
  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null)

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
              <p style={{ color: '#666', fontSize: '0.875rem' }}>Drawing tools coming soon...</p>
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
                backgroundColor: '#fafafa'
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
            </Stage>
          )}
        </section>
      </main>
    </div>
  )
}

export default App