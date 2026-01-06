import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadCanvasAsPdf, captureCleanCanvas } from './exportUtils';
import Konva from 'konva';

// Create mock PDF instance at module scope so tests can access it
const mockPdfInstance = {
  addImage: vi.fn(),
  save: vi.fn(),
  internal: {
    pageSize: {
      getWidth: () => 210, // A4 width in mm
      getHeight: () => 297, // A4 height in mm
    },
  },
};

const jsPDFConstructor = vi.fn(() => mockPdfInstance);

// Mock jspdf module
vi.mock('jspdf', () => ({
  jsPDF: jsPDFConstructor,
}));

describe('downloadCanvasAsPdf', () => {
  let mockStage: Konva.Stage;
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create a mock canvas element
    mockCanvas = {
      width: 800,
      height: 600,
      toDataURL: vi.fn(() => 'data:image/png;base64,mock-image-data'),
      getContext: vi.fn(() => ({
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(800 * 600 * 4), width: 800, height: 600 })),
      })),
    } as unknown as HTMLCanvasElement;

    // Create a mock Konva stage with the methods we need
    mockStage = {
      getLayers: vi.fn(() => []),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should capture canvas with pixelRatio 2 for high quality', async () => {
    await downloadCanvasAsPdf(mockStage, 'test-export.pdf');

    // Should call toCanvas with pixelRatio: 2
    expect(mockStage.toCanvas).toHaveBeenCalledWith({ pixelRatio: 2 });
  });

  it('should convert canvas to PNG data URL', async () => {
    await downloadCanvasAsPdf(mockStage, 'test-export.pdf');

    // Should call toDataURL with PNG format
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('should create PDF with A4 page size by default', async () => {
    await downloadCanvasAsPdf(mockStage, 'test-export.pdf');

    // Should create PDF with A4 format and portrait orientation
    expect(jsPDFConstructor).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
  });

  it('should add image to PDF', async () => {
    await downloadCanvasAsPdf(mockStage, 'test-export.pdf');

    // Should add image to PDF
    expect(mockPdfInstance.addImage).toHaveBeenCalled();
    
    // First argument should be the data URL
    const addImageCall = mockPdfInstance.addImage.mock.calls[0];
    expect(addImageCall[0]).toBe('data:image/png;base64,mock-image-data');
    expect(addImageCall[1]).toBe('PNG');
  });

  it('should scale image to fit within page margins', async () => {
    await downloadCanvasAsPdf(mockStage, 'test-export.pdf');

    const addImageCall = mockPdfInstance.addImage.mock.calls[0];
    const [, , x, y, width, height] = addImageCall;

    // Should have margins (x, y > 0)
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);

    // Should fit within page (width and height < page dimensions)
    expect(width).toBeLessThan(210); // A4 width
    expect(height).toBeLessThan(297); // A4 height
  });

  it('should center image on the page', async () => {
    await downloadCanvasAsPdf(mockStage, 'test-export.pdf');

    const addImageCall = mockPdfInstance.addImage.mock.calls[0];
    const [, , x, y, width, height] = addImageCall;

    const pageWidth = 210;
    const pageHeight = 297;

    // Calculate expected centered position
    const expectedX = (pageWidth - width) / 2;
    const expectedY = (pageHeight - height) / 2;

    // Should be centered
    expect(x).toBeCloseTo(expectedX, 1);
    expect(y).toBeCloseTo(expectedY, 1);
  });

  it('should maintain aspect ratio when scaling', async () => {
    // Canvas is 800x600 (aspect ratio 4:3)
    await downloadCanvasAsPdf(mockStage, 'test.pdf');

    const addImageCall = mockPdfInstance.addImage.mock.calls[0];
    const [, , , , width, height] = addImageCall;

    // Check aspect ratio is maintained (4:3)
    const aspectRatio = width / height;
    const expectedAspectRatio = 800 / 600;
    expect(aspectRatio).toBeCloseTo(expectedAspectRatio, 2);
  });

  it('should trigger download with correct filename', async () => {
    await downloadCanvasAsPdf(mockStage, 'my-document.pdf');

    // Should call save with the filename
    expect(mockPdfInstance.save).toHaveBeenCalledWith('my-document.pdf');
  });

  it('should use default filename if not provided', async () => {
    await downloadCanvasAsPdf(mockStage);

    // Should use default filename
    expect(mockPdfInstance.save).toHaveBeenCalledWith('canvas-export.pdf');
  });
});

describe('captureCleanCanvas', () => {
  it('should call stage.toCanvas with provided pixelRatio', () => {
    const mockCanvas = {
      width: 100,
      height: 100,
    } as HTMLCanvasElement;

    const mockStage = {
      getLayers: vi.fn(() => []),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;

    const result = captureCleanCanvas(mockStage, { pixelRatio: 3 });

    expect(mockStage.toCanvas).toHaveBeenCalledWith({ pixelRatio: 3 });
    expect(result).toBe(mockCanvas);
  });

  it('should default to pixelRatio 1', () => {
    const mockCanvas = {
      width: 100,
      height: 100,
    } as HTMLCanvasElement;

    const mockStage = {
      getLayers: vi.fn(() => []),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;

    captureCleanCanvas(mockStage);

    expect(mockStage.toCanvas).toHaveBeenCalledWith({ pixelRatio: 1 });
  });

  it('should hide grid lines when hideGrid is true', () => {
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    
    const gridLine = {
      name: () => 'gridLine',
      getClassName: () => 'Line',
      visible: vi.fn((val?: boolean) => val === undefined ? true : undefined),
    };
    
    const mockLayer = {
      getChildren: vi.fn(() => [gridLine]),
    };

    const mockStage = {
      getLayers: vi.fn(() => [mockLayer]),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;

    captureCleanCanvas(mockStage, { hideGrid: true });

    // Should have hidden the grid line
    expect(gridLine.visible).toHaveBeenCalledWith(false);
    // Should have restored visibility
    expect(gridLine.visible).toHaveBeenCalledWith(true);
  });

  it('should hide Transformer when hideSelectionUI is true', () => {
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    
    const transformer = {
      name: () => '',
      getClassName: () => 'Transformer',
      visible: vi.fn((val?: boolean) => val === undefined ? true : undefined),
    };
    
    const mockLayer = {
      getChildren: vi.fn(() => [transformer]),
    };

    const mockStage = {
      getLayers: vi.fn(() => [mockLayer]),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;

    captureCleanCanvas(mockStage, { hideSelectionUI: true });

    // Should have hidden the transformer
    expect(transformer.visible).toHaveBeenCalledWith(false);
    // Should have restored visibility
    expect(transformer.visible).toHaveBeenCalledWith(true);
  });

  it('should hide canvas background when hideBackground is true', () => {
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    
    const background = {
      name: () => 'canvasBackground',
      getClassName: () => 'Rect',
      visible: vi.fn((val?: boolean) => val === undefined ? true : undefined),
    };
    
    const mockLayer = {
      getChildren: vi.fn(() => [background]),
    };

    const mockStage = {
      getLayers: vi.fn(() => [mockLayer]),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;

    captureCleanCanvas(mockStage, { hideBackground: true });

    // Should have hidden the background
    expect(background.visible).toHaveBeenCalledWith(false);
    // Should have restored visibility
    expect(background.visible).toHaveBeenCalledWith(true);
  });

  it('should not hide background when hideBackground is false', () => {
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    
    const background = {
      name: () => 'canvasBackground',
      getClassName: () => 'Rect',
      visible: vi.fn((val?: boolean) => val === undefined ? true : undefined),
    };
    
    const mockLayer = {
      getChildren: vi.fn(() => [background]),
    };

    const mockStage = {
      getLayers: vi.fn(() => [mockLayer]),
      toCanvas: vi.fn(() => mockCanvas),
    } as unknown as Konva.Stage;

    captureCleanCanvas(mockStage, { hideBackground: false });

    // Should NOT have hidden the background (only called once to check visibility)
    expect(background.visible).not.toHaveBeenCalledWith(false);
  });
});
