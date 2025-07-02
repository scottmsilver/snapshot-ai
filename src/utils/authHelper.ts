import { useAuth } from '@/contexts/AuthContext';

// Higher-order function to wrap API calls with token checking
export async function withTokenCheck<T>(
  apiCall: () => Promise<T>,
  authContext: ReturnType<typeof useAuth>
): Promise<T> {
  const { checkAndRefreshToken, isAuthenticated } = authContext;
  
  if (!isAuthenticated) {
    throw new Error('User is not authenticated');
  }
  
  // Check if token is still valid
  const isValid = await checkAndRefreshToken();
  
  if (!isValid) {
    throw new Error('Authentication expired. Please log in again.');
  }
  
  // Proceed with the API call
  return apiCall();
}

// Hook to use in components
export function useAuthenticatedCall() {
  const auth = useAuth();
  
  return async function<T>(apiCall: () => Promise<T>): Promise<T> {
    return withTokenCheck(apiCall, auth);
  };
}