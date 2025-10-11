import React from 'react';
import { TextInputDialog } from '@/components/TextInputDialog';
import { CalibrationDialog } from '@/components/Tools/CalibrationDialog';

type TextDialogProps = React.ComponentProps<typeof TextInputDialog>;
type CalibrationDialogProps = React.ComponentProps<typeof CalibrationDialog>;

interface WorkspaceDialogsProps {
  textDialogProps: TextDialogProps;
  calibrationDialogProps: CalibrationDialogProps;
}

export const WorkspaceDialogs: React.FC<WorkspaceDialogsProps> = ({
  textDialogProps,
  calibrationDialogProps,
}) => {
  return (
    <>
      <TextInputDialog {...textDialogProps} />
      <CalibrationDialog {...calibrationDialogProps} />
    </>
  );
};
