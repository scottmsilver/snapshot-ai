export interface HistoryState {
  id: string;
  timestamp: number;
  data: string; // JSON serialized Konva stage
  description?: string; // Optional description of the action
}

export interface UseHistoryReturn {
  // State
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  currentIndex: number;
  
  // Actions
  pushState: (data: string, description?: string) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  
  // Get current state
  getCurrentState: () => HistoryState | null;
}