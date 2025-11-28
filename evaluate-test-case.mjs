#!/usr/bin/env node

/**
 * Evaluate Test Case from ZIP
 *
 * Takes a test case ZIP file, extracts it, generates marked image, and evaluates with Gemini.
 *
 * Usage:
 *   node evaluate-test-case.mjs <test-case.zip>
 *
 * Example:
 *   node evaluate-test-case.mjs window-test.zip
 */

import { GoogleGenAI } from '@google/genai';
import AdmZip from 'adm-zip';
import { createCanvas, loadImage } from 'canvas';
import cliProgress from 'cli-progress';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Check for API key in multiple possible environment variables
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY ||
                       process.env.GEMINI_API_KEY ||
                       process.env.GOOGLE_API_KEY;
const OUTPUT_DIR = './evaluation-results';

if (!GEMINI_API_KEY) {
  console.error('Error: Gemini API key not found');
  console.error('Please set one of these environment variables in .env file:');
  console.error('  - VITE_GEMINI_API_KEY');
  console.error('  - GEMINI_API_KEY');
  console.error('  - GOOGLE_API_KEY');
  console.error('\nOr export as environment variable:');
  console.error('  export GEMINI_API_KEY="your-api-key-here"');
  console.error('  node evaluate-test-case.mjs test.zip');
  process.exit(1);
}

function imageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

async function createMarkedImage(sourceImagePath, maskImagePath, outputPath) {
  console.log('  Creating marked image...');
  const sourceImage = await loadImage(sourceImagePath);
  const maskImage = await loadImage(maskImagePath);

  if (sourceImage.width !== maskImage.width || sourceImage.height !== maskImage.height) {
    throw new Error('Source and mask images must have the same dimensions');
  }

  const canvas = createCanvas(sourceImage.width, sourceImage.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImage, 0, 0);

  const maskCanvas = createCanvas(maskImage.width, maskImage.height);
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.drawImage(maskImage, 0, 0);
  const maskImageData = maskCtx.getImageData(0, 0, maskImage.width, maskImage.height);
  const maskData = maskImageData.data;

  ctx.strokeStyle = 'red';
  ctx.fillStyle = 'red';

  let edgePixels = [];

  for (let y = 0; y < maskImage.height; y++) {
    for (let x = 0; x < maskImage.width; x++) {
      const idx = (y * maskImage.width + x) * 4;

      if (maskData[idx] > 128) {
        const isEdge =
          x === 0 || x === maskImage.width - 1 ||
          y === 0 || y === maskImage.height - 1 ||
          (x > 0 && maskData[idx - 4] <= 128) ||
          (x < maskImage.width - 1 && maskData[idx + 4] <= 128) ||
          (y > 0 && maskData[idx - maskImage.width * 4] <= 128) ||
          (y < maskImage.height - 1 && maskData[idx + maskImage.width * 4] <= 128);

        if (isEdge) {
          edgePixels.push({ x, y });
        }
      }
    }
  }

  edgePixels.forEach(({ x, y }) => {
    ctx.fillRect(x - 1, y - 1, 3, 3);
  });

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`  ✓ Marked image created: ${outputPath}`);
}

// Helper to get description of the marked area
async function getAreaDescription(markedImage) {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const describePrompt = `This image contains a red outline marking a specific area.

Your task: Identify and describe what is inside the red outline in great detail, relative to everything else in the image.

IMPORTANT: In your description, DO NOT mention the red outline itself. Describe ONLY the actual content (objects, areas) that are marked, as if the red outline doesn't exist. The red outline is just a tool to help you identify what to describe.

Include:
- What specific object or area is marked
- Its precise location relative to other elements in the image (e.g., "the third window from the left", "the door in the bottom right corner", "the central building among five buildings")
- Distinctive visual features that differentiate it from similar objects nearby
- Spatial relationships to surrounding elements

Be extremely specific and detailed so this object can be unambiguously identified in the original image WITHOUT needing to see the red outline.`;

  const describeResult = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: markedImage } },
        { text: describePrompt }
      ]
    }]
  });

  return {
    description: describeResult.text || 'the marked area',
    describePrompt,
    describeResult
  };
}

// Helper to create super-enhanced prompt using LLM
async function createSuperEnhancedPrompt(description, userPrompt) {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const enhancePrompt = `You are helping to create an enhanced image editing prompt.

Given:
1. A detailed description of the area to be edited: "${description}"
2. The user's editing instruction: "${userPrompt}"

Your task: Combine these into a single, coherent, natural-sounding prompt that:
- Integrates the location/description details seamlessly into the instruction
- Removes any redundancy if the user already mentioned location details
- Sounds natural and fluent, not template-like
- Maintains the user's intent exactly
- Is clear and unambiguous about what to edit and how

Return ONLY the enhanced prompt text, nothing else.`;

  const result = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [{
      role: 'user',
      parts: [{ text: enhancePrompt }]
    }]
  });

  return result.text || `For the area described as "${description}", please: ${userPrompt}`;
}

// Base strategy implementations
const STRATEGIES = {
  '2step-clean-describe': {
    name: '2step-clean-describe',
    async execute(markedImage, originalImage, userPrompt, preDescription = null) {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      let description, describePrompt, describeResult;

      // If preDescription is provided (enhanced/super variants), use it
      if (preDescription) {
        description = preDescription;
        describePrompt = null;
        describeResult = null;
      } else {
        // Otherwise, generate description (base variant)
        describePrompt = `This image contains a red outline marking a specific area.

Your task: Identify and describe what is inside the red outline in great detail, relative to everything else in the image.

Include:
- What specific object or area is marked (ignore the red outline itself - it's just a marker)
- Its precise location relative to other elements in the image (e.g., "the third window from the left", "the door in the bottom right corner", "the central building among five buildings")
- Distinctive visual features that differentiate it from similar objects nearby
- Spatial relationships to surrounding elements

Be extremely specific and detailed so this object can be unambiguously identified in the original image.`;

        describeResult = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: markedImage } },
              { text: describePrompt }
            ]
          }]
        });

        description = describeResult.text || 'the marked area';
      }

      const editPrompt = `In this image, there is: ${description}

Apply this change to ONLY that specific area described above: ${userPrompt}

CRITICAL RULES:
1. Make the requested change very visible and significant to the area I described
2. DO NOT change, modify, or alter any other parts of the image
3. ONLY modify other elements if they would naturally interact with or be affected by the requested change (e.g., if adding a window, adjust reflections; if changing color, adjust shadows)
4. Preserve all unrelated elements exactly as they appear in the original image

Return the edited image.`;

    const editResult = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: originalImage } },
          { text: editPrompt }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const calls = [];

    // Only include Step 1 if we actually did description (base variant)
    if (describePrompt) {
      calls.push({
        step: 'Step 1: Describe Selection',
        model: 'gemini-3-pro-preview',
        inputImage: markedImage,
        inputPrompt: describePrompt,
        outputText: description
      });
    }

    // Always include the edit step
    calls.push({
      step: preDescription ? 'Edit Image (using pre-generated description)' : 'Step 2: Edit Image',
      model: 'gemini-3-pro-image-preview',
      inputImage: originalImage,
      inputPrompt: editPrompt,
      outputText: null
    });

    return {
      calls,
      result: editResult
    };
    }
  },

  '2step-marked-describe': {
    name: '2step-marked-describe',
    async execute(markedImage, originalImage, userPrompt, preDescription = null) {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const describePrompt = `This image contains a red outline marking a specific area.

Your task: Identify and describe what is inside the red outline in great detail, relative to everything else in the image.

Include:
- What specific object or area is marked (ignore the red outline itself - it's just a marker)
- Its precise location relative to other elements in the image (e.g., "the third window from the left", "the door in the bottom right corner", "the central building among five buildings")
- Distinctive visual features that differentiate it from similar objects nearby
- Spatial relationships to surrounding elements

Be extremely specific and detailed so this object can be unambiguously identified in the original image.`;

      const describeResult = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: markedImage } },
            { text: describePrompt }
          ]
        }]
      });

      const description = describeResult.text || 'the marked area';

      const editPrompt = `This image has a red outline marking a specific area.

That area is: ${description}

Your task:
1. Apply this change to the area inside the red outline: ${userPrompt}
2. Remove the red outline completely from the final result
3. Make the requested change very visible and significant
4. DO NOT change any other parts of the image
5. ONLY modify other elements if they would naturally interact with or be affected by the requested change (e.g., if adding a window, adjust reflections; if changing color, adjust shadows)

Return the edited image with NO red outline visible.`;

    const editResult = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: markedImage } },
          { text: editPrompt }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    return {
      calls: [
        {
          step: 'Step 1: Describe Selection',
          model: 'gemini-3-pro-preview',
          inputImage: markedImage,
          inputPrompt: describePrompt,
          outputText: description
        },
        {
          step: 'Step 2: Edit Marked Image',
          model: 'gemini-3-pro-image-preview',
          inputImage: markedImage,
          inputPrompt: editPrompt,
          outputText: null
        }
      ],
      result: editResult
    };
    }
  },

  '1step-marked-direct': {
    name: '1step-marked-direct',
    async execute(markedImage, originalImage, userPrompt, preDescription = null) {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const prompt = `This image has a red outline marking a specific area.

Your task:
1. ${userPrompt} (apply to the area inside the red outline ONLY)
2. Remove the red outline from the result
3. Return the full edited image without the red outline

CRITICAL RULES:
- Make the requested change very visible and significant to the marked area
- DO NOT change, modify, or alter any other parts of the image
- ONLY modify other elements if they would naturally interact with or be affected by the requested change (e.g., if adding a window, adjust reflections; if changing color, adjust shadows)
- Preserve all unrelated elements exactly as they appear in the original image

Make significant visible changes to the marked area only.`;

      const editResult = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: markedImage } },
            { text: prompt }
          ]
        }],
        generationConfig: { responseModalities: ['image'] }
      });

      return {
        calls: [
          {
            step: 'Single Step: Edit Marked Image',
            model: 'gemini-3-pro-image-preview',
            inputImage: markedImage,
            inputPrompt: prompt,
            outputText: null
          }
        ],
        result: editResult
      };
    }
  },

  '2step-clean-detailed': {
    name: '2step-clean-detailed',
    async execute(markedImage, originalImage, userPrompt, preDescription = null) {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const describePrompt = `This image contains a red outline marking a specific area.

Your task: Identify and describe what is inside the red outline in great detail, relative to everything else in the image.

Include:
- What specific object or area is marked (the red outline is just a visual marker, not part of the actual image)
- Its precise location relative to other elements in the image (e.g., "the third window from the left", "the door in the bottom right corner", "the central building among five buildings")
- Distinctive visual features that differentiate it from similar objects nearby
- Spatial relationships to surrounding elements
- Any unique characteristics that make it identifiable

Be extremely specific and detailed so this object can be unambiguously identified in the original image.`;

      const describeResult = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: markedImage } },
            { text: describePrompt }
          ]
        }]
      });

      const description = describeResult.text || 'the marked object';

      const editPrompt = `Image contains: ${description}

Task:
1. Locate that specific object/area
2. Apply this modification: ${userPrompt}
3. Make the change dramatic and clearly visible
4. Ensure only that specific area is modified

CRITICAL RULES:
- Make the requested change very visible and significant to the marked area
- DO NOT change, modify, or alter any other parts of the image
- ONLY modify other elements if they would naturally interact with or be affected by the requested change (e.g., if adding a window, adjust reflections; if changing color, adjust shadows)
- Preserve all unrelated elements exactly as they appear in the original image
- The rest of the image must remain completely unchanged

Return the edited image.`;

      const editResult = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: originalImage } },
            { text: editPrompt }
          ]
        }],
        generationConfig: { responseModalities: ['image'] }
      });

      return {
        calls: [
          {
            step: 'Step 1: Detailed Description',
            model: 'gemini-3-pro-preview',
            inputImage: markedImage,
            inputPrompt: describePrompt,
            outputText: description
          },
          {
            step: 'Step 2: Apply Modification',
            model: 'gemini-3-pro-image-preview',
            inputImage: originalImage,
            inputPrompt: editPrompt,
            outputText: null
          }
        ],
        result: editResult
      };
    }
  },

  '2step-clean-numbered': {
    name: '2step-clean-numbered',
    async execute(markedImage, originalImage, userPrompt, preDescription = null) {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const describePrompt = `This image contains a red outline marking a specific area.

Your task: Identify and describe what is inside the red outline in great detail, relative to everything else in the image.

STEP 1: Identify what specific object or area is inside the red outline (ignore the red outline - it's just a marker)

STEP 2: Describe its precise location relative to other elements
- Examples: "the third window from the left on the second floor", "the central door among three doors", "the building in the top-right quadrant"

STEP 3: Note distinctive visual features that differentiate it from similar objects nearby

STEP 4: Describe spatial relationships to surrounding elements

Be extremely specific and detailed so this object can be unambiguously identified in the original image.`;

      const describeResult = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: markedImage } },
            { text: describePrompt }
          ]
        }]
      });

      const description = describeResult.text || 'the marked area';

      const editPrompt = `CONTEXT: ${description}

INSTRUCTION: ${userPrompt}

STEPS TO FOLLOW:
1. Locate the specific area described above
2. Apply the instruction ONLY to that area
3. Make the change very obvious and significant
4. Leave everything else unchanged

CRITICAL RULES:
- Make the requested change very visible and significant to the marked area
- DO NOT change, modify, or alter any other parts of the image
- ONLY modify other elements if they would naturally interact with or be affected by the requested change (e.g., if adding a window, adjust reflections; if changing color, adjust shadows)
- Preserve all unrelated elements exactly as they appear in the original image
- The rest of the image must remain completely unchanged

OUTPUT: Return the edited image.`;

      const editResult = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: originalImage } },
            { text: editPrompt }
          ]
        }],
        generationConfig: { responseModalities: ['image'] }
      });

      return {
        calls: [
          {
            step: 'Step 1: Numbered Description',
            model: 'gemini-3-pro-preview',
            inputImage: markedImage,
            inputPrompt: describePrompt,
            outputText: description
          },
          {
            step: 'Step 2: Execute Instructions',
            model: 'gemini-3-pro-image-preview',
            inputImage: originalImage,
            inputPrompt: editPrompt,
            outputText: null
          }
        ],
        result: editResult
      };
    }
  }
};

function extractImageFromResponse(response) {
  if (!response.candidates || response.candidates.length === 0) return null;

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) return null;

  for (const part of candidate.content.parts) {
    if (part.inlineData && part.inlineData.data) {
      return part.inlineData.data;
    }
  }

  return null;
}

function renderAPICall(call) {
  return `
    <div class="api-call">
      <div class="api-call-header">
        <span class="badge">${call.model}</span>
        <span>${call.step}</span>
      </div>
      <div class="api-call-body">
        <!-- Input Section -->
        <div class="io-section">
          <div class="io-section-header">
            <div class="io-label input">📥 Inputs</div>
          </div>
          <div class="io-content">
            ${call.inputImage ? `
              <div class="io-item">
                <div class="io-item-label">Image</div>
                <div class="io-image-container">
                  <img src="data:image/png;base64,${call.inputImage}" alt="Input image" />
                </div>
              </div>
            ` : ''}
            ${call.inputPrompt ? `
              <div class="io-item">
                <div class="io-item-label">Prompt</div>
                <div class="io-text-container">
                  <div class="io-text">${call.inputPrompt}</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Output Section -->
        <div class="io-section">
          <div class="io-section-header">
            <div class="io-label output">📤 Outputs</div>
          </div>
          <div class="io-content">
            ${call.outputText ? `
              <div class="io-item">
                <div class="io-item-label">Text Response</div>
                <div class="io-text-container">
                  <div class="io-text">${call.outputText}</div>
                </div>
              </div>
            ` : `
              <div class="io-item">
                <div class="io-text-container">
                  <div class="io-text empty">Image output (see Final Result below)</div>
                </div>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateHTMLReport(results, metadata) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gemini Marked Image Evaluation</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: #1e1e1e; color: #d4d4d4; font-size: 13px; height: 100vh; overflow: hidden; }

    .layout { display: flex; height: 100vh; }

    /* Sidebar */
    .sidebar { width: 300px; background: #252526; border-right: 1px solid #3e3e42; overflow-y: auto; padding: 8px; }
    .sidebar-header { padding: 8px; color: #cccccc; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

    .tree-item { padding: 4px 8px; cursor: pointer; user-select: none; font-size: 12px; display: flex; align-items: center; }
    .tree-item:hover { background: #2a2d2e; }
    .tree-item.active { background: #094771; }
    .tree-item .icon { margin-right: 6px; font-size: 10px; transition: transform 0.2s; display: inline-block; width: 12px; }
    .tree-item .icon.collapsed { transform: rotate(-90deg); }
    .tree-item .label { flex: 1; }
    .tree-item .badge { background: #007acc; color: white; padding: 1px 5px; border-radius: 10px; font-size: 10px; margin-left: 4px; }
    .tree-item .badge.error { background: #f48771; }
    .tree-item .badge.success { background: #89d185; }

    .tree-children { margin-left: 16px; display: none; }
    .tree-children.expanded { display: block; }

    /* Main content */
    .main { flex: 1; overflow-y: auto; padding: 12px; }
    .section { margin-bottom: 12px; }
    .section-title { font-size: 11px; font-weight: 600; color: #858585; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }

    .card { background: #252526; border: 1px solid #3e3e42; border-radius: 3px; margin-bottom: 8px; overflow: hidden; }
    .card-header { padding: 6px 10px; background: #2d2d30; border-bottom: 1px solid #3e3e42; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .card-header:hover { background: #323233; }
    .card-header .toggle { font-size: 10px; transition: transform 0.2s; }
    .card-header .toggle.collapsed { transform: rotate(-90deg); }
    .card-content { padding: 8px; display: block; }
    .card-content.collapsed { display: none; }

    .metadata-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .metadata-item { font-size: 12px; }
    .metadata-item .key { color: #858585; font-size: 11px; }
    .metadata-item .value { color: #ce9178; }

    .image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .image-item { background: #1e1e1e; padding: 6px; border-radius: 3px; text-align: center; }
    .image-item img { max-width: 100%; max-height: 120px; object-fit: contain; border-radius: 2px; }
    .image-label { font-size: 10px; color: #858585; margin-top: 4px; }

    /* Results Grid */
    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
    .grid-item { background: #252526; border: 1px solid #3e3e42; border-radius: 4px; padding: 8px; cursor: pointer; transition: all 0.2s; position: relative; }
    .grid-item:hover { background: #2a2d2e; border-color: #007acc; transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,122,204,0.3); }
    .grid-item img { width: 100%; height: 150px; object-fit: contain; border-radius: 2px; background: #1e1e1e; }
    .grid-label { font-size: 10px; color: #cccccc; margin-top: 6px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .grid-error, .grid-no-result { width: 100%; height: 150px; display: flex; align-items: center; justify-content: center; font-size: 32px; background: #1e1e1e; border-radius: 2px; }
    .grid-error { color: #f48771; }
    .grid-no-result { color: #858585; }

    .prompt-box { background: #1e1e1e; border: 1px solid #3e3e42; padding: 8px; border-radius: 3px; font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; line-height: 1.5; max-height: 200px; overflow-y: auto; color: #ce9178; }

    .io-pair { margin-bottom: 8px; }
    .io-header { font-size: 10px; font-weight: 600; color: #4fc1ff; margin-bottom: 4px; display: flex; align-items: center; }
    .io-header.output { color: #89d185; }
    .io-body { background: #1e1e1e; border: 1px solid #3e3e42; padding: 6px; border-radius: 3px; }

    .result-img { max-width: 100%; max-height: 250px; object-fit: contain; display: block; margin: 0 auto; }

    .rating-section { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
    .rating-btn { padding: 4px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s; }
    .rating-btn.good { background: #89d185; color: #1e1e1e; }
    .rating-btn.bad { background: #f48771; color: #1e1e1e; }
    .rating-btn:hover { opacity: 0.8; }
    .rating-status { font-size: 11px; font-weight: 600; }

    textarea { width: 100%; min-height: 40px; padding: 6px; border: 1px solid #3e3e42; border-radius: 3px; font-family: inherit; font-size: 11px; background: #1e1e1e; color: #d4d4d4; margin-top: 6px; resize: vertical; }

    /* Lightbox */
    .lightbox { display: none; position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); align-items: center; justify-content: center; }
    .lightbox.active { display: flex; }
    .lightbox img { max-width: 95%; max-height: 95%; object-fit: contain; border-radius: 4px; box-shadow: 0 0 50px rgba(0,0,0,0.5); }
    .lightbox-close { position: absolute; top: 20px; right: 30px; color: #fff; font-size: 40px; font-weight: bold; cursor: pointer; user-select: none; z-index: 10000; }
    .lightbox-close:hover { color: #ccc; }
    .lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); color: #fff; font-size: 50px; font-weight: bold; cursor: pointer; user-select: none; padding: 20px; z-index: 10000; }
    .lightbox-nav:hover { color: #ccc; }
    .lightbox-prev { left: 20px; }
    .lightbox-next { right: 20px; }
    .lightbox-caption { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 14px; background: rgba(0,0,0,0.7); padding: 10px 20px; border-radius: 4px; }

    /* Make images clickable */
    .image-item img, .result-img, .io-body img, .prompt-box + img { cursor: pointer; transition: opacity 0.2s; }
    .image-item img:hover, .result-img:hover, .io-body img:hover { opacity: 0.85; }

    /* Markdown styling */
    .markdown-content { line-height: 1.6; }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 { color: #4fc1ff; margin-top: 12px; margin-bottom: 8px; }
    .markdown-content h1 { font-size: 16px; }
    .markdown-content h2 { font-size: 14px; }
    .markdown-content h3 { font-size: 13px; }
    .markdown-content p { margin: 8px 0; }
    .markdown-content ul, .markdown-content ol { margin: 8px 0; padding-left: 20px; }
    .markdown-content li { margin: 4px 0; }
    .markdown-content code { background: #2d2d30; padding: 2px 6px; border-radius: 3px; color: #ce9178; font-size: 11px; }
    .markdown-content pre { background: #2d2d30; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 8px 0; }
    .markdown-content pre code { background: transparent; padding: 0; }
    .markdown-content blockquote { border-left: 3px solid #4fc1ff; padding-left: 12px; margin: 8px 0; color: #858585; }
    .markdown-content strong { color: #89d185; font-weight: 600; }
    .markdown-content em { color: #ce9178; font-style: italic; }
    .markdown-content a { color: #4fc1ff; text-decoration: none; }
    .markdown-content a:hover { text-decoration: underline; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div class="layout">
    <!-- Sidebar Navigation -->
    <div class="sidebar">
      <div class="sidebar-header">📋 Test Case</div>
      <div class="tree-item" onclick="showSection('metadata')">
        <span class="icon">▶</span>
        <span class="label">${metadata.testName}</span>
      </div>

      <div class="sidebar-header" style="margin-top: 16px;">🧪 Strategies</div>
      ${Object.entries(results).map(([strategyKey, result]) => {
        const strategyName = result.strategyName || strategyKey;
        const statusBadge = result.error ?
          '<span class="badge error">Error</span>' :
          result.resultImage ? '<span class="badge success">✓</span>' :
          '<span class="badge">?</span>';
        return `
        <div class="tree-item" onclick="showSection('${strategyKey}')">
          <span class="icon">▶</span>
          <span class="label">${strategyName}</span>
          ${statusBadge}
        </div>
        `;
      }).join('')}
    </div>

    <!-- Main Content Area -->
    <div class="main">
      <!-- Metadata Section -->
      <div id="section-metadata" class="content-section">
        <div class="section">
          <div class="section-title">Test Configuration</div>
          <div class="card">
            <div class="card-header">
              <span>Details</span>
            </div>
            <div class="card-content">
              <div class="metadata-grid">
                <div class="metadata-item">
                  <div class="key">Test Case</div>
                  <div class="value">${metadata.testName}</div>
                </div>
                <div class="metadata-item">
                  <div class="key">Timestamp</div>
                  <div class="value">${new Date().toISOString().split('T')[0]}</div>
                </div>
              </div>
              <div style="margin-top: 8px;">
                <div class="key">User Prompt (Base)</div>
                <div class="prompt-box">${metadata.userPrompt}</div>
              </div>
              <div style="margin-top: 8px;">
                <div class="key">Enhanced Prompt (String Concatenation)</div>
                <div class="prompt-box">${metadata.enhancedPrompt}</div>
              </div>
              <div style="margin-top: 8px;">
                <div class="key">Super-Enhanced Prompt (LLM Generated)</div>
                <div class="prompt-box">${metadata.superEnhancedPrompt}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Input Images</div>
          <div class="image-grid">
            <div class="image-item">
              <img src="data:image/png;base64,${metadata.originalImage}" />
              <div class="image-label">Original</div>
            </div>
            <div class="image-item">
              <img src="data:image/png;base64,${metadata.markedImage}" />
              <div class="image-label">Marked</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Grid View - All Results</div>
          <div class="results-grid">
            ${Object.entries(results).map(([strategyKey, result]) => {
              const strategyName = result.strategyName || strategyKey;
              return `
                <div class="grid-item" onclick="showSection('${strategyKey}')" title="${strategyName}">
                  ${result.error ?
                    `<div class="grid-error">❌</div>` :
                    result.resultImage ?
                      `<img src="data:image/png;base64,${result.resultImage}" />` :
                      `<div class="grid-no-result">⚠️</div>`}
                  <div class="grid-label">${strategyName}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Strategy Sections -->
      ${Object.entries(results).map(([strategyKey, result]) => {
        const strategyName = result.strategyName || strategyKey;
        return `
        <div id="section-${strategyKey}" class="content-section" style="display: none;">
          <div class="section">
            <div class="section-title">${strategyName}</div>

            <!-- Final Result at Top -->
            <div class="card">
              <div class="card-header">
                <span>🎨 Final Result</span>
              </div>
              <div class="card-content">
                ${result.error ? `<div style="color: #f48771;">❌ Error: ${result.error}</div>` :
                  result.resultImage ? `<img src="data:image/png;base64,${result.resultImage}" class="result-img" />` :
                  '<div style="color: #858585; font-style: italic;">⚠️ No image returned</div>'}
              </div>
            </div>

            ${result.calls ? result.calls.map((call, idx) => {
              const isLastCall = idx === result.calls.length - 1;
              return `
              <div class="card">
                <div class="card-header" onclick="toggleCard(this)">
                  <span>${call.step}</span>
                  <span class="toggle">▼</span>
                </div>
                <div class="card-content">
                  <div class="io-pair">
                    <div class="io-header">Input</div>
                    <div class="io-body">
                      ${call.inputImage ? `<img src="data:image/png;base64,${call.inputImage}" style="max-width: 100%; max-height: 150px; object-fit: contain; display: block; margin-bottom: 6px;" />` : ''}
                      <div class="prompt-box">${call.inputPrompt}</div>
                    </div>
                  </div>
                  <div class="io-pair">
                    <div class="io-header output">Output</div>
                    <div class="io-body">
                      ${call.outputText ?
                        `<div class="prompt-box">${call.outputText}</div>` :
                        isLastCall ?
                          (result.error ?
                            `<div style="color: #f48771;">❌ Error: ${result.error}</div>` :
                            result.resultImage ?
                              `<img src="data:image/png;base64,${result.resultImage}" style="max-width: 100%; max-height: 300px; object-fit: contain; display: block;" />` :
                              `<div style="color: #858585; font-size: 11px; font-style: italic;">⚠️ No image returned</div>`) :
                          ''}
                    </div>
                  </div>
                </div>
              </div>
            `;
            }).join('') : ''}

            <div class="card">
              <div class="card-header">
                <span>Rating & Notes</span>
              </div>
              <div class="card-content">
                <div class="rating-section">
                  <button class="rating-btn good" onclick="rate('${strategyKey}', 'good')">👍 Good</button>
                  <button class="rating-btn bad" onclick="rate('${strategyKey}', 'bad')">👎 Bad</button>
                  <span id="rating-${strategyKey}" class="rating-status"></span>
                </div>
                <textarea id="notes-${strategyKey}" placeholder="Notes..." onchange="saveNotes('${strategyKey}', this.value)"></textarea>
              </div>
            </div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
  </div>

  <!-- Lightbox -->
  <div id="lightbox" class="lightbox" onclick="closeLightbox(event)">
    <span class="lightbox-close" onclick="closeLightbox(event)">&times;</span>
    <span class="lightbox-nav lightbox-prev" onclick="navigateLightbox(-1, event)">&#10094;</span>
    <img id="lightbox-img" src="" alt="">
    <span class="lightbox-nav lightbox-next" onclick="navigateLightbox(1, event)">&#10095;</span>
    <div id="lightbox-caption" class="lightbox-caption"></div>
  </div>

  <script>
    const ratings = JSON.parse(localStorage.getItem('gemini-eval-ratings') || '{}');
    const notes = JSON.parse(localStorage.getItem('gemini-eval-notes') || '{}');

    // Lightbox functionality
    let allImages = [];
    let currentImageIndex = 0;

    function initLightbox() {
      // Collect all images that should be lightbox-enabled
      allImages = Array.from(document.querySelectorAll('.image-item img, .result-img, .io-body img'));

      // Add click handlers to each image
      allImages.forEach((img, index) => {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          openLightbox(index);
        });
      });
    }

    function openLightbox(index) {
      currentImageIndex = index;
      const img = allImages[index];
      const lightbox = document.getElementById('lightbox');
      const lightboxImg = document.getElementById('lightbox-img');
      const caption = document.getElementById('lightbox-caption');

      lightboxImg.src = img.src;

      // Set caption based on context
      let captionText = img.alt || '';
      const parent = img.closest('.image-item, .card, .io-body');
      if (parent) {
        const label = parent.querySelector('.image-label, .card-header, .io-header');
        if (label) captionText = label.textContent.trim();
      }
      caption.textContent = captionText;

      lightbox.classList.add('active');

      // Add keyboard navigation
      document.addEventListener('keydown', handleKeyPress);
    }

    function closeLightbox(event) {
      if (event) event.stopPropagation();
      const lightbox = document.getElementById('lightbox');
      lightbox.classList.remove('active');
      document.removeEventListener('keydown', handleKeyPress);
    }

    function navigateLightbox(direction, event) {
      if (event) event.stopPropagation();
      currentImageIndex = (currentImageIndex + direction + allImages.length) % allImages.length;
      openLightbox(currentImageIndex);
    }

    function handleKeyPress(e) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') navigateLightbox(-1);
      else if (e.key === 'ArrowRight') navigateLightbox(1);
    }

    // Initialize lightbox when page loads
    window.addEventListener('DOMContentLoaded', () => {
      initLightbox();
      renderAllMarkdown();

      // Check for hash in URL and navigate to that section
      if (window.location.hash) {
        const sectionId = window.location.hash.substring(1);
        showSection(sectionId);
      }
    });

    // Handle hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
      if (window.location.hash) {
        const sectionId = window.location.hash.substring(1);
        showSection(sectionId);
      }
    });

    // Render markdown in all prompt boxes and text outputs
    function renderAllMarkdown() {
      // Configure marked options
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          breaks: true,
          gfm: true
        });

        // Render all prompt boxes and output text
        document.querySelectorAll('.prompt-box').forEach(elem => {
          const markdownText = elem.textContent;
          elem.innerHTML = marked.parse(markdownText);
          elem.classList.add('markdown-content');
        });
      }
    }

    function showSection(sectionId) {
      // Hide all sections
      document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');

      // Remove active class from all tree items
      document.querySelectorAll('.tree-item').forEach(item => item.classList.remove('active'));

      // Show selected section
      const section = document.getElementById('section-' + sectionId);
      if (section) section.style.display = 'block';

      // Mark tree item as active
      if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
      }

      // Update URL hash
      window.location.hash = sectionId;
    }

    function toggleCard(header) {
      const content = header.nextElementSibling;
      const toggle = header.querySelector('.toggle');

      if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggle.classList.remove('collapsed');
      } else {
        content.classList.add('collapsed');
        toggle.classList.add('collapsed');
      }
    }

    function rate(strategy, rating) {
      ratings[strategy] = rating;
      const elem = document.getElementById('rating-' + strategy);
      elem.textContent = rating === 'good' ? '✓ Rated Good' : '✗ Rated Bad';
      elem.style.color = rating === 'good' ? '#89d185' : '#f48771';
      localStorage.setItem('gemini-eval-ratings', JSON.stringify(ratings));
    }

    function saveNotes(strategy, note) {
      notes[strategy] = note;
      localStorage.setItem('gemini-eval-notes', JSON.stringify(notes));
    }

    // Load saved ratings and notes
    Object.entries(ratings).forEach(([strategy, rating]) => {
      const elem = document.getElementById('rating-' + strategy);
      if (elem) {
        elem.textContent = rating === 'good' ? '✓ Rated Good' : '✗ Rated Bad';
        elem.style.color = rating === 'good' ? '#89d185' : '#f48771';
      }
    });

    Object.entries(notes).forEach(([strategy, note]) => {
      const elem = document.getElementById('notes-' + strategy);
      if (elem) elem.value = note;
    });
  </script>
</body>
</html>`;

  return html;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node evaluate-test-case.mjs <test-case.zip>');
    console.error('Example: node evaluate-test-case.mjs window-test.zip');
    process.exit(1);
  }

  const zipPath = args[0];

  if (!fs.existsSync(zipPath)) {
    console.error(`Error: ZIP file not found: ${zipPath}`);
    process.exit(1);
  }

  console.log(`📦 Extracting test case from ${zipPath}...`);

  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();

  let sourceImagePath, maskImagePath, metadataPath;
  let testName = path.basename(zipPath, '.zip');

  zipEntries.forEach(entry => {
    if (entry.entryName.endsWith('-source.png')) {
      sourceImagePath = entry.entryName;
    } else if (entry.entryName.endsWith('-mask.png')) {
      maskImagePath = entry.entryName;
    } else if (entry.entryName.endsWith('-metadata.json')) {
      metadataPath = entry.entryName;
    }
  });

  if (!sourceImagePath || !maskImagePath || !metadataPath) {
    console.error('Error: ZIP file does not contain required files (source.png, mask.png, metadata.json)');
    process.exit(1);
  }

  const tempDir = path.join(__dirname, 'temp-extract');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  zip.extractAllTo(tempDir, true);

  const sourcePath = path.join(tempDir, sourceImagePath);
  const maskPath = path.join(tempDir, maskImagePath);
  const metaPath = path.join(tempDir, metadataPath);
  const markedPath = path.join(tempDir, `${testName}-marked.png`);

  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const userPrompt = metadata.prompt;

  console.log(`\n📋 Test Case: ${metadata.name}`);
  console.log(`📝 Prompt: "${userPrompt}"\n`);

  await createMarkedImage(sourcePath, maskPath, markedPath);

  console.log('\n🔄 Loading images...');
  const markedImage = imageToBase64(markedPath);
  const originalImage = imageToBase64(sourcePath);

  console.log('🧪 Testing strategies...\n');

  // First, get description of the marked area to create enhanced prompts
  console.log('📝 Generating enhanced prompts with area description...');
  const { description, describePrompt } = await getAreaDescription(markedImage);

  // Create enhanced prompt (simple concatenation)
  const enhancedUserPrompt = `For the area described as "${description}", please: ${userPrompt}`;

  // Create super-enhanced prompt (LLM-generated)
  console.log('🤖 Creating super-enhanced prompt using LLM...');
  const superEnhancedUserPrompt = await createSuperEnhancedPrompt(description, userPrompt);
  console.log(`✓ All prompts created\n`);

  // Gemini API Quotas:
  // gemini-3-pro-preview: Used for text generation (descriptions, prompt enhancement)
  // gemini-3-pro-image-preview: Used for all image generation
  //
  // Each 2-step strategy = 1 call to flash (describe) + 1 call to flash-image (edit)
  // Each 1-step strategy = 1 call to flash-image (edit)
  // Initial setup = 1 call to flash (getAreaDescription) + 1 call to flash (super-enhanced prompt)

  const MAX_CONCURRENT = 2; // Run 2 strategies at once (conservative for rate limits)

  // Create tasks for all strategies with base, enhanced, and super-enhanced prompts
  const allStrategyTasks = [];

  // Add base versions (no pre-generated description, strategies do their own)
  Object.entries(STRATEGIES).forEach(([key, strategy]) => {
    allStrategyTasks.push([
      `${key}-base`,
      {
        name: `${strategy.name} • base`,
        prompt: userPrompt,
        execute: strategy.execute,
        preDescription: null  // No pre-generated description
      }
    ]);
  });

  // Add enhanced versions (use pre-generated description to avoid double-description)
  Object.entries(STRATEGIES).forEach(([key, strategy]) => {
    allStrategyTasks.push([
      `${key}-enhanced`,
      {
        name: `${strategy.name} • enhanced`,
        prompt: enhancedUserPrompt,
        execute: strategy.execute,
        preDescription: description  // Pass pre-generated description
      }
    ]);
  });

  // Add super-enhanced versions (use pre-generated description)
  Object.entries(STRATEGIES).forEach(([key, strategy]) => {
    allStrategyTasks.push([
      `${key}-super`,
      {
        name: `${strategy.name} • super`,
        prompt: superEnhancedUserPrompt,
        execute: strategy.execute,
        preDescription: description  // Pass pre-generated description
      }
    ]);
  });

  // Create progress bar with animated gradient effect
  const totalStrategies = allStrategyTasks.length;

  // Custom format function with animated colors
  let animationFrame = 0;
  const gradientColors = [
    '\x1b[38;5;33m',  // Blue
    '\x1b[38;5;39m',  // Bright Blue
    '\x1b[38;5;45m',  // Cyan
    '\x1b[38;5;51m',  // Bright Cyan
    '\x1b[38;5;87m',  // Light Cyan
    '\x1b[38;5;123m', // Light Blue
  ];

  function applyColorWave(text, offset) {
    // Strip ANSI codes from text to get plain text
    const plainText = text.replace(/\x1b\[[0-9;]*m/g, '');
    let result = '';

    for (let i = 0; i < plainText.length; i++) {
      const colorIndex = (offset + i) % gradientColors.length;
      result += gradientColors[colorIndex] + plainText[i] + '\x1b[0m';
    }

    return result;
  }

  const progressBar = new cliProgress.SingleBar({
    format: function(options, params, payload) {
      const percentage = Math.floor(params.progress * 100);
      const barLength = 40;
      const completeLength = Math.round(barLength * params.progress);
      const incompleteLength = barLength - completeLength;

      // Create animated gradient bar
      const colorIndex = animationFrame % gradientColors.length;

      const completeBar = gradientColors[colorIndex] + '█'.repeat(completeLength) + '\x1b[0m';
      const incompleteBar = '\x1b[38;5;240m' + '░'.repeat(incompleteLength) + '\x1b[0m';

      // Apply color wave to status text for running/starting states
      let animatedStatus;
      if (payload.status.includes('Running') || payload.status.includes('Starting')) {
        animatedStatus = applyColorWave(payload.status, animationFrame);
      } else {
        animatedStatus = payload.status;
      }

      animationFrame++;

      return `   ${completeBar}${incompleteBar} | \x1b[36m${percentage}%\x1b[0m | \x1b[33m${params.value}/${params.total}\x1b[0m strategies | ${animatedStatus}`;
    },
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    fps: 5,
    stream: process.stdout
  });

  progressBar.start(totalStrategies, 0, { status: '\x1b[90mStarting...\x1b[0m' });

  let completed = 0;
  let currentStatus = '\x1b[90mStarting...\x1b[0m';
  let isRunning = true;

  // Force animation updates by yielding to event loop
  async function keepAnimating() {
    while (isRunning) {
      // Yield to event loop
      await new Promise(resolve => setImmediate(resolve));
      progressBar.update(completed, { status: currentStatus });
      // Small delay for animation
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Start animation in background
  const animationPromise = keepAnimating();

  // Helper function to run tasks with limited concurrency
  async function runWithConcurrency(tasks, maxConcurrent, metadata) {
    const results = {};
    const executing = [];
    const taskMap = new Map(tasks);
    const runningTasks = new Map(); // Track which tasks are currently running

    for (const [key, taskFn] of tasks) {
      const promise = (async () => {
        runningTasks.set(key, true);
        // Update status to show this task started
        const running = Array.from(runningTasks.keys()).map(k => {
          return metadata[k] || k;
        }).join(', ');
        currentStatus = `\x1b[36mRunning: ${running}\x1b[0m`;
        progressBar.update(completed, { status: currentStatus });

        try {
          const result = await taskFn();
          results[key] = result;
          completed++;
          runningTasks.delete(key);
          const taskName = metadata[key] || key;
          progressBar.update(completed, { status: `\x1b[32m✓ Completed: ${taskName}\x1b[0m` });

          // Small delay to show completion message
          await new Promise(resolve => setTimeout(resolve, 300));

          return key;
        } catch (error) {
          runningTasks.delete(key);
          throw error;
        }
      })();

      executing.push(promise);

      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          const p = executing[i];
          const settled = await Promise.race([
            p.then(() => true, () => true),
            new Promise(resolve => setTimeout(() => resolve(false), 0))
          ]);
          if (settled) {
            executing.splice(i, 1);
          }
        }
      }
    }

    await Promise.all(executing);
    isRunning = false;
    await animationPromise; // Wait for animation to stop
    return results;
  }

  // Create metadata map for task names (used by progress bar)
  const taskMetadata = {};
  allStrategyTasks.forEach(([key, info]) => {
    taskMetadata[key] = info.name;
  });

  const strategyTasks = allStrategyTasks.map(([key, strategyInfo]) => [
    key,
    async () => {
      try {
        // Periodically yield to event loop during execution
        const resultPromise = strategyInfo.execute(markedImage, originalImage, strategyInfo.prompt, strategyInfo.preDescription);

        // Keep updating status while waiting
        const statusInterval = setInterval(() => {
          // Force an update to trigger animation
          process.stdout.write('');
        }, 50);

        const result = await resultPromise;
        clearInterval(statusInterval);

        const resultImage = extractImageFromResponse(result.result);

        return {
          calls: result.calls,
          resultImage,
          error: null,
          strategyName: strategyInfo.name
        };
      } catch (error) {
        return {
          calls: null,
          resultImage: null,
          error: error.message,
          strategyName: strategyInfo.name
        };
      }
    }
  ]);

  const results = await runWithConcurrency(strategyTasks, MAX_CONCURRENT, taskMetadata);
  progressBar.update(totalStrategies, { status: '\x1b[32m✓ All strategies complete!\x1b[0m' });
  progressBar.stop();

  console.log('\n');

  process.stdout.write('\n📊 Generating HTML report...');
  const html = generateHTMLReport(results, {
    testName: metadata.name,
    markedImage,
    originalImage,
    userPrompt,
    enhancedPrompt: enhancedUserPrompt,
    superEnhancedPrompt: superEnhancedUserPrompt
  });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(OUTPUT_DIR, `evaluation-${metadata.name}-${timestamp}.html`);

  process.stdout.write(' writing file...');
  fs.writeFileSync(reportPath, html);

  process.stdout.write(' cleaning up...');
  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log(' done!\n');
  console.log(`✅ Report saved to: ${reportPath}`);
  console.log(`📂 Open in browser to view results and rate them.`);
}

main().catch(console.error);
