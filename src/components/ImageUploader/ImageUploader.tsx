import React, { useRef, useState, useEffect } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  const validateFile = (file: File): UploadError | null => {
    // Check file type
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type as FileType);
    const isPDF = ACCEPTED_PDF_TYPES.includes(file.type);
    
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

  const handleFile = (file: File) => {
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
  };

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

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
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
    </div>
  );
};