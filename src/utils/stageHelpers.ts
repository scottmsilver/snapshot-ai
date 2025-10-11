import Konva from 'konva';

interface SerializedStageState {
  width: number;
  height: number;
  layers: string[];
}

const isSerializedStageState = (value: unknown): value is SerializedStageState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    Array.isArray(candidate.layers) &&
    candidate.layers.every(layer => typeof layer === 'string')
  );
};

export const saveStageState = (stage: Konva.Stage): string => {
  // Get all layers except the background image layer
  const layers = stage.getLayers();
  const drawingLayers = layers.slice(1); // Skip first layer (background image)
  
  // Create a minimal state object
  const state = {
    width: stage.width(),
    height: stage.height(),
    layers: drawingLayers.map(layer => layer.toJSON())
  };
  
  return JSON.stringify(state);
};

export const restoreStageState = (stage: Konva.Stage, stateJson: string): void => {
  try {
    const parsed = JSON.parse(stateJson) as unknown;
    if (!isSerializedStageState(parsed)) {
      throw new Error('Invalid stage state payload');
    }
    
    // Remove all layers except the background image layer
    const layers = stage.getLayers();
    for (let i = 1; i < layers.length; i++) {
      layers[i].destroy();
    }
    
    // Restore drawing layers
    parsed.layers.forEach(layerData => {
      const layer = Konva.Node.create(layerData);
      stage.add(layer);
    });
    
    stage.draw();
  } catch (error) {
    console.error('Failed to restore stage state:', error);
  }
};