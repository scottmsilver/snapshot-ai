import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface GenerativeFillDialogProps {
  isOpen: boolean;
  isGenerating: boolean;
  mode?: 'inpainting' | 'text-only';
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  sourceImagePreview?: string; // Base64 PNG of source image
  maskImagePreview?: string;   // Base64 PNG of mask image
}

export const GenerativeFillDialog: React.FC<GenerativeFillDialogProps> = ({
  isOpen,
  isGenerating,
  mode = 'inpainting',
  onSubmit,
  onCancel,
  sourceImagePreview,
  maskImagePreview,
}) => {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating) {
      onSubmit(prompt.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && !isGenerating) {
      onCancel();
    } else if (e.key === 'Enter' && e.ctrlKey && !isGenerating) {
      // Ctrl+Enter to submit
      e.preventDefault();
      if (prompt.trim()) {
        onSubmit(prompt.trim());
      }
    }
  };

  if (!isOpen) return null;

  const examplePrompts = mode === 'text-only'
    ? [
        'Make the sky more dramatic with sunset colors',
        'Add a person walking in the foreground',
        'Change the season to winter with snow',
        'Make it look like a painting in Van Gogh style',
        'Add reflections in the water'
      ]
    : [
        'Extend the window to fill this selected area',
        'Replace with a wooden door maintaining architectural style',
        'Add a balcony with glass railings',
        'Remove the window and fill with brick wall',
        'Change the material to brushed metal'
      ];

  const dialogTitle = mode === 'text-only' ? 'AI Edit - Text Only' : 'AI Fill Prompt';
  const promptLabel = mode === 'text-only'
    ? 'How should the AI edit the entire image?'
    : 'What should the AI do with the selected area?';
  const promptPlaceholder = mode === 'text-only'
    ? 'e.g., Add dramatic sunset, Make it look like a painting...'
    : 'e.g., Extend the window, Replace with door, Add balcony...';

  const dialogContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={!isGenerating ? onCancel : undefined}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          minWidth: '380px',
          maxWidth: '450px',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: '0 0 14px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#333',
          }}
        >
          {dialogTitle}
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                fontWeight: '500',
                color: '#555',
              }}
            >
              {promptLabel}
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={promptPlaceholder}
              disabled={isGenerating}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                backgroundColor: isGenerating ? '#f5f5f5' : 'white',
              }}
              autoFocus
            />
            <div
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: '#999',
              }}
            >
              Press Ctrl+Enter to submit
            </div>
          </div>

          {/* Image Previews - Compact */}
          {(sourceImagePreview || maskImagePreview) && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                border: '1px solid #e5e5e5',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#666',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Preview
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: sourceImagePreview && maskImagePreview ? '1fr 1fr' : '1fr',
                  gap: '8px',
                }}
              >
                {sourceImagePreview && (
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#666',
                        marginBottom: '4px',
                        fontWeight: '500',
                      }}
                    >
                      Source
                    </div>
                    <img
                      src={sourceImagePreview}
                      alt="Source"
                      style={{
                        width: '100%',
                        height: 'auto',
                        maxHeight: '100px',
                        objectFit: 'contain',
                        borderRadius: '3px',
                        border: '1px solid #ddd',
                        display: 'block',
                      }}
                    />
                  </div>
                )}
                {maskImagePreview && (
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#666',
                        marginBottom: '4px',
                        fontWeight: '500',
                      }}
                    >
                      Mask
                    </div>
                    <img
                      src={maskImagePreview}
                      alt="Mask"
                      style={{
                        width: '100%',
                        height: 'auto',
                        maxHeight: '100px',
                        objectFit: 'contain',
                        borderRadius: '3px',
                        border: '1px solid #ddd',
                        display: 'block',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <details
            style={{
              marginBottom: '16px',
            }}
          >
            <summary
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#666',
                cursor: 'pointer',
                padding: '8px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                border: '1px solid #e5e5e5',
                listStyle: 'none',
              }}
            >
              <span style={{ marginLeft: '4px' }}>💡 Example Prompts</span>
            </summary>
            <div
              style={{
                marginTop: '8px',
                padding: '10px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                border: '1px solid #e5e5e5',
              }}
            >
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '18px',
                  fontSize: '12px',
                  color: '#555',
                  lineHeight: '1.6',
                }}
              >
                {examplePrompts.map((example, index) => (
                  <li
                    key={index}
                    style={{
                      marginBottom: '3px',
                      cursor: isGenerating ? 'default' : 'pointer',
                    }}
                    onClick={() => !isGenerating && setPrompt(example)}
                  >
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={isGenerating}
              style={{
                padding: '8px 18px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#666',
                fontSize: '13px',
                fontWeight: '500',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isGenerating ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isGenerating) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (!isGenerating) {
                  e.currentTarget.style.backgroundColor = 'white';
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              style={{
                padding: '8px 18px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor:
                  prompt.trim() && !isGenerating ? '#4a90e2' : '#ccc',
                color: 'white',
                fontSize: '13px',
                fontWeight: '500',
                cursor:
                  prompt.trim() && !isGenerating ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) => {
                if (prompt.trim() && !isGenerating) {
                  e.currentTarget.style.backgroundColor = '#357abd';
                }
              }}
              onMouseLeave={(e) => {
                if (prompt.trim() && !isGenerating) {
                  e.currentTarget.style.backgroundColor = '#4a90e2';
                }
              }}
            >
              {isGenerating ? (
                <>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Generating...
                </>
              ) : (
                'Generate'
              )}
            </button>
          </div>
        </form>

        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};
