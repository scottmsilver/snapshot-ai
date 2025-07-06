import React from 'react';

export const OAuthTester: React.FC = () => {
  const testDirectOAuth = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    const redirectUri = window.location.origin;
    const scope = 'openid email profile https://www.googleapis.com/auth/drive.file';
    
    console.log('🧪 Testing direct OAuth with:', {
      clientId: clientId?.substring(0, 20) + '...',
      clientIdLength: clientId?.length,
      redirectUri,
      scope
    });
    
    // Construct OAuth URL manually
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('include_granted_scopes', 'true');
    
    console.log('🔗 OAuth URL:', authUrl.toString());
    
    // Open in new window
    window.open(authUrl.toString(), '_blank', 'width=500,height=600');
  };
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 60,
      right: 10,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 9999
    }}>
      <button 
        onClick={testDirectOAuth}
        style={{
          background: '#4285f4',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          borderRadius: '3px',
          cursor: 'pointer'
        }}
      >
        Test Direct OAuth
      </button>
    </div>
  );
};