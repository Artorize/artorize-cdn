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
import * as backendClient from './backend-client.js';
import { performSelfUpdate, getVersionInfo, initializeVersionFile } from './self-update.js';

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

// Health check endpoint (includes backend health)
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    env: ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    backend: {
      url: process.env.BACKEND_API_URL || 'http://localhost:3002',
      status: 'unknown',
    },
  };

  // Check backend health
  try {
    const backendHealth = await backendClient.checkBackendHealth();
    health.backend.status = 'ok';
    health.backend.details = backendHealth;
  } catch (error) {
    health.backend.status = 'error';
    health.backend.error = error.message;
  }

  res.json(health);
});

// Version endpoint
app.get('/version', async (req, res) => {
  try {
    const versionInfo = await getVersionInfo();
    res.json(versionInfo);
  } catch (error) {
    res.status(500).json({
      error: 'Unable to get version info',
      message: error.message,
    });
  }
});

// Manual update endpoint (for triggering updates without restart)
app.post('/api/update', async (req, res) => {
  try {
    console.log('Manual update triggered via API');
    const result = await performSelfUpdate({ force: false });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Update failed',
      message: error.message,
    });
  }
});

// Backend API routes for artwork retrieval
// These routes proxy requests to the backend storage service

// Fetch artwork file (original or protected variant)
app.get('/api/artworks/:id', async (req, res, next) => {
  const { id } = req.params;
  const variant = req.query.variant || 'protected'; // Default to protected variant for CDN

  try {
    const { buffer, contentType, size } = await backendClient.fetchArtworkFile(id, variant);

    res.set({
      'Content-Type': contentType,
      'Content-Length': size,
      'Cache-Control': `public, max-age=${currentConfig.cacheMaxAge}, immutable`,
      'X-Content-Type-Options': 'nosniff',
    });

    res.send(buffer);
  } catch (error) {
    console.error(`Error fetching artwork ${id} (variant: ${variant}):`, error.message);

    if (error.message.includes('404')) {
      return res.status(404).json({
        error: 'Artwork not found',
        message: `Artwork ${id} or variant ${variant} not found`,
      });
    }

    next(error);
  }
});

// Fetch artwork mask file (SAC format)
app.get('/api/artworks/:id/mask', async (req, res, next) => {
  const { id } = req.params;

  try {
    const { buffer, contentType, size } = await backendClient.fetchArtworkMask(id);

    res.set({
      'Content-Type': contentType,
      'Content-Length': size,
      'Cache-Control': `public, max-age=${currentConfig.cacheMaxAge}, immutable`,
      'Content-Disposition': `inline; filename="${id}-mask.sac"`,
      'X-Content-Type-Options': 'nosniff',
    });

    res.send(buffer);
  } catch (error) {
    console.error(`Error fetching mask for artwork ${id}:`, error.message);

    if (error.message.includes('404')) {
      return res.status(404).json({
        error: 'Mask not found',
        message: `Mask for artwork ${id} not found`,
      });
    }

    next(error);
  }
});

// Fetch artwork metadata
app.get('/api/artworks/:id/metadata', async (req, res, next) => {
  const { id } = req.params;

  try {
    const metadata = await backendClient.fetchArtworkMetadata(id);

    res.set({
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${Math.min(currentConfig.cacheMaxAge, 3600)}`, // Cache metadata for max 1 hour
    });

    res.json(metadata);
  } catch (error) {
    console.error(`Error fetching metadata for artwork ${id}:`, error.message);

    if (error.message.includes('404')) {
      return res.status(404).json({
        error: 'Artwork not found',
        message: `Artwork ${id} not found`,
      });
    }

    next(error);
  }
});

// Search artworks (with query parameters)
app.get('/api/artworks', async (req, res, next) => {
  try {
    // Forward query parameters to backend
    const artworks = await backendClient.searchArtworks(req.query);

    res.set({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // Cache search results for 5 minutes
    });

    res.json(artworks);
  } catch (error) {
    console.error('Error searching artworks:', error.message);
    next(error);
  }
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

// Perform self-update on startup
async function startServer() {
  console.log('\n=== Artorize CDN Server Starting ===\n');

  // Initialize version file if it doesn't exist
  await initializeVersionFile();

  // Perform self-update (check for updates and pull if available)
  if (process.env.SKIP_AUTO_UPDATE !== 'true') {
    console.log('Checking for updates...');
    const updateResult = await performSelfUpdate({ skipBuild: false });

    if (updateResult.updated) {
      console.log(`✅ Updated to commit ${updateResult.currentCommit.substring(0, 7)}`);
    } else if (updateResult.error) {
      console.warn(`⚠️  Update check failed: ${updateResult.error}`);
      if (updateResult.details) {
        console.warn(`   Details: ${updateResult.details}`);
      }
    } else {
      console.log('✅ Already up to date');
    }
  } else {
    console.log('⏭️  Auto-update skipped (SKIP_AUTO_UPDATE=true)');
  }

  // Start server
  app.listen(PORT, async () => {
    const versionInfo = await getVersionInfo();

    console.log(`\n🚀 Artorize CDN Server`);
    console.log(`   Version: ${versionInfo.version}`);
    console.log(`   Commit: ${versionInfo.gitCommitShort || 'unknown'}`);
    console.log(`   Branch: ${versionInfo.gitBranch || 'unknown'}`);
    console.log(`   Last Update: ${versionInfo.lastUpdate ? new Date(versionInfo.lastUpdate).toLocaleString() : 'never'}`);
    console.log(`   Environment: ${ENV}`);
    console.log(`   Port: ${PORT}`);
    console.log(`   CORS: ${currentConfig.corsOrigin}`);
    console.log(`   Cache Max-Age: ${currentConfig.cacheMaxAge}s`);
    console.log(`   Compression: ${currentConfig.compression ? 'enabled' : 'disabled'}`);
    console.log(`\n   🌐 http://localhost:${PORT}`);
    console.log(`   🏥 http://localhost:${PORT}/health`);
    console.log(`   📦 http://localhost:${PORT}/version\n`);
  });
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
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
