import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  type AIProgressState,
  type AIProgressEvent,
  type AILogEntry,
  type ThinkingStatus,
  initialAIProgressState,
} from '@/types/aiProgress';

// Only log in development
const DEBUG = import.meta.env.DEV;
function debugLog(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    console.log(`[AIProgressContext] ${message}`, data ?? '');
  }
}

/**
 * Data needed for exporting an AI interaction as a zip file
 */
export interface AIExportData {
  /** Source image before AI processing (base64 data URL) */
  sourceImage: string;
  /** Result image after AI processing (base64 data URL) */
  resultImage: string;
  /** User's prompt */
  prompt: string;
  /** Optional mask image for inpainting (base64 data URL) */
  maskImage?: string;
  /** Type of AI operation */
  type: 'ai_fill' | 'ai_manipulation' | 'ai_reference' | string;
  /** Canvas dimensions */
  canvas?: { width: number; height: number };
}

/**
 * Context type for AI Progress tracking
 */
export interface AIProgressContextType {
  /** Current progress state */
  state: AIProgressState;

  /** Update progress with a new event */
  updateProgress: (event: AIProgressEvent) => void;

  /** Append thinking text incrementally (for streaming) */
  appendThinking: (text: string) => void;

  /** Clear the entire log history */
  clearLog: () => void;

  /** Set the thinking image for overlay display */
  setThinkingImage: (image: string | null) => void;

  /** Set the thinking status for overlay animation */
  setThinkingStatus: (status: ThinkingStatus) => void;

  /** Set data for exporting the AI interaction */
  setExportData: (data: AIExportData | null) => void;

  /** Current export data (null if no interaction to export) */
  exportData: AIExportData | null;
}

/**
 * Create the context
 */
export const AIProgressContext = createContext<AIProgressContextType | undefined>(undefined);

/**
 * Provider props
 */
interface AIProgressProviderProps {
  children: ReactNode;
}

/**
 * Generate unique ID for log entries
 */
const generateLogId = (): string => `log-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

/**
 * AIProgressProvider component that manages AI progress state
 */
export const AIProgressProvider: React.FC<AIProgressProviderProps> = ({ children }) => {
  const [state, setState] = useState<AIProgressState>(initialAIProgressState);
  const [exportData, setExportDataState] = useState<AIExportData | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const currentLogIdRef = useRef<string | null>(null);

  // Update elapsed time every 100ms when operation is active
  useEffect(() => {
    if (state.step !== 'idle' && state.step !== 'complete' && state.step !== 'error') {
      // Start timer if not already started
      if (!timerRef.current) {
        timerRef.current = window.setInterval(() => {
          if (startTimeRef.current) {
            setState(prev => ({
              ...prev,
              elapsedMs: Date.now() - (startTimeRef.current || 0),
            }));
          }
        }, 100);
      }
    } else {
      // Clear timer when idle, complete, or error
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.step]);

  const updateProgress = useCallback((event: AIProgressEvent) => {
    const isCompletingOrError = event.step === 'complete' || event.step === 'error';
    const isActiveStep = event.step !== 'idle' && event.step !== 'complete' && event.step !== 'error';
    const isThinkingDelta = !!event.thinkingTextDelta || !!event.rawOutputDelta;

    // For thinking deltas, we append to the last entry instead of creating new
    // For everything else, we create a new entry (append-only log)
    const shouldAppendToLast = isThinkingDelta && !event.newLogEntry;

    // Track operation start time for the first event
    if (isActiveStep && !currentLogIdRef.current) {
      startTimeRef.current = Date.now();
      currentLogIdRef.current = generateLogId();
    }

    // Stop timer on complete or error
    if (isCompletingOrError && timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Reset refs on complete/error
    if (isCompletingOrError) {
      currentLogIdRef.current = null;
      startTimeRef.current = null;
    }

    setState(prev => {
      const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current : prev.elapsedMs;
      const newLog = [...prev.log];

      // Get source/mask from previous entry if not provided (inherit within operation)
      const lastEntry = newLog[newLog.length - 1];
      const inheritedSourceImage = event.sourceImage ?? lastEntry?.sourceImage;
      const inheritedMaskImage = event.maskImage ?? lastEntry?.maskImage;

      if (shouldAppendToLast && lastEntry) {
        // Append thinking/raw output deltas to the last entry
        newLog[newLog.length - 1] = {
          ...lastEntry,
          thinkingText: event.thinkingTextDelta 
            ? (lastEntry.thinkingText || '') + event.thinkingTextDelta
            : lastEntry.thinkingText,
          rawOutput: event.rawOutputDelta
            ? (lastEntry.rawOutput || '') + event.rawOutputDelta
            : lastEntry.rawOutput,
        };
        debugLog('Appended delta to last entry', {
          id: lastEntry.id,
          thinkingLength: newLog[newLog.length - 1].thinkingText?.length || 0,
        });
      } else {
        // Append-only: create a new log entry for each event
        const newEntry: AILogEntry = {
          id: generateLogId(),
          timestamp: Date.now(),
          step: event.step,
          message: event.message || '',
          thinkingText: event.thinkingText,
          prompt: event.prompt,
          rawOutput: event.rawOutput,
          inputImages: event.inputImages,  // Include all input images for transparency
          iteration: event.iteration,
          error: event.error,
          iterationImage: event.iterationImage,
          sourceImage: inheritedSourceImage,
          maskImage: inheritedMaskImage,
          durationMs: isCompletingOrError ? elapsedMs : undefined,
        };
        newLog.push(newEntry);
        debugLog('Appended new log entry', {
          id: newEntry.id,
          step: newEntry.step,
          message: newEntry.message?.substring(0, 40),
          hasInputImages: newEntry.inputImages?.length ?? 0,
        });
      }

      // Handle thinking image based on step changes
      let thinkingImage = prev.thinkingImage;
      let thinkingStatus = prev.thinkingStatus;

      // START: When transitioning FROM idle/complete/error to any active step
      // This ensures the overlay shows for EVERY new operation, not just the first one
      const isFromInactiveState = prev.step === 'idle' || prev.step === 'complete' || prev.step === 'error';
      if (isFromInactiveState && isActiveStep) {
        debugLog('Setting thinkingStatus to thinking');
        thinkingStatus = 'thinking';
      }

      // When iteration image arrives, set it as the thinking image
      if (event.iterationImage) {
        debugLog('Setting thinkingImage', { length: event.iterationImage.length });
        thinkingImage = event.iterationImage;
      }

      // END: When complete or error, clear thinking state
      if (event.step === 'complete' || event.step === 'error') {
        thinkingStatus = 'idle';
        thinkingImage = null;
      }

      const newState: AIProgressState = {
        step: event.step,
        message: event.message ?? prev.message,
        // If delta provided, append; otherwise replace with full text
        thinkingText: event.thinkingTextDelta 
          ? prev.thinkingText + event.thinkingTextDelta
          : (event.thinkingText ?? prev.thinkingText),
        iteration: event.iteration ?? prev.iteration,
        elapsedMs,
        startTime: startTimeRef.current,
        error: event.error,
        log: newLog,
        thinkingImage,
        thinkingStatus,
      };

      return newState;
    });
  }, []);

  const appendThinking = useCallback((text: string) => {
    setState(prev => {
      // Also append to current log entry
      const newLog = [...prev.log];
      if (currentLogIdRef.current) {
        const currentIndex = newLog.findIndex(e => e.id === currentLogIdRef.current);
        if (currentIndex >= 0) {
          newLog[currentIndex] = {
            ...newLog[currentIndex],
            thinkingText: (newLog[currentIndex].thinkingText || '') + text,
          };
        }
      }

      return {
        ...prev,
        thinkingText: prev.thinkingText + text,
        log: newLog,
      };
    });
  }, []);

  const clearLog = useCallback(() => {
    setState(prev => ({
      ...prev,
      log: [],
    }));
  }, []);

  const setThinkingImage = useCallback((image: string | null) => {
    setState(prev => ({
      ...prev,
      thinkingImage: image,
    }));
  }, []);

  const setThinkingStatus = useCallback((status: ThinkingStatus) => {
    setState(prev => ({
      ...prev,
      thinkingStatus: status,
    }));
  }, []);

  const setExportData = useCallback((data: AIExportData | null) => {
    setExportDataState(data);
  }, []);

  const value: AIProgressContextType = {
    state,
    updateProgress,
    appendThinking,
    clearLog,
    setThinkingImage,
    setThinkingStatus,
    setExportData,
    exportData,
  };

  return <AIProgressContext.Provider value={value}>{children}</AIProgressContext.Provider>;
};

/**
 * Hook to access AI progress context
 * @throws Error if used outside AIProgressProvider
 */
export const useAIProgress = (): AIProgressContextType => {
  const context = useContext(AIProgressContext);
  if (!context) {
    throw new Error('useAIProgress must be used within an AIProgressProvider');
  }
  return context;
};
