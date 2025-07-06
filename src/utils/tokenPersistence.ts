// Token persistence utilities for longer sessions

const TOKEN_KEY = 'google_access_token';
const USER_KEY = 'google_user';
const EXPIRY_KEY = 'google_token_expiry';
const SESSION_KEY = 'google_session_id';

interface StoredSession {
  token: string;
  user: any;
  expiry: number;
  sessionId: string;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Store authentication session
 */
export function storeSession(token: string, user: any, expiresIn: number): void {
  const sessionId = generateSessionId();
  const expiryTime = Date.now() + (expiresIn * 1000);
  
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(EXPIRY_KEY, expiryTime.toString());
  localStorage.setItem(SESSION_KEY, sessionId);
  
  // Also store in sessionStorage for current session
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(SESSION_KEY, sessionId);
}

/**
 * Retrieve stored session
 */
export function getStoredSession(): StoredSession | null {
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  const expiryStr = localStorage.getItem(EXPIRY_KEY);
  const sessionId = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  
  if (!token || !userStr || !expiryStr || !sessionId) {
    return null;
  }
  
  try {
    const user = JSON.parse(userStr);
    const expiry = parseInt(expiryStr);
    
    return {
      token,
      user,
      expiry,
      sessionId
    };
  } catch (error) {
    console.error('Failed to parse stored session:', error);
    return null;
  }
}

/**
 * Clear stored session
 */
export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(SESSION_KEY);
  
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Extend session expiry (useful when user is active)
 */
export function extendSession(additionalMinutes: number = 30): void {
  const expiryStr = localStorage.getItem(EXPIRY_KEY);
  if (expiryStr) {
    const currentExpiry = parseInt(expiryStr);
    const now = Date.now();
    
    // Only extend if not already expired
    if (currentExpiry > now) {
      const newExpiry = currentExpiry + (additionalMinutes * 60 * 1000);
      localStorage.setItem(EXPIRY_KEY, newExpiry.toString());
    }
  }
}

/**
 * Check if session is still valid
 */
export function isSessionValid(): boolean {
  const session = getStoredSession();
  if (!session) return false;
  
  const now = Date.now();
  return now < session.expiry;
}

/**
 * Get time until session expires (in milliseconds)
 */
export function getTimeUntilExpiry(): number {
  const session = getStoredSession();
  if (!session) return 0;
  
  const now = Date.now();
  return Math.max(0, session.expiry - now);
}