import React, { useState, useRef } from 'react';
import { Stage, Layer, Text, Rect } from 'react-konva';
import { InlineTextEditor, type TextFlowMode } from '@/components/Canvas/InlineTextEditor';

export const InlineTextPlayground: React.FC = () => {
    const [textState, setTextState] = useState({
        x: 50, // Move closer to top-left to stay in view when zoomed
        y: 50,
        text: 'Hello World',
        fontSize: 24,
        rotation: 0,
        fontFamily: 'Arial',
        color: '#000000',
        width: 200,
        height: 100,
    });

    const [mode, setMode] = useState<TextFlowMode>('shrink-to-fit');
    const [isEditing, setIsEditing] = useState(false);
    const [editorOpacity, setEditorOpacity] = useState(1);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [yOffset, setYOffset] = useState(0); // Manual vertical adjustment
    const [xOffset, setXOffset] = useState(0); // Manual horizontal adjustment
    const [showBackgroundText, setShowBackgroundText] = useState(false); // Keep text visible for alignment
    const [padding, setPadding] = useState(0);
    const [showDebugBorders, setShowDebugBorders] = useState(false);
    const stageRef = useRef<any>(null);

    const handleTextChange = (newText: string) => {
        setTextState((prev) => ({ ...prev, text: newText }));
    };

    const getEditorPosition = () => {
        return {
            x: (textState.x + xOffset) * zoomLevel,
            y: (textState.y + yOffset) * zoomLevel,
        };
    };

    const editorPos = getEditorPosition();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 20, gap: 20 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', padding: 20, background: '#f0f0f0', borderRadius: 8, flexWrap: 'wrap' }}>
                <h2>Inline Text Playground</h2>

                <label>
                    <input
                        type="checkbox"
                        checked={isEditing}
                        onChange={(e) => setIsEditing(e.target.checked)}
                    />
                    Edit Mode
                </label>

                <select value={mode} onChange={(e) => setMode(e.target.value as TextFlowMode)}>
                    <option value="shrink-to-fit">Shrink to Fit</option>
                    <option value="fixed-size">Fixed Size (Wrap)</option>
                </select>

                <label>
                    Width: {textState.width}px
                    <input
                        type="range"
                        min="50"
                        max="500"
                        value={textState.width}
                        onChange={(e) => setTextState(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                    />
                </label>

                <label>
                    Opacity: {editorOpacity.toFixed(1)}
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={editorOpacity}
                        onChange={(e) => setEditorOpacity(parseFloat(e.target.value))}
                    />
                </label>

                <label>
                    Zoom: {zoomLevel.toFixed(1)}x
                    <input
                        type="range"
                        min="0.5"
                        max="6"
                        step="0.1"
                        value={zoomLevel}
                        onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                    />
                </label>

                <label>
                    Rotation: {textState.rotation}°
                    <input
                        type="range"
                        min="0"
                        max="360"
                        value={textState.rotation}
                        onChange={(e) => setTextState(prev => ({ ...prev, rotation: parseInt(e.target.value) }))}
                    />
                </label>

                <div style={{ width: '100%', height: 1, background: '#ccc', margin: '10px 0' }} />
                <h3>Debug Controls</h3>

                <label>
                    <input
                        type="checkbox"
                        checked={showDebugBorders}
                        onChange={(e) => setShowDebugBorders(e.target.checked)}
                    />
                    Show Debug Borders
                </label>

                <label>
                    <input
                        type="checkbox"
                        checked={showBackgroundText}
                        onChange={(e) => setShowBackgroundText(e.target.checked)}
                    />
                    Show Background Text (Overlap)
                </label>

                <label>
                    Padding: {padding}px
                    <input
                        type="range"
                        min="0"
                        max="20"
                        step="1"
                        value={padding}
                        onChange={(e) => setPadding(parseInt(e.target.value))}
                    />
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label>X-Offset: {xOffset.toFixed(1)}px</label>
                    <button onClick={() => setXOffset(prev => Number((prev - 0.1).toFixed(1)))}>-</button>
                    <input
                        type="range"
                        min="-20"
                        max="20"
                        step="0.1"
                        value={xOffset}
                        onChange={(e) => setXOffset(parseFloat(e.target.value))}
                    />
                    <button onClick={() => setXOffset(prev => Number((prev + 0.1).toFixed(1)))}>+</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label>Y-Offset: {yOffset.toFixed(1)}px</label>
                    <button onClick={() => setYOffset(prev => Number((prev - 0.1).toFixed(1)))}>-</button>
                    <input
                        type="range"
                        min="-20"
                        max="20"
                        step="0.1"
                        value={yOffset}
                        onChange={(e) => setYOffset(parseFloat(e.target.value))}
                    />
                    <button onClick={() => setYOffset(prev => Number((prev + 0.1).toFixed(1)))}>+</button>
                </div>
            </div>

            <div style={{ position: 'relative', border: '1px solid #ccc', flex: 1, overflow: 'auto' }}>
                <Stage
                    width={800 * Math.max(1, zoomLevel / 2)} // Expand stage slightly to allow scrolling
                    height={600 * Math.max(1, zoomLevel / 2)}
                    scaleX={zoomLevel}
                    scaleY={zoomLevel}
                    ref={stageRef}
                >
                    <Layer>
                        <Rect x={0} y={0} width={800} height={600} fill="#fafafa" />

                        <Text
                            visible={!isEditing || showBackgroundText} // Hide when editing unless debug toggle is on
                            x={textState.x}
                            y={textState.y}
                            text={textState.text}
                            fontSize={textState.fontSize}
                            fontFamily={textState.fontFamily}
                            fill={textState.color}
                            rotation={textState.rotation}
                            width={mode === 'fixed-size' ? textState.width : undefined}
                            wrap={mode === 'fixed-size' ? 'word' : 'none'}
                            lineHeight={1.2}
                            padding={padding}
                            letterSpacing={0}
                        />
                        <Rect
                            x={textState.x}
                            y={textState.y}
                            width={textState.width}
                            height={textState.height}
                            stroke="#ccc"
                            strokeWidth={1}
                            dash={[5, 5]}
                            rotation={textState.rotation}
                        />
                    </Layer>
                </Stage>

                {isEditing && (
                    <InlineTextEditor
                        x={editorPos.x}
                        y={editorPos.y}
                        width={textState.width}
                        height={textState.height}
                        rotation={textState.rotation}
                        value={textState.text}
                        fontSize={textState.fontSize}
                        fontFamily={textState.fontFamily}
                        color={textState.color}
                        opacity={editorOpacity}
                        zoomLevel={zoomLevel}
                        mode={mode}
                        padding={padding}
                        onChange={handleTextChange}
                        onFontSizeChange={(newSize) => setTextState(prev => ({ ...prev, fontSize: newSize }))}
                        onBlur={() => { }} // DEBUG: Keep open for slider adjustment
                    />
                )}
            </div>
        </div>
    );
};
