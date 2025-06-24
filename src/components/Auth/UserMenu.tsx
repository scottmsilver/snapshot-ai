import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const UserMenu: React.FC = () => {
  // Try to use auth context, but handle case where it's not available
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    // Auth context not available (Google OAuth not configured)
    return (
      <div style={{
        padding: '0.25rem 0.75rem',
        backgroundColor: '#fff3cd',
        color: '#856404',
        border: '1px solid #ffeeba',
        borderRadius: '4px',
        fontSize: '0.75rem',
      }}>
        ⚠️ Google OAuth not configured
      </div>
    );
  }
  
  const { user, isAuthenticated, login, logout } = authContext;
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isAuthenticated) {
    return (
      <div 
        onClick={login}
        className="g_id_signin"
        data-type="standard"
        data-size="medium"
        data-theme="outline"
        data-text="sign_in_with"
        data-shape="rectangular"
        style={{
          cursor: 'pointer',
          display: 'inline-block'
        }}
      >
        {/* Fallback custom button if Google button doesn't render */}
        <button
          style={{
            backgroundColor: '#fff',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            color: '#3c4043',
            cursor: 'pointer',
            fontFamily: 'Google Sans,Roboto,Arial,sans-serif',
            fontSize: '14px',
            height: '40px',
            letterSpacing: '0.25px',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#fbbc04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          padding: '0.25rem 0.5rem',
          backgroundColor: 'transparent',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f5f5f5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%'
            }}
          />
        ) : (
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#4285f4',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 'bold'
            }}
          >
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
        )}
        <span style={{ fontSize: '0.75rem', color: '#666' }}>
          {user?.email}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            minWidth: '200px',
            zIndex: 1000
          }}
        >
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.125rem' }}>
              {user?.email}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              setShowDropdown(false);
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              backgroundColor: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: '#666'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};