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
import aiRoutes from './routes/ai.js';
import imageRoutes from './routes/images.js';
import agenticRoutes from './routes/agentic.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// Middleware
// ============================================================================

// CORS configuration - allow requests from the Vite dev server
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// JSON body parsing with increased limit for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
  res.json({
    name: 'Image Markup AI Server',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'POST /api/ai/generate - Text generation',
      'POST /api/images/generate - Image generation/editing',
      'POST /api/images/inpaint - Two-step inpainting',
      'POST /api/ai/agentic/edit - Agentic edit with SSE streaming',
    ],
  });
});

// ============================================================================
// AI Endpoints
// ============================================================================

/**
 * Mount AI routes under /api/ai
 * 
 * Available endpoints:
 * - POST /api/ai/generate - Text generation (implemented)
 */
app.use('/api/ai', aiRoutes);

/**
 * Mount agentic routes under /api/ai/agentic
 * 
 * Available endpoints:
 * - POST /api/ai/agentic/edit - Agentic edit with SSE streaming (implemented)
 */
app.use('/api/ai/agentic', agenticRoutes);

/**
 * Mount image routes under /api/images
 * 
 * Available endpoints:
 * - POST /api/images/generate - Image generation/editing (implemented)
 * - POST /api/images/inpaint - Two-step inpainting (implemented)
 */
app.use('/api/images', imageRoutes);

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
  console.log(`🌐 CORS origin: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
});

export default app;
