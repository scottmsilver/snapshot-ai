import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

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

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('google_access_token');
    const storedUser = localStorage.getItem('google_user');
    const storedExpiry = localStorage.getItem('google_token_expiry');
    
    if (storedToken && storedUser) {
      const expiry = storedExpiry ? parseInt(storedExpiry) : null;
      
      // Check if token is expired
      if (expiry && Date.now() > expiry) {
        // Token expired, clear session
        logout();
      } else {
        setAccessToken(storedToken);
        setUser(JSON.parse(storedUser));
        setTokenExpiry(expiry);
        
        // Validate token is still valid
        validateToken(storedToken).catch(() => {
          // Token is invalid, clear session
          logout();
        });
      }
    }
    
    setIsLoading(false);
  }, []);

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
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }
      
      const userData = await response.json();
      
      const user: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
      };
      
      // Store user info
      localStorage.setItem('google_user', JSON.stringify(user));
      setUser(user);
      
      return user;
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      const token = response.access_token;
      setAccessToken(token);
      localStorage.setItem('google_access_token', token);
      
      // Calculate and store token expiry (Google tokens typically expire in 1 hour)
      // response.expires_in is in seconds, we convert to milliseconds
      const expiresIn = response.expires_in || 3600; // Default to 1 hour if not provided
      const expiryTime = Date.now() + (expiresIn * 1000);
      setTokenExpiry(expiryTime);
      localStorage.setItem('google_token_expiry', expiryTime.toString());
      
      // Fetch user info
      await fetchUserInfo(token);
    },
    onError: (error) => {
      console.error('Login failed:', error);
    },
    scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
  });

  const login = () => {
    googleLogin();
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setTokenExpiry(null);
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_user');
    localStorage.removeItem('google_token_expiry');
    
    // Optional: Revoke token
    if (accessToken) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
      }).catch(console.error);
    }
  };

  const getAccessToken = () => accessToken;

  // Check if token is expired or will expire soon (within 5 minutes)
  const checkAndRefreshToken = async (): Promise<boolean> => {
    if (!accessToken || !tokenExpiry) {
      return false;
    }

    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (now > tokenExpiry - fiveMinutes) {
      // Token is expired or will expire soon
      // With implicit flow, we can't refresh - need to re-authenticate
      console.log('Token expired or expiring soon, please log in again');
      
      // Show user-friendly notification
      if (now > tokenExpiry) {
        alert('Your session has expired. Please log in again to continue.');
      } else {
        console.log('Your session will expire soon. Please save your work.');
      }
      
      // Clear the session
      logout();
      
      return false;
    }
    
    return true;
  };

  // Set up periodic token check (every minute)
  useEffect(() => {
    if (!accessToken) return;
    
    const interval = setInterval(() => {
      checkAndRefreshToken();
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [accessToken, tokenExpiry]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        getAccessToken,
        checkAndRefreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  
  if (!clientId || clientId === 'your-client-id-here') {
    console.error('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.');
    console.error('Follow the instructions in GOOGLE_SETUP.md to create a Google Cloud project and get credentials.');
    return <>{children}</>;
  }
  
  // Google OAuth initialized
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </GoogleOAuthProvider>
  );
};