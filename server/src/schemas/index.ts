/**
 * Zod validation schemas for API endpoints
 * 
 * Provides runtime validation for request bodies with detailed error messages
 */

import { z } from 'zod';

/**
 * Custom refinement for validating base64 image data URLs
 */
const imageDataUrlSchema = z.string().refine(
  (val) => val.startsWith('data:image/'),
  { message: 'Must be a valid base64 image data URL (starts with "data:image/")' }
);

/**
 * Custom refinement for non-empty strings
 */
const nonEmptyString = z.string().min(1, 'Must be a non-empty string');

// ============================================================================
// POST /api/ai/generate - Text generation
// ============================================================================

export const generateTextRequestSchema = z.object({
  model: nonEmptyString,
  contents: z.array(z.any()).min(1, { message: 'Must be a non-empty array' }),
  tools: z.array(z.any()).optional(),
  generationConfig: z.record(z.string(), z.unknown()).optional(),
  thinkingBudget: z.number().optional(),
  includeThoughts: z.boolean().optional(),
  logLabel: z.string().optional(),
});

export type GenerateTextRequest = z.infer<typeof generateTextRequestSchema>;

// ============================================================================
// POST /api/images/generate - Image generation/editing
// ============================================================================

export const generateImageRequestSchema = z.object({
  model: nonEmptyString,
  sourceImage: imageDataUrlSchema,
  prompt: nonEmptyString,
  maskImage: imageDataUrlSchema.optional(),
  isImageGeneration: z.boolean().optional(),
  logLabel: z.string().optional(),
});

export type GenerateImageRequest = z.infer<typeof generateImageRequestSchema>;

// ============================================================================
// POST /api/images/inpaint - Two-step inpainting
// ============================================================================

export const inpaintRequestSchema = z.object({
  sourceImage: imageDataUrlSchema,
  maskImage: imageDataUrlSchema,
  prompt: nonEmptyString,
  thinkingBudget: z.number().optional(),
});

export type InpaintRequest = z.infer<typeof inpaintRequestSchema>;

// ============================================================================
// POST /api/ai/agentic/edit - Agentic editing with SSE
// ============================================================================

export const agenticEditRequestSchema = z.object({
  sourceImage: imageDataUrlSchema,
  prompt: nonEmptyString,
  maskImage: imageDataUrlSchema.optional(),
  maxIterations: z.number().int().min(1).max(10).optional().default(3),
});

export type AgenticEditRequest = z.infer<typeof agenticEditRequestSchema>;
