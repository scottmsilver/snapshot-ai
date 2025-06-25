import React, { useState, useEffect } from 'react';
import { googleDriveService, type ShareOptions } from '@/services/googleDrive';

interface ShareDialogProps {
  isOpen: boolean;
  fileId: string | null;
  onClose: () => void;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({ isOpen, fileId, onClose }) => {
  const [shareType, setShareType] = useState<'anyone' | 'specific'>('anyone');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'reader' | 'writer'>('reader');
  const [shareLink, setShareLink] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  useEffect(() => {
    if (isOpen && fileId) {
      // Generate the share link when dialog opens
      const appUrl = window.location.origin;
      const shareUrl = `${appUrl}?file=${fileId}`;
      setShareLink(shareUrl);
    }
  }, [isOpen, fileId]);

  const handleShare = async () => {
    if (!fileId) return;

    setIsSharing(true);
    setError(null);

    try {
      const shareOptions: ShareOptions = shareType === 'anyone' 
        ? { type: 'anyone', role }
        : { type: 'user', role, emailAddress: email };

      await googleDriveService.shareProject(fileId, shareOptions);
      
      // If sharing with specific user, reset email
      if (shareType === 'specific') {
        setEmail('');
      }
    } catch (err) {
      console.error('Failed to share:', err);
      setError(err instanceof Error ? err.message : 'Failed to share project');
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>Share Project</h2>
        
        {/* Share Link Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Share Link
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={shareLink}
              readOnly
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                fontSize: '0.875rem',
              }}
            />
            <button
              onClick={handleCopyLink}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: copiedToClipboard ? '#4CAF50' : '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                transition: 'background-color 0.2s',
              }}
            >
              {copiedToClipboard ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
            Anyone with this link can view the project
          </p>
        </div>

        {/* Sharing Options */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Sharing Permissions
          </label>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <input
                type="radio"
                checked={shareType === 'anyone'}
                onChange={() => setShareType('anyone')}
                style={{ marginRight: '0.5rem' }}
              />
              Anyone with the link
            </label>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="radio"
                checked={shareType === 'specific'}
                onChange={() => setShareType('specific')}
                style={{ marginRight: '0.5rem' }}
              />
              Specific people
            </label>
          </div>

          {shareType === 'specific' && (
            <input
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
              }}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ fontSize: '0.875rem' }}>Permission:</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'reader' | 'writer')}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            >
              <option value="reader">View only</option>
              <option value="writer">Can edit</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Close
          </button>
          <button
            onClick={handleShare}
            disabled={isSharing || (shareType === 'specific' && !email)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              opacity: isSharing || (shareType === 'specific' && !email) ? 0.6 : 1,
            }}
          >
            {isSharing ? 'Sharing...' : 'Update Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
};