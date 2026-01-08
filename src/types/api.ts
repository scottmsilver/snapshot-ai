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
 * An input image sent to the AI (for full transparency logging)
 */
export interface AIInputImage {
  /** Label describing what this image is (e.g., "Original Image", "Edited Result", "Mask") */
  label: string;
  /** Base64 data URL of the image */
  dataUrl: string;
}

/**
 * SSE progress event for streaming operations (matches client AIProgressEvent)
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

// ============================================================================
// POST /api/ai/generate - Text generation
// ============================================================================

/**
 * Gemini content part - text or inline data
 * @see https://ai.google.dev/api/generate-content#v1beta.Content
 */
export interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

/**
 * Gemini content structure for multi-turn conversations
 * Note: role is string to accept frontend AIContent which uses string
 */
export interface GeminiContent {
  role: string;
  parts: GeminiContentPart[];
}

/**
 * Gemini function declaration for tool use
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GenerateTextRequest {
  /** The model to use */
  model: string;
  /** The content/prompt to send (Gemini Content format) */
  contents: GeminiContent[];
  /** Optional tools (function declarations) - flexible to accept frontend AIToolDeclaration */
  tools?: Array<{ functionDeclarations?: GeminiFunctionDeclaration[] }>;
  /** Generation config */
  generationConfig?: Record<string, unknown>;
  /** Thinking budget - defaults to MEDIUM */
  thinkingBudget?: number;
  /** Whether to include thoughts in response - defaults to true */
  includeThoughts?: boolean;
  /** Label for this call in the log */
  logLabel?: string;
}

/**
 * Raw Gemini API response structure (simplified)
 * Full type would require @google/generative-ai types
 */
export interface GeminiRawResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface GenerateTextResponse {
  /** The raw result from the API (Gemini response structure) */
  raw: GeminiRawResponse;
  /** Extracted text response (non-thinking parts) */
  text: string;
  /** Extracted thinking text */
  thinking: string;
  /** Function call if present */
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
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
  /** The raw result from the API (Gemini response structure) */
  raw: GeminiRawResponse;
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

/**
 * InpaintResponse - now returns same format as AgenticEditResponse
 * since both endpoints use the agentic graph
 */
export interface InpaintResponse {
  /** Generated image (base64 data URL) */
  imageData: string;
  /** Number of iterations performed */
  iterations: number;
  /** Final prompt that produced the result */
  finalPrompt: string;
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
