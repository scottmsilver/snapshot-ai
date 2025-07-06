import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const AuthDebugger: React.FC = () => {
  const auth = useAuth();
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 10,
      right: 10,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999
    }}>
      <div>Auth Debug</div>
      <div>isLoading: {auth.isLoading ? 'true' : 'false'}</div>
      <div>isAuthenticated: {auth.isAuthenticated ? 'true' : 'false'}</div>
      <div>user: {auth.user ? auth.user.email : 'null'}</div>
      <div>token: {auth.getAccessToken() ? 'present' : 'null'}</div>
    </div>
  );
};