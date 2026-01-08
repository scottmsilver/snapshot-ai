import React, { useCallback, useMemo, useState } from 'react';
import { CalibrationDialog } from '@/components/Tools/CalibrationDialog';
import { calculatePixelDistance, calculatePixelsPerUnit, type MeasurementUnit } from '@/utils/measurementUtils';
import type { MeasurementLineShape } from '@/types/drawing';
import type { UseMeasurementReturn } from '@/hooks/useMeasurement';

interface CalibrationControllerProps {
  pendingCalibrationLine: MeasurementLineShape | null;
  measurement: UseMeasurementReturn;
  onDeleteShape: (shapeIds: string[]) => void;
  onClose: () => void;
  onSetMeasurementCalibration: (calibration: {
    pixelsPerUnit: number;
    unit: MeasurementUnit;
    calibrationLineId: string | null;
  }) => void;
}

export const CalibrationController: React.FC<CalibrationControllerProps> = ({
  pendingCalibrationLine,
  measurement,
  onDeleteShape,
  onClose,
  onSetMeasurementCalibration,
}) => {
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
  const [localPendingLine, setLocalPendingLine] = useState<MeasurementLineShape | null>(null);

  // When pendingCalibrationLine changes externally, open the dialog
  React.useEffect(() => {
    if (pendingCalibrationLine) {
      setLocalPendingLine(pendingCalibrationLine);
      setCalibrationDialogOpen(true);
    }
  }, [pendingCalibrationLine]);

  const handleCalibrationConfirm = useCallback(
    (value: number, unit: MeasurementUnit) => {
      if (localPendingLine) {
        const [x1, y1, x2, y2] = localPendingLine.points;
        const pixelDistance = calculatePixelDistance(x1, y1, x2, y2);
        const pixelsPerUnit = calculatePixelsPerUnit(pixelDistance, value, unit);

        onSetMeasurementCalibration({
          pixelsPerUnit,
          unit,
          calibrationLineId: null,
        });

        measurement.setCalibration(pixelDistance, value, unit, '');
        onDeleteShape([localPendingLine.id]);
      }

      setCalibrationDialogOpen(false);
      setLocalPendingLine(null);
      onClose();
    },
    [localPendingLine, measurement, onDeleteShape, onSetMeasurementCalibration, onClose],
  );

  const handleCalibrationCancel = useCallback(() => {
    if (localPendingLine) {
      onDeleteShape([localPendingLine.id]);
    }

    setCalibrationDialogOpen(false);
    setLocalPendingLine(null);
    onClose();
  }, [localPendingLine, onDeleteShape, onClose]);

  const calibrationDialogProps = useMemo(
    () => ({
      isOpen: calibrationDialogOpen,
      pixelDistance: localPendingLine
        ? calculatePixelDistance(...localPendingLine.points)
        : 0,
      onConfirm: handleCalibrationConfirm,
      onCancel: handleCalibrationCancel,
    }),
    [calibrationDialogOpen, localPendingLine, handleCalibrationConfirm, handleCalibrationCancel],
  );

  return <CalibrationDialog {...calibrationDialogProps} />;
};
