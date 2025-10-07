/**
 * Artorize CDN Server
 * Serves protected images and SAC mask files with proper caching and CORS
 */

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';

// Configuration
const config = {
  development: {
    corsOrigin: '*',
    cacheMaxAge: 3600, // 1 hour for dev
    compression: true,
  },
  staging: {
    corsOrigin: '*',
    cacheMaxAge: 86400, // 24 hours
    compression: true,
  },
  production: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    cacheMaxAge: 31536000, // 1 year
    compression: true,
  },
};

const currentConfig = config[ENV];

// Middleware
app.use(cors({
  origin: currentConfig.corsOrigin,
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Range'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'Content-Type'],
}));

// Compression middleware (Brotli/Gzip)
app.use(compression({
  threshold: 1024, // Only compress files > 1KB
  filter: (req, res) => {
    // Always compress SAC files
    if (req.url.endsWith('.sac')) return true;
    return compression.filter(req, res);
  },
}));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '..'), {
  maxAge: ENV === 'production' ? currentConfig.cacheMaxAge * 1000 : 0,
  etag: true,
  lastModified: true,
}));

// SAC file handler with special headers
app.get('*.sac', (req, res, next) => {
  const filePath = path.join(__dirname, '..', req.path);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return next(); // Pass to 404 handler
  }

  // Set SAC-specific headers
  res.set({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': `public, max-age=${currentConfig.cacheMaxAge}, immutable`,
    'X-Content-Type-Options': 'nosniff',
  });

  res.sendFile(filePath);
});

// Image file handler with caching
app.get(/\.(jpg|jpeg|png|webp|gif)$/i, (req, res, next) => {
  const filePath = path.join(__dirname, '..', req.path);

  if (!fs.existsSync(filePath)) {
    return next();
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  res.set({
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': `public, max-age=${currentConfig.cacheMaxAge}, immutable`,
  });

  res.sendFile(filePath);
});

// API endpoint to list available test images
app.get('/api/images', (req, res) => {
  const testDataDir = path.join(__dirname, '..', 'test_data');

  if (!fs.existsSync(testDataDir)) {
    return res.json({ images: [] });
  }

  const files = fs.readdirSync(testDataDir);
  const images = files
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map((filename) => ({
      filename,
      url: `/test_data/${filename}`,
      sacUrl: `/test_data/${filename}.sac`,
      hasSac: fs.existsSync(path.join(testDataDir, `${filename}.sac`)),
    }));

  res.json({ images });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The requested resource ${req.url} was not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Artorize CDN Server`);
  console.log(`   Environment: ${ENV}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   CORS: ${currentConfig.corsOrigin}`);
  console.log(`   Cache Max-Age: ${currentConfig.cacheMaxAge}s`);
  console.log(`   Compression: ${currentConfig.compression ? 'enabled' : 'disabled'}`);
  console.log(`\n   🌐 http://localhost:${PORT}`);
  console.log(`   🏥 http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});
