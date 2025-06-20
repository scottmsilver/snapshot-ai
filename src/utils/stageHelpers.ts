import Konva from 'konva';

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
    const state = JSON.parse(stateJson);
    
    // Remove all layers except the background image layer
    const layers = stage.getLayers();
    for (let i = 1; i < layers.length; i++) {
      layers[i].destroy();
    }
    
    // Restore drawing layers
    if (state.layers && Array.isArray(state.layers)) {
      state.layers.forEach((layerData: any) => {
        const layer = Konva.Node.create(layerData);
        stage.add(layer);
      });
    }
    
    stage.draw();
  } catch (error) {
    console.error('Failed to restore stage state:', error);
  }
};