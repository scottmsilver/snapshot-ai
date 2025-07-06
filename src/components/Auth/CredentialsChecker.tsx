import React from 'react';

export const CredentialsChecker: React.FC = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  
  const checkCredentials = () => {
    console.log('🔐 Checking credentials:');
    console.log('Client ID:', clientId);
    console.log('Client ID length:', clientId?.length);
    console.log('Client ID trimmed:', clientId?.trim());
    console.log('Client ID trimmed length:', clientId?.trim()?.length);
    console.log('API Key:', apiKey?.substring(0, 10) + '...');
    
    // Check for common issues
    if (clientId?.includes('\n')) {
      console.error('❌ Client ID contains newline character!');
    }
    if (clientId?.includes(' ')) {
      console.error('❌ Client ID contains space character!');
    }
    if (clientId !== clientId?.trim()) {
      console.error('❌ Client ID has leading/trailing whitespace!');
    }
  };
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 110,
      right: 10,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 9999
    }}>
      <button 
        onClick={checkCredentials}
        style={{
          background: '#f4b400',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          borderRadius: '3px',
          cursor: 'pointer'
        }}
      >
        Check Credentials
      </button>
    </div>
  );
};