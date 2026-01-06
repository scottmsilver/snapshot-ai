/**
 * Express server for image markup AI operations
 * 
 * This server provides RESTful endpoints for AI-powered image editing,
 * acting as a bridge between the client and Google's Gemini API.
 * 
 * In the future, this Express server may be replaced/proxied by a Python
 * backend using LangGraph for more sophisticated agentic workflows.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import aiRoutes from './routes/ai.js';
import imageRoutes from './routes/images.js';
import agenticRoutes from './routes/agentic.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { 
  generalRateLimiter, 
  aiRateLimiter, 
  agenticRateLimiter, 
  securityHeaders, 
  apiKeyValidator,
  requestSizeCheck,
} from './middleware/security.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// Python proxy config - defined early so we can reference in middleware
// ============================================================================

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'http://localhost:8001';
const ENABLE_PYTHON_PROXY = process.env.ENABLE_PYTHON_PROXY === 'true';

// ============================================================================
// CORS Configuration (applies to all routes including proxy)
// ============================================================================

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [process.env.CLIENT_URL || 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // In development, be more permissive
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));

// Security headers (helmet)
app.use(securityHeaders);

// ============================================================================
// Python Server Proxy (Phase 4)
// IMPORTANT: Must be BEFORE express.json() to preserve raw request body
// ============================================================================

if (ENABLE_PYTHON_PROXY) {
  console.log(`🐍 Python proxy enabled: ${PYTHON_SERVER_URL}`);
  
  /**
   * Proxy /api/python/* to Python server /api/*
   * Express mounted at /api/python strips that prefix, so req.url is just /echo
   * We need to prepend /api to get /api/echo on the Python server
   */
  app.use('/api/python', (req, res, next) => {
    console.log(`🐍 Python proxy intercepted: ${req.method} ${req.url}`);
    next();
  }, createProxyMiddleware({
    target: PYTHON_SERVER_URL,
    changeOrigin: true,
    pathRewrite: (path) => {
      const newPath = `/api${path}`;
      console.log(`🔀 pathRewrite: "${path}" → "${newPath}"`);
      return newPath;
    },
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`🔀 proxyReq: method=${req.method}, url=${req.url}, path=${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req) => {
        console.log(`🔀 proxyRes: ${proxyRes.statusCode} for ${req.url}`);
      },
      error: (err, req, res) => {
        console.error(`❌ Proxy error for ${req.url}:`, err.message);
        if (res && 'writeHead' in res) {
          (res as Response).status(502).json({
            error: 'Python server unavailable',
            details: err.message,
          });
        }
      },
    },
  }));

  /**
   * Proxy /python-health to Python server /health
   */
  app.use('/python-health', createProxyMiddleware({
    target: PYTHON_SERVER_URL,
    changeOrigin: true,
    pathRewrite: () => '/health',
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`🔀 Proxying ${req.method} /python-health → Python /health`);
      },
      error: (err, req, res) => {
        console.error(`❌ Proxy error for ${req.url}:`, err.message);
        if (res && 'writeHead' in res) {
          (res as Response).status(502).json({
            error: 'Python server unavailable',
            details: err.message,
          });
        }
      },
    },
  }));
}

// ============================================================================
// Body parsing middleware (AFTER proxy routes)
// ============================================================================

// JSON body parsing with increased limit for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// General rate limiting for all requests
app.use(generalRateLimiter);

// Optional API key validation (if SERVER_API_KEY is set)
app.use(apiKeyValidator);

// Request size check
app.use(requestSizeCheck);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Root endpoint
 * GET /
 */
app.get('/', (req: Request, res: Response) => {
  const endpoints = [
    'GET /health - Health check',
    'POST /api/ai/generate - Text generation',
    'POST /api/images/generate - Image generation/editing',
    'POST /api/images/inpaint - Two-step inpainting',
    'POST /api/ai/agentic/edit - Agentic edit with SSE streaming',
  ];
  
  if (ENABLE_PYTHON_PROXY) {
    endpoints.push(
      'GET /python-health - Python server health (proxied)',
      'POST /api/python/echo - Echo test (proxied to Python)',
    );
  }
  
  res.json({
    name: 'Image Markup AI Server',
    version: '1.0.0',
    pythonProxy: ENABLE_PYTHON_PROXY ? PYTHON_SERVER_URL : 'disabled',
    endpoints,
  });
})

// ============================================================================
// AI Endpoints
// ============================================================================

/**
 * Mount AI routes under /api/ai
 * Rate limited to 20 requests/minute per IP
 * 
 * Available endpoints:
 * - POST /api/ai/generate - Text generation (implemented)
 */
app.use('/api/ai', aiRateLimiter, aiRoutes);

/**
 * Mount agentic routes under /api/ai/agentic
 * Stricter rate limit: 5 requests/minute per IP (long-running operations)
 * 
 * Available endpoints:
 * - POST /api/ai/agentic/edit - Agentic edit with SSE streaming (implemented)
 */
app.use('/api/ai/agentic', agenticRateLimiter, agenticRoutes);

/**
 * Mount image routes under /api/images
 * Rate limited to 20 requests/minute per IP
 * 
 * Available endpoints:
 * - POST /api/images/generate - Image generation/editing (implemented)
 * - POST /api/images/inpaint - Two-step inpainting (implemented)
 */
app.use('/api/images', aiRateLimiter, imageRoutes);

// ============================================================================
// Error handling
// ============================================================================

/**
 * 404 handler - must come after all routes
 */
app.use(notFoundHandler);

/**
 * Global error handler - must come last
 */
app.use(errorHandler);

// ============================================================================
// Server startup
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Image Markup AI Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? '✓ configured' : '✗ missing'}`);
  console.log(`🔐 API Key Auth: ${process.env.SERVER_API_KEY ? '✓ enabled' : '✗ disabled (open access)'}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
  console.log(`⚡ Rate limits: General=100/min, AI=20/min, Agentic=5/min`);
  console.log(`🐍 Python proxy: ${ENABLE_PYTHON_PROXY ? `✓ enabled (${PYTHON_SERVER_URL})` : '✗ disabled'}`);
});

export default app;
