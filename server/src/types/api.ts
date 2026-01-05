/**
 * API contract types for AI image editing endpoints
 * 
 * These types mirror the client's AICallOptions and AICallResult interfaces
 * to facilitate easy migration from direct client API calls to server-proxied calls.
 */

/**
 * Thinking budget configurations (matches client-side THINKING_BUDGETS)
 */
export const THINKING_BUDGETS = {
  HIGH: 8192,    // Complex planning and reasoning
  MEDIUM: 4096,  // Quality checks and validation
  LOW: 2048,     // Simple identification tasks
} as const;

export type ThinkingBudgetKey = keyof typeof THINKING_BUDGETS;

/**
 * AI model identifiers (matches client-side AI_MODELS)
 */
export const AI_MODELS = {
  PLANNING: 'gemini-3-flash-preview',
  IMAGE_GENERATION: 'gemini-3-pro-image-preview',
  PRO: 'gemini-3-pro-preview',
  FAST: 'gemini-3-flash-preview',
} as const;

export type AIModelKey = keyof typeof AI_MODELS;

/**
 * Progress step enum for AI operations (matches client AIProgressStep)
 */
export type AIProgressStep =
  | 'idle'
  | 'planning'
  | 'calling_api'
  | 'processing'
  | 'self_checking'
  | 'iterating'
  | 'complete'
  | 'error';

/**
 * SSE progress event for streaming operations (matches client AIProgressEvent)
 */
export interface AIProgressEvent {
  step: AIProgressStep;
  message?: string;
  thinkingText?: string;
  /** Incremental thinking text delta (for streaming - append to existing) */
  thinkingTextDelta?: string;
  
  // NEW: Add these fields for full transparency
  /** The prompt being sent to the AI (system prompt, user prompt, etc) */
  prompt?: string;
  /** Raw text output from the AI (non-thinking response) */
  rawOutput?: string;
  /** Incremental raw output delta (for streaming) */
  rawOutputDelta?: string;
  
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

// ============================================================================
// POST /api/ai/generate - Text generation
// ============================================================================

export interface GenerateTextRequest {
  /** The model to use */
  model: string;
  /** The content/prompt to send */
  contents: any[];
  /** Optional tools (function declarations) */
  tools?: any[];
  /** Generation config */
  generationConfig?: Record<string, unknown>;
  /** Thinking budget - defaults to MEDIUM */
  thinkingBudget?: number;
  /** Whether to include thoughts in response - defaults to true */
  includeThoughts?: boolean;
  /** Label for this call in the log */
  logLabel?: string;
}

export interface GenerateTextResponse {
  /** The raw result from the API */
  raw: any;
  /** Extracted text response (non-thinking parts) */
  text: string;
  /** Extracted thinking text */
  thinking: string;
  /** Function call if present */
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
}

// ============================================================================
// POST /api/ai/generate-image - Image editing with Gemini
// ============================================================================

export interface GenerateImageRequest {
  /** The model to use */
  model: string;
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Edit prompt */
  prompt: string;
  /** Optional mask image (base64 data URL) */
  maskImage?: string;
  /** Whether this is an image generation call (no thinking expected) */
  isImageGeneration?: boolean;
  /** Label for this call in the log */
  logLabel?: string;
}

export interface GenerateImageResponse {
  /** The raw result from the API */
  raw: any;
  /** Generated image (base64 data URL) */
  imageData: string;
}

// ============================================================================
// POST /api/ai/inpaint - Two-step inpainting process
// ============================================================================

export interface InpaintRequest {
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Mask image (base64 data URL) */
  maskImage: string;
  /** Edit prompt */
  prompt: string;
  /** Thinking budget for planning */
  thinkingBudget?: number;
}

export interface InpaintResponse {
  /** Generated image (base64 data URL) */
  imageData: string;
  /** AI's refined prompt used for generation */
  refinedPrompt: string;
  /** AI's thinking during planning */
  thinking: string;
}

// ============================================================================
// POST /api/ai/agentic/edit - SSE streaming agentic edit with iterations
// ============================================================================

export interface AgenticEditRequest {
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Edit prompt */
  prompt: string;
  /** Optional mask image (base64 data URL) */
  maskImage?: string;
  /** Maximum iterations (default: 3) */
  maxIterations?: number;
}

/**
 * SSE streaming response structure
 * 
 * Events:
 * - event: progress
 *   data: AIProgressEvent (JSON)
 * 
 * - event: complete
 *   data: AgenticEditResponse (JSON)
 * 
 * - event: error
 *   data: { message: string, details?: string } (JSON)
 */
export interface AgenticEditResponse {
  /** Final generated image (base64 data URL) */
  imageData: string;
  /** Number of iterations performed */
  iterations: number;
  /** Final prompt that produced the result */
  finalPrompt: string;
}

// ============================================================================
// Error response
// ============================================================================

export interface ErrorResponse {
  error: string;
  details?: string;
  stack?: string;
}
