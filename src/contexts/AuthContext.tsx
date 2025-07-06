import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { storeSession, getStoredSession, clearStoredSession, isSessionValid } from '@/utils/tokenPersistence';
import { useActivityMonitor } from '@/hooks/useActivityMonitor';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  getAccessToken: () => string | null;
  checkAndRefreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderInnerProps {
  children: ReactNode;
}

const AuthProviderInner: React.FC<AuthProviderInnerProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);

  const validateToken = async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token);
      if (!response.ok) {
        throw new Error('Token validation failed');
      }
      return true;
    } catch (error) {
      throw error;
    }
  };

  const fetchUserInfo = async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }
      
      const userData = await response.json();
      
      const user: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
      };
      
      return user;
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  };


  const logout = useCallback(() => {
    const currentAccessToken = accessToken;
    setUser(null);
    setAccessToken(null);
    setTokenExpiry(null);
    
    // Clear stored session
    clearStoredSession();
    
    // Optional: Revoke token
    if (currentAccessToken) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${currentAccessToken}`, {
        method: 'POST',
      }).catch(console.error);
    }
  }, [accessToken]);

  // Listen for OAuth messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Try to parse the data if it's a string
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
        } catch (e) {
          // Not JSON
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const session = getStoredSession();
      
      if (session && isSessionValid()) {
        setUser(session.user);
        setAccessToken(session.token);
        setTokenExpiry(session.expiry);
        
        // Validate token is still valid with Google
        try {
          await validateToken(session.token);
        } catch (error) {
          console.error('❌ Stored token is invalid:', error);
          logout();
        }
      }
      setIsLoading(false);
    };
    
    checkSession();
  }, [logout]);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      const token = response.access_token;
      if (!token) {
        console.error('❌ No access token in response');
        return;
      }
      
      setAccessToken(token);
      
      // Calculate and store token expiry
      const expiresIn = response.expires_in || 3600;
      const expiryTime = Date.now() + (expiresIn * 1000);
      setTokenExpiry(expiryTime);
      
      // Fetch user info
      try {
        const user = await fetchUserInfo(token);
        
        // Store session with improved persistence
        storeSession(token, user, expiresIn);
        
        // Update the user state - this was missing!
        setUser(user);
      } catch (error) {
        console.error('❌ Failed to fetch user info after login:', error);
        // Clear tokens on error
        setAccessToken(null);
        setTokenExpiry(null);
      }
    },
    onError: (error) => {
      console.error('❌ Login failed:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    },
    onNonOAuthError: (error) => {
      console.error('❌ Non-OAuth error:', error);
      if (error && typeof error === 'object') {
        console.error('Error type:', (error as any).type);
        console.error('Error message:', (error as any).message);
        console.error('Full error object:', JSON.stringify(error, null, 2));
      }
    },
    scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
    // Use implicit flow for now (simpler and works well for SPAs)
    flow: 'implicit',
  });

  const login = () => {
    googleLogin();
  };

  const getAccessToken = () => accessToken;

  // Check if token is expired or will expire soon
  const checkAndRefreshToken = useCallback(async (): Promise<boolean> => {
    return isSessionValid();
  }, []);

  // Set up activity monitoring
  useActivityMonitor({
    enabled: !!accessToken,
    onSessionExpiring: (minutesLeft) => {
      // You could show a notification here
    },
    onSessionExpired: () => {
      logout();
    }
  });


  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    getAccessToken,
    checkAndRefreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    console.error('❌ Google Client ID not configured');
    // Provide a minimal context when auth is not configured
    const value: AuthContextType = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: () => console.error('Google OAuth not configured'),
      logout: () => {},
      getAccessToken: () => null,
      checkAndRefreshToken: async () => false,
    };
    
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }
  
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </GoogleOAuthProvider>
  );
};