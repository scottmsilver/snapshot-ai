import JSZip from 'jszip';

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

function sanitizeFilename(value: string): string {
  return value.replace(/[:.]/g, '-');
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function downloadAiManipulationCase(caseData: AiManipulationCase): Promise<void> {
  const zip = new JSZip();
  const assets = zip.folder('assets');

  if (!assets) {
    throw new Error('Failed to create assets folder');
  }

  const sourceBlob = await dataUrlToBlob(caseData.sourceImageDataUrl);
  const alphaMaskBlob = await dataUrlToBlob(caseData.alphaMaskDataUrl);
  const outputBlob = await dataUrlToBlob(caseData.outputImageDataUrl);

  assets.file('source.png', sourceBlob);
  assets.file('alpha-mask.png', alphaMaskBlob);
  assets.file('output.png', outputBlob);

  const caseJson = {
    ...caseData,
    sourceImagePath: 'assets/source.png',
    alphaMaskPath: 'assets/alpha-mask.png',
    outputImagePath: 'assets/output.png',
  };
  delete (caseJson as Partial<AiManipulationCase>).sourceImageDataUrl;
  delete (caseJson as Partial<AiManipulationCase>).alphaMaskDataUrl;
  delete (caseJson as Partial<AiManipulationCase>).outputImageDataUrl;

  zip.file('case.json', JSON.stringify(caseJson, null, 2));
  zip.file('command.txt', caseData.command);
  zip.file('enriched-prompt.txt', caseData.enrichedPrompt);
  zip.file('reference-points.json', JSON.stringify(caseData.referencePoints, null, 2));
  zip.file('markup-shapes.json', JSON.stringify(caseData.markupShapes, null, 2));
  zip.file('move-plan.json', JSON.stringify(caseData.movePlan, null, 2));

  const bundle = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(bundle);
  const link = document.createElement('a');
  const filename = sanitizeFilename(caseData.id || 'ai-manipulation-case');

  link.href = url;
  link.download = `${filename}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
