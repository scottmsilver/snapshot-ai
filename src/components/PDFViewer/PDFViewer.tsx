import React, { useState, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPDFDocument, pdfPageToImageElement, getPDFInfo } from '@/utils/pdfUtils';
import type { PDFDocumentInfo } from '@/utils/pdfUtils';

interface PDFViewerProps {
  file: File;
  onPageLoad: (image: HTMLImageElement, pageInfo: { current: number; total: number }) => void;
  onError?: (error: Error) => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ file, onPageLoad, onError }) => {
  console.log('PDFViewer mounted with file:', file.name);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PDFDocumentInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderScale, setRenderScale] = useState(2); // Default scale for quality
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [rotation, setRotation] = useState(0); // Rotation in degrees (0, 90, 180, 270)

  // Load PDF document
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const loadPDF = async () => {
      try {
        console.log('Loading PDF:', file.name);
        setLoading(true);
        setError(null);
        
        // Set a timeout for PDF loading
        timeoutId = setTimeout(() => {
          if (mounted) {
            setError('PDF loading timed out. The file might be too large or corrupted.');
            setLoading(false);
          }
        }, 30000); // 30 second timeout
        
        const pdfDoc = await loadPDFDocument(file);
        console.log('PDF loaded, pages:', pdfDoc.numPages);
        
        if (!mounted) return;
        clearTimeout(timeoutId);
        
        setPdf(pdfDoc);
        
        const info = await getPDFInfo(pdfDoc);
        setPdfInfo(info);
        
        // Don't auto-load first page - wait for user to click "Use This Page"
      } catch (err) {
        console.error('PDF loading error:', err);
        if (!mounted) return;
        clearTimeout(timeoutId);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load PDF';
        setError(errorMessage);
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (pdf) {
        pdf.destroy();
      }
    };
  }, [file]);

  // Load preview when PDF is ready, page changes, or rotation changes
  useEffect(() => {
    if (pdf && pdfInfo) {
      loadPreview(currentPage);
    }
  }, [pdf, pdfInfo, currentPage, rotation]);

  // Load preview for current page
  const loadPreview = async (pageNum: number) => {
    if (!pdf || !pdfInfo) return;
    
    try {
      setLoadingPreview(true);
      // Use lower scale for preview with rotation
      const previewImage = await pdfPageToImageElement(pdf, pageNum, 1, rotation);
      setPreviewUrl(previewImage.src);
    } catch (err) {
      console.error('Error loading preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Load and use a specific page
  const loadAndUsePage = async () => {
    if (!pdf || !pdfInfo) return;
    
    try {
      setLoading(true);
      const image = await pdfPageToImageElement(pdf, currentPage, renderScale, rotation);
      onPageLoad(image, { current: currentPage, total: pdfInfo.numPages });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load page';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Navigation handlers
  const goToPage = (pageNum: number) => {
    if (!pdf || !pdfInfo || pageNum < 1 || pageNum > pdfInfo.numPages) return;
    setCurrentPage(pageNum);
  };

  const nextPage = () => {
    if (currentPage < (pdfInfo?.numPages || 0)) {
      goToPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  // Handle scale changes
  const changeScale = (newScale: number) => {
    setRenderScale(newScale);
  };
  
  // Rotation handlers
  const rotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };
  
  const rotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };
  
  const resetRotation = () => {
    setRotation(0);
  };

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        backgroundColor: '#fee',
        border: '1px solid #fcc',
        borderRadius: '8px',
        color: '#c33',
        textAlign: 'center'
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Error loading PDF</h3>
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (loading && !pdf) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#666'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }} />
        <p>Loading PDF...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '2rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      zIndex: 1000,
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      overflow: 'auto',
      textAlign: 'center'
    }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Select PDF Page</h3>
      
      <p style={{ margin: '0 0 1.5rem 0', color: '#666' }}>
        Choose which page to load as an image for annotation
      </p>

      {/* Page Preview */}
      <div style={{
        marginBottom: '1.5rem',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: '#f5f5f5',
        minHeight: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {loadingPreview ? (
          <div style={{ color: '#666' }}>Loading preview...</div>
        ) : previewUrl ? (
          <img 
            src={previewUrl} 
            alt={`Page ${currentPage} preview`}
            style={{
              maxWidth: '100%',
              maxHeight: '400px',
              height: 'auto',
              display: 'block'
            }}
          />
        ) : (
          <div style={{ color: '#666' }}>Preview will appear here</div>
        )}
      </div>

      {/* Page Selection */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <button
          onClick={prevPage}
          disabled={currentPage <= 1 || loading}
          style={{
            padding: '0.5rem',
            backgroundColor: currentPage > 1 && !loading ? '#4a90e2' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage > 1 && !loading ? 'pointer' : 'not-allowed',
            fontSize: '1rem',
            width: '40px',
            height: '40px'
          }}
          title="Previous page"
        >
          ‹
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '1rem'
        }}>
          <span>Page</span>
          <input
            type="number"
            value={currentPage}
            onChange={(e) => {
              const page = parseInt(e.target.value);
              if (!isNaN(page)) {
                goToPage(page);
              }
            }}
            min={1}
            max={pdfInfo?.numPages || 1}
            style={{
              width: '60px',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              textAlign: 'center',
              fontSize: '1rem'
            }}
          />
          <span>of {pdfInfo?.numPages || 0}</span>
        </div>

        <button
          onClick={nextPage}
          disabled={currentPage >= (pdfInfo?.numPages || 0) || loading}
          style={{
            padding: '0.5rem',
            backgroundColor: currentPage < (pdfInfo?.numPages || 0) && !loading ? '#4a90e2' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage < (pdfInfo?.numPages || 0) && !loading ? 'pointer' : 'not-allowed',
            fontSize: '1rem',
            width: '40px',
            height: '40px'
          }}
          title="Next page"
        >
          ›
        </button>
      </div>

      {/* Rotation Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem'
      }}>
        <span style={{ fontSize: '1rem', color: '#666' }}>Rotate:</span>
        <button
          onClick={rotateLeft}
          disabled={loading || loadingPreview}
          style={{
            padding: '0.5rem',
            backgroundColor: loading || loadingPreview ? '#ccc' : '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || loadingPreview ? 'not-allowed' : 'pointer',
            fontSize: '1.2rem',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Rotate Left"
        >
          ↺
        </button>
        <span style={{ 
          fontSize: '1rem', 
          minWidth: '40px', 
          textAlign: 'center',
          fontWeight: '500',
          color: rotation !== 0 ? '#4a90e2' : '#666'
        }}>
          {rotation}°
        </span>
        <button
          onClick={rotateRight}
          disabled={loading || loadingPreview}
          style={{
            padding: '0.5rem',
            backgroundColor: loading || loadingPreview ? '#ccc' : '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || loadingPreview ? 'not-allowed' : 'pointer',
            fontSize: '1.2rem',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Rotate Right"
        >
          ↻
        </button>
        {rotation !== 0 && (
          <button
            onClick={resetRotation}
            disabled={loading || loadingPreview}
            style={{
              padding: '0.5rem',
              backgroundColor: loading || loadingPreview ? '#ccc' : '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || loadingPreview ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Reset Rotation"
          >
            ⟲
          </button>
        )}
      </div>

      {/* Quality Setting */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        marginBottom: '1.5rem'
      }}>
        <span>Quality:</span>
        <select
          value={renderScale}
          onChange={(e) => changeScale(parseFloat(e.target.value))}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '1rem',
            backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          <option value={1}>Low</option>
          <option value={2}>Medium</option>
          <option value={3}>High</option>
          <option value={4}>Very High</option>
        </select>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center'
      }}>
        <button
          onClick={() => {
            // Clean up and close
            if (pdf) {
              pdf.destroy();
            }
            if (onError) {
              onError(new Error('PDF selection cancelled'));
            }
          }}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: 'transparent',
            color: '#666',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500'
          }}
        >
          Cancel
        </button>
        
        <button
          onClick={loadAndUsePage}
          disabled={loading || !pdf}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: loading || !pdf ? '#ccc' : '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || !pdf ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: '500'
          }}
        >
          {loading ? 'Loading...' : 'Use This Page'}
        </button>
      </div>
    </div>
  );
};