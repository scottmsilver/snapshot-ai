import { useEffect, useRef } from 'react';
import { extendSession, isSessionValid, getTimeUntilExpiry } from '@/utils/tokenPersistence';

interface UseActivityMonitorOptions {
  enabled: boolean;
  onSessionExpiring?: (minutesLeft: number) => void;
  onSessionExpired?: () => void;
}

/**
 * Monitor user activity and extend session when active
 */
export function useActivityMonitor({
  enabled,
  onSessionExpiring,
  onSessionExpired
}: UseActivityMonitorOptions) {
  const lastActivityRef = useRef<number>(Date.now());
  const hasNotifiedExpiringRef = useRef<boolean>(false);
  
  useEffect(() => {
    if (!enabled) return;
    
    // Activity events to monitor
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];
    
    // Update last activity time
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };
    
    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });
    
    // Check session and extend if active
    const checkInterval = setInterval(() => {
      if (!isSessionValid()) {
        if (onSessionExpired) {
          onSessionExpired();
        }
        return;
      }
      
      const timeUntilExpiry = getTimeUntilExpiry();
      const minutesLeft = Math.floor(timeUntilExpiry / 60000);
      
      // Notify when session is expiring soon (5 minutes)
      if (minutesLeft <= 5 && !hasNotifiedExpiringRef.current) {
        hasNotifiedExpiringRef.current = true;
        if (onSessionExpiring) {
          onSessionExpiring(minutesLeft);
        }
      }
      
      // Reset notification flag if session was extended
      if (minutesLeft > 5) {
        hasNotifiedExpiringRef.current = false;
      }
      
      // Check if user has been active in the last 5 minutes
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      const wasRecentlyActive = timeSinceLastActivity < 5 * 60 * 1000; // 5 minutes
      
      // Extend session if:
      // 1. User is active
      // 2. Session expires in less than 30 minutes
      // 3. Session is still valid
      if (wasRecentlyActive && minutesLeft < 30 && isSessionValid()) {
        console.log('Extending session due to user activity');
        extendSession(30); // Extend by 30 minutes
      }
    }, 60000); // Check every minute
    
    return () => {
      // Clean up
      activityEvents.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      clearInterval(checkInterval);
    };
  }, [enabled, onSessionExpiring, onSessionExpired]);
  
  return {
    lastActivity: lastActivityRef.current
  };
}