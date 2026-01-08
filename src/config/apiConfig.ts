/**
 * Server API configuration
 * 
 * Reads server URL from VITE_API_URL environment variable.
 * Defaults to localhost:3001 for local development.
 */

const DEFAULT_API_URL = 'http://localhost:3001';

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
 * API endpoint paths
 * Note: No leading slashes - ky uses these with prefixUrl
 */
export const API_ENDPOINTS = {
  /** POST /api/ai/generate - Text generation */
  GENERATE_TEXT: 'api/ai/generate',
  
  /** POST /api/ai/generate-image - Image editing with Gemini */
  GENERATE_IMAGE: 'api/ai/generate-image',
  
  /** POST /api/ai/inpaint - Two-step inpainting process */
  INPAINT: 'api/ai/inpaint',
  
  /** POST /api/ai/inpaint-stream - SSE streaming inpaint (wraps Python backend) */
  INPAINT_STREAM: 'api/ai/inpaint-stream',
  
  /** POST /api/ai/agentic/edit - SSE streaming agentic edit with iterations (Express) */
  AGENTIC_EDIT: 'api/ai/agentic/edit',
  
  /** POST /api/python/agentic/edit - SSE streaming agentic edit with LangGraph (proxied to Python) */
  AGENTIC_EDIT_LANGGRAPH: 'api/python/agentic/edit',
  

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
