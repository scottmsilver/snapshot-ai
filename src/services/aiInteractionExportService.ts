import JSZip from 'jszip';

/**
 * Core bundle interface for AI interaction exports.
 * Generic enough for AI Manipulation, AI Fill/Mask, and future AI features.
 */
export interface AIInteractionBundle {
  /** Source image before AI processing (base64 data URL) */
  sourceImage: string;
  /** Optional mask image for inpainting operations (base64 data URL) */
  maskImage?: string;
  /** Result image after AI processing (base64 data URL) */
  resultImage: string;
  /** User's prompt or command */
  prompt: string;
  /** AI events/log entries from the operation */
  events: AIExportEvent[];
  /** Additional metadata about the interaction */
  metadata: AIInteractionMetadata;
}

/**
 * Event entry for AI operation logging
 */
export interface AIExportEvent {
  timestamp: number;
  step: string;
  message: string;
  thinkingText?: string;
  prompt?: string;
  rawOutput?: string;
  iteration?: {
    current: number;
    max: number;
  };
  error?: {
    message: string;
    details?: string;
  };
  durationMs?: number;
}

/**
 * Metadata about the AI interaction
 */
export interface AIInteractionMetadata {
  /** Unique identifier for this interaction */
  id: string;
  /** Type of AI operation */
  type: 'ai_fill' | 'ai_manipulation' | 'ai_reference' | 'ai_move' | string;
  /** When the interaction was created */
  createdAt: string;
  /** Canvas dimensions */
  canvas?: {
    width: number;
    height: number;
  };
  /** Models used in the operation */
  models?: {
    planning?: string;
    generation?: string;
  };
  /** For AI manipulation: enriched prompt after AI planning */
  enrichedPrompt?: string;
  /** For AI manipulation: the move plan */
  movePlan?: unknown;
  /** For AI manipulation: reference points */
  referencePoints?: Array<{ label: string; x: number; y: number }>;
  /** For AI manipulation: markup shapes */
  markupShapes?: unknown[];
  /** Any additional custom metadata */
  [key: string]: unknown;
}

/**
 * Sanitizes a filename by replacing invalid characters
 */
function sanitizeFilename(value: string): string {
  return value.replace(/[:.]/g, '-').replace(/[/\\?%*|"<>]/g, '_');
}

/**
 * Converts a base64 data URL to a Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Creates a zip file containing all AI interaction data.
 * 
 * Structure:
 * - assets/
 *   - source.png
 *   - mask.png (if present)
 *   - result.png
 * - case.json (full metadata with paths instead of data URLs)
 * - prompt.txt (user prompt)
 * - enriched-prompt.txt (if present)
 * - events.json (AI operation events/log)
 * - Additional metadata files as needed
 * 
 * @param bundle The AI interaction bundle to export
 * @returns A Blob containing the zip file
 */
export async function createInteractionZip(bundle: AIInteractionBundle): Promise<Blob> {
  const zip = new JSZip();
  const assets = zip.folder('assets');

  if (!assets) {
    throw new Error('Failed to create assets folder in zip');
  }

  // Convert images to blobs and add to assets folder
  const sourceBlob = await dataUrlToBlob(bundle.sourceImage);
  assets.file('source.png', sourceBlob);

  if (bundle.maskImage) {
    const maskBlob = await dataUrlToBlob(bundle.maskImage);
    assets.file('mask.png', maskBlob);
  }

  const resultBlob = await dataUrlToBlob(bundle.resultImage);
  assets.file('result.png', resultBlob);

  // Create case.json with paths instead of data URLs
  const caseJson: Record<string, unknown> = {
    ...bundle.metadata,
    prompt: bundle.prompt,
    sourceImagePath: 'assets/source.png',
    resultImagePath: 'assets/result.png',
  };

  if (bundle.maskImage) {
    caseJson.maskImagePath = 'assets/mask.png';
  }

  // Add events summary to case
  caseJson.eventCount = bundle.events.length;
  caseJson.totalDurationMs = bundle.events.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  zip.file('case.json', JSON.stringify(caseJson, null, 2));

  // Add prompt file
  zip.file('prompt.txt', bundle.prompt);

  // Add enriched prompt if present
  if (bundle.metadata.enrichedPrompt) {
    zip.file('enriched-prompt.txt', bundle.metadata.enrichedPrompt);
  }

  // Add events log
  zip.file('events.json', JSON.stringify(bundle.events, null, 2));

  // Add reference points if present (for AI manipulation)
  if (bundle.metadata.referencePoints) {
    zip.file('reference-points.json', JSON.stringify(bundle.metadata.referencePoints, null, 2));
  }

  // Add move plan if present (for AI manipulation)
  if (bundle.metadata.movePlan) {
    zip.file('move-plan.json', JSON.stringify(bundle.metadata.movePlan, null, 2));
  }

  // Add markup shapes if present
  if (bundle.metadata.markupShapes) {
    zip.file('markup-shapes.json', JSON.stringify(bundle.metadata.markupShapes, null, 2));
  }

  // Generate the zip blob
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Creates and triggers download of an AI interaction zip file.
 * 
 * @param bundle The AI interaction bundle to export
 * @param filename Optional custom filename (without .zip extension)
 */
export async function downloadInteractionZip(
  bundle: AIInteractionBundle,
  filename?: string
): Promise<void> {
  const zipBlob = await createInteractionZip(bundle);
  
  // Generate filename from bundle ID or use provided filename
  const baseName = filename || sanitizeFilename(bundle.metadata.id || 'ai-interaction');
  const fullFilename = `${baseName}.zip`;

  // Create download link and trigger download
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fullFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Helper to create a bundle from AI log entries
 */
export function createBundleFromLogEntries(
  sourceImage: string,
  resultImage: string,
  prompt: string,
  logEntries: Array<{
    timestamp: number;
    step: string;
    message: string;
    thinkingText?: string;
    prompt?: string;
    rawOutput?: string;
    iteration?: { current: number; max: number };
    error?: { message: string; details?: string };
    durationMs?: number;
  }>,
  metadata: Partial<AIInteractionMetadata> = {},
  maskImage?: string
): AIInteractionBundle {
  const id = metadata.id || `ai-${metadata.type || 'interaction'}-${Date.now()}`;
  
  return {
    sourceImage,
    maskImage,
    resultImage,
    prompt,
    events: logEntries.map(entry => ({
      timestamp: entry.timestamp,
      step: entry.step,
      message: entry.message,
      thinkingText: entry.thinkingText,
      prompt: entry.prompt,
      rawOutput: entry.rawOutput,
      iteration: entry.iteration,
      error: entry.error,
      durationMs: entry.durationMs,
    })),
    metadata: {
      id,
      type: metadata.type || 'ai_interaction',
      createdAt: metadata.createdAt || new Date().toISOString(),
      ...metadata,
    },
  };
}
