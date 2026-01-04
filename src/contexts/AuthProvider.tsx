import React, { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import {
  storeSession,
  getStoredSession,
  clearStoredSession,
  isSessionValid,
} from '@/utils/tokenPersistence';
import { useActivityMonitor } from '@/hooks/useActivityMonitor';
import { AuthContext, type AuthContextType, type User } from '@/contexts/AuthContext';

interface OAuthError {
  type?: string;
  message?: string;
}

const isOAuthError = (value: unknown): value is OAuthError => {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('type' in value || 'message' in value)
  );
};

interface AuthProviderInnerProps {
  children: ReactNode;
}

const AuthProviderInner: React.FC<AuthProviderInnerProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const validateToken = async (token: string): Promise<boolean> => {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token);
    if (!response.ok) {
      throw new Error('Token validation failed');
    }
    return true;
  };

  const fetchUserInfo = async (token: string): Promise<User> => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const userData = await response.json();

      const fetchedUser: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
      };

      return fetchedUser;
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  };

  const logout = useCallback((): void => {
    const currentAccessToken = accessToken;
    setUser(null);
    setAccessToken(null);

    clearStoredSession();

    if (currentAccessToken) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${currentAccessToken}`, {
        method: 'POST',
      }).catch(console.error);
    }
  }, [accessToken]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      console.log('📨 postMessage received:', {
        origin: event.origin,
        data: typeof event.data === 'string' ? event.data.substring(0, 200) : event.data
      });
      if (typeof event.data === 'string') {
        try {
          JSON.parse(event.data);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle OAuth redirect callback (token in URL hash)
  useEffect(() => {
    const handleRedirectCallback = async (): Promise<void> => {
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        console.log('🔄 OAuth redirect detected, parsing token from URL...');
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

        if (token) {
          console.log('🎉 Token found in redirect URL!');
          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search);

          setAccessToken(token);
          try {
            const fetchedUser = await fetchUserInfo(token);
            storeSession(token, fetchedUser, expiresIn);
            setUser(fetchedUser);
            console.log('✅ Login successful via redirect!');
          } catch (error) {
            console.error('Failed to fetch user info after redirect:', error);
            setAccessToken(null);
          }
        }
        setIsLoading(false);
        return;
      }

      // Check stored session
      const session = getStoredSession();
      if (session && isSessionValid()) {
        setUser(session.user);
        setAccessToken(session.token);

        try {
          await validateToken(session.token);
        } catch (error) {
          console.error('Stored token is invalid:', error);
          logout();
        }
      }
      setIsLoading(false);
    };

    void handleRedirectCallback();
  }, [logout]);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response): Promise<void> => {
      console.log('🎉 onSuccess called!', response);
      const token = response.access_token;
      if (!token) {
        console.error('No access token in response');
        return;
      }

      setAccessToken(token);
      const expiresIn = response.expires_in || 3600;

      try {
        const fetchedUser = await fetchUserInfo(token);
        storeSession(token, fetchedUser, expiresIn);
        setUser(fetchedUser);
      } catch (error) {
        console.error('Failed to fetch user info after login:', error);
        setAccessToken(null);
      }
    },
    onError: (error): void => {
      console.log('❌ onError called!');
      console.error('Login failed:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    },
    onNonOAuthError: (error): void => {
      console.log('⚠️ onNonOAuthError called!');
      console.error('Non-OAuth error:', error);
      if (isOAuthError(error)) {
        if (error.type) {
          console.error('Error type:', error.type);
        }
        if ('message' in error && typeof error.message === 'string') {
          console.error('Error message:', error.message);
        }
        console.error('Full error object:', JSON.stringify(error, null, 2));
      }
    },
    scope: 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/cloud-platform',
    flow: 'implicit',
  });

  const login = (): void => {
    console.log('🚀 login() called, starting OAuth flow...');
    googleLogin();
  };

  const getAccessToken = (): string | null => accessToken;

  const checkAndRefreshToken = useCallback(async (): Promise<boolean> => {
    return isSessionValid();
  }, []);

  useActivityMonitor({
    enabled: !!accessToken,
    onSessionExpiring: (minutesLeft): void => {
      void minutesLeft;
    },
    onSessionExpired: (): void => {
      logout();
    },
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
    console.error('Google Client ID not configured');
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
