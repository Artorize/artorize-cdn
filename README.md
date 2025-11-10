# Artorize CDN - AI Art Protection System

A CDN delivery system for protecting artwork from AI scrapers using the SAC v1.1 (Simple Array Container) mask transmission protocol.

## Overview

This system protects artwork by serving a "polluted" version of the image to AI scrapers while maintaining the ability to reconstruct the original quality for legitimate viewers. The protection works by:

1. **Backend Storage**: Secure MongoDB GridFS storage for originals, protected images, and masks
2. **CDN Proxy**: High-performance caching layer that proxies requests to the backend
3. **Polluted Image**: A degraded version of the artwork served to clients
4. **Mask Data**: Grayscale mask in SAC v1.1 format containing reconstruction information
5. **Client-Side Reconstruction**: JavaScript code that fetches the mask and applies it to reveal the original quality

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  CDN Server  │────▶│ Backend API     │
│  Browser    │◀────│  (Port 3000) │◀────│ (Port 3002)     │
└─────────────┘     └──────────────┘     └─────────────────┘
                           ↓                      ↓
                    (Caches files)        (MongoDB GridFS)
```

**Features**:
- **Backend Integration**: Fetches artwork from secure backend storage
- **Caching**: Aggressive caching with immutable headers for optimal performance
- **SAC v1.1 Protocol**: 50% smaller mask files with single-array grayscale mode
- **Backward Compatible**: Still supports filesystem-based test data

## Project Structure

```
artorize-cdn/
├── src/
│   ├── index.ts          # Main SAC parser and mask renderer
│   ├── test.ts           # Interactive test suite
│   └── embed.ts          # Multi-image embed script
├── examples/
│   ├── index.html        # Single-image example
│   ├── test.html         # Test page with controls
│   └── embed.html        # Multi-image embed example
├── docs/
│   ├── CLIENT_INTEGRATION.md         # Client-side integration guide
│   ├── DEPLOYMENT.md                 # Deployment guide
│   ├── LOCAL_TESTING.md              # Local testing guide
│   ├── QUICKSTART.md                 # Quick start guide
│   ├── CLAUDE.md                     # Project guidance for Claude Code
│   └── sac_v_1_cdn_mask_transfer_protocol.md  # Protocol spec
├── config/
│   ├── ecosystem.config.js           # PM2 configuration
│   └── nginx.conf                    # Nginx configuration
├── scripts/
│   └── generate_test_sac.py          # Python script to create test SAC files
├── server/
│   ├── index.js          # CDN server (proxies to backend)
│   └── backend-client.js # Backend API client
└── tests/
    ├── unit/             # Unit tests
    └── integration/      # Integration tests
```

## Quick Start

### 1. Configure Backend Connection

Create a `.env` file with your backend URL:

```bash
cp .env.example .env
# Edit .env and set:
# BACKEND_API_URL=http://localhost:3002
```

**Default**: `http://localhost:3002`

### 2. Build the Project

```bash
npm install
npm run build:all
```

This compiles both the main code and the test suite.

### 2. Run the Test Suite

**Option A: Generate test files with Python**

```bash
# Install dependencies (numpy and optionally Pillow)
pip install numpy pillow

# Generate test data
python scripts/generate_test_sac.py
```

This creates `test_data/` with:
- `test_image.png` - A gradient test image (400x300)
- `test_mask_radial.sac` - Radial gradient mask
- `test_mask_checkerboard.sac` - Checkerboard pattern mask
- `test_mask_gradient.sac` - Horizontal/vertical gradient mask

**Option B: Use built-in sample generator**

Simply open `examples/test.html` and click "Load Sample Test Data" - no external files needed!

### 3. Start the CDN Server

```bash
# Start the CDN server (proxies to backend)
npm run serve

# Server runs on http://localhost:3000
# Backend should be running on http://localhost:3002
```

### 4. Test the Integration

**Option A: Test with backend artwork**
```bash
# Fetch artwork via CDN
curl http://localhost:3000/api/artworks/{ARTWORK_ID}

# Fetch mask via CDN
curl http://localhost:3000/api/artworks/{ARTWORK_ID}/mask
```

**Option B: Test with local files**
```bash
# Navigate to http://localhost:3000/examples/test.html
# Use built-in sample data generator (no backend required)
```

The test page provides:
- **Sample Data Generator**: Creates procedural test patterns in-browser
- **File Upload**: Test with your own polluted images and `.sac` files
- **Stacked Canvas Rendering**: Shows how the mask overlays the image
- **Interactive Controls**: Adjust opacity and visualization modes

## Production Deployment (Linux/Ubuntu)

### One-Line Deployment

Deploy the CDN server with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/Artorize/artorize-cdn/main/scripts/deploy.sh | sudo bash
```

This automated deployment script will:
- ✅ Install Node.js 20+ if not present
- ✅ Create dedicated service user (`artorize`)
- ✅ Clone/update repository to `/opt/artorize-cdn`
- ✅ Install dependencies and build the project
- ✅ **Register as systemd service** with automatic restart
- ✅ **Configure comprehensive logging** (access + error logs)
- ✅ Set up log rotation (14 days retention)
- ✅ Apply security hardening (restricted permissions, isolated temp)

### System Service Management

**IMPORTANT**: The CDN **must be registered as a systemd service** for production use. The deployment script handles this automatically.

After deployment, manage the service with:

```bash
# Start/stop/restart service
sudo systemctl start artorize-cdn
sudo systemctl stop artorize-cdn
sudo systemctl restart artorize-cdn

# Check service status
sudo systemctl status artorize-cdn

# Enable/disable auto-start on boot
sudo systemctl enable artorize-cdn
sudo systemctl disable artorize-cdn
```

### Logging Setup

The service is configured with **proper logging** at multiple levels:

**1. Systemd Journal Logs** (all service output):
```bash
# Follow live logs
sudo journalctl -u artorize-cdn -f

# View recent logs
sudo journalctl -u artorize-cdn -n 100

# Filter by priority (errors only)
sudo journalctl -u artorize-cdn -p err
```

**2. Application-Specific Logs**:
```bash
# Access log (HTTP requests)
tail -f /var/log/artorize-cdn/access.log

# Error log (application errors)
tail -f /var/log/artorize-cdn/error.log
```

**3. Log Rotation**: Logs are automatically rotated daily with 14-day retention

### Configuration

Edit the configuration file and restart:

```bash
# Edit configuration
sudo nano /opt/artorize-cdn/.env

# Restart to apply changes
sudo systemctl restart artorize-cdn
```

**Required Settings**:
```bash
NODE_ENV=production
PORT=3000
BACKEND_API_URL=http://your-backend-server:3002  # CHANGE THIS
CORS_ORIGIN=*
SKIP_AUTO_UPDATE=false
```

### Health Monitoring

```bash
# Quick health check
curl http://localhost:3000/health

# Version information
curl http://localhost:3000/version

# Full service status
sudo systemctl status artorize-cdn
```

### Troubleshooting

**Service won't start?**
```bash
# Check detailed error logs
sudo journalctl -u artorize-cdn -n 50 --no-pager

# Verify configuration
cat /opt/artorize-cdn/.env

# Test manually (as service user)
sudo -u artorize bash
cd /opt/artorize-cdn
node server/index.js
```

**Port already in use?**
```bash
# Find process using port 3000
sudo lsof -i :3000

# Change port in config
sudo nano /opt/artorize-cdn/.env  # Set PORT=3001
sudo systemctl restart artorize-cdn
```

### Manual Installation

If you prefer manual setup, see the [systemd service template](config/artorize-cdn.service) and follow the [deployment guide](docs/DEPLOYMENT.md).

## SAC v1 Protocol

The Simple Array Container (SAC v1) is a minimal binary format for transmitting mask data:

### File Format

```
[24-byte header] + [Array A payload] + [Array B payload]

Header layout (little-endian):
- Bytes 0-3:   Magic "SAC1"
- Byte 4:      Flags (reserved)
- Byte 5:      Data type (1 = int16)
- Byte 6:      Array count (must be 2)
- Byte 7:      Reserved
- Bytes 8-11:  Length of array A (uint32)
- Bytes 12-15: Length of array B (uint32)
- Bytes 16-19: Width (uint32, optional)
- Bytes 20-23: Height (uint32, optional)
```

See [sac_v_1_cdn_mask_transfer_protocol.md](docs/sac_v_1_cdn_mask_transfer_protocol.md) for complete specification.

## Usage Examples

For complete client-side integration documentation, see [docs/CLIENT_INTEGRATION.md](docs/CLIENT_INTEGRATION.md).

### Client-Side Integration

```html
<div class="image-container">
  <img id="protected-image" src="https://cdn.example.com/art/12345.jpg">
  <canvas id="mask-canvas"></canvas>
</div>

<script src="dist/index.js"></script>
```

The code automatically:
1. Detects the image element
2. Fetches `https://cdn.example.com/art/12345.jpg.sac`
3. Parses the mask data
4. Renders it on the canvas overlay

### Programmatic Usage

```typescript
import { fetchSAC, parseSAC, loadMaskAndRender } from './index';

// Fetch and parse
const sacData = await fetchSAC('https://cdn.example.com/mask.sac');
console.log(sacData.width, sacData.height); // 1920 1080

// Render on canvas
const img = document.querySelector('#my-image');
const canvas = document.querySelector('#my-canvas');
await loadMaskAndRender(img, 'mask.sac', canvas);
```

## Creating SAC Files (Server-Side)

Use the Python implementation from the protocol spec:

```python
import numpy as np
from sac_builder import build_sac  # See protocol spec

# Your mask computation
mask_a = compute_mask_component_a(image)  # int16 array
mask_b = compute_mask_component_b(image)  # int16 array

# Build SAC file
sac_bytes = build_sac(
    mask_a.ravel(),
    mask_b.ravel(),
    width=image.width,
    height=image.height
)

# Upload to CDN
upload_to_cdn(f'{image_id}.jpg.sac', sac_bytes)
```

## Test Page Features

The `examples/test.html` page includes:

### Visualization Modes
- **White Overlay**: Standard white mask with alpha
- **Red/Green/Blue Heatmap**: Single-channel visualization
- **Rainbow**: Magnitude-based color mapping

### Controls
- **Opacity Slider**: Adjust mask transparency (0-100%)
- **Color Mode**: Switch between visualization modes
- **File Upload**: Test custom images and SAC files

### Stacked Canvas Architecture

The test uses CSS absolute positioning to stack two canvases:

```css
.canvas-stack {
  position: relative;
}

#polluted-canvas {
  position: relative;
}

#mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
```

This ensures:
- Pixel-perfect alignment of mask over image
- Independent rendering of each layer
- Flexible blend modes and opacity control

## CDN Deployment

### Recommended CDN Configuration

```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/octet-stream (for .sac files)
Content-Encoding: br (Brotli compression)
Access-Control-Allow-Origin: * (if needed for CORS)
```

### URL Convention

```
Image:     https://cdn.example.com/i/abc123def.jpg
Mask:      https://cdn.example.com/i/abc123def.jpg.sac
```

The `.sac` extension appended to the image filename ensures:
- Same cache lifetime and invalidation
- Easy association between image and mask
- Simple client-side URL construction

## Development Commands

```bash
# Build main code only
npm run build

# Build test suite only
npm run build:test

# Build everything
npm run build:all

# Run test (builds and shows instructions)
npm test

# Check version and last update time
npm run version

# Manually trigger update
npm run update
```

## Self-Update System

The CDN server includes automatic self-update functionality that runs on each launch:

### Features

- **Automatic Updates**: Checks for new commits and pulls changes on server startup
- **Version Tracking**: Records last update time, current commit, and branch information
- **Version Command**: Display current version and git information
- **Manual Updates**: Trigger updates via CLI or API endpoint

### Version Command

Check the current version, commit, and last update time:

```bash
npm run version
```

Output:
```
=== Artorize CDN Version Info ===

  Name: artorize-cdn
  Version: 1.0.0
  Git Commit: cb3eee3dc6e9d2567f080f5de87d3dc00fd3185a
  Git Commit (short): cb3eee3
  Git Branch: main
  Last Update: 11/9/2025, 10:30:45 AM (2 hours ago)
```

### API Endpoints

The server provides version and update endpoints:

```bash
# Get version information
curl http://localhost:3000/version

# Trigger manual update (POST request)
curl -X POST http://localhost:3000/api/update
```

### Disabling Auto-Update

To disable automatic updates on server startup:

```bash
SKIP_AUTO_UPDATE=true npm run serve
```

Or add to your `.env` file:
```bash
SKIP_AUTO_UPDATE=true
```

### How It Works

1. **On Server Start**: Checks git for new commits
2. **If Updates Found**: Pulls latest changes and rebuilds
3. **Update Version File**: Records timestamp and commit hash in `version.json`
4. **Continue Startup**: Server starts normally with updated code

The self-update system uses git operations and will:
- Fetch from remote repository
- Compare local and remote commits
- Pull updates if available
- Rebuild TypeScript files
- Update version tracking file

## Browser Compatibility

- All modern browsers (Chrome, Firefox, Safari, Edge)
- Requires support for:
  - `fetch()` API
  - `ArrayBuffer` and `DataView`
  - `Int16Array` typed arrays
  - Canvas 2D rendering context

## Performance Notes

- **Binary format**: 50-70% smaller than JSON Base64
- **Zero parsing overhead**: Direct typed array views
- **CDN cacheable**: Immutable files with long cache lifetimes
- **HTTP/2 multiplexing**: Image and mask fetch in parallel

## Security Considerations

- SAC files are **read-only data** - no executable code
- Always validate header magic and dimensions
- Gracefully degrade if mask fetch fails
- Consider SRI (Subresource Integrity) for critical deployments

## License

Private project for Artorize AI art protection system.

## API Endpoints

The CDN provides these endpoints that proxy to the backend:

- `GET /api/artworks/:id` - Fetch artwork file (protected/original variant)
- `GET /api/artworks/:id/mask` - Fetch mask file (SAC v1.1 format)
- `GET /api/artworks/:id/metadata` - Fetch artwork metadata
- `GET /api/artworks` - Search artworks with query parameters
- `GET /health` - Health check (includes backend status)

See [Backend API Documentation](docs/BACKEND_API.md) for complete reference.

## Documentation

- **[Backend API Reference](docs/BACKEND_API.md)** - Complete backend integration and API documentation
- **[Client Integration Guide](docs/CLIENT_INTEGRATION.md)** - Complete guide for integrating Artorize protection into your website
- **[Quick Start](docs/QUICKSTART.md)** - Get up and running in 5 minutes
- **[Local Testing](docs/LOCAL_TESTING.md)** - Test the system on your local machine
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Deploy to production servers
- **[SAC v1.1 Protocol Specification](docs/poison-mask-grayscale-protocol.md)** - Binary format documentation

## Further Reading

- MDN: [TypedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray)
- MDN: [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
