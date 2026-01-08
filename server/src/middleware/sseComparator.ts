/**
 * SSE Stream Comparator
 * 
 * Compares Server-Sent Event streams from Express and Python servers.
 * Used for shadow testing of streaming endpoints like /api/ai/agentic/edit.
 * 
 * Strategy:
 * 1. Buffer all events from both streams
 * 2. Compare after both streams complete
 * 3. Report event count, types, payload differences, and timing
 */

import { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';

// ============================================================================
// Types
// ============================================================================

export interface ParsedSSEEvent {
  /** Event type (e.g., "progress", "complete", "error") */
  type: string;
  /** Parsed JSON data */
  data: unknown;
  /** Raw data string */
  raw: string;
  /** Timestamp when event was received */
  timestamp: number;
}

export interface SSEComparisonResult {
  /** Whether the streams match */
  match: boolean;
  /** Request details */
  request: {
    method: string;
    path: string;
    timestamp: string;
  };
  /** Express stream summary */
  express: SSEStreamSummary;
  /** Python stream summary */
  python: SSEStreamSummary;
  /** Detailed comparison */
  comparison: {
    /** Event counts match */
    eventCountMatch: boolean;
    /** All event types match in order */
    eventTypesMatch: boolean;
    /** Final result payloads match */
    finalResultMatch: boolean;
    /** Individual event differences */
    eventDifferences: EventDifference[];
  };
}

export interface SSEStreamSummary {
  /** Total number of events */
  eventCount: number;
  /** Event types in order */
  eventTypes: string[];
  /** Time to first event (ms) */
  timeToFirstEvent: number;
  /** Total stream duration (ms) */
  totalDuration: number;
  /** Final event (complete/error) */
  finalEvent?: ParsedSSEEvent;
  /** Whether stream completed successfully */
  completed: boolean;
  /** Error if stream failed */
  error?: string;
}

export interface EventDifference {
  /** Event index */
  index: number;
  /** Type of difference */
  type: 'type_mismatch' | 'data_mismatch' | 'missing_express' | 'missing_python';
  /** Express event (if present) */
  expressEvent?: ParsedSSEEvent;
  /** Python event (if present) */
  pythonEvent?: ParsedSSEEvent;
  /** Specific data differences */
  dataDiffs?: { path: string; express: unknown; python: unknown }[];
}

export interface SSEComparatorConfig {
  /** Python server URL */
  pythonServerUrl: string;
  /** Timeout for stream completion (ms) */
  timeout: number;
  /** Paths to ignore in data comparison */
  ignorePaths?: string[];
  /** Callback for comparison results */
  onComparisonResult?: (result: SSEComparisonResult) => void;
}

// ============================================================================
// SSE Parser
// ============================================================================

/**
 * Parse SSE stream into events
 */
export async function parseSSEStream(
  stream: ReadableStream<Uint8Array> | Readable,
  startTime: number,
): Promise<{ events: ParsedSSEEvent[]; error?: string }> {
  const events: ParsedSSEEvent[] = [];
  let buffer = '';
  let currentEventType = 'message';
  
  try {
    // Handle both web streams and Node streams
    const reader = 'getReader' in stream
      ? stream.getReader()
      : null;
    
    const decoder = new TextDecoder();
    
    if (reader) {
      // Web ReadableStream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            let data: unknown;
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
            events.push({
              type: currentEventType,
              data,
              raw,
              timestamp: Date.now() - startTime,
            });
            currentEventType = 'message';
          }
        }
      }
    } else {
      // Node Readable stream
      for await (const chunk of stream as Readable) {
        buffer += typeof chunk === 'string' ? chunk : chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            let data: unknown;
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
            events.push({
              type: currentEventType,
              data,
              raw,
              timestamp: Date.now() - startTime,
            });
            currentEventType = 'message';
          }
        }
      }
    }
    
    return { events };
  } catch (error) {
    return {
      events,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Stream Summary
// ============================================================================

function createStreamSummary(
  events: ParsedSSEEvent[],
  totalDuration: number,
  error?: string,
): SSEStreamSummary {
  const eventTypes = events.map(e => e.type);
  const finalEvent = events[events.length - 1];
  
  return {
    eventCount: events.length,
    eventTypes,
    timeToFirstEvent: events[0]?.timestamp || totalDuration,
    totalDuration,
    finalEvent,
    completed: !error && (finalEvent?.type === 'complete' || finalEvent?.type === 'error'),
    error,
  };
}

// ============================================================================
// Deep Comparison
// ============================================================================

function deepCompareData(
  expressVal: unknown,
  pythonVal: unknown,
  path: string = '',
  ignorePaths: string[] = [],
): { path: string; express: unknown; python: unknown }[] {
  const diffs: { path: string; express: unknown; python: unknown }[] = [];
  
  // Check if path should be ignored
  if (ignorePaths.some(p => path === p || path.startsWith(`${p}.`))) {
    return diffs;
  }
  
  if (expressVal === pythonVal) return diffs;
  
  if (typeof expressVal !== typeof pythonVal) {
    diffs.push({ path: path || 'root', express: expressVal, python: pythonVal });
    return diffs;
  }
  
  if (Array.isArray(expressVal) && Array.isArray(pythonVal)) {
    const maxLen = Math.max(expressVal.length, pythonVal.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...deepCompareData(expressVal[i], pythonVal[i], `${path}[${i}]`, ignorePaths));
    }
    return diffs;
  }
  
  if (typeof expressVal === 'object' && expressVal && pythonVal) {
    const expressObj = expressVal as Record<string, unknown>;
    const pythonObj = pythonVal as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(expressObj), ...Object.keys(pythonObj)]);
    
    for (const key of allKeys) {
      diffs.push(...deepCompareData(
        expressObj[key],
        pythonObj[key],
        path ? `${path}.${key}` : key,
        ignorePaths,
      ));
    }
    return diffs;
  }
  
  if (expressVal !== pythonVal) {
    diffs.push({ path: path || 'root', express: expressVal, python: pythonVal });
  }
  
  return diffs;
}

// ============================================================================
// Event Comparison
// ============================================================================

function compareEvents(
  expressEvents: ParsedSSEEvent[],
  pythonEvents: ParsedSSEEvent[],
  ignorePaths: string[] = [],
): EventDifference[] {
  const differences: EventDifference[] = [];
  const maxLen = Math.max(expressEvents.length, pythonEvents.length);
  
  for (let i = 0; i < maxLen; i++) {
    const expressEvent = expressEvents[i];
    const pythonEvent = pythonEvents[i];
    
    if (!expressEvent) {
      differences.push({
        index: i,
        type: 'missing_express',
        pythonEvent,
      });
      continue;
    }
    
    if (!pythonEvent) {
      differences.push({
        index: i,
        type: 'missing_python',
        expressEvent,
      });
      continue;
    }
    
    if (expressEvent.type !== pythonEvent.type) {
      differences.push({
        index: i,
        type: 'type_mismatch',
        expressEvent,
        pythonEvent,
      });
      continue;
    }
    
    const dataDiffs = deepCompareData(expressEvent.data, pythonEvent.data, '', ignorePaths);
    if (dataDiffs.length > 0) {
      differences.push({
        index: i,
        type: 'data_mismatch',
        expressEvent,
        pythonEvent,
        dataDiffs,
      });
    }
  }
  
  return differences;
}

// ============================================================================
// SSE Comparator
// ============================================================================

/**
 * Compare SSE streams from Express and Python
 */
export async function compareSSEStreams(
  config: SSEComparatorConfig,
  req: Request,
  expressStream: ReadableStream<Uint8Array> | Readable,
  pythonPath: string,
): Promise<SSEComparisonResult> {
  const startTime = Date.now();
  const pythonUrl = `${config.pythonServerUrl}${pythonPath}`;
  
  // Parse Express stream
  const expressResult = await parseSSEStream(expressStream, startTime);
  const expressDuration = Date.now() - startTime;
  
  // Forward request to Python
  let pythonResult: { events: ParsedSSEEvent[]; error?: string };
  let pythonDuration: number;
  
  try {
    const pythonStart = Date.now();
    const pythonResponse = await fetch(pythonUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(config.timeout),
    });
    
    if (!pythonResponse.body) {
      throw new Error('No response body from Python');
    }
    
    pythonResult = await parseSSEStream(pythonResponse.body, pythonStart);
    pythonDuration = Date.now() - pythonStart;
  } catch (error) {
    pythonDuration = Date.now() - startTime;
    pythonResult = {
      events: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
  
  // Create summaries
  const expressSummary = createStreamSummary(
    expressResult.events,
    expressDuration,
    expressResult.error,
  );
  const pythonSummary = createStreamSummary(
    pythonResult.events,
    pythonDuration,
    pythonResult.error,
  );
  
  // Compare events
  const eventDifferences = compareEvents(
    expressResult.events,
    pythonResult.events,
    config.ignorePaths,
  );
  
  // Check final results match
  const expressFinal = expressResult.events.find(e => e.type === 'complete');
  const pythonFinal = pythonResult.events.find(e => e.type === 'complete');
  const finalResultMatch = expressFinal && pythonFinal
    ? deepCompareData(expressFinal.data, pythonFinal.data, '', config.ignorePaths).length === 0
    : expressFinal === pythonFinal;
  
  // Build result
  const eventCountMatch = expressSummary.eventCount === pythonSummary.eventCount;
  const eventTypesMatch = expressSummary.eventTypes.every(
    (t, i) => t === pythonSummary.eventTypes[i]
  );
  
  const result: SSEComparisonResult = {
    match: eventCountMatch && eventTypesMatch && finalResultMatch && eventDifferences.length === 0,
    request: {
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString(),
    },
    express: expressSummary,
    python: pythonSummary,
    comparison: {
      eventCountMatch,
      eventTypesMatch,
      finalResultMatch,
      eventDifferences,
    },
  };
  
  return result;
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log SSE comparison result
 */
export function logSSEComparisonResult(result: SSEComparisonResult): void {
  const status = result.match ? '✅ SSE MATCH' : '❌ SSE MISMATCH';
  
  console.log(`[Shadow/SSE] ${status} ${result.request.method} ${result.request.path}`);
  console.log(`  Express: ${result.express.eventCount} events in ${result.express.totalDuration}ms`);
  console.log(`  Python:  ${result.python.eventCount} events in ${result.python.totalDuration}ms`);
  
  if (result.express.error) {
    console.log(`  Express error: ${result.express.error}`);
  }
  if (result.python.error) {
    console.log(`  Python error: ${result.python.error}`);
  }
  
  if (!result.match) {
    console.log('  Comparison:');
    console.log(`    Event count match: ${result.comparison.eventCountMatch}`);
    console.log(`    Event types match: ${result.comparison.eventTypesMatch}`);
    console.log(`    Final result match: ${result.comparison.finalResultMatch}`);
    
    if (result.comparison.eventDifferences.length > 0) {
      console.log(`    Event differences (first 3):`);
      for (const diff of result.comparison.eventDifferences.slice(0, 3)) {
        console.log(`      [${diff.index}] ${diff.type}`);
        if (diff.dataDiffs && diff.dataDiffs.length > 0) {
          for (const dataDiff of diff.dataDiffs.slice(0, 2)) {
            console.log(`        ${dataDiff.path}: Express=${JSON.stringify(dataDiff.express)} Python=${JSON.stringify(dataDiff.python)}`);
          }
        }
      }
    }
  }
}

// ============================================================================
// Middleware for SSE Endpoints
// ============================================================================

export interface SSEShadowConfig {
  enabled: boolean;
  sampleRate: number;
  pythonServerUrl: string;
  timeout: number;
  pythonPath?: string;
  ignorePaths?: string[];
  onComparisonResult?: (result: SSEComparisonResult) => void;
}

/**
 * Create SSE shadow testing middleware
 * 
 * Note: This is more complex than regular shadow testing because we need to:
 * 1. Intercept the Express SSE stream
 * 2. Tee the stream (one to client, one to comparison)
 * 3. Forward to Python in parallel
 * 4. Compare after both complete
 */
export function createSSEShadowMiddleware(
  config: SSEShadowConfig,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enabled) {
      return next();
    }
    
    if (Math.random() > config.sampleRate) {
      return next();
    }
    
    // For SSE, we'll run Python in parallel and compare after Express completes
    // This doesn't modify the Express response flow
    
    const pythonPath = config.pythonPath || req.path;
    const pythonUrl = `${config.pythonServerUrl}${pythonPath}`;
    const startTime = Date.now();
    
    // Start Python request in parallel
    const pythonPromise = (async () => {
      try {
        const response = await fetch(pythonUrl, {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(config.timeout),
        });
        
        if (!response.body) {
          throw new Error('No response body');
        }
        
        return await parseSSEStream(response.body, startTime);
      } catch (error) {
        return {
          events: [] as ParsedSSEEvent[],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();
    
    // Capture Express events
    const expressEvents: ParsedSSEEvent[] = [];
    const originalWrite = res.write.bind(res);
    let buffer = '';
    let currentEventType = 'message';
    
    res.write = function(chunk: Buffer | string, ...args: unknown[]): boolean {
      if (chunk) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        buffer += text;
        
        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            let data: unknown;
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
            expressEvents.push({
              type: currentEventType,
              data,
              raw,
              timestamp: Date.now() - startTime,
            });
            currentEventType = 'message';
          }
        }
      }
      return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...args);
    };
    
    // Compare when Express completes
    // Note: SSE streams use 'close' event, not 'finish', since they're long-lived connections
    res.on('close', async () => {
      const expressDuration = Date.now() - startTime;
      const pythonResult = await pythonPromise;
      const pythonDuration = Date.now() - startTime;
      
      // Build comparison
      const expressSummary = createStreamSummary(expressEvents, expressDuration);
      const pythonSummary = createStreamSummary(
        pythonResult.events,
        pythonDuration,
        pythonResult.error,
      );
      
      const eventDifferences = compareEvents(
        expressEvents,
        pythonResult.events,
        config.ignorePaths,
      );
      
      const expressFinal = expressEvents.find(e => e.type === 'complete');
      const pythonFinal = pythonResult.events.find(e => e.type === 'complete');
      const finalResultMatch = expressFinal && pythonFinal
        ? deepCompareData(expressFinal.data, pythonFinal.data, '', config.ignorePaths).length === 0
        : !expressFinal && !pythonFinal;
      
      const eventCountMatch = expressSummary.eventCount === pythonSummary.eventCount;
      const eventTypesMatch = expressSummary.eventTypes.every(
        (t, i) => t === pythonSummary.eventTypes[i],
      );
      
      const result: SSEComparisonResult = {
        match: eventCountMatch && eventTypesMatch && finalResultMatch && eventDifferences.length === 0,
        request: {
          method: req.method,
          path: req.path,
          timestamp: new Date().toISOString(),
        },
        express: expressSummary,
        python: pythonSummary,
        comparison: {
          eventCountMatch,
          eventTypesMatch,
          finalResultMatch,
          eventDifferences,
        },
      };
      
      if (config.onComparisonResult) {
        config.onComparisonResult(result);
      } else {
        logSSEComparisonResult(result);
      }
    });
    
    next();
  };
}

export default createSSEShadowMiddleware;
