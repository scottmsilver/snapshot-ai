import React from 'react';
import { motion } from 'framer-motion';
import { Palette } from 'lucide-react';
import { UserMenu } from '@/components/Auth/UserMenu';
import type { AuthContextType } from '@/contexts/AuthContext';

interface AuthGateProps {
  authContext: AuthContextType | null;
  children: React.ReactNode;
}

const loadingContainerStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f5f5f5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const spinnerStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  border: '3px solid #e0e0e0',
  borderTopColor: '#4285f4',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

export const AuthGate: React.FC<AuthGateProps> = ({ authContext, children }) => {
  if (!authContext || authContext.isLoading) {
    return (
      <div style={loadingContainerStyle}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div style={spinnerStyle} />
          <p style={{ color: '#666', fontSize: '0.875rem' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!authContext.isAuthenticated) {
    return (
      <div style={loadingContainerStyle}>
        <div
          style={{
            backgroundColor: 'white',
            padding: '3rem',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <Palette size={48} color="#4a90e2" style={{ marginBottom: '1rem' }} />
          </motion.div>
          <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Image Markup App</h1>
          <p style={{ marginBottom: '2rem', color: '#666' }}>
            Sign in with Google to start creating and saving your image annotations
          </p>
          <UserMenu />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
