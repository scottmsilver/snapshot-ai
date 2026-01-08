/**
 * Server API configuration
 * 
 * Reads server URL from VITE_API_URL environment variable.
 * Defaults to localhost:8001 for local development (Python FastAPI server).
 */

const DEFAULT_API_URL = 'http://localhost:8001';

/**
 * Check if server-side AI is enabled (default: true)
 * Set VITE_USE_SERVER_AI=false to use direct client-side Gemini calls (legacy mode)
 */
export function isServerAIEnabled(): boolean {
  return import.meta.env.VITE_USE_SERVER_AI !== 'false';
}



/**
 * Get the API base URL from environment or use default
 */
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || DEFAULT_API_URL;
}



/**
 * API endpoint paths (Python FastAPI server)
 * Note: No leading slashes - ky uses these with prefixUrl
 * 
 * Python server has redirects for backward compatibility:
 * - /api/ai/agentic/edit -> /api/agentic/edit
 * - /api/ai/generate-image -> /api/images/generate
 * - /api/ai/inpaint -> /api/images/inpaint
 */
export const API_ENDPOINTS = {
  /** POST /api/ai/generate - Text generation */
  GENERATE_TEXT: 'api/ai/generate',
  
  /** POST /api/images/generate - Image editing with Gemini (Python native route) */
  GENERATE_IMAGE: 'api/images/generate',
  
  /** POST /api/images/inpaint - Two-step inpainting process (Python native route) */
  INPAINT: 'api/images/inpaint',
  
  /** POST /api/ai/inpaint-stream - SSE streaming inpaint */
  INPAINT_STREAM: 'api/ai/inpaint-stream',
  
  /** POST /api/agentic/edit - SSE streaming agentic edit with LangGraph (Python native route) */
  AGENTIC_EDIT: 'api/agentic/edit',
  
  /** @deprecated Alias for AGENTIC_EDIT - both now use Python LangGraph backend */
  AGENTIC_EDIT_LANGGRAPH: 'api/agentic/edit',

} as const;

/**
 * Build full URL for an API endpoint
 */
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiUrl();
  // Remove trailing slash from base URL if present
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}
