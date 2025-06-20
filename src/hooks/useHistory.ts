import { useState, useCallback, useRef } from 'react';
import type { HistoryState, UseHistoryReturn } from '@/types/history';

const MAX_HISTORY_SIZE = 50;

export const useHistory = (initialState?: string): UseHistoryReturn => {
  const [history, setHistory] = useState<HistoryState[]>(() => {
    if (initialState) {
      return [{
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        data: initialState,
        description: 'Initial state'
      }];
    }
    return [];
  });
  
  const [currentIndex, setCurrentIndex] = useState(() => initialState ? 0 : -1);
  
  // Use ref to avoid stale closures in callbacks
  const historyRef = useRef(history);
  const currentIndexRef = useRef(currentIndex);
  
  // Update refs when state changes
  historyRef.current = history;
  currentIndexRef.current = currentIndex;

  const pushState = useCallback((data: string, description?: string) => {
    const newState: HistoryState = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      data,
      description
    };

    setHistory(prev => {
      // Remove any states after current index (clear redo stack)
      const newHistory = prev.slice(0, currentIndexRef.current + 1);
      
      // Add new state
      newHistory.push(newState);
      
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
      }
      
      return newHistory;
    });
    
    setCurrentIndex(prev => {
      const newIndex = Math.min(prev + 1, MAX_HISTORY_SIZE - 1);
      return newIndex;
    });
  }, []);

  const undo = useCallback(() => {
    if (currentIndexRef.current > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, []);

  const redo = useCallback(() => {
    if (currentIndexRef.current < historyRef.current.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  const getCurrentState = useCallback((): HistoryState | null => {
    if (currentIndex >= 0 && currentIndex < history.length) {
      return history[currentIndex];
    }
    return null;
  }, [currentIndex, history]);

  return {
    // State
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    historySize: history.length,
    currentIndex,
    
    // Actions
    pushState,
    undo,
    redo,
    clearHistory,
    
    // Get current state
    getCurrentState
  };
};