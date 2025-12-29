import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import type { FileType, UploadError } from '@/types/canvas';
import { isHeicFile, convertHeicToJpeg } from '@/utils/heicConverter';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  onPDFUpload?: (file: File) => void;
  maxSizeMB?: number;
}

const ACCEPTED_IMAGE_TYPES: FileType[] = ['image/jpeg', 'image/png', 'image/jpg', 'image/heic', 'image/heif'];
const ACCEPTED_PDF_TYPES = ['application/pdf'];
const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_PDF_TYPES];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUpload, 
  onPDFUpload,
  maxSizeMB = 10 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const validateFile = useCallback((file: File): UploadError | null => {
    // Check file type
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type as FileType);
    const isPDF = ACCEPTED_PDF_TYPES.includes(file.type);
    // HEIC files from iPhone often have empty/incorrect MIME type, so check by extension too
    const isHeic = isHeicFile(file);
    
    if (!isImage && !isPDF && !isHeic) {
      return { 
        message: 'Please upload only JPG, PNG, HEIC images or PDF files', 
        type: 'type' 
      };
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return { 
        message: `File size must be less than ${maxSizeMB}MB`, 
        type: 'size' 
      };
    }

    return null;
  }, [maxSizeMB]);

  const handleFile = useCallback(async (file: File): Promise<void> => {
    const error = validateFile(file);
    if (error) {
      setError(error);
      return;
    }

    setError(null);
    
    // Check if it's a PDF
    if (file.type === 'application/pdf') {
      if (onPDFUpload) {
        onPDFUpload(file);
      } else {
        setError({ 
          message: 'PDF support is not enabled', 
          type: 'type' 
        });
      }
      return;
    }
    
    // Check if it's a HEIC file and convert to JPEG
    if (isHeicFile(file)) {
      try {
        setIsConverting(true);
        const convertedFile = await convertHeicToJpeg(file);
        setIsConverting(false);
        onImageUpload(convertedFile);
      } catch (err) {
        setIsConverting(false);
        setError({
          message: err instanceof Error ? err.message : 'Failed to convert HEIC image',
          type: 'type'
        });
      }
    } else {
      onImageUpload(file);
    }
  }, [onImageUpload, onPDFUpload, validateFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = (): void => {
    fileInputRef.current?.click();
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  // Enhanced paste handler
  const handlePaste = useCallback(async (e: ClipboardEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    
    // Method 1: Check DataTransfer items (most compatible)
    if (e.clipboardData && e.clipboardData.items) {
      const items = e.clipboardData.items;
      const itemsArray = Array.from(items);
      
      // Look for image items
      for (let i = 0; i < itemsArray.length; i++) {
        const item = itemsArray[i];
        
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && file.type.startsWith('image/')) {
            handleFile(file);
            return;
          }
        }
      }
    }
    
    // Method 2: Try Clipboard API (requires HTTPS in production)
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        
        for (const clipboardItem of clipboardItems) {
          for (const type of clipboardItem.types) {
            if (type.startsWith('image/')) {
              try {
                const blob = await clipboardItem.getType(type);
                const file = new File([blob], `pasted-image-${Date.now()}.png`, { 
                  type: blob.type || 'image/png' 
                });
                handleFile(file);
                return;
              } catch {
                // Silently fail for individual type errors
              }
            }
          }
        }
      } catch {
        // Silently fail if clipboard API is not available
      }
    }
    
    setError({ 
      message: 'No image found in clipboard. Try copying an image first.', 
      type: 'type' 
    });
    
    // Clear error after 3 seconds
    setTimeout(() => setError(null), 3000);
  }, [handleFile]);

  // Set up paste event listeners
  useEffect(() => {
    // Focus container on mount
    const container = document.querySelector('[data-paste-target="true"]');
    if (container instanceof HTMLElement) {
      container.focus();
    }

    // Add paste listener to both container and document
    const pasteHandler = (e: Event): void => {
      handlePaste(e as ClipboardEvent);
    };
    
    // Try to capture paste events at multiple levels
    document.addEventListener('paste', pasteHandler, true); // Capture phase
    document.addEventListener('paste', pasteHandler, false); // Bubble phase
    window.addEventListener('paste', pasteHandler);
    
    return () => {
      document.removeEventListener('paste', pasteHandler, true);
      document.removeEventListener('paste', pasteHandler, false);
      window.removeEventListener('paste', pasteHandler);
    };
  }, [handlePaste]);

  return (
    <div 
      data-paste-target="true"
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        outline: 'none'
      }}
      onKeyDown={async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
          e.preventDefault();
          
          // Directly read clipboard when Ctrl+V is pressed
          try {
            const clipboardItems = await navigator.clipboard.read();
            
            for (const clipboardItem of clipboardItems) {
              for (const type of clipboardItem.types) {
                if (type.startsWith('image/')) {
                  const blob = await clipboardItem.getType(type);
                  const file = new File([blob], `pasted-image-${Date.now()}.png`, { 
                    type: blob.type || 'image/png' 
                  });
                  handleFile(file);
                  return;
                }
              }
            }
          } catch {
            // Fallback: try to trigger a paste event manually
            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
              clipboardData: new DataTransfer()
            });
            e.currentTarget.dispatchEvent(pasteEvent);
          }
        }
      }}
      onPaste={(e) => {
        handlePaste(e.nativeEvent);
      }}
    >
      <motion.div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        animate={{
          borderColor: isDragging ? '#4a90e2' : '#ccc',
          backgroundColor: isDragging ? '#f0f8ff' : '#fafafa'
        }}
        transition={{ duration: 0.2 }}
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '250px',
          border: '2px dashed',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}
      >
        <motion.div
          animate={{ y: isDragging ? -5 : 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Upload size={64} color={isDragging ? '#4a90e2' : '#999'} />
        </motion.div>
        
        <p style={{ 
          marginTop: '1rem', 
          color: '#666',
          fontSize: '1rem',
          fontWeight: 500
        }}>
          Click to upload or drag & drop
        </p>
        
        <p style={{ 
          marginTop: '0.5rem', 
          color: '#999',
          fontSize: '0.875rem'
        }}>
          JPG, PNG, HEIC or PDF • Max {maxSizeMB}MB
        </p>

        <p style={{
          marginTop: '0.5rem',
          color: '#999',
          fontSize: '0.875rem'
        }}>
          or paste an image (Ctrl+V)
        </p>
      </motion.div>

      {error && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
          fontSize: '0.875rem'
        }}>
          {error.message}
        </div>
      )}

      {isConverting && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: '#e3f2fd',
          border: '1px solid #90caf9',
          borderRadius: '4px',
          color: '#1976d2',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <div style={{
            width: '16px',
            height: '16px',
            border: '2px solid #1976d2',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          Converting HEIC image...
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={`${ACCEPTED_TYPES.join(',')},.heic,.heif`}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};