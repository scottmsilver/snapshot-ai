import React from 'react';
import { TextInputDialog } from '@/components/TextInputDialog';

type TextDialogProps = React.ComponentProps<typeof TextInputDialog>;

interface WorkspaceDialogsProps {
  textDialogProps: TextDialogProps;
}

export const WorkspaceDialogs: React.FC<WorkspaceDialogsProps> = ({
  textDialogProps,
}) => {
  return (
    <>
      <TextInputDialog {...textDialogProps} />
    </>
  );
};
