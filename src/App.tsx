import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Undo2, Redo2, Copy, Download, FileText, 
  Palette, Ruler, ZoomIn, ZoomOut, RefreshCw,
  AlertTriangle
} from 'lucide-react'
import { ImageUploader } from '@/components/ImageUploader'
import { DrawingToolbar } from '@/components/Toolbar'
import { PropertiesSection } from '@/components/Toolbar/PropertiesSection'
import { DrawingLayer } from '@/components/Canvas/DrawingLayer'
import { TextInputDialog } from '@/components/TextInputDialog'
import { UserMenu } from '@/components/Auth/UserMenu'
import { FileMenu } from '@/components/FileMenu/FileMenu'
import { EditMenu } from '@/components/EditMenu'
import { SaveIndicator } from '@/components/SaveIndicator'
import { PDFViewer } from '@/components/PDFViewer/PDFViewer'
import { useHistory } from '@/hooks/useHistory'
import { useDrawing } from '@/hooks/useDrawing'
import { useDrawingContext } from '@/contexts/DrawingContext'
import { useAuth } from '@/contexts/AuthContext'
import { useMeasurement } from '@/hooks/useMeasurement'
import { copyCanvasToClipboard, downloadCanvasAsImage } from '@/utils/exportUtils'
import { DrawingTool, type Point, type TextShape, type CalloutShape, type MeasurementLineShape, type ImageShape } from '@/types/drawing'
import { googleDriveService, type ProjectData } from '@/services/googleDrive'
import { CalibrationDialog } from '@/components/Tools/CalibrationDialog'
import { calculatePixelDistance, calculatePixelsPerUnit } from '@/utils/measurementUtils'
import type { MeasurementUnit } from '@/utils/measurementUtils'
import { calculateScaledDimensions, ImageSource, isPDFSourcedImage, isLikelyScreenshot } from '@/utils/imageScaling'

function App() {
  const CANVAS_PADDING = 100
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [canvasBackground, setCanvasBackground] = useState('#ffffff')
  const stageRef = useRef<Konva.Stage | null>(null)
  const { shapes, activeTool, clearSelection, addShape, updateShape, currentStyle, selectedShapeIds, selectShape, selectMultiple, setActiveTool, deleteSelected, updateStyle } = useDrawing()
  const { state: drawingState, setShapes, setMeasurementCalibration, copySelectedShapes, pasteShapes } = useDrawingContext()
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100%
  const [isLoadingSharedFile, setIsLoadingSharedFile] = useState(false)
  const [sharedFileError, setSharedFileError] = useState<string | null>(null)
  const [loadedFileId, setLoadedFileId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [documentName, setDocumentName] = useState('Untitled')
  const [isEditingName, setIsEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  
  // Get selected shapes
  const selectedShapes = shapes.filter(shape => selectedShapeIds.includes(shape.id))
  
  // Text dialog state
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [textPosition, setTextPosition] = useState<Point | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  
  // Handle editing existing text shapes
  const handleTextShapeEdit = (shapeId: string) => {
    const shape = shapes.find(s => s.id === shapeId);
    if (shape && (shape.type === DrawingTool.TEXT || shape.type === DrawingTool.CALLOUT)) {
      setEditingTextId(shapeId);
      setTextDialogOpen(true);
    }
  }
  
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
    console.error('❌ App: Failed to get auth context:', error);
    // Auth context not available
  }

  // Helper function to create IMAGE shape from file
  const createImageShapeFromFile = async (file: File, source?: ImageSource): Promise<ImageShape> => {
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
    
    // Determine source if not provided
    let imageSource = source;
    if (!imageSource) {
      if (isPDFSourcedImage(file.name)) {
        imageSource = ImageSource.PDF;
      } else if (isLikelyScreenshot({ width: img.width, height: img.height })) {
        imageSource = ImageSource.SCREENSHOT;
      } else {
        imageSource = ImageSource.UPLOAD;
      }
    }
    
    // Define canvas constraints
    const MAX_INITIAL_CANVAS_WIDTH = 1400;
    const MAX_INITIAL_CANVAS_HEIGHT = 900;
    const MIN_CANVAS_WIDTH = 800;
    const MIN_CANVAS_HEIGHT = 600;
    
    // Determine the effective canvas size for scaling
    let effectiveCanvasSize = canvasSize;
    if (!effectiveCanvasSize) {
      // Use the maximum canvas size for scaling calculations
      effectiveCanvasSize = {
        width: MAX_INITIAL_CANVAS_WIDTH,
        height: MAX_INITIAL_CANVAS_HEIGHT
      };
    }
    
    // Calculate scaled dimensions based on source
    const scaledDimensions = calculateScaledDimensions(
      { width: img.width, height: img.height },
      effectiveCanvasSize,
      imageSource,
      CANVAS_PADDING
    );
    
    // If canvas not initialized, set canvas size based on scaled image
    if (!isCanvasInitialized) {
      // Calculate canvas size based on scaled image
      let canvasWidth = scaledDimensions.width + (CANVAS_PADDING * 2);
      let canvasHeight = scaledDimensions.height + (CANVAS_PADDING * 2);
      
      // Apply maximum limits
      canvasWidth = Math.min(canvasWidth, MAX_INITIAL_CANVAS_WIDTH);
      canvasHeight = Math.min(canvasHeight, MAX_INITIAL_CANVAS_HEIGHT);
      
      // Apply minimum limits
      canvasWidth = Math.max(canvasWidth, MIN_CANVAS_WIDTH);
      canvasHeight = Math.max(canvasHeight, MIN_CANVAS_HEIGHT);
      
      setCanvasSize({
        width: canvasWidth,
        height: canvasHeight
      })
      setIsCanvasInitialized(true)
    }
    
    // Center the image if canvas was capped
    let imageX = CANVAS_PADDING;
    let imageY = CANVAS_PADDING;
    
    if (canvasSize) {
      // Center horizontally if image is smaller than available space
      const availableWidth = canvasSize.width - (CANVAS_PADDING * 2);
      if (scaledDimensions.width < availableWidth) {
        imageX = CANVAS_PADDING + (availableWidth - scaledDimensions.width) / 2;
      }
      
      // Center vertically if image is smaller than available space
      const availableHeight = canvasSize.height - (CANVAS_PADDING * 2);
      if (scaledDimensions.height < availableHeight) {
        imageY = CANVAS_PADDING + (availableHeight - scaledDimensions.height) / 2;
      }
    }
    
    const imageShape: ImageShape = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: DrawingTool.IMAGE,
      x: imageX,
      y: imageY,
      width: scaledDimensions.width,
      height: scaledDimensions.height,
      imageData: dataURL,
      style: {
        stroke: 'transparent',
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
          .then(({ projectData, fileName }) => {
            
            // For now, skip loading old format files with background images
            if (projectData.image && projectData.image.data) {
              console.warn('This project uses the old format with background images. Please re-save it in the new format.');
              setSharedFileError('This project uses an old format. Please open it in an older version and re-save.');
              return;
            }
            
            // Set the document name
            let displayName = fileName;
            if (fileName.startsWith('Markup - ')) {
              displayName = fileName.substring(9); // Remove "Markup - " prefix
            }
            setDocumentName(displayName);
            
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
      setPdfFile(null) // Clear any PDF state
      setPdfPageInfo(null)
      // Switch to select tool first
      setActiveTool(DrawingTool.SELECT)
      // Add shape - this will automatically select it
      addShape(imageShape)
    } catch (error) {
      console.error('Failed to load image:', error)
    }
  }
  
  const handlePDFUpload = (file: File) => {
    setPdfFile(file)
  }
  
  const handlePDFPageLoad = async (image: HTMLImageElement, pageInfo: { current: number; total: number }) => {
    
    try {
      // Convert the selected page to an image file
      const res = await fetch(image.src)
      const blob = await res.blob()
      const fileName = pdfFile ? `${pdfFile.name} - Page ${pageInfo.current}` : `pdf-page-${pageInfo.current}.png`
      const file = new File([blob], fileName, { type: 'image/png' })
      
      // Create image shape from the PDF page
      const imageShape = await createImageShapeFromFile(file, ImageSource.PDF)
      
      // Clear PDF state
      setPdfFile(null)
      setPdfPageInfo(null)
      
      // Switch to select tool first
      setActiveTool(DrawingTool.SELECT)
      
      // Add shape - this will automatically select it
      addShape(imageShape)
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
      // Show success feedback
      const button = document.querySelector('div[title*="Copy"]') as HTMLElement;
      if (button) {
        const originalTitle = button.title;
        button.title = 'Copied!';
        button.style.backgroundColor = '#4caf50';
        button.style.color = 'white';
        setTimeout(() => {
          button.title = originalTitle;
          button.style.backgroundColor = 'transparent';
          button.style.color = '#5f6368';
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('Failed to copy to clipboard. Your browser may not support this feature.');
      }
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
      if (!stageRef.current || bounds.width < 10 || bounds.height < 10 || !canvasSize) return;

      try {
        const scale = stageRef.current.scaleX();
        
        // Use the existing stage's toDataURL to capture exactly what's visible
        // This will include all transformations, rotations, etc.
        const dataURL = stageRef.current.toDataURL({
          x: bounds.x * scale,
          y: bounds.y * scale,
          width: bounds.width * scale,
          height: bounds.height * scale,
          pixelRatio: 1 / scale // Compensate for zoom level
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
            stroke: 'transparent',  // No border by default
            strokeWidth: 0,
            opacity: 1
          },
          visible: true,
          locked: false,
          zIndex: Math.max(...shapes.map(s => s.zIndex || 0), 0) + 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Add the shape first
        addShape(imageShape);
        
        // Switch to select tool immediately
        setActiveTool(DrawingTool.SELECT);
        
        // Force selection after a delay for screenshots
        setTimeout(() => {
          selectShape(imageShape.id);
        }, 150);
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
      }
    };

    window.addEventListener('screenshot-area-selected', handleScreenshotAreaSelected as EventListener);
    return () => {
      window.removeEventListener('screenshot-area-selected', handleScreenshotAreaSelected as EventListener);
    };
  }, [shapes, addShape, setActiveTool, selectShape, canvasSize, canvasBackground, showGrid]);

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

  // Handle paste events for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't handle paste if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          
          const blob = item.getAsFile();
          if (!blob) continue;

          try {
            // Convert blob to File
            const file = new File([blob], 'pasted-image.png', { type: blob.type });
            
            // Create image shape from pasted file
            const imageShape = await createImageShapeFromFile(file, ImageSource.PASTE);
            
            // If pasting into existing canvas, offset the position
            if (isCanvasInitialized && shapes.length > 0) {
              // Find a good position that doesn't overlap too much
              let offsetX = 50;
              let offsetY = 50;
              
              // Check if there are recent shapes at the default position
              const recentShapes = shapes.slice(-3);
              const hasOverlap = recentShapes.some(s => 
                'x' in s && 'y' in s && 
                Math.abs(s.x - CANVAS_PADDING) < 50 && 
                Math.abs(s.y - CANVAS_PADDING) < 50
              );
              
              if (hasOverlap) {
                // Offset based on number of shapes
                offsetX = 50 + (shapes.length % 5) * 30;
                offsetY = 50 + (shapes.length % 5) * 30;
              }
              
              imageShape.x = CANVAS_PADDING + offsetX;
              imageShape.y = CANVAS_PADDING + offsetY;
            }
            
            // Switch to select tool first
            setActiveTool(DrawingTool.SELECT);
            // Add shape - this will automatically select it
            addShape(imageShape);
          } catch (error) {
            console.error('Failed to paste image:', error);
          }
          
          // Only handle the first image
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isCanvasInitialized, shapes, addShape, setActiveTool]);
  
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

  // Show loading screen while checking authentication
  if (!authContext || authContext.isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
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
          <p style={{ color: '#666', fontSize: '0.875rem' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!authContext.isAuthenticated) {
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
      {/* Header - Google Docs Style */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0', display: 'flex' }}>
        {/* Logo spanning both rows */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 0.5rem',
        }}>
          <Palette size={32} color="#4a90e2" />
        </div>
        
        {/* Center section with two rows */}
        <div style={{ flex: 1 }}>
          {/* Top Row: Filename and actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: '24px',
            padding: '0.375rem 0.5rem 0'
          }}>
            {/* File Name and save indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  onBlur={() => {
                    setIsEditingName(false);
                    if (documentName.trim() === '') {
                      setDocumentName('Untitled');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setIsEditingName(false);
                      if (documentName.trim() === '') {
                        setDocumentName('Untitled');
                      }
                    } else if (e.key === 'Escape') {
                      setDocumentName(loadedFileId ? 'Saved Project' : 'Untitled');
                      setIsEditingName(false);
                    }
                  }}
                  style={{
                    margin: 0,
                    padding: '0.125rem 0.25rem',
                    fontSize: '1rem',
                    fontWeight: '400',
                    color: '#202124',
                    lineHeight: '1',
                    border: '1px solid #dadce0',
                    borderRadius: '4px',
                    backgroundColor: '#fff',
                    outline: 'none',
                    minWidth: '200px',
                  }}
                  autoFocus
                />
              ) : (
                <h1 
                  onClick={() => setIsEditingName(true)}
                  style={{ 
                    margin: 0, 
                    fontSize: '1rem',
                    fontWeight: '400',
                    color: '#202124',
                    lineHeight: '1',
                    cursor: 'text',
                    padding: '0.125rem 0.25rem',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f3f4';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {documentName}
                </h1>
              )}
              <SaveIndicator status={saveStatus} lastSaved={lastSaved} />
            </div>
          </div>

          {/* Menu Bar Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: '28px',
            padding: '0 0.5rem 0.125rem',
          }}>
            <FileMenu 
              stageRef={stageRef} 
              imageData={null} 
              initialFileId={loadedFileId}
              documentName={documentName}
              onSaveStatusChange={(status, saved) => {
                setSaveStatus(status);
                setLastSaved(saved);
              }}
              onProjectLoad={(projectData, fileName) => {
                // Clear any existing canvas state
                clearSelection();
                setCanvasSize(null);
                setIsCanvasInitialized(false);
                setPdfFile(null);
                setPdfPageInfo(null);
                
                // Extract the name without the "Markup - " prefix if it exists
                let displayName = fileName;
                if (fileName.startsWith('Markup - ')) {
                  displayName = fileName.substring(9); // Remove "Markup - " prefix
                }
                setDocumentName(displayName);
                
                // Re-initialize canvas if we have shapes
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
                      width: Math.min(maxX + CANVAS_PADDING, 1400),
                      height: Math.min(maxY + CANVAS_PADDING, 900)
                    });
                    setIsCanvasInitialized(true);
                  }
                }
              }}
              onNew={() => {
                clearSelection();
                setShapes([]);
                setLoadedFileId(null);
                setSaveStatus('saved');
                setCanvasSize(null);
                setIsCanvasInitialized(false);
                setDocumentName('Untitled');
              }}
              onExport={handleDownloadImage}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid(!showGrid)}
              canvasBackground={canvasBackground}
              onChangeBackground={setCanvasBackground}
            />
            
            {isCanvasInitialized && (
              <EditMenu
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                canCopy={selectedShapeIds.length > 0 || isCanvasInitialized}
                onCopy={() => {
                  if (selectedShapeIds.length > 0) {
                    copySelectedShapes();
                  } else {
                    handleCopyToClipboard();
                  }
                }}
                hasSelection={selectedShapeIds.length > 0}
                onDelete={deleteSelected}
                onSelectAll={() => {
                  const allShapeIds = shapes.map(s => s.id);
                  selectMultiple(allShapeIds);
                }}
              />
            )}
          </div>
        </div>
        
        {/* User profile spanning both rows */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 0.5rem',
          gap: '0.5rem'
        }}>
          {isCanvasInitialized && (
            <div 
              onClick={() => {
                handleCopyToClipboard();
              }}
              style={{
                padding: '0.375rem',
                backgroundColor: 'transparent',
                border: '1px solid #ddd',
                cursor: 'pointer',
                color: '#5f6368',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f3f4';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
              role="button"
              title="Copy canvas to clipboard"
            >
              <Copy size={18} style={{ pointerEvents: 'none' }} />
            </div>
          )}
          <UserMenu />
        </div>
      </div>

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
          {/* Drawing Tools */}
          <div style={{ 
            display: 'flex', 
            gap: '0.25rem',
            paddingRight: '0.75rem',
            borderRight: '1px solid #e0e0e0'
          }}>
            <DrawingToolbar horizontal={true} selectedShapes={selectedShapes} />
          </div>

          {/* Properties Section - Dynamic based on tool/selection */}
          <PropertiesSection
            activeTool={activeTool}
            currentStyle={currentStyle}
            selectedShapes={selectedShapes}
            onStyleChange={updateStyle}
            updateShape={updateShape}
          />

          {/* Right-side controls */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            marginLeft: 'auto'
          }}>

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
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
              <option value="1.75">175%</option>
              <option value="2">200%</option>
              <option value="2.25">225%</option>
              <option value="2.5">250%</option>
              <option value="2.75">275%</option>
              <option value="3">300%</option>
              <option value="3.25">325%</option>
              <option value="3.5">350%</option>
              <option value="3.75">375%</option>
              <option value="4">400%</option>
              {/* Add current zoom level if it's not in the list */}
              {![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4].includes(zoomLevel) && (
                <option value={zoomLevel}>{Math.round(zoomLevel * 100)}%</option>
              )}
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
              padding: 20,
              width: 'fit-content',
              height: 'fit-content'
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
              <div style={{
                width: canvasSize.width * zoomLevel,
                height: canvasSize.height * zoomLevel,
                overflow: 'visible'
              }}>
                <Stage
                  width={canvasSize.width * zoomLevel}
                  height={canvasSize.height * zoomLevel}
                  ref={stageRef}
                  scaleX={1}
                  scaleY={1}
                  style={{
                    border: '1px solid #ddd',
                    backgroundColor: '#fafafa',
                    cursor: activeTool === DrawingTool.SELECT ? 'default' : 'crosshair'
                  }}
                >
                {/* Canvas background layer */}
                <Layer scaleX={zoomLevel} scaleY={zoomLevel}>
                  {/* Background color */}
                  <Rect
                    x={0}
                    y={0}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    fill={canvasBackground}
                  />
                  
                  {/* Optional grid */}
                  {showGrid && (() => {
                    const gridSize = 20;
                    const lines = [];
                    
                    // Vertical lines
                    for (let x = 0; x <= canvasSize.width; x += gridSize) {
                      lines.push(
                        <Line
                          key={`v-${x}`}
                          points={[x, 0, x, canvasSize.height]}
                          stroke="#e0e0e0"
                          strokeWidth={1}
                          listening={false}
                        />
                      );
                    }
                    
                    // Horizontal lines
                    for (let y = 0; y <= canvasSize.height; y += gridSize) {
                      lines.push(
                        <Line
                          key={`h-${y}`}
                          points={[0, y, canvasSize.width, y]}
                          stroke="#e0e0e0"
                          strokeWidth={1}
                          listening={false}
                        />
                      );
                    }
                    
                    return lines;
                  })()}
                </Layer>
                
                {/* Drawing Layer for annotations */}
                <DrawingLayer 
                  stageRef={stageRef}
                  zoomLevel={zoomLevel}
                  onTextClick={(pos) => {
                    setTextPosition(pos);
                    setEditingTextId(null);
                    setTextDialogOpen(true);
                  }}
                  onTextShapeEdit={handleTextShapeEdit}
                  onImageToolComplete={(bounds) => {
                    // Create file input and show picker
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,.pdf,application/pdf';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        try {
                          // Check if it's a PDF
                          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                            // Handle PDF - show PDF viewer
                            setPdfFile(file);
                            // Cancel the drawing operation since PDF viewer will handle it
                            setActiveTool(DrawingTool.SELECT);
                          } else {
                            // Handle regular image
                            const imageShape = await createImageShapeFromFile(file);
                            
                            // Calculate dimensions that fit within bounds while maintaining aspect ratio
                            const imageAspectRatio = imageShape.width / imageShape.height;
                            const boundsAspectRatio = bounds.width / bounds.height;
                            
                            let finalWidth, finalHeight;
                            
                            if (imageAspectRatio > boundsAspectRatio) {
                              // Image is wider than bounds - fit to width
                              finalWidth = bounds.width;
                              finalHeight = bounds.width / imageAspectRatio;
                            } else {
                              // Image is taller than bounds - fit to height
                              finalHeight = bounds.height;
                              finalWidth = bounds.height * imageAspectRatio;
                            }
                            
                            // Center the image within the drawn bounds
                            imageShape.x = bounds.x + (bounds.width - finalWidth) / 2;
                            imageShape.y = bounds.y + (bounds.height - finalHeight) / 2;
                            imageShape.width = finalWidth;
                            imageShape.height = finalHeight;
                            
                            // Add to canvas and switch to select tool
                            addShape(imageShape);
                            setActiveTool(DrawingTool.SELECT);
                            selectShape(imageShape.id);
                          }
                        } catch (error) {
                          console.error('Failed to load file:', error);
                        }
                      }
                    };
                    input.click();
                  }}
                />
              </Stage>
              </div>
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
        initialText={editingTextId ? (shapes.find(s => s.id === editingTextId) as TextShape | CalloutShape)?.text || '' : ''}
        initialFontSize={editingTextId ? (shapes.find(s => s.id === editingTextId) as TextShape | CalloutShape)?.fontSize || 16 : 16}
        initialFontFamily={editingTextId ? (shapes.find(s => s.id === editingTextId) as TextShape | CalloutShape)?.fontFamily || 'Arial' : currentStyle.fontFamily || 'Arial'}
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
            // Switch to select tool after creating text
            setActiveTool(DrawingTool.SELECT);
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