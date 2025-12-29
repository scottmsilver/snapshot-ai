import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  type AIProgressState,
  type AIProgressEvent,
  type AILogEntry,
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
    const needsNewOperation = isActiveStep && !currentLogIdRef.current;
    
    if (needsNewOperation) {
      startTimeRef.current = Date.now();
      currentLogIdRef.current = generateLogId();
      console.log('📊 Created new log ID:', currentLogIdRef.current);
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
      let newLog = [...prev.log];
      
      if (needsNewOperation && currentLogId) {
        // Create new log entry for this operation
        const newEntry: AILogEntry = {
          id: currentLogId,
          timestamp: Date.now(),
          step: event.step,
          message: event.message || '',
          thinkingText: event.thinkingText,
          iteration: event.iteration,
          error: event.error,
        };
        newLog.push(newEntry);
        console.log('📊 Created new log entry, total entries:', newLog.length);
      } else if (currentLogId) {
        // Update the current log entry
        const currentIndex = newLog.findIndex(e => e.id === currentLogId);
        console.log('📊 Updating log entry at index:', currentIndex, 'for ID:', currentLogId);
        if (currentIndex >= 0) {
          const currentEntry = newLog[currentIndex];
          newLog[currentIndex] = {
            ...currentEntry,
            step: event.step,
            message: event.message || currentEntry.message,
            // Replace thinking text (don't append - the caller sends full text)
            thinkingText: event.thinkingText ?? currentEntry.thinkingText,
            iteration: event.iteration || currentEntry.iteration,
            error: event.error,
            durationMs: isCompletingOrError ? elapsedMs : undefined,
          };
          console.log('📊 Updated entry thinkingText length:', newLog[currentIndex].thinkingText?.length || 0);
        }
      } else {
        console.log('📊 No log entry to update - no currentLogId');
      }

      const newState: AIProgressState = {
        step: event.step,
        message: event.message ?? prev.message,
        thinkingText: event.thinkingText ?? prev.thinkingText,
        iteration: event.iteration ?? prev.iteration,
        elapsedMs,
        startTime: startTimeRef.current,
        error: event.error,
        log: newLog,
      };

      return newState;
    });
  }, []);

  const appendThinking = useCallback((text: string) => {
    setState(prev => {
      // Also append to current log entry
      let newLog = [...prev.log];
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

  const value: AIProgressContextType = {
    state,
    updateProgress,
    appendThinking,
    clearLog,
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
