import React, { useEffect, useRef, useLayoutEffect, useState } from 'react';

export type TextFlowMode = 'shrink-to-fit' | 'fixed-size';

interface InlineTextEditorProps {
    x: number;
    y: number;
    width?: number;
    height?: number;
    rotation: number;
    value: number | string;
    fontSize: number;
    fontFamily: string;
    color: string;
    opacity: number;
    zoomLevel: number;
    mode: TextFlowMode;
    onChange: (value: string) => void;
    onBlur: () => void;
    style?: React.CSSProperties;
    onFontSizeChange?: (fontSize: number) => void;
    padding?: number;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
    x,
    y,
    width,
    height,
    rotation,
    value,
    fontSize: initialFontSize,
    fontFamily,
    color,
    opacity,
    zoomLevel,
    mode,
    onChange,
    onBlur,
    style,
    onFontSizeChange,
    padding = 0,
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [currentFontSize, setCurrentFontSize] = useState(initialFontSize);

    // Auto-resize and Shrink-to-Fit logic
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        const measure = measureRef.current;

        if (!textarea || !measure) return;

        // Sync styles to measurement div
        measure.style.fontFamily = fontFamily;
        measure.style.fontSize = `${initialFontSize}px`;
        measure.style.lineHeight = '1.2';
        measure.style.letterSpacing = '0px';
        measure.style.whiteSpace = mode === 'shrink-to-fit' ? 'pre' : 'pre-wrap';
        measure.style.wordBreak = mode === 'fixed-size' ? 'break-word' : 'normal';
        measure.textContent = value.toString() || ' '; // Ensure at least one char for height

        if (mode === 'shrink-to-fit') {
            // Reset
            textarea.style.whiteSpace = 'pre';

            if (width) {
                // Shrink to fit logic
                let size = initialFontSize;
                const minSize = 8;

                // Measure with initial size
                measure.style.fontSize = `${size}px`;
                let measuredWidth = measure.offsetWidth;

                // Iteratively reduce if too wide
                let iterations = 0;
                while (measuredWidth > width && size > minSize && iterations < 100) {
                    size--;
                    measure.style.fontSize = `${size}px`;
                    measuredWidth = measure.offsetWidth;
                    iterations++;
                }

                if (size !== currentFontSize) {
                    setCurrentFontSize(size);
                    onFontSizeChange?.(size);
                }
                textarea.style.width = `${width}px`;
            } else {
                // Point text (grow)
                if (initialFontSize !== currentFontSize) {
                    setCurrentFontSize(initialFontSize);
                    onFontSizeChange?.(initialFontSize);
                }
                // Add slight buffer
                textarea.style.width = `${measure.offsetWidth + 10}px`;
            }
            textarea.style.height = `${measure.offsetHeight}px`;

        } else {
            // Fixed Size (Wrap)
            textarea.style.width = width ? `${width}px` : 'auto';
            textarea.style.height = height ? `${height}px` : 'auto';
            textarea.style.whiteSpace = 'pre-wrap';
            textarea.style.wordBreak = 'break-word';
            if (initialFontSize !== currentFontSize) {
                setCurrentFontSize(initialFontSize);
                onFontSizeChange?.(initialFontSize);
            }
        }

    }, [value, initialFontSize, fontFamily, mode, width, height, currentFontSize, onFontSizeChange]);

    // Focus on mount
    useEffect(() => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(len, len);
    }, []);

    return (
        <>
            {/* Hidden Measurement Div */}
            <div
                ref={measureRef}
                style={{
                    position: 'absolute',
                    visibility: 'hidden',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    width: mode === 'fixed-size' && width ? `${width}px` : 'auto',
                    padding: `${padding}px`,
                    border: 0,
                    margin: 0,
                    boxSizing: 'border-box',
                }}
            />

            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        onBlur();
                    }
                    e.stopPropagation();
                }}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    // Use transform for positioning and scaling
                    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${zoomLevel})`,
                    transformOrigin: 'top left',

                    // Font metrics
                    fontSize: `${currentFontSize}px`,
                    fontFamily: fontFamily,
                    color: color,
                    lineHeight: 1.2,
                    letterSpacing: '0px',
                    textAlign: 'left',
                    fontWeight: 'normal',
                    whiteSpace: mode === 'shrink-to-fit' ? 'pre' : 'pre-wrap',
                    wordBreak: mode === 'fixed-size' ? 'break-word' : 'normal',

                    // Box model reset
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: `${padding}px`,
                    margin: 0,
                    resize: 'none',
                    overflow: 'hidden',
                    display: 'block', // Ensure block layout

                    // Initial dimensions
                    // Calculate precise height for shrink-to-fit to match Konva immediately
                    // Use Math.ceil because offsetHeight is always an integer
                    width: width ? `${width}px` : 'auto',
                    height: mode === 'shrink-to-fit'
                        ? `${Math.ceil(initialFontSize * 1.2)}px`
                        : (height ? `${height}px` : 'auto'),

                    // Box sizing
                    boxSizing: 'border-box',

                    // Visuals
                    opacity: opacity,
                    zIndex: 1000,

                    // Font smoothing
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    ...style,
                }}
            />
        </>
    );
};
