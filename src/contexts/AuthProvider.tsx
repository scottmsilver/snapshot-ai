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

  useEffect(() => {
    const checkSession = async (): Promise<void> => {
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

    void checkSession();
  }, [logout]);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response): Promise<void> => {
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
      console.error('Login failed:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    },
    onNonOAuthError: (error): void => {
      console.error('Non-OAuth error:', error);
      if (isOAuthError(error)) {
        if (error.type) {
          console.error('Error type:', error.type);
        }
        if (error.message) {
          console.error('Error message:', error.message);
        }
        console.error('Full error object:', JSON.stringify(error, null, 2));
      }
    },
    scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
    flow: 'implicit',
  });

  const login = (): void => {
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
