/**
 * SSE (Server-Sent Events) client for streaming AI responses
 * 
 * Handles EventSource connections with proper error handling and cleanup.
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';

// Only log in development
const DEBUG = import.meta.env.DEV;
function debugLog(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    console.log(`[sseClient] ${message}`, data ?? '');
  }
}

export interface SSEEvent<T = unknown> {
  /** Event type (e.g., 'progress', 'complete', 'error') */
  event: string;
  /** Parsed JSON data */
  data: T;
}

export interface SSEClientOptions {
  /** Called when connection is established */
  onOpen?: () => void;
  /** Called for each event received */
  onEvent?: (event: SSEEvent) => void;
  /** Called when an error event is received or connection fails */
  onError?: (error: Error) => void;
  /** Called when connection is closed */
  onClose?: () => void;
}

/**
 * Custom error class for SSE-related errors
 */
export class SSEError extends Error {
  constructor(
    message: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'SSEError';
  }
}

/**
 * Create an SSE connection to the given URL
 * 
 * Returns a cleanup function to close the connection.
 * 
 * @example
 * ```ts
 * const close = createSSEClient(url, {
 *   onEvent: (event) => {
 *     if (event.event === 'progress') {
 *       console.log('Progress:', event.data);
 *     } else if (event.event === 'complete') {
 *       console.log('Done:', event.data);
 *       close();
 *     }
 *   },
 *   onError: (error) => {
 *     console.error('SSE error:', error);
 *     close();
 *   }
 * });
 * ```
 */
export function createSSEClient(
  url: string,
  options: SSEClientOptions
): () => void {
  const { onOpen, onEvent, onError, onClose } = options;

  const eventSource = new EventSource(url);
  let isClosed = false;

  // Handle connection opened
  eventSource.addEventListener('open', () => {
    if (isClosed) return;
    onOpen?.();
  });

  // Handle generic messages (fallback for events without explicit type)
  eventSource.addEventListener('message', (e) => {
    if (isClosed) return;
    try {
      const data = JSON.parse(e.data);
      onEvent?.({ event: 'message', data });
    } catch (error) {
      const parseError = new SSEError(
        'Failed to parse SSE message',
        error instanceof Error ? error.message : undefined
      );
      onError?.(parseError);
    }
  });

  // Handle 'progress' events
  eventSource.addEventListener('progress', (e) => {
    if (isClosed) return;
    try {
      const data = JSON.parse(e.data);
      onEvent?.({ event: 'progress', data });
    } catch (error) {
      const parseError = new SSEError(
        'Failed to parse progress event',
        error instanceof Error ? error.message : undefined
      );
      onError?.(parseError);
    }
  });

  // Handle 'complete' events
  eventSource.addEventListener('complete', (e) => {
    if (isClosed) return;
    try {
      const data = JSON.parse(e.data);
      onEvent?.({ event: 'complete', data });
    } catch (error) {
      const parseError = new SSEError(
        'Failed to parse complete event',
        error instanceof Error ? error.message : undefined
      );
      onError?.(parseError);
    }
  });

  // Handle 'error' events (server-sent errors with data)
  eventSource.addEventListener('error', (e: Event) => {
    if (isClosed) return;
    
    // Check if this is a MessageEvent with data (server error)
    if ('data' in e && typeof e.data === 'string') {
      try {
        const errorData = JSON.parse(e.data);
        const sseError = new SSEError(
          errorData.message || 'Server error',
          errorData.details
        );
        onError?.(sseError);
      } catch {
        // If we can't parse the error data, treat it as a generic error
        const sseError = new SSEError('Server error', e.data);
        onError?.(sseError);
      }
    } else {
      // Connection error (no data)
      const sseError = new SSEError('SSE connection error');
      onError?.(sseError);
    }
  });

  // Cleanup function
  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    eventSource.close();
    onClose?.();
  };

  return cleanup;
}

/**
 * Promise-based SSE client for simpler usage patterns
 * 
 * Returns a promise that resolves with the 'complete' event data,
 * or rejects on error.
 * 
 * @example
 * ```ts
 * try {
 *   const result = await sseRequest(url, {
 *     onProgress: (data) => console.log('Progress:', data)
 *   });
 *   console.log('Complete:', result);
 * } catch (error) {
 *   console.error('Error:', error);
 * }
 * ```
 */
export function sseRequest<TComplete, TProgress>(
  url: string,
  options: {
    onProgress?: (data: TProgress) => void;
  } = {}
): Promise<TComplete> {
  return new Promise<TComplete>((resolve, reject) => {
    const cleanup = createSSEClient(url, {
      onEvent: (event) => {
        if (event.event === 'progress') {
          options.onProgress?.(event.data as TProgress);
        } else if (event.event === 'complete') {
          cleanup();
          resolve(event.data as TComplete);
        }
      },
      onError: (error) => {
        cleanup();
        reject(error);
      },
    });
  });
}

/**
 * Promise-based SSE client using POST with JSON body for large payloads
 * 
 * Uses @microsoft/fetch-event-source to support POST requests with SSE streaming.
 * This avoids HTTP 431 errors when sending large data (e.g., base64 images) in URLs.
 * 
 * Returns a promise that resolves with the 'complete' event data,
 * or rejects on error.
 * 
 * @example
 * ```ts
 * try {
 *   const result = await ssePostRequest(url, { sourceImage: '...' }, {
 *     onProgress: (data) => console.log('Progress:', data)
 *   });
 *   console.log('Complete:', result);
 * } catch (error) {
 *   console.error('Error:', error);
 * }
 * ```
 */
export async function ssePostRequest<TComplete, TProgress>(
  url: string,
  body: unknown,
  options: {
    onProgress?: (data: TProgress) => void;
  } = {}
): Promise<TComplete> {
  // Use AbortController to stop the connection after receiving complete event
  const abortController = new AbortController();
  let isComplete = false;
  
  return new Promise<TComplete>((resolve, reject) => {
    let lastProgressJson: string | undefined; // Track last progress event to prevent duplicates
    
    fetchEventSource(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
      
      // Disable automatic retry - we handle completion ourselves
      openWhenHidden: true,
      
      async onopen(response: Response) {
        debugLog('SSE connection opened', { status: response.status });
        if (!response.ok) {
          throw new SSEError(`HTTP error ${response.status}`, response.statusText);
        }
      },
      
      onmessage(ev) {
        // If we've already completed, ignore any further events
        if (isComplete) return;
        
        debugLog('SSE raw event', { event: ev.event || '(empty)', dataLength: ev.data?.length || 0 });
        
        // Skip events with no data (e.g., SSE comments)
        if (!ev.data) return;
        
        try {
          const data = JSON.parse(ev.data);
          
          if (ev.event === 'progress') {
            // Prevent duplicate progress events (can happen with SSE retry/reconnect)
            const currentJson = ev.data;
            if (currentJson === lastProgressJson) {
              debugLog('Skipping duplicate progress event');
              return;
            }
            lastProgressJson = currentJson;
            debugLog('SSE received progress', {
              step: data.step,
              message: data.message,
              hasSourceImage: !!data.sourceImage,
              hasMaskImage: !!data.maskImage,
              newLogEntry: data.newLogEntry,
            });
            options.onProgress?.(data);
          } else if (ev.event === 'complete') {
            debugLog('SSE received complete event', {
              hasImageData: !!data.imageData,
              imageDataLength: data.imageData?.length || 0,
            });
            isComplete = true;
            // Abort the connection to prevent retries
            abortController.abort();
            resolve(data as TComplete);
          } else if (ev.event === 'error') {
            isComplete = true;
            abortController.abort();
            reject(new SSEError(data.message || 'Server error', data.details));
          }
        } catch (parseError) {
          // Only ignore SyntaxError (expected for SSE comments)
          // Re-throw unexpected errors from onProgress callback
          if (!(parseError instanceof SyntaxError)) {
            throw parseError;
          }
        }
      },
      
      onclose() {
        // Only reject if we didn't complete successfully
        if (!isComplete) {
          reject(new SSEError('SSE stream closed without complete event'));
        }
      },
      
      onerror(err) {
        // If we aborted intentionally after complete, don't treat as error
        if (isComplete) return;
        
        reject(new SSEError('SSE connection error', err?.message));
        // Throw to stop retrying
        throw err;
      },
    });
  });
}
