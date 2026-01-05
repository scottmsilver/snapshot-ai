import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  type AIProgressState,
  type AIProgressEvent,
  type AILogEntry,
  type ThinkingStatus,
  initialAIProgressState,
} from '@/types/aiProgress';

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
const generateLogId = (): string => `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * AIProgressProvider component that manages AI progress state
 */
export const AIProgressProvider: React.FC<AIProgressProviderProps> = ({ children }) => {
  const [state, setState] = useState<AIProgressState>(initialAIProgressState);
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

    // Determine if we need to start a new operation BEFORE entering setState
    // This prevents race conditions with multiple rapid calls
    // Create new entry if: (1) first active step, OR (2) server explicitly requests new entry
    const needsNewOperation = (isActiveStep && !currentLogIdRef.current) || event.newLogEntry;

    if (needsNewOperation) {
      startTimeRef.current = Date.now();
      currentLogIdRef.current = generateLogId();
      // Debug: console.log('📊 Created new log ID:', currentLogIdRef.current);
    }

    // Stop timer on complete or error
    if (isCompletingOrError && timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const currentLogId = currentLogIdRef.current;

    // Reset refs on complete/error AFTER capturing the current ID
    if (isCompletingOrError) {
      currentLogIdRef.current = null;
      startTimeRef.current = null;
    }

    setState(prev => {
      const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current : prev.elapsedMs;

      // Build new log entry or update existing one
      const newLog = [...prev.log];

      if (needsNewOperation && currentLogId) {
        // Create new log entry for this operation
        const newEntry: AILogEntry = {
          id: currentLogId,
          timestamp: Date.now(),
          step: event.step,
          message: event.message || '',
          thinkingText: event.thinkingText,
          prompt: event.prompt,
          rawOutput: event.rawOutput,
          iteration: event.iteration,
          error: event.error,
          iterationImage: event.iterationImage,
        };
        newLog.push(newEntry);
        // Debug: console.log('📊 Created new log entry, total entries:', newLog.length);
      } else if (currentLogId) {
        // Update the current log entry
        const currentIndex = newLog.findIndex(e => e.id === currentLogId);
        // Debug: console.log('📊 Updating log entry at index:', currentIndex, 'for ID:', currentLogId);
        if (currentIndex >= 0) {
          const currentEntry = newLog[currentIndex];
          newLog[currentIndex] = {
            ...currentEntry,
            step: event.step,
            message: event.message || currentEntry.message,
            // If delta provided, append; otherwise replace with full text
            thinkingText: event.thinkingTextDelta 
              ? (currentEntry.thinkingText || '') + event.thinkingTextDelta
              : (event.thinkingText ?? currentEntry.thinkingText),
            // Handle prompt (replace if provided)
            prompt: event.prompt ?? currentEntry.prompt,
            // Handle rawOutput (append delta or replace)
            rawOutput: event.rawOutputDelta
              ? (currentEntry.rawOutput || '') + event.rawOutputDelta
              : (event.rawOutput ?? currentEntry.rawOutput),
            iteration: event.iteration || currentEntry.iteration,
            error: event.error,
            durationMs: isCompletingOrError ? elapsedMs : undefined,
            // Keep latest iteration image if provided
            iterationImage: event.iterationImage ?? currentEntry.iterationImage,
          };
          // Debug: console.log('📊 Updated entry thinkingText length:', newLog[currentIndex].thinkingText?.length || 0);
        }
      }
      // No else needed - it's normal to have no currentLogId after operation ends

      // Handle thinking image based on step changes
      let thinkingImage = prev.thinkingImage;
      let thinkingStatus = prev.thinkingStatus;

      // START: When transitioning FROM idle/complete/error to any active step
      // This ensures the overlay shows for EVERY new operation, not just the first one
      const isFromInactiveState = prev.step === 'idle' || prev.step === 'complete' || prev.step === 'error';
      if (isFromInactiveState && isActiveStep) {
        console.log('🎨 Setting thinkingStatus to thinking');
        thinkingStatus = 'thinking';
      }

      // When iteration image arrives, set it as the thinking image
      if (event.iterationImage) {
        console.log('🎨 Setting thinkingImage, length:', event.iterationImage.length);
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

  const value: AIProgressContextType = {
    state,
    updateProgress,
    appendThinking,
    clearLog,
    setThinkingImage,
    setThinkingStatus,
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
