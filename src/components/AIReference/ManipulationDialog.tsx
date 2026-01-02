import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import './ManipulationDialog.css';

interface ReferencePoint {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface ManipulationDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (command: string) => void;
  referencePoints: ReferencePoint[];
  previewImage?: string; // Base64 image with pins annotated
}

export const ManipulationDialog: React.FC<ManipulationDialogProps> = ({
  open,
  onClose,
  onSubmit,
  referencePoints,
  previewImage,
}) => {
  const [command, setCommand] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Reset command when dialog closes
  useEffect(() => {
    if (!open) {
      setCommand('');
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (command.trim()) {
      onSubmit(command.trim());
      setCommand('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter or Cmd+Enter to submit
      e.preventDefault();
      if (command.trim()) {
        onSubmit(command.trim());
        setCommand('');
      }
    }
  };

  if (!open) return null;

  // Format reference points for display
  const referenceLabels = referencePoints.map(p => p.label).join(', ');
  const pointCount = referencePoints.length;

  const dialogContent = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="manipulation-dialog-backdrop"
            onClick={onClose}
          />

          {/* Dialog */}
          <div className="manipulation-dialog-container">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="manipulation-dialog"
              role="dialog"
              aria-label="AI Manipulation Dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="manipulation-dialog-header">
                <h2>AI Manipulation</h2>
                <button
                  onClick={onClose}
                  className="manipulation-dialog-close"
                  aria-label="Close dialog"
                  type="button"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="manipulation-dialog-content">
                {/* Preview Image with pins */}
                {previewImage && (
                  <div className="preview-image-section">
                    <img
                      src={previewImage}
                      alt="Canvas with reference points marked"
                      className="preview-image"
                    />
                    <div className="reference-points-label">
                      Reference points: {referenceLabels}
                    </div>
                  </div>
                )}

                {/* Fallback if no preview */}
                {!previewImage && (
                  <div className="reference-points-summary">
                    <strong>Reference points:</strong> {referenceLabels}
                    <span className="point-count">({pointCount} point{pointCount !== 1 ? 's' : ''})</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="manipulation-command">
                      What would you like to do?
                    </label>
                    <textarea
                      ref={textareaRef}
                      id="manipulation-command"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g., Move A to the position of B, or Make A look like B"
                      className="command-textarea"
                      rows={4}
                    />
                    <div className="input-hint">
                      Press Ctrl+Enter to execute
                    </div>
                  </div>

                  {/* Example prompts */}
                  <details className="examples-section">
                    <summary>💡 Example Commands</summary>
                    <ul className="examples-list">
                      <li onClick={() => setCommand('Move A to the position of B')}>
                        Move A to the position of B
                      </li>
                      <li onClick={() => setCommand('Make A look like B')}>
                        Make A look like B
                      </li>
                      <li onClick={() => setCommand('Swap the positions of A and B')}>
                        Swap the positions of A and B
                      </li>
                      <li onClick={() => setCommand('Copy the style from A and apply it to B')}>
                        Copy the style from A and apply it to B
                      </li>
                      <li onClick={() => setCommand('Align A, B, and C horizontally')}>
                        Align A, B, and C horizontally
                      </li>
                    </ul>
                  </details>

                  {/* Footer Buttons */}
                  <div className="manipulation-dialog-footer">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn btn-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!command.trim()}
                      className="btn btn-execute"
                    >
                      Execute
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(dialogContent, document.body);
};
