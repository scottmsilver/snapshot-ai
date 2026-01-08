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
 * Thinking status for the overlay image display
 */
export type ThinkingStatus =
  | 'idle'              // No thinking image to display
  | 'thinking'          // Showing iteration image with pulsing animation
  | 'accepted'          // Iteration accepted (green flash)
  | 'rejected';         // Iteration rejected (red flash)

/**
 * An input image sent to the AI (for full transparency logging)
 */
export interface AIInputImage {
  /** Label describing what this image is (e.g., "Original Image", "Edited Result", "Mask") */
  label: string;
  /** Base64 data URL of the image */
  dataUrl: string;
}

/**
 * A single log entry in the AI console
 */
export interface AILogEntry {
  id: string;
  timestamp: number;
  step: AIProgressStep;
  message: string;
  thinkingText?: string;
  
  // Full transparency fields
  /** The prompt being sent to the AI (system prompt, user prompt, etc) */
  prompt?: string;
  /** Raw text output from the AI (non-thinking response) */
  rawOutput?: string;
  /** Incremental raw output delta (for streaming) */
  rawOutputDelta?: string;
  /** All input images sent to the AI for this call */
  inputImages?: AIInputImage[];
  
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
  /** Generated image from this iteration (base64 data URL) */
  iterationImage?: string;
  /** Debug data for self-check visualization */
  debugData?: {
    originalImage: string;  // base64 data URL
    resultImage: string;    // base64 data URL
    editRegions: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
      pixelCount: number;
    }>;
    imageWidth: number;
    imageHeight: number;
    totalChangedPixels: number;
    percentChanged: number;
  };
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

  /** Current thinking image to display in overlay (base64 data URL) */
  thinkingImage: string | null;

  /** Status of the thinking image overlay animation */
  thinkingStatus: ThinkingStatus;
}

/**
 * Event type for progress updates
 */
export interface AIProgressEvent {
  step: AIProgressStep;
  message?: string;
  thinkingText?: string;
  /** Incremental thinking text delta (for streaming - append to existing) */
  thinkingTextDelta?: string;
  
  // Full transparency fields
  /** The prompt being sent to the AI (system prompt, user prompt, etc) */
  prompt?: string;
  /** Raw text output from the AI (non-thinking response) */
  rawOutput?: string;
  /** Incremental raw output delta (for streaming) */
  rawOutputDelta?: string;
  /** All input images sent to the AI for this call */
  inputImages?: AIInputImage[];
  
  iteration?: {
    current: number;
    max: number;
  };
  error?: {
    message: string;
    details?: string;
  };
  /** Generated image from this iteration (base64 data URL) */
  iterationImage?: string;
  /** If true, forces creation of a new log entry instead of updating existing */
  newLogEntry?: boolean;
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
  thinkingImage: null,
  thinkingStatus: 'idle',
};
