/**
 * AI Progress tracking types for streaming progress updates during AI operations
 */

/**
 * Progress step enum representing the current phase of AI operation
 */
export type AIProgressStep = 
  | 'idle'              // No operation in progress
  | 'planning'          // Agent is planning the edit (high thinking budget)
  | 'calling_api'       // Making API call to generative model
  | 'processing'        // Processing API response
  | 'self_checking'     // Agent is evaluating the result
  | 'iterating'         // Preparing for next iteration
  | 'complete'          // Operation completed successfully
  | 'error';            // Operation failed

/**
 * A single log entry in the AI console
 */
export interface AILogEntry {
  id: string;
  timestamp: number;
  step: AIProgressStep;
  message: string;
  thinkingText?: string;
  iteration?: {
    current: number;
    max: number;
  };
  error?: {
    message: string;
    details?: string;
  };
  /** Duration in ms (set when operation completes) */
  durationMs?: number;
}

/**
 * Progress state containing all information about current AI operation
 */
export interface AIProgressState {
  /** Current step in the AI operation pipeline */
  step: AIProgressStep;
  
  /** Human-readable message describing current activity */
  message: string;
  
  /** Streamed thinking tokens from the AI (for extended thinking mode) */
  thinkingText: string;
  
  /** Current iteration information */
  iteration: {
    current: number;
    max: number;
  };
  
  /** Elapsed time in milliseconds since operation started */
  elapsedMs: number;
  
  /** Timestamp when operation started (null if idle) */
  startTime: number | null;
  
  /** Error information if step is 'error' */
  error?: {
    message: string;
    details?: string;
  };
  
  /** Persistent log of all AI operations (console style) */
  log: AILogEntry[];
}

/**
 * Event type for progress updates
 */
export interface AIProgressEvent {
  step: AIProgressStep;
  message?: string;
  thinkingText?: string;
  iteration?: {
    current: number;
    max: number;
  };
  error?: {
    message: string;
    details?: string;
  };
}

/**
 * Initial/default state for AI progress
 */
export const initialAIProgressState: AIProgressState = {
  step: 'idle',
  message: '',
  thinkingText: '',
  iteration: {
    current: 0,
    max: 0,
  },
  elapsedMs: 0,
  startTime: null,
  error: undefined,
  log: [],
};
