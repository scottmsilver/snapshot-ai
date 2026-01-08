import { useCallback } from 'react';
import Konva from 'konva';
import { copyCanvasToClipboard, downloadCanvasAsImage, downloadCanvasAsPdf } from '@/utils/exportUtils';

export interface UseExportOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
}

export interface UseExportReturn {
  handleCopyToClipboard: () => Promise<void>;
  handleDownloadImage: () => void;
  handleDownloadPdf: () => void;
}

export function useExport({ stageRef }: UseExportOptions): UseExportReturn {
  const handleCopyToClipboard = useCallback(async () => {
    if (!stageRef.current) {
      return;
    }

    try {
      await copyCanvasToClipboard(stageRef.current);
      const button = document.querySelector('div[title*="Copy"]') as HTMLElement | null;
      if (!button) {
        return;
      }

      const originalTitle = button.title;
      button.title = 'Copied!';
      button.style.backgroundColor = '#4caf50';
      button.style.color = 'white';

      setTimeout(() => {
        button.title = originalTitle;
        button.style.backgroundColor = 'transparent';
        button.style.color = '#5f6368';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('Failed to copy to clipboard. Your browser may not support this feature.');
      }
    }
  }, [stageRef]);

  const handleDownloadImage = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    downloadCanvasAsImage(stageRef.current, `markup-${timestamp}.png`);
  }, [stageRef]);

  const handleDownloadPdf = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    void downloadCanvasAsPdf(stageRef.current, `markup-${timestamp}.pdf`);
  }, [stageRef]);

  return {
    handleCopyToClipboard,
    handleDownloadImage,
    handleDownloadPdf,
  };
}
