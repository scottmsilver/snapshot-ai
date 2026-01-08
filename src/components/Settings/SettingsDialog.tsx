import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Eye, EyeOff } from 'lucide-react';
import { settingsManager } from '@/services/settingsManager';
import { useAuth } from '@/contexts/AuthContext';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps): React.ReactElement {
  const { getAccessToken } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [inpaintingModel, setInpaintingModel] = useState('imagen');
  const [textOnlyModel, setTextOnlyModel] = useState('gemini');
  const [googleCloudProjectId, setGoogleCloudProjectId] = useState('');
  const [showRainbowBorder, setShowRainbowBorder] = useState(false);
  const [recordAiManipulationCases, setRecordAiManipulationCases] = useState(false);
  const [useLangGraph, setUseLangGraph] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectIdRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      await settingsManager.initialize(accessToken);
      const key = await settingsManager.getGeminiApiKey();
      const inpainting = await settingsManager.getInpaintingModel();
      const textOnly = await settingsManager.getTextOnlyModel();
      const projectId = await settingsManager.getGoogleCloudProjectId();
      const rainbow = await settingsManager.getShowRainbowBorder();
      const langGraph = await settingsManager.getUseLangGraph();
      setApiKey(key || '');
      setInpaintingModel(inpainting || 'imagen');
      setTextOnlyModel(textOnly || 'gemini');
      setGoogleCloudProjectId(projectId || '');
      setShowRainbowBorder(rainbow);
      setUseLangGraph(langGraph);
      setRecordAiManipulationCases(localStorage.getItem('recordAiManipulationCases') === 'true');
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  // Update input value when apiKey changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = apiKey;
    }
  }, [apiKey]);

  // Handle paste manually since native paste event doesn't fire reliably
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = async (e: KeyboardEvent): Promise<void> => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement === inputRef.current) {
        try {
          const text = await navigator.clipboard.readText();
          if (inputRef.current) {
            inputRef.current.value = text;
          }
        } catch (err) {
          console.error('Failed to read clipboard:', err);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      // Get the current values from the input refs
      const currentKey = inputRef.current?.value || apiKey;
      const currentProjectId = projectIdRef.current?.value || googleCloudProjectId;

      await settingsManager.initialize(accessToken);
      await settingsManager.setGeminiApiKey(currentKey);
      await settingsManager.setInpaintingModel(inpaintingModel);
      await settingsManager.setTextOnlyModel(textOnlyModel);
      await settingsManager.setGoogleCloudProjectId(currentProjectId);
      await settingsManager.setShowRainbowBorder(showRainbowBorder);
      await settingsManager.setUseLangGraph(useLangGraph);
      localStorage.setItem('recordAiManipulationCases', recordAiManipulationCases ? 'true' : 'false');

      setApiKey(currentKey); // Update state to match
      setGoogleCloudProjectId(currentProjectId);
      setSuccessMessage('Settings saved successfully!');

      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = (): void => {
    setSuccessMessage(null);
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
          />

          {/* Dialog */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1001,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
                width: '90vw',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                borderBottom: '1px solid #e5e5e5',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#1a1a1a',
                }}
              >
                Settings
              </h2>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
              }}
            >
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '3px solid #e5e5e5',
                      borderTopColor: '#4a90e2',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto',
                    }}
                  />
                  <style>
                    {`
                      @keyframes spin {
                        to { transform: rotate(360deg); }
                      }
                    `}
                  </style>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* AI Model Selection */}
                  <div>
                    <h3
                      style={{
                        margin: '0 0 16px 0',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#1a1a1a',
                      }}
                    >
                      Generative Fill Models
                    </h3>

                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#333',
                        }}
                      >
                        Inpainting Model (for mask-based edits)
                      </label>
                      <select
                        value={inpaintingModel}
                        onChange={(e) => setInpaintingModel(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#4a90e2';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#ddd';
                        }}
                      >
                        <option value="imagen">Imagen 3.0 (Google Cloud Vertex AI) - Default</option>
                        <option value="gemini">Gemini 3 Pro (Google AI Studio)</option>
                      </select>
                      <p
                        style={{
                          margin: '8px 0 0 0',
                          fontSize: '13px',
                          color: '#666',
                          lineHeight: '1.5',
                        }}
                      >
                        Used when you select an area with a mask. Imagen is recommended for precise mask-based inpainting.
                      </p>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#333',
                        }}
                      >
                        Text-Only Model (for conversational edits)
                      </label>
                      <select
                        value={textOnlyModel}
                        onChange={(e) => setTextOnlyModel(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#4a90e2';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#ddd';
                        }}
                      >
                        <option value="gemini">Gemini 3 Pro (Google AI Studio) - Default</option>
                        <option value="imagen">Imagen 3.0 (Google Cloud Vertex AI)</option>
                      </select>
                      <p
                        style={{
                          margin: '8px 0 0 0',
                          fontSize: '13px',
                          color: '#666',
                          lineHeight: '1.5',
                        }}
                      >
                        Used for text-only prompts without a mask selection. Gemini is fast and conversational.
                      </p>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                        }}
                        onClick={() => setShowRainbowBorder(!showRainbowBorder)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowRainbowBorder(!showRainbowBorder);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: '40px',
                            height: '22px',
                            backgroundColor: showRainbowBorder ? '#4a90e2' : '#e5e5e5',
                            borderRadius: '11px',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: showRainbowBorder ? '20px' : '2px',
                              width: '18px',
                              height: '18px',
                              backgroundColor: 'white',
                              borderRadius: '50%',
                              transition: 'left 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#333',
                          }}
                        >
                          Show "Thinking" Rainbow Border
                        </span>
                      </label>
                      <p
                        style={{
                          margin: '4px 0 0 52px',
                          fontSize: '13px',
                          color: '#666',
                          lineHeight: '1.5',
                        }}
                      >
                        When enabled, displays a colorful animated border while AI is processing. Sparkles are always shown.
                      </p>
                      <input
                        type="checkbox"
                        checked={showRainbowBorder}
                        onChange={(e) => setShowRainbowBorder(e.target.checked)}
                        style={{ display: 'none' }}
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                        }}
                        onClick={() => setRecordAiManipulationCases(!recordAiManipulationCases)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setRecordAiManipulationCases(!recordAiManipulationCases);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: '40px',
                            height: '22px',
                            backgroundColor: recordAiManipulationCases ? '#4a90e2' : '#e5e5e5',
                            borderRadius: '11px',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: recordAiManipulationCases ? '20px' : '2px',
                              width: '18px',
                              height: '18px',
                              backgroundColor: 'white',
                              borderRadius: '50%',
                              transition: 'left 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#333',
                          }}
                        >
                          Record AI Manipulation Cases
                        </span>
                      </label>
                      <p
                        style={{
                          margin: '4px 0 0 52px',
                          fontSize: '13px',
                          color: '#666',
                          lineHeight: '1.5',
                        }}
                      >
                        Downloads a JSON case bundle after each AI Reference run for CLI replays.
                      </p>
                      <input
                        type="checkbox"
                        checked={recordAiManipulationCases}
                        onChange={(e) => setRecordAiManipulationCases(e.target.checked)}
                        style={{ display: 'none' }}
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                        }}
                        onClick={() => setUseLangGraph(!useLangGraph)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setUseLangGraph(!useLangGraph);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: '40px',
                            height: '22px',
                            backgroundColor: useLangGraph ? '#10b981' : '#e5e5e5',
                            borderRadius: '11px',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: useLangGraph ? '20px' : '2px',
                              width: '18px',
                              height: '18px',
                              backgroundColor: 'white',
                              borderRadius: '50%',
                              transition: 'left 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#333',
                          }}
                        >
                          Use LangGraph Backend (Experimental)
                        </span>
                      </label>
                      <p
                        style={{
                          margin: '4px 0 0 52px',
                          fontSize: '13px',
                          color: '#666',
                          lineHeight: '1.5',
                        }}
                      >
                        Routes agentic edit operations through the Python/LangGraph backend instead of Express/TypeScript.
                        This enables more sophisticated AI workflows but is experimental.
                      </p>
                      <input
                        type="checkbox"
                        checked={useLangGraph}
                        onChange={(e) => setUseLangGraph(e.target.checked)}
                        style={{ display: 'none' }}
                      />
                    </div>

                  </div>

                  {/* API Keys Section */}
                  <div>
                    <h3
                      style={{
                        margin: '0 0 16px 0',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#1a1a1a',
                      }}
                    >
                      API Keys
                    </h3>

                    {/* Gemini API Key */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#333',
                        }}
                      >
                        Gemini API Key
                      </label>
                      <p
                        style={{
                          margin: '0 0 12px 0',
                          fontSize: '13px',
                          color: '#666',
                          lineHeight: '1.5',
                        }}
                      >
                        Your API key is stored securely in your Google Drive. Get your key from{' '}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#4a90e2', textDecoration: 'none' }}
                        >
                          Google AI Studio
                        </a>
                        .
                      </p>
                      <div style={{ position: 'relative' }}>
                        <input
                          ref={inputRef}
                          type={showApiKey ? 'text' : 'password'}
                          defaultValue={apiKey}
                          placeholder="Enter your Gemini API key"
                          autoComplete="off"
                          style={{
                            width: '100%',
                            padding: '10px 40px 10px 12px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            outline: 'none',
                            fontFamily: 'monospace',
                            boxSizing: 'border-box',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#4a90e2';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#ddd';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            color: '#666',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Google Cloud Project ID (for Imagen) */}
                    {(inpaintingModel === 'imagen' || textOnlyModel === 'imagen') && (
                      <div style={{ marginBottom: '16px' }}>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#333',
                          }}
                        >
                          Google Cloud Project ID
                        </label>
                        <p
                          style={{
                            margin: '0 0 12px 0',
                            fontSize: '13px',
                            color: '#666',
                            lineHeight: '1.5',
                          }}
                        >
                          Your Google Cloud project ID for Vertex AI. Make sure Vertex AI API is enabled.{' '}
                          <a
                            href="https://console.cloud.google.com/vertex-ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#4a90e2', textDecoration: 'none' }}
                          >
                            Google Cloud Console
                          </a>
                        </p>
                        <input
                          ref={projectIdRef}
                          type="text"
                          defaultValue={googleCloudProjectId}
                          placeholder="your-project-id"
                          autoComplete="off"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            outline: 'none',
                            fontFamily: 'monospace',
                            boxSizing: 'border-box',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#4a90e2';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#ddd';
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Status Messages */}
                  {error && (
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '6px',
                        color: '#c00',
                        fontSize: '14px',
                      }}
                    >
                      {error}
                    </div>
                  )}

                  {successMessage && (
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: '#efe',
                        border: '1px solid #cfc',
                        borderRadius: '6px',
                        color: '#060',
                        fontSize: '14px',
                      }}
                    >
                      {successMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 24px',
                borderTop: '1px solid #e5e5e5',
              }}
            >
              <button
                onClick={handleClose}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#333',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || isLoading}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: isSaving || isLoading ? '#ccc' : '#4a90e2',
                  color: 'white',
                  cursor: isSaving || isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  if (!isSaving && !isLoading) {
                    e.currentTarget.style.backgroundColor = '#3a7bc8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSaving && !isLoading) {
                    e.currentTarget.style.backgroundColor = '#4a90e2';
                  }
                }}
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
