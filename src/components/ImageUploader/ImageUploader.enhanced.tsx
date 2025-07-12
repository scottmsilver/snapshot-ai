import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import type { FileType, UploadError } from '@/types/canvas';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  onPDFUpload?: (file: File) => void;
  maxSizeMB?: number;
}

const ACCEPTED_IMAGE_TYPES: FileType[] = ['image/jpeg', 'image/png', 'image/jpg'];
const ACCEPTED_PDF_TYPES = ['application/pdf'];
const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_PDF_TYPES];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUpload, 
  onPDFUpload,
  maxSizeMB = 10 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const validateFile = (file: File): UploadError | null => {
    // Check file type
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type as FileType);
    const isPDF = ACCEPTED_PDF_TYPES.includes(file.type);
    
    console.log('Validating file:', file.name, 'Type:', file.type, 'Is image:', isImage, 'Is PDF:', isPDF);
    
    if (!isImage && !isPDF) {
      return { 
        message: 'Please upload only JPG, PNG images or PDF files', 
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
  };

  const handleFile = useCallback((file: File) => {
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
    } else {
      onImageUpload(file);
    }
  }, [onImageUpload, onPDFUpload, maxSizeMB]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  // Enhanced paste handler
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    console.log('=== Paste Event Detected ===');
    console.log('Event type:', e.type);
    console.log('Event target:', e.target);
    console.log('Is trusted:', e.isTrusted);
    
    e.preventDefault();
    e.stopPropagation();
    
    // Method 1: Check DataTransfer items (most compatible)
    if (e.clipboardData && e.clipboardData.items) {
      const items = e.clipboardData.items;
      console.log(`DataTransfer: Found ${items.length} items`);
      
      // Convert to array for easier manipulation
      const itemsArray = Array.from(items);
      
      // Log all items first
      itemsArray.forEach((item, index) => {
        console.log(`Item ${index}:`, {
          type: item.type,
          kind: item.kind
        });
      });
      
      // Look for image items
      for (let i = 0; i < itemsArray.length; i++) {
        const item = itemsArray[i];
        
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            console.log('File obtained:', {
              name: file.name,
              type: file.type,
              size: file.size
            });
            
            // Handle image files
            if (file.type.startsWith('image/')) {
              console.log('✓ Image file detected, processing...');
              handleFile(file);
              return;
            }
          }
        }
      }
    } else {
      console.log('No clipboardData.items available');
    }
    
    // Method 2: Try Clipboard API (requires HTTPS in production)
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        console.log('Attempting Clipboard API...');
        const clipboardItems = await navigator.clipboard.read();
        console.log(`Clipboard API: Found ${clipboardItems.length} items`);
        
        for (const clipboardItem of clipboardItems) {
          console.log('Clipboard item types:', clipboardItem.types);
          
          // Try each type
          for (const type of clipboardItem.types) {
            if (type.startsWith('image/')) {
              try {
                const blob = await clipboardItem.getType(type);
                console.log('Blob obtained:', {
                  type: blob.type,
                  size: blob.size
                });
                
                // Create file from blob
                const file = new File([blob], `pasted-image-${Date.now()}.png`, { 
                  type: blob.type || 'image/png' 
                });
                
                console.log('✓ File created from blob, processing...');
                handleFile(file);
                return;
              } catch (err) {
                console.error(`Failed to get type ${type}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error('Clipboard API error:', err);
        console.log('This might be due to:');
        console.log('- Not running on HTTPS');
        console.log('- Browser permissions');
        console.log('- Browser compatibility');
      }
    } else {
      console.log('Clipboard API not available');
    }
    
    console.log('❌ No image found in clipboard');
    setError({ 
      message: 'No image found in clipboard. Try copying an image first.', 
      type: 'type' 
    });
    
    // Clear error after 3 seconds
    setTimeout(() => setError(null), 3000);
  }, [handleFile]);

  // Set up paste event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Focus container on mount
    container.focus();

    // Add paste listener to both the container and document
    const pasteHandler = (e: Event) => handlePaste(e as ClipboardEvent);
    
    container.addEventListener('paste', pasteHandler);
    document.addEventListener('paste', pasteHandler);
    
    // Log when component is ready
    console.log('ImageUploader: Paste handler attached');
    
    return () => {
      container.removeEventListener('paste', pasteHandler);
      document.removeEventListener('paste', pasteHandler);
    };
  }, [handlePaste]);

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      console.log('Ctrl/Cmd+V detected via keydown');
      // The paste event will be triggered automatically
    }
  };

  return (
    <div 
      ref={containerRef}
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        outline: isFocused ? '2px solid #4a90e2' : 'none',
        outlineOffset: '2px'
      }}
      onFocus={() => {
        console.log('Container focused');
        setIsFocused(true);
      }}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
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
          JPG, PNG or PDF • Max {maxSizeMB}MB
        </p>

        <p style={{
          marginTop: '0.5rem',
          color: '#999',
          fontSize: '0.875rem'
        }}>
          or paste an image (Ctrl+V)
        </p>
        
        {isFocused && (
          <p style={{
            marginTop: '0.5rem',
            color: '#4a90e2',
            fontSize: '0.75rem',
            fontWeight: 500
          }}>
            Ready to paste!
          </p>
        )}
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

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      
      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f0f0f0',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          color: '#666',
          maxWidth: '400px',
          width: '100%'
        }}>
          <div>Clipboard Debug Info:</div>
          <div>- Protocol: {window.location.protocol}</div>
          <div>- Clipboard API: {navigator.clipboard ? '✓' : '✗'}</div>
          <div>- Clipboard Read: {navigator.clipboard?.read ? '✓' : '✗'}</div>
          <div>- Focus state: {isFocused ? 'Focused' : 'Not focused'}</div>
        </div>
      )}
    </div>
  );
};