import React, { useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { TextInputDialog } from '@/components/TextInputDialog/TextInputDialog';
import {
  DrawingTool,
  type Point,
  type TextShape,
  type CalloutShape,
  type Shape,
  type DrawingStyle,
} from '@/types/drawing';

export interface TextEditControllerProps {
  shapes: Shape[];
  currentStyle: DrawingStyle;
  onUpdateShape: (id: string, updates: Partial<Shape>) => void;
  onAddShape: (shape: Omit<Shape, 'zIndex'>) => void;
  onSetActiveTool: (tool: DrawingTool) => void;
}

export interface TextEditControllerRef {
  handleCanvasTextClick: (position: Point) => void;
  handleTextShapeEdit: (shapeId: string) => void;
}

export const TextEditController = forwardRef<TextEditControllerRef, TextEditControllerProps>(
  ({ shapes, currentStyle, onUpdateShape, onAddShape, onSetActiveTool }, ref) => {
    const [textDialogOpen, setTextDialogOpen] = useState(false);
    const [textPosition, setTextPosition] = useState<Point | null>(null);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);

    const editingTextShape = useMemo(() => {
      if (!editingTextId) {
        return undefined;
      }
      const shape = shapes.find(item => item.id === editingTextId);
      if (!shape) {
        return undefined;
      }
      if (shape.type === DrawingTool.TEXT || shape.type === DrawingTool.CALLOUT) {
        return shape as TextShape | CalloutShape;
      }
      return undefined;
    }, [editingTextId, shapes]);

    const handleCanvasTextClick = useCallback(
      (position: Point) => {
        setTextPosition(position);
        setEditingTextId(null);
        setTextDialogOpen(true);
      },
      [],
    );

    const handleTextShapeEdit = useCallback(
      (shapeId: string) => {
        const shape = shapes.find(item => item.id === shapeId);
        if (shape && (shape.type === DrawingTool.TEXT || shape.type === DrawingTool.CALLOUT)) {
          setEditingTextId(shapeId);
          setTextDialogOpen(true);
        }
      },
      [shapes],
    );

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      handleCanvasTextClick,
      handleTextShapeEdit,
    }), [handleCanvasTextClick, handleTextShapeEdit]);

    const editingDialogText = editingTextShape?.text ?? '';
    const editingDialogFontSize = editingTextShape?.fontSize ?? 16;
    const editingDialogFontFamily = editingTextShape?.fontFamily ?? currentStyle.fontFamily ?? 'Arial';

    const textDialogProps = useMemo(
      () => ({
        isOpen: textDialogOpen,
        initialText: editingDialogText,
        initialFontSize: editingDialogFontSize,
        initialFontFamily: editingDialogFontFamily,
        onSubmit: (text: string, fontSize: number, fontFamily: string) => {
          if (editingTextId) {
            onUpdateShape(editingTextId, {
              text,
              fontSize,
              fontFamily,
              updatedAt: Date.now(),
            });
          } else if (textPosition) {
            const textShape: Omit<TextShape, 'zIndex'> = {
              id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: DrawingTool.TEXT,
              x: textPosition.x,
              y: textPosition.y,
              text,
              fontSize,
              fontFamily,
              style: {
                stroke: currentStyle.stroke,
                strokeWidth: 0,
                opacity: currentStyle.opacity,
              },
              visible: true,
              locked: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            onAddShape(textShape);
            onSetActiveTool(DrawingTool.SELECT);
          }

          setTextDialogOpen(false);
          setTextPosition(null);
          setEditingTextId(null);
        },
        onCancel: () => {
          setTextDialogOpen(false);
          setTextPosition(null);
          setEditingTextId(null);
        },
      }),
      [
        textDialogOpen,
        editingDialogText,
        editingDialogFontSize,
        editingDialogFontFamily,
        currentStyle,
        editingTextId,
        onUpdateShape,
        textPosition,
        onAddShape,
        onSetActiveTool,
      ],
    );

    return <TextInputDialog {...textDialogProps} />;
  }
);

TextEditController.displayName = 'TextEditController';
