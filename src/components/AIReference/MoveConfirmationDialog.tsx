import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, ArrowRight } from 'lucide-react';
import type { MovePlan } from '@/services/agenticService';
import './MoveConfirmationDialog.css';

interface MoveConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onEditCommand: () => void;
  plan: MovePlan | null;
  isLoading?: boolean;
}

export const MoveConfirmationDialog: React.FC<MoveConfirmationDialogProps> = ({
  open,
  onClose,
  onConfirm,
  onEditCommand,
  plan,
  isLoading = false,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (open && !isLoading && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [open, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      onConfirm();
    }
  };

  if (!open) return null;

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
            className="move-confirmation-backdrop"
            onClick={onClose}
          />

          {/* Dialog */}
          <div className="move-confirmation-container">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="move-confirmation-dialog"
              role="dialog"
              aria-label="Confirm AI Operation"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleKeyDown}
            >
              {/* Header */}
              <div className="move-confirmation-header">
                <h2>Confirm Operation</h2>
                <button
                  onClick={onClose}
                  className="move-confirmation-close"
                  aria-label="Close dialog"
                  type="button"
                  disabled={isLoading}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="move-confirmation-content">
                {isLoading ? (
                  <div className="loading-state">
                    <div className="loading-spinner" />
                    <p>Analyzing your command...</p>
                  </div>
                ) : plan ? (
                  <>
                    {/* Annotated Image Preview */}
                    <div className="preview-section">
                      <div className="preview-label">Preview with annotations:</div>
                      <div className="preview-image-container">
                        <img
                          src={plan.annotatedImage}
                          alt="Annotated preview showing reference points"
                          className="preview-image"
                        />
                      </div>
                    </div>

                    {/* Reference Points */}
                    <div className="points-section">
                      <div className="section-label">Reference Points:</div>
                      <div className="points-list">
                        {plan.descriptions.map((desc) => (
                          <div key={desc.label} className="point-item">
                            <div className="point-label-badge">{desc.label}</div>
                            <div className="point-details">
                              <div className="point-coords">
                                <MapPin size={12} />
                                ({desc.x}, {desc.y})
                              </div>
                              <div className="point-description">{desc.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Command and Interpretation */}
                    <div className="interpretation-section">
                      <div className="command-row">
                        <span className="command-label">Your command:</span>
                        <span className="command-text">"{plan.originalCommand}"</span>
                      </div>
                      <div className="interpretation-row">
                        <ArrowRight size={16} className="arrow-icon" />
                        <span className="interpretation-text">{plan.interpretation}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <p>No plan available</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              {!isLoading && plan && (
                <div className="move-confirmation-footer">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onEditCommand}
                    className="btn btn-edit"
                  >
                    Edit Command
                  </button>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    onClick={onConfirm}
                    className="btn btn-confirm"
                  >
                    Confirm & Execute
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(dialogContent, document.body);
};
