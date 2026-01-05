import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { createCanvas, loadImage, ImageData, Image } from 'canvas';
import AdmZip from 'adm-zip';
import { AgenticPainterService } from '../src/services/agenticService';
import { createGenerativeService } from '../src/services/generativeApi';
import { detectEditRegions } from '../src/services/imageCompareService';

dotenv.config();

if (!globalThis.document) {
  globalThis.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') {
        throw new Error(`Unsupported element: ${tag}`);
      }
      return createCanvas(1, 1);
    },
  } as Document;
}

if (!globalThis.window) {
  globalThis.window = {
    setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
    clearInterval: (...args: Parameters<typeof clearInterval>) => clearInterval(...args),
  } as Window & typeof globalThis;
}

if (!globalThis.ImageData) {
  globalThis.ImageData = ImageData;
}

if (!globalThis.Image) {
  globalThis.Image = Image as typeof globalThis.Image;
}

interface AiManipulationCase {
  id: string;
  type: 'ai_reference_manipulation';
  createdAt: string;
  canvas: { width: number; height: number };
  command: string;
  enrichedPrompt: string;
  movePlan: unknown;
  referencePoints: Array<{ label: string; x: number; y: number }>;
  markupShapes: unknown[];
  sourceImagePath?: string;
  alphaMaskPath?: string;
  outputImagePath?: string;
  baselineOutputPath?: string;
  models: { planning: string; generation: string };
}

function getArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

async function bufferToImageData(buffer: Buffer): Promise<ImageData> {
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function writeBufferPng(buffer: Buffer, outputPath: string): Promise<void> {
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const out = canvas.toBuffer('image/png');
  await fs.writeFile(outputPath, out);
}

async function writeImageDataPng(imageData: ImageData, outputPath: string): Promise<void> {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(outputPath, buffer);
}

async function main(): Promise<void> {
  const casePath = process.argv[2];
  if (!casePath) {
    console.error('Usage: npm run eval:ai-manip -- <case.json> [--out output-dir]');
    process.exit(1);
  }

  const outputRoot = getArgValue('--out') || path.resolve(process.cwd(), 'ai-manipulation-runs');
  if (!casePath.endsWith('.zip')) {
    throw new Error('Expected a .zip bundle from the client recorder.');
  }

  const inputZip = new AdmZip(casePath);
  const caseEntry = inputZip.getEntry('case.json');
  if (!caseEntry) {
    throw new Error('Zip bundle missing case.json');
  }
  const caseData = JSON.parse(caseEntry.getData().toString('utf-8')) as AiManipulationCase;

  const caseId = caseData.id || path.basename(casePath, path.extname(casePath));
  const runDir = path.join(outputRoot, caseId, new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(runDir, { recursive: true });
  const assetsDir = path.join(runDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.VITE_GENERATIVE_API_KEY;

  if (!apiKey) {
    console.error('Missing API key. Set GEMINI_API_KEY or VITE_GEMINI_API_KEY.');
    process.exit(1);
  }

  const getZipBuffer = (entryPath?: string): Buffer => {
    if (!entryPath) {
      throw new Error('Zip entry not available');
    }
    const entry = inputZip.getEntry(entryPath);
    if (!entry) {
      throw new Error(`Zip bundle missing ${entryPath}`);
    }
    return entry.getData();
  };

  const sourceImage = await bufferToImageData(getZipBuffer(caseData.sourceImagePath));
  const baselineImage = await bufferToImageData(getZipBuffer(caseData.baselineOutputPath || caseData.outputImagePath));

  const apiEndpoint =
    process.env.VITE_GENERATIVE_API_ENDPOINT ||
    process.env.GENERATIVE_API_ENDPOINT ||
    '';
  const generativeService = createGenerativeService(
    apiKey,
    'gemini',
    undefined,
    'gemini',
    'gemini',
    apiEndpoint
  );
  const agenticService = new AgenticPainterService(apiKey, generativeService);

  const resultImage = await agenticService.edit(
    sourceImage,
    caseData.enrichedPrompt,
    undefined,
  );

  const sourcePath = path.join(assetsDir, 'source.png');
  const baselinePath = path.join(assetsDir, 'baseline.png');
  const alphaMaskPath = path.join(assetsDir, 'alpha-mask.png');
  const outputPath = path.join(assetsDir, 'output.png');

  await writeBufferPng(getZipBuffer(caseData.sourceImagePath), sourcePath);
  await writeBufferPng(getZipBuffer(caseData.baselineOutputPath || caseData.outputImagePath), baselinePath);
  if (caseData.alphaMaskPath) {
    await writeBufferPng(getZipBuffer(caseData.alphaMaskPath), alphaMaskPath);
  }
  await writeImageDataPng(resultImage, outputPath);

  const diffResult = detectEditRegions(baselineImage, resultImage);
  const report = {
    caseId,
    createdAt: new Date().toISOString(),
    baselinePercentChanged: diffResult.percentChanged,
    baselineRegions: diffResult.regions.length,
    totalChangedPixels: diffResult.totalChangedPixels,
  };

  const sanitizedCase = {
    ...caseData,
    sourceImagePath: 'assets/source.png',
    alphaMaskPath: 'assets/alpha-mask.png',
    outputImagePath: 'assets/output.png',
    baselineOutputPath: 'assets/baseline.png',
  };

  await fs.writeFile(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(runDir, 'case.json'), JSON.stringify(sanitizedCase, null, 2));

  const outputZip = new AdmZip();
  outputZip.addLocalFolder(runDir);
  const zipPath = `${runDir}.zip`;
  outputZip.writeZip(zipPath);

  console.log(`Run complete: ${runDir}`);
  console.log(`Bundle: ${zipPath}`);
}

main().catch((error) => {
  console.error('Failed to run manipulation case:', error);
  process.exit(1);
});
