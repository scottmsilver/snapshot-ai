/**
 * Legacy AI manipulation case recorder.
 * 
 * @deprecated Use the shared aiInteractionExportService instead:
 *   import { downloadInteractionZip, createBundleFromLogEntries } from '@/services/aiInteractionExportService';
 * 
 * This module is kept for backward compatibility with existing code.
 */

import {
  downloadInteractionZip,
  type AIInteractionBundle,
  type AIInteractionMetadata,
} from '@/services/aiInteractionExportService';

/**
 * @deprecated Use AIInteractionBundle from aiInteractionExportService instead
 */
export interface AiManipulationCase {
  id: string;
  type: 'ai_reference_manipulation';
  createdAt: string;
  canvas: {
    width: number;
    height: number;
  };
  command: string;
  enrichedPrompt: string;
  movePlan: unknown;
  referencePoints: Array<{ label: string; x: number; y: number }>;
  markupShapes: unknown[];
  sourceImageDataUrl: string;
  alphaMaskDataUrl: string;
  outputImageDataUrl: string;
  models: {
    planning: string;
    generation: string;
  };
}

/**
 * Converts legacy AiManipulationCase to the new AIInteractionBundle format
 */
function convertToBundle(caseData: AiManipulationCase): AIInteractionBundle {
  const metadata: AIInteractionMetadata = {
    id: caseData.id,
    type: caseData.type,
    createdAt: caseData.createdAt,
    canvas: caseData.canvas,
    models: caseData.models,
    enrichedPrompt: caseData.enrichedPrompt,
    movePlan: caseData.movePlan,
    referencePoints: caseData.referencePoints,
    markupShapes: caseData.markupShapes,
  };

  return {
    sourceImage: caseData.sourceImageDataUrl,
    maskImage: caseData.alphaMaskDataUrl,
    resultImage: caseData.outputImageDataUrl,
    prompt: caseData.command,
    events: [], // Legacy format didn't have events
    metadata,
  };
}

/**
 * Downloads an AI manipulation case as a zip file.
 * 
 * @deprecated Use downloadInteractionZip from aiInteractionExportService instead
 */
export async function downloadAiManipulationCase(caseData: AiManipulationCase): Promise<void> {
  const bundle = convertToBundle(caseData);
  await downloadInteractionZip(bundle);
}
