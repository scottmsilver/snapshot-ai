/**
 * Centralized AI model configuration
 *
 * Update model names here when new versions are available.
 * All AI services should import from this file.
 */

export const AI_MODELS = {
  // Planning, reasoning, and text analysis (flash = fast, cheap)
  PLANNING: 'gemini-3-flash-preview',

  // Image generation and editing (pro with image output)
  IMAGE_GENERATION: 'gemini-3-pro-image-preview',

  // Pro model for complex reasoning without image output
  PRO: 'gemini-3-pro-preview',

  // Quick tasks (element identification, simple checks)
  FAST: 'gemini-3-flash-preview',
} as const;

// Thinking budget configurations
export const THINKING_BUDGETS = {
  HIGH: 8192,    // Complex planning and reasoning
  MEDIUM: 4096,  // Quality checks and validation
  LOW: 2048,     // Simple identification tasks
} as const;

export type AIModelKey = keyof typeof AI_MODELS;
export type ThinkingBudgetKey = keyof typeof THINKING_BUDGETS;
