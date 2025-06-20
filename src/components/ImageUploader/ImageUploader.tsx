import React, { useRef, useState, useEffect } from 'react';
import type { FileType, UploadError } from '@/types/canvas';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  maxSizeMB?: number;
}

const ACCEPTED_TYPES: FileType[] = ['image/jpeg', 'image/png', 'image/jpg'];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUpload, 
  maxSizeMB = 10 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  const validateFile = (file: File): UploadError | null => {
    // Check file type
    if (!ACCEPTED_TYPES.includes(file.type as FileType)) {
      return { 
        message: 'Please upload only JPG or PNG images', 
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
    onImageUpload(file);
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
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '250px',
          border: `2px dashed ${isDragging ? '#4a90e2' : '#ccc'}`,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          backgroundColor: isDragging ? '#f0f8ff' : '#fafafa',
          transition: 'all 0.3s ease'
        }}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isDragging ? '#4a90e2' : '#999'}
          strokeWidth="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        
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
          JPG or PNG • Max {maxSizeMB}MB
        </p>

        <p style={{
          marginTop: '0.5rem',
          color: '#999',
          fontSize: '0.875rem'
        }}>
          or paste an image (Ctrl+V)
        </p>
      </div>

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