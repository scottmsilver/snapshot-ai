import { useCallback } from 'react';
import {
  createInteractionZip,
  downloadInteractionZip,
  createBundleFromLogEntries,
  type AIInteractionBundle,
  type AIInteractionMetadata,
  type AIExportEvent,
} from '@/services/aiInteractionExportService';

/**
 * Options for creating an AI interaction export
 */
export interface UseAIInteractionExportOptions {
  /** Source image (base64 data URL) */
  sourceImage: string;
  /** Result image (base64 data URL) */
  resultImage: string;
  /** User's prompt or command */
  prompt: string;
  /** Optional mask image for inpainting (base64 data URL) */
  maskImage?: string;
  /** AI log entries from the operation */
  logEntries?: AIExportEvent[];
  /** Metadata about the interaction */
  metadata?: Partial<AIInteractionMetadata>;
}

/**
 * Return type for the useAIInteractionExport hook
 */
export interface UseAIInteractionExportReturn {
  /** Create a zip blob from the current interaction data */
  createZip: () => Promise<Blob>;
  /** Download the interaction as a zip file */
  downloadZip: (filename?: string) => Promise<void>;
  /** Create a bundle object (useful for inspection/debugging) */
  createBundle: () => AIInteractionBundle;
}

/**
 * Hook for exporting AI interaction data as zip files.
 * 
 * Works with any AI feature that produces source -> result transformations,
 * including AI Fill (with mask), AI Manipulation, AI Reference, etc.
 * 
 * @example
 * ```tsx
 * const { downloadZip } = useAIInteractionExport({
 *   sourceImage: sourceDataUrl,
 *   resultImage: resultDataUrl,
 *   prompt: userPrompt,
 *   maskImage: maskDataUrl, // optional
 *   logEntries: aiLogEntries,
 *   metadata: {
 *     type: 'ai_fill',
 *     canvas: { width: 800, height: 600 },
 *   },
 * });
 * 
 * const handleExport = () => downloadZip('my-ai-edit');
 * ```
 */
export function useAIInteractionExport(
  options: UseAIInteractionExportOptions
): UseAIInteractionExportReturn {
  const {
    sourceImage,
    resultImage,
    prompt,
    maskImage,
    logEntries = [],
    metadata = {},
  } = options;

  const createBundle = useCallback((): AIInteractionBundle => {
    return createBundleFromLogEntries(
      sourceImage,
      resultImage,
      prompt,
      logEntries,
      metadata,
      maskImage
    );
  }, [sourceImage, resultImage, prompt, logEntries, metadata, maskImage]);

  const createZip = useCallback(async (): Promise<Blob> => {
    const bundle = createBundle();
    return createInteractionZip(bundle);
  }, [createBundle]);

  const downloadZip = useCallback(async (filename?: string): Promise<void> => {
    const bundle = createBundle();
    return downloadInteractionZip(bundle, filename);
  }, [createBundle]);

  return {
    createZip,
    downloadZip,
    createBundle,
  };
}

// Re-export types and functions from the service for convenience
export type {
  AIInteractionBundle,
  AIInteractionMetadata,
  AIExportEvent,
} from '@/services/aiInteractionExportService';

export {
  createInteractionZip,
  downloadInteractionZip,
  createBundleFromLogEntries,
} from '@/services/aiInteractionExportService';
