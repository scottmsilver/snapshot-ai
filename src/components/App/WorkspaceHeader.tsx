import React from 'react';
import { Palette, Copy } from 'lucide-react';
import { SaveIndicator } from '@/components/SaveIndicator';
import { FileMenu } from '@/components/FileMenu/FileMenu';
import { EditMenu } from '@/components/EditMenu';
import { UserMenu } from '@/components/Auth/UserMenu';

type SaveStatus = React.ComponentProps<typeof SaveIndicator>['status'];
type FileMenuProps = React.ComponentProps<typeof FileMenu>;
type EditMenuProps = React.ComponentProps<typeof EditMenu>;

interface WorkspaceHeaderProps {
  documentName: string;
  isEditingName: boolean;
  onStartEditingName: () => void;
  onDocumentNameChange: (value: string) => void;
  onDocumentNameBlur: () => void;
  onDocumentNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  nameInputRef: React.RefObject<HTMLInputElement>;
  saveStatus: SaveStatus;
  isCanvasInitialized: boolean;
  onCopyCanvas: () => void;
  fileMenuProps: FileMenuProps;
  editMenuProps?: EditMenuProps;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  documentName,
  isEditingName,
  onStartEditingName,
  onDocumentNameChange,
  onDocumentNameBlur,
  onDocumentNameKeyDown,
  nameInputRef,
  saveStatus,
  isCanvasInitialized,
  onCopyCanvas,
  fileMenuProps,
  editMenuProps,
}) => {
  return (
    <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0', display: 'flex' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 0.5rem',
        }}
      >
        <Palette size={32} color="#4a90e2" />
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '24px',
            padding: '0.375rem 0.5rem 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {isEditingName ? (
              <input
                ref={nameInputRef}
                value={documentName}
                onChange={event => onDocumentNameChange(event.target.value)}
                onBlur={onDocumentNameBlur}
                onKeyDown={onDocumentNameKeyDown}
                style={{
                  margin: 0,
                  padding: '0.125rem 0.25rem',
                  fontSize: '1rem',
                  fontWeight: 400,
                  color: '#202124',
                  lineHeight: '1',
                  border: '1px solid #dadce0',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  outline: 'none',
                  minWidth: '200px',
                }}
                autoFocus
              />
            ) : (
              <h1
                onClick={onStartEditingName}
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 400,
                  color: '#202124',
                  lineHeight: '1',
                  cursor: 'text',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={event => {
                  event.currentTarget.style.backgroundColor = '#f1f3f4';
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {documentName}
              </h1>
            )}
            <SaveIndicator status={saveStatus} />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '28px',
            padding: '0 0.5rem 0.125rem',
          }}
        >
          <FileMenu {...fileMenuProps} />
          {isCanvasInitialized && editMenuProps ? <EditMenu {...editMenuProps} /> : null}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 0.5rem',
          gap: '0.5rem',
        }}
      >
        {isCanvasInitialized && (
          <div
            onClick={onCopyCanvas}
            style={{
              padding: '0.375rem',
              backgroundColor: 'transparent',
              border: '1px solid #ddd',
              cursor: 'pointer',
              color: '#5f6368',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 10,
            }}
            onMouseEnter={event => {
              event.currentTarget.style.backgroundColor = '#f1f3f4';
            }}
            onMouseLeave={event => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            role="button"
            title="Copy canvas to clipboard"
          >
            <Copy size={18} style={{ pointerEvents: 'none' }} />
          </div>
        )}
        <UserMenu />
      </div>
    </div>
  );
};
