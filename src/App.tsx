import { useState, useRef, useEffect } from 'react'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Undo2, Redo2, Copy, Download, FileText, 
  Palette, Ruler, ZoomIn, ZoomOut, RefreshCw,
  AlertTriangle
} from 'lucide-react'
import { ImageUploader } from '@/components/ImageUploader'
import { ColorPicker } from '@/components/ColorPicker'
import { DrawingToolbar } from '@/components/Toolbar'
import { DrawingLayer } from '@/components/Canvas/DrawingLayer'
import { TextInputDialog } from '@/components/TextInputDialog'
import { UserMenu } from '@/components/Auth/UserMenu'
import { FileMenu } from '@/components/FileMenu/FileMenu'
import { SaveIndicator } from '@/components/SaveIndicator'
import { PDFViewer } from '@/components/PDFViewer/PDFViewer'
import { useHistory } from '@/hooks/useHistory'
import { useDrawing } from '@/hooks/useDrawing'
import { useDrawingContext } from '@/contexts/DrawingContext'
import { useAuth } from '@/contexts/AuthContext'
import { useMeasurement } from '@/hooks/useMeasurement'
import { copyCanvasToClipboard, downloadCanvasAsImage } from '@/utils/exportUtils'
import { DrawingTool, type Point, type TextShape, type MeasurementLineShape, type ImageShape } from '@/types/drawing'
import { googleDriveService, type ProjectData } from '@/services/googleDrive'
import { CalibrationDialog } from '@/components/Tools/CalibrationDialog'
import { calculatePixelDistance, calculatePixelsPerUnit } from '@/utils/measurementUtils'
import type { MeasurementUnit } from '@/utils/measurementUtils'

function App() {
  const CANVAS_PADDING = 100
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false)
  const stageRef = useRef<Konva.Stage | null>(null)
  const { shapes, activeTool, clearSelection, addShape, updateShape, currentStyle, selectedShapeIds, selectShape, setActiveTool, deleteSelected, updateStyle } = useDrawing()
  const { state: drawingState, setShapes, setMeasurementCalibration, copySelectedShapes, pasteShapes } = useDrawingContext()
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100%
  const [isLoadingSharedFile, setIsLoadingSharedFile] = useState(false)
  const [sharedFileError, setSharedFileError] = useState<string | null>(null)
  const [loadedFileId, setLoadedFileId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  
  // Get selected shapes
  const selectedShapes = shapes.filter(shape => selectedShapeIds.includes(shape.id))
  
  // Text dialog state
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [textPosition, setTextPosition] = useState<Point | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  
  // Measurement state
  const measurement = useMeasurement(shapes, setShapes, {
    pixelsPerUnit: drawingState.measurementCalibration.pixelsPerUnit,
    unit: drawingState.measurementCalibration.unit,
    calibrationLineId: drawingState.measurementCalibration.calibrationLineId
  })
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false)
  const [pendingCalibrationLine, setPendingCalibrationLine] = useState<MeasurementLineShape | null>(null)
  
  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPageInfo, setPdfPageInfo] = useState<{ current: number; total: number } | null>(null)
  
  const { 
    canUndo, 
    canRedo, 
    pushState, 
    undo, 
    redo, 
    getCurrentState,
    currentIndex 
  } = useHistory()
  
  // Get auth context - try/catch in case it's not available
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch (error) {
    // Auth context not available
  }

  // Helper function to create IMAGE shape from file
  const createImageShapeFromFile = async (file: File): Promise<ImageShape> => {
    const dataURL = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.readAsDataURL(file)
    })
    
    const img = await new Promise<HTMLImageElement>((resolve) => {
      const image = new window.Image()
      image.onload = () => resolve(image)
      image.src = dataURL
    })
    
    // If canvas not initialized, set canvas size based on image
    if (!isCanvasInitialized) {
      setCanvasSize({
        width: img.width + (CANVAS_PADDING * 2),
        height: img.height + (CANVAS_PADDING * 2)
      })
      setIsCanvasInitialized(true)
    }
    
    const imageShape: ImageShape = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: DrawingTool.IMAGE,
      x: CANVAS_PADDING,
      y: CANVAS_PADDING,
      width: img.width,
      height: img.height,
      imageData: dataURL,
      style: {
        stroke: '#ddd',
        strokeWidth: 0,
        opacity: 1
      },
      visible: true,
      locked: false,
      zIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    
    return imageShape
  }

  // Handle shared file loading from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('file');
    
    
    if (fileId && authContext?.isAuthenticated && authContext?.getAccessToken) {
      setIsLoadingSharedFile(true);
      setSharedFileError(null);
      
      const token = authContext.getAccessToken();
      if (token) {
        googleDriveService.initialize(token)
          .then(() => {
            return googleDriveService.loadProject(fileId);
          })
          .then((projectData: ProjectData) => {
            
            // For now, skip loading old format files with background images
            if (projectData.image && projectData.image.data) {
              console.warn('This project uses the old format with background images. Please re-save it in the new format.');
              setSharedFileError('This project uses an old format. Please open it in an older version and re-save.');
              return;
            }
            
            // Load the shapes
            setShapes(projectData.shapes || []);
            
            // Initialize canvas if we have shapes
            if (projectData.shapes && projectData.shapes.length > 0) {
              // Find bounds of all shapes to set canvas size
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              projectData.shapes.forEach(shape => {
                if ('x' in shape && 'y' in shape && 'width' in shape && 'height' in shape) {
                  minX = Math.min(minX, shape.x);
                  minY = Math.min(minY, shape.y);
                  maxX = Math.max(maxX, shape.x + shape.width);
                  maxY = Math.max(maxY, shape.y + shape.height);
                }
              });
              
              if (isFinite(minX)) {
                setCanvasSize({
                  width: maxX + CANVAS_PADDING,
                  height: maxY + CANVAS_PADDING
                });
                setIsCanvasInitialized(true);
              }
            }
            
            // Save the file ID for future saves
            setLoadedFileId(fileId);
            
            // Clear the URL parameter after a short delay to ensure everything loads
            setTimeout(() => {
              const newUrl = window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
            }, 1000);
          })
          .catch((error) => {
            console.error('Failed to load shared file:', error);
            setSharedFileError(error.message || 'Failed to load shared file');
          })
          .finally(() => {
            setIsLoadingSharedFile(false);
          });
      }
    }
  }, [authContext?.isAuthenticated, authContext?.getAccessToken, setShapes]);


  const handleImageUpload = async (file: File) => {
    try {
      const imageShape = await createImageShapeFromFile(file)
      addShape(imageShape)
      setPdfFile(null) // Clear any PDF state
      setPdfPageInfo(null)
      // Switch to select tool to allow immediate manipulation
      if (activeTool !== DrawingTool.SELECT) {
        setActiveTool(DrawingTool.SELECT)
      }
      selectShape(imageShape.id)
    } catch (error) {
      console.error('Failed to load image:', error)
    }
  }
  
  const handlePDFUpload = (file: File) => {
    console.log('PDF Upload:', file.name, file.type, file.size)
    console.log('Setting pdfFile state...')
    setPdfFile(file)
    console.log('PDF state updated')
  }
  
  const handlePDFPageLoad = async (image: HTMLImageElement, pageInfo: { current: number; total: number }) => {
    console.log('PDF page loaded:', pageInfo)
    
    try {
      // Convert the selected page to an image file
      const res = await fetch(image.src)
      const blob = await res.blob()
      const fileName = pdfFile ? `${pdfFile.name} - Page ${pageInfo.current}` : `pdf-page-${pageInfo.current}.png`
      const file = new File([blob], fileName, { type: 'image/png' })
      
      // Create image shape from the PDF page
      const imageShape = await createImageShapeFromFile(file)
      addShape(imageShape)
      
      // Clear PDF state and select the new image
      setPdfFile(null)
      setPdfPageInfo(null)
      setActiveTool(DrawingTool.SELECT)
      selectShape(imageShape.id)
    } catch (err) {
      console.error('Error converting PDF page to shape:', err)
    }
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

  const handleCalibrationConfirm = (value: number, unit: MeasurementUnit) => {
    if (pendingCalibrationLine) {
      const [x1, y1, x2, y2] = pendingCalibrationLine.points;
      const pixelDistance = calculatePixelDistance(x1, y1, x2, y2);
      
      // Set calibration without keeping the line
      const pixelsPerUnit = calculatePixelsPerUnit(pixelDistance, value, unit);
      
      // Update global measurement calibration
      setMeasurementCalibration({
        pixelsPerUnit,
        unit,
        calibrationLineId: null // No calibration line to keep
      });
      
      // Set calibration in measurement hook
      measurement.setCalibration(pixelDistance, value, unit, '');
      
      // Remove the calibration line from shapes
      const filteredShapes = shapes.filter(s => s.id !== pendingCalibrationLine.id);
      
      // Update all existing measurement lines with new calibration
      const updatedShapes = measurement.updateMeasurementLabels(filteredShapes);
      setShapes(updatedShapes);
    }
    
    setCalibrationDialogOpen(false);
    setPendingCalibrationLine(null);
  };

  const handleCalibrationCancel = () => {
    // Delete the pending calibration line
    if (pendingCalibrationLine) {
      const updatedShapes = shapes.filter(s => s.id !== pendingCalibrationLine.id);
      setShapes(updatedShapes);
    }
    
    setCalibrationDialogOpen(false);
    setPendingCalibrationLine(null);
  };

  // Generate unique ID for shapes
  const generateId = () => `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Handle screenshot area selection
  useEffect(() => {
    const handleScreenshotAreaSelected = async (event: Event) => {
      const bounds = (event as CustomEvent).detail;
      if (!stageRef.current || bounds.width < 10 || bounds.height < 10) return;

      try {
        // Get the stage and create a temporary layer
        const stage = stageRef.current;
        const scale = stage.scaleX();
        
        // Convert to data URL of the selected area
        const dataURL = await stage.toDataURL({
          x: bounds.x * scale,
          y: bounds.y * scale,
          width: bounds.width * scale,
          height: bounds.height * scale,
          pixelRatio: 1 / scale
        });

        // Create an IMAGE shape with the captured data
        const imageShape = {
          id: generateId(),
          type: DrawingTool.IMAGE,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          imageData: dataURL,
          style: {
            stroke: '#ddd',
            strokeWidth: 1,
            opacity: 1
          },
          visible: true,
          locked: false,
          zIndex: Math.max(...shapes.map(s => s.zIndex || 0), 0) + 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Add the image shape
        addShape(imageShape);
        
        // Switch back to select tool
        setActiveTool(DrawingTool.SELECT);
        
        // Select the new image
        selectShape(imageShape.id);
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
      }
    };

    window.addEventListener('screenshot-area-selected', handleScreenshotAreaSelected as EventListener);
    return () => {
      window.removeEventListener('screenshot-area-selected', handleScreenshotAreaSelected as EventListener);
    };
  }, [shapes, addShape, setActiveTool, selectShape]);

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
      // Ctrl/Cmd + C for copy shapes (when not in text input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (selectedShapeIds.length > 0) {
            copySelectedShapes();
          } else {
            // If no shapes selected, copy the whole canvas
            handleCopyToClipboard();
          }
        }
      }
      // Ctrl/Cmd + V for paste shapes
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          pasteShapes();
        }
      }
      // Ctrl/Cmd + X for cut shapes
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (selectedShapeIds.length > 0) {
            copySelectedShapes();
            deleteSelected();
          }
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
  }, [canUndo, canRedo, undo, redo, zoomLevel, selectedShapeIds, copySelectedShapes, pasteShapes, deleteSelected])

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
  
  // Handle new measurement and calibration lines
  useEffect(() => {
    const measurementLines = shapes.filter(s => s.type === DrawingTool.MEASURE) as MeasurementLineShape[]
    
    // Check for new calibration line (created by CALIBRATE tool)
    const newCalibrationLine = measurementLines.find(line => 
      line.isCalibration && 
      !line.measurement && 
      Date.now() - line.createdAt < 1000 // Created in the last second
    )
    
    if (newCalibrationLine) {
      // Open calibration dialog for this line
      setPendingCalibrationLine(newCalibrationLine)
      setCalibrationDialogOpen(true)
      measurement.cancelCalibration()
      // Switch back to select tool
      setActiveTool(DrawingTool.SELECT)
    }
    
    // Check for new measurement line (created by MEASURE tool)
    const newMeasurementLine = measurementLines.find(line => 
      !line.isCalibration && 
      !line.measurement && 
      Date.now() - line.createdAt < 1000 // Created in the last second
    )
    
    if (newMeasurementLine && measurement.isCalibrated) {
      // Update with calculated measurement
      const updatedShapes = measurement.updateMeasurementLabels(shapes)
      setShapes(updatedShapes)
    }
  }, [shapes, measurement, updateShape, setShapes, setActiveTool])
  
  // Update measurement lines when calibration or unit changes
  useEffect(() => {
    // Only run if we have calibration and measurement lines
    if (measurement.isCalibrated && shapes.some(s => s.type === DrawingTool.MEASURE && !s.isCalibration)) {
      const updatedShapes = measurement.updateMeasurementLabels(shapes);
      // Only update if shapes actually changed
      if (JSON.stringify(updatedShapes) !== JSON.stringify(shapes)) {
        setShapes(updatedShapes);
      }
    }
  }, [measurement.calibration.pixelsPerUnit, measurement.calibration.unit, measurement.isCalibrated])

  // Show login screen if not authenticated or auth context not available
  if (!authContext || !authContext.isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '3rem',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <Palette size={48} color="#4a90e2" style={{ marginBottom: '1rem' }} />
          </motion.div>
          <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Image Markup App</h1>
          <p style={{ marginBottom: '2rem', color: '#666' }}>
            Sign in with Google to start creating and saving your image annotations
          </p>
          <UserMenu />
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{ 
        height: '100vh', 
        backgroundColor: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
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
          gap: '0.5rem',
          position: 'relative'
        }}>
          <Palette size={20} color="#4a90e2" />
          <h1 style={{ 
            margin: 0, 
            fontSize: '1rem',
            fontWeight: '600',
            color: '#333'
          }}>
            {loadedFileId ? 'Saved Project' : 'New Project'}
          </h1>
          <SaveIndicator status={saveStatus} lastSaved={lastSaved} />
        </div>

        {/* Right: Quick Actions */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem',
          alignItems: 'center'
        }}>
          <FileMenu 
            stageRef={stageRef} 
            imageData={null} 
            initialFileId={loadedFileId}
            onSaveStatusChange={(status, saved) => {
              setSaveStatus(status);
              setLastSaved(saved);
            }}
          />
          {isCanvasInitialized && (
            <>
              <button
                onClick={() => {
                  clearSelection();
                  setShapes([]);
                  setLoadedFileId(null);
                  setSaveStatus('saved');
                  setCanvasSize(null);
                  setIsCanvasInitialized(false);
                }}
                title="New Project"
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
                <FileText size={14} />
                <span>New</span>
              </button>
              <button
                onClick={() => {
                  if (selectedShapeIds.length > 0) {
                    copySelectedShapes();
                  } else {
                    handleCopyToClipboard();
                  }
                }}
                title={selectedShapeIds.length > 0 ? "Copy Shapes (Ctrl+C)" : "Copy Canvas (Ctrl+C)"}
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
                <Copy size={14} />
                <span>Copy</span>
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
                <Download size={14} />
                <span>Export</span>
              </button>
            </>
          )}
          <UserMenu />
        </div>
      </header>

      {/* Horizontal Toolbar */}
      {isCanvasInitialized && (
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
              <Undo2 size={16} />
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
              <Redo2 size={16} />
            </button>
          </div>

          {/* Drawing Tools */}
          <div style={{ 
            display: 'flex', 
            gap: '0.25rem',
            flex: 1
          }}>
            {/* Tools will be rendered here */}
            <DrawingToolbar horizontal={true} selectedShapes={selectedShapes} />
          </div>

          {/* Color Picker */}
          {isCanvasInitialized && (
            <div style={{
              paddingLeft: '0.5rem',
              borderLeft: '1px solid #e0e0e0'
            }}>
              <ColorPicker
                strokeColor={currentStyle.stroke}
                fillColor={currentStyle.fill}
                onStrokeChange={(color) => updateStyle({ stroke: color })}
                onFillChange={(color) => updateStyle({ fill: color })}
                showFill={[DrawingTool.RECTANGLE, DrawingTool.CIRCLE, DrawingTool.STAR].includes(activeTool as any)}
              />
            </div>
          )}

          {/* Measurement Calibration */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            paddingLeft: '0.5rem',
            borderLeft: '1px solid #e0e0e0'
          }}>
            {!measurement.isCalibrated ? (
                <button
                  onClick={() => {
                    // Reset zoom to 1 when calibrating to avoid coordinate issues
                    if (zoomLevel !== 1) {
                      setZoomLevel(1);
                    }
                    setActiveTool(DrawingTool.CALIBRATE);
                    measurement.startCalibration();
                  }}
                  style={{
                    padding: '0.25rem 0.75rem',
                    backgroundColor: '#ff9800',
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
                    e.currentTarget.style.backgroundColor = '#f57c00';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ff9800';
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>Set Scale</span>
                </button>
              ) : (
                <>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.75rem',
                    color: '#666'
                  }}>
                    <Ruler size={14} />
                    <span>{measurement.calibration.pixelsPerUnit?.toFixed(2)} px/{measurement.calibration.unit}</span>
                  </div>
                  <select
                    value={measurement.calibration.unit}
                    onChange={(e) => {
                      measurement.changeUnit(e.target.value as MeasurementUnit);
                      // Also update global state
                      if (drawingState.measurementCalibration.pixelsPerUnit !== null) {
                        setMeasurementCalibration({
                          ...drawingState.measurementCalibration,
                          unit: e.target.value
                        });
                      }
                    }}
                    style={{
                      padding: '0.125rem 0.25rem',
                      fontSize: '0.75rem',
                      backgroundColor: 'white',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                    <option value="ft">ft</option>
                  </select>
                  <button
                    onClick={() => {
                      // Reset zoom to 1 when calibrating to avoid coordinate issues
                      if (zoomLevel !== 1) {
                        setZoomLevel(1);
                      }
                      setActiveTool(DrawingTool.CALIBRATE);
                      measurement.startCalibration();
                    }}
                    title="Recalibrate"
                    style={{
                      padding: '0.25rem',
                      backgroundColor: 'transparent',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      color: '#666'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </>
              )}
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
              <ZoomOut size={16} />
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
              <ZoomIn size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        overflow: 'hidden',
        minHeight: 0
      }}>
        {/* Properties Panel */}
        {isCanvasInitialized && (
          <aside style={{
            position: 'relative',
            transition: 'width 0.3s ease',
            width: propertiesPanelOpen ? '200px' : '40px',
            flexShrink: 0
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
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          position: 'relative',
          overflow: 'auto'
        }}>
          {isLoadingSharedFile ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              gap: '1rem'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '3px solid #e0e0e0',
                borderTopColor: '#4285f4',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <p style={{ color: '#666', fontSize: '0.875rem' }}>Loading shared project...</p>
            </div>
          ) : sharedFileError ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              gap: '1rem',
              padding: '2rem'
            }}>
              <div style={{
                padding: '1rem',
                backgroundColor: '#ffebee',
                color: '#c62828',
                borderRadius: '8px',
                maxWidth: '400px',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>Failed to load shared project</h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>{sharedFileError}</p>
                <button
                  onClick={() => {
                    setSharedFileError(null);
                    window.history.replaceState({}, document.title, window.location.pathname);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#c62828',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : !isCanvasInitialized ? (
            <div style={{ width: '100%', height: '100%' }}>
              <ImageUploader onImageUpload={handleImageUpload} onPDFUpload={handlePDFUpload} />
            </div>
          ) : canvasSize ? (
            <div style={{ 
              position: 'relative', 
              display: 'inline-block',
              padding: '20px',
              width: canvasSize.width * zoomLevel,
              height: canvasSize.height * zoomLevel
            }}>
              {/* Show calibration instructions when CALIBRATE tool is active */}
              {activeTool === DrawingTool.CALIBRATE && (
                <div style={{
                  position: 'fixed',
                  top: '120px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(74, 144, 226, 0.95)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  zIndex: 100,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}>
                  Click and drag to draw a reference line for calibration
                </div>
              )}
              <Stage
                width={canvasSize.width}
                height={canvasSize.height}
                ref={stageRef}
                scaleX={zoomLevel}
                scaleY={zoomLevel}
                style={{
                  border: '1px solid #ddd',
                  backgroundColor: '#fafafa',
                  cursor: activeTool === DrawingTool.SELECT ? 'default' : 'crosshair'
                }}
              >
                {/* Canvas background - no longer needed as shapes include images */}
                
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
            </div>
          ) : null}
          
          {/* PDF Viewer - shows when PDF is loaded */}
          {pdfFile && (
            <PDFViewer
              file={pdfFile}
              onPageLoad={handlePDFPageLoad}
              onError={(error) => {
                console.error('PDF Error:', error)
                setPdfFile(null)
                setPdfPageInfo(null)
              }}
            />
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
      
      {/* Calibration Dialog */}
      <CalibrationDialog
        isOpen={calibrationDialogOpen}
        pixelDistance={pendingCalibrationLine ? calculatePixelDistance(...pendingCalibrationLine.points) : 0}
        onConfirm={handleCalibrationConfirm}
        onCancel={handleCalibrationCancel}
      />
      
    </motion.div>
  )
}

export default App