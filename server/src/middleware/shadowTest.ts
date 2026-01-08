/**
 * Shadow Testing Middleware
 * 
 * Implements the "dark launch" pattern for migrating endpoints from Express to Python.
 * 
 * How it works:
 * 1. Request comes to Express (primary)
 * 2. Express processes and returns response to client immediately
 * 3. In parallel, request is forwarded to Python (shadow)
 * 4. Responses are compared asynchronously
 * 5. Differences are logged for analysis
 * 
 * This allows validating the Python implementation without affecting users.
 */

import { Request, Response, NextFunction } from 'express';

// ============================================================================
// Types
// ============================================================================

export interface ShadowTestConfig {
  /** Whether shadow testing is enabled */
  enabled: boolean;
  /** Sample rate (0-1): what percentage of requests to shadow test */
  sampleRate: number;
  /** Python server base URL */
  pythonServerUrl: string;
  /** Timeout for Python response (ms) */
  timeout: number;
  /** Endpoints to shadow test (path patterns) */
  endpoints: ShadowEndpointConfig[];
  /** Callback for comparison results */
  onComparisonResult?: (result: ComparisonResult) => void;
}

export interface ShadowEndpointConfig {
  /** Path pattern (exact match or regex) */
  path: string | RegExp;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Python path (if different from Express path) */
  pythonPath?: string;
  /** Whether this endpoint uses SSE streaming */
  isSSE?: boolean;
  /** Paths to ignore in comparison (e.g., timestamps) */
  ignorePaths?: string[];
}

export interface ComparisonResult {
  /** Whether responses match */
  match: boolean;
  /** Request details */
  request: {
    method: string;
    path: string;
    timestamp: string;
  };
  /** Express response details */
  express: {
    statusCode: number;
    latencyMs: number;
    body?: unknown;
    error?: string;
  };
  /** Python response details */
  python: {
    statusCode: number;
    latencyMs: number;
    body?: unknown;
    error?: string;
  };
  /** Detailed differences if not matching */
  differences?: Difference[];
}

export interface Difference {
  path: string;
  expressValue: unknown;
  pythonValue: unknown;
}

// ============================================================================
// Default Configuration
// ============================================================================

const defaultConfig: ShadowTestConfig = {
  enabled: process.env.SHADOW_TEST_ENABLED === 'true',
  sampleRate: parseFloat(process.env.SHADOW_TEST_SAMPLE_RATE || '0.1'),
  pythonServerUrl: process.env.PYTHON_SERVER_URL || 'http://localhost:8001',
  timeout: parseInt(process.env.SHADOW_TEST_TIMEOUT || '30000', 10),
  endpoints: [],
  onComparisonResult: defaultComparisonLogger,
};

// ============================================================================
// Comparison Logger
// ============================================================================

function defaultComparisonLogger(result: ComparisonResult): void {
  const status = result.match ? '✅ MATCH' : '❌ MISMATCH';
  const latencyDiff = result.python.latencyMs - result.express.latencyMs;
  const latencySign = latencyDiff >= 0 ? '+' : '';
  
  console.log(`[Shadow] ${status} ${result.request.method} ${result.request.path}`);
  console.log(`  Express: ${result.express.statusCode} in ${result.express.latencyMs}ms`);
  console.log(`  Python:  ${result.python.statusCode} in ${result.python.latencyMs}ms (${latencySign}${latencyDiff}ms)`);
  
  if (!result.match && result.differences) {
    console.log('  Differences:');
    for (const diff of result.differences.slice(0, 5)) {
      console.log(`    ${diff.path}:`);
      console.log(`      Express: ${JSON.stringify(diff.expressValue)}`);
      console.log(`      Python:  ${JSON.stringify(diff.pythonValue)}`);
    }
    if (result.differences.length > 5) {
      console.log(`    ... and ${result.differences.length - 5} more differences`);
    }
  }
  
  if (result.express.error) {
    console.log(`  Express error: ${result.express.error}`);
  }
  if (result.python.error) {
    console.log(`  Python error: ${result.python.error}`);
  }
}

// ============================================================================
// Response Capture
// ============================================================================

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * Wrap response to capture what's sent to client
 */
function captureResponse(res: Response): Promise<CapturedResponse> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    
    // Capture writes
    res.write = function(chunk: any, ...args: any[]): boolean {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return originalWrite(chunk, ...args);
    };
    
    // Capture end
    res.end = function(chunk?: any, ...args: any[]): Response {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      
      const headers: Record<string, string> = {};
      res.getHeaderNames().forEach(name => {
        const value = res.getHeader(name);
        if (value) headers[name] = String(value);
      });
      
      resolve({
        statusCode: res.statusCode,
        headers,
        body: Buffer.concat(chunks),
      });
      
      return originalEnd(chunk, ...args);
    };
  });
}

// ============================================================================
// Python Request
// ============================================================================

interface PythonResponse {
  statusCode: number;
  body: unknown;
  latencyMs: number;
  error?: string;
}

/**
 * Forward request to Python server
 */
async function forwardToPython(
  config: ShadowTestConfig,
  req: Request,
  pythonPath: string,
): Promise<PythonResponse> {
  const start = Date.now();
  const url = `${config.pythonServerUrl}${pythonPath}`;
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Forward relevant headers
    if (req.headers['x-api-key']) {
      headers['X-API-Key'] = req.headers['x-api-key'] as string;
    }
    
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(config.timeout),
    });
    
    const latencyMs = Date.now() - start;
    
    // Try to parse as JSON
    let body: unknown;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    
    return {
      statusCode: response.status,
      body,
      latencyMs,
    };
  } catch (error) {
    return {
      statusCode: 0,
      body: null,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Comparison Logic
// ============================================================================

/**
 * Deep compare two values, returning differences
 */
function deepCompare(
  expressVal: unknown,
  pythonVal: unknown,
  path: string = '',
  ignorePaths: string[] = [],
): Difference[] {
  const differences: Difference[] = [];
  
  // Check if path should be ignored
  if (ignorePaths.some(p => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`))) {
    return differences;
  }
  
  // Handle null/undefined
  if (expressVal === null || expressVal === undefined) {
    if (pythonVal !== null && pythonVal !== undefined) {
      differences.push({ path: path || 'root', expressValue: expressVal, pythonValue: pythonVal });
    }
    return differences;
  }
  
  if (pythonVal === null || pythonVal === undefined) {
    differences.push({ path: path || 'root', expressValue: expressVal, pythonValue: pythonVal });
    return differences;
  }
  
  // Handle different types
  if (typeof expressVal !== typeof pythonVal) {
    differences.push({ path: path || 'root', expressValue: expressVal, pythonValue: pythonVal });
    return differences;
  }
  
  // Handle arrays
  if (Array.isArray(expressVal)) {
    if (!Array.isArray(pythonVal)) {
      differences.push({ path: path || 'root', expressValue: expressVal, pythonValue: pythonVal });
      return differences;
    }
    
    const maxLen = Math.max(expressVal.length, pythonVal.length);
    for (let i = 0; i < maxLen; i++) {
      differences.push(...deepCompare(
        expressVal[i],
        pythonVal[i],
        `${path}[${i}]`,
        ignorePaths,
      ));
    }
    return differences;
  }
  
  // Handle objects
  if (typeof expressVal === 'object') {
    const expressObj = expressVal as Record<string, unknown>;
    const pythonObj = pythonVal as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(expressObj), ...Object.keys(pythonObj)]);
    
    for (const key of allKeys) {
      differences.push(...deepCompare(
        expressObj[key],
        pythonObj[key],
        path ? `${path}.${key}` : key,
        ignorePaths,
      ));
    }
    return differences;
  }
  
  // Handle primitives
  if (expressVal !== pythonVal) {
    differences.push({ path: path || 'root', expressValue: expressVal, pythonValue: pythonVal });
  }
  
  return differences;
}

/**
 * Compare Express and Python responses
 */
function compareResponses(
  expressRes: CapturedResponse,
  pythonRes: PythonResponse,
  ignorePaths: string[] = [],
): { match: boolean; differences: Difference[] } {
  const differences: Difference[] = [];
  
  // Compare status codes
  if (expressRes.statusCode !== pythonRes.statusCode) {
    differences.push({
      path: 'statusCode',
      expressValue: expressRes.statusCode,
      pythonValue: pythonRes.statusCode,
    });
  }
  
  // Parse Express body
  let expressBody: unknown;
  try {
    const bodyStr = expressRes.body.toString('utf-8');
    expressBody = bodyStr ? JSON.parse(bodyStr) : null;
  } catch {
    expressBody = expressRes.body.toString('utf-8');
  }
  
  // Compare bodies
  differences.push(...deepCompare(expressBody, pythonRes.body, '', ignorePaths));
  
  return {
    match: differences.length === 0,
    differences,
  };
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create shadow testing middleware
 */
export function createShadowTestMiddleware(
  userConfig: Partial<ShadowTestConfig> = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const config: ShadowTestConfig = { ...defaultConfig, ...userConfig };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if shadow testing is enabled
    if (!config.enabled) {
      return next();
    }
    
    // Find matching endpoint config
    const endpointConfig = config.endpoints.find(ep => {
      const methodMatch = ep.method === req.method;
      const pathMatch = ep.path instanceof RegExp
        ? ep.path.test(req.path)
        : ep.path === req.path;
      return methodMatch && pathMatch;
    });
    
    if (!endpointConfig) {
      return next();
    }
    
    // Check sample rate
    if (Math.random() > config.sampleRate) {
      return next();
    }
    
    // Skip SSE endpoints for now (handled separately)
    if (endpointConfig.isSSE) {
      return next();
    }
    
    const requestStart = Date.now();
    const pythonPath = endpointConfig.pythonPath || req.path;
    
    // Capture Express response
    const capturePromise = captureResponse(res);
    
    // Continue with Express processing
    next();
    
    // After Express responds, compare with Python
    capturePromise.then(async (expressRes) => {
      const expressLatency = Date.now() - requestStart;
      
      // Forward to Python
      const pythonRes = await forwardToPython(config, req, pythonPath);
      
      // Compare responses
      const { match, differences } = compareResponses(
        expressRes,
        pythonRes,
        endpointConfig.ignorePaths,
      );
      
      // Build result
      const result: ComparisonResult = {
        match,
        request: {
          method: req.method,
          path: req.path,
          timestamp: new Date().toISOString(),
        },
        express: {
          statusCode: expressRes.statusCode,
          latencyMs: expressLatency,
          body: (() => {
            try {
              return JSON.parse(expressRes.body.toString('utf-8'));
            } catch {
              return expressRes.body.toString('utf-8').slice(0, 200);
            }
          })(),
        },
        python: {
          statusCode: pythonRes.statusCode,
          latencyMs: pythonRes.latencyMs,
          body: pythonRes.body,
          error: pythonRes.error,
        },
        differences: match ? undefined : differences,
      };
      
      // Report result
      config.onComparisonResult?.(result);
    }).catch((error) => {
      console.error('[Shadow] Error during comparison:', error);
    });
  };
}

// ============================================================================
// Metrics Collection
// ============================================================================

export interface ShadowMetrics {
  totalRequests: number;
  matchCount: number;
  mismatchCount: number;
  pythonErrorCount: number;
  avgExpressLatencyMs: number;
  avgPythonLatencyMs: number;
  byEndpoint: Record<string, {
    total: number;
    matches: number;
    mismatches: number;
    errors: number;
  }>;
}

/**
 * Create a metrics collector for shadow test results
 */
export function createMetricsCollector(): {
  record: (result: ComparisonResult) => void;
  getMetrics: () => ShadowMetrics;
  reset: () => void;
} {
  let metrics: ShadowMetrics = {
    totalRequests: 0,
    matchCount: 0,
    mismatchCount: 0,
    pythonErrorCount: 0,
    avgExpressLatencyMs: 0,
    avgPythonLatencyMs: 0,
    byEndpoint: {},
  };
  
  let totalExpressLatency = 0;
  let totalPythonLatency = 0;
  
  return {
    record(result: ComparisonResult) {
      metrics.totalRequests++;
      
      if (result.match) {
        metrics.matchCount++;
      } else {
        metrics.mismatchCount++;
      }
      
      if (result.python.error) {
        metrics.pythonErrorCount++;
      }
      
      totalExpressLatency += result.express.latencyMs;
      totalPythonLatency += result.python.latencyMs;
      metrics.avgExpressLatencyMs = totalExpressLatency / metrics.totalRequests;
      metrics.avgPythonLatencyMs = totalPythonLatency / metrics.totalRequests;
      
      // Track by endpoint
      const endpoint = `${result.request.method} ${result.request.path}`;
      if (!metrics.byEndpoint[endpoint]) {
        metrics.byEndpoint[endpoint] = {
          total: 0,
          matches: 0,
          mismatches: 0,
          errors: 0,
        };
      }
      const ep = metrics.byEndpoint[endpoint];
      ep.total++;
      if (result.match) ep.matches++;
      else ep.mismatches++;
      if (result.python.error) ep.errors++;
    },
    
    getMetrics() {
      return { ...metrics };
    },
    
    reset() {
      metrics = {
        totalRequests: 0,
        matchCount: 0,
        mismatchCount: 0,
        pythonErrorCount: 0,
        avgExpressLatencyMs: 0,
        avgPythonLatencyMs: 0,
        byEndpoint: {},
      };
      totalExpressLatency = 0;
      totalPythonLatency = 0;
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export default createShadowTestMiddleware;
