import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, ArrowRight, Edit2 } from 'lucide-react';
import type { MovePlan } from '@/services/agenticService';
import './MoveConfirmationDialog.css';

interface MoveConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onEditCommand: () => void;
  onReplan: (editedCommand: string) => void;
  plan: MovePlan | null;
  isLoading?: boolean;
}

export const MoveConfirmationDialog: React.FC<MoveConfirmationDialogProps> = ({
  open,
  onClose,
  onConfirm,
  onEditCommand: _onEditCommand,
  onReplan,
  plan,
  isLoading = false,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [editedInterpretation, setEditedInterpretation] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (open && !isLoading && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [open, isLoading]);

  // Reset editedInterpretation when plan changes
  useEffect(() => {
    if (plan?.interpretation) {
      setEditedInterpretation(plan.interpretation);
      setIsEditing(false);
    }
  }, [plan]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (isEditing) {
        setIsEditing(false);
        setEditedInterpretation(plan?.interpretation || '');
      } else {
        onClose();
      }
    } else if (e.key === 'Enter' && !isLoading) {
      // Ctrl+Enter to replan when editing
      if (e.ctrlKey && isEditing) {
        e.preventDefault();
        handleReplan();
      } else if (!isEditing) {
        // Regular Enter to confirm when not editing
        e.preventDefault();
        onConfirm();
      }
    }
  };

  const handleReplan = (): void => {
    if (editedInterpretation.trim()) {
      onReplan(editedInterpretation.trim());
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
                        {isEditing ? (
                          <textarea
                            className="interpretation-textarea"
                            value={editedInterpretation}
                            onChange={(e) => setEditedInterpretation(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Edit the interpretation..."
                            autoFocus
                          />
                        ) : (
                          <span className="interpretation-text">{editedInterpretation}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsEditing(!isEditing)}
                          className="edit-button"
                          aria-label={isEditing ? "Cancel editing" : "Edit interpretation"}
                          title={isEditing ? "Cancel (Esc)" : "Edit interpretation"}
                        >
                          <Edit2 size={14} />
                        </button>
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
                    onClick={handleReplan}
                    className="btn btn-replan"
                    disabled={!editedInterpretation.trim() || editedInterpretation === plan.interpretation}
                    title={isEditing ? "Replan with edited interpretation (Ctrl+Enter)" : "Replan with current interpretation"}
                  >
                    Replan
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
