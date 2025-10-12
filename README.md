# Artorize CDN - AI Art Protection System

A CDN delivery system for protecting artwork from AI scrapers using the SAC v1 (Simple Array Container) mask transmission protocol.

## Overview

This system protects artwork by serving a "polluted" version of the image to AI scrapers while maintaining the ability to reconstruct the original quality for legitimate viewers. The protection works by:

1. **Polluted Image**: A degraded version of the artwork stored on the CDN
2. **Mask Data**: Two int16 arrays (A and B) containing the reconstruction information
3. **Client-Side Reconstruction**: JavaScript code that fetches the mask and applies it to reveal the original quality

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
│   └── index.js          # Local Express dev server
└── tests/
    ├── unit/             # Unit tests
    └── integration/      # Integration tests
```

## Quick Start

### 1. Build the Project

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

### 3. Open the Test Page

```bash
# Start the development server
npm run serve

# Open test page in your browser
# Navigate to http://localhost:3000/examples/test.html
```

The test page provides:
- **Sample Data Generator**: Creates procedural test patterns in-browser
- **File Upload**: Test with your own polluted images and `.sac` files
- **Stacked Canvas Rendering**: Shows how the mask overlays the image
- **Interactive Controls**: Adjust opacity and visualization modes

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
```

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

## Documentation

- **[Client Integration Guide](docs/CLIENT_INTEGRATION.md)** - Complete guide for integrating Artorize protection into your website
- **[Quick Start](docs/QUICKSTART.md)** - Get up and running in 5 minutes
- **[Local Testing](docs/LOCAL_TESTING.md)** - Test the system on your local machine
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Deploy to production servers
- **[SAC v1 Protocol Specification](docs/sac_v_1_cdn_mask_transfer_protocol.md)** - Binary format documentation

## Further Reading

- MDN: [TypedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray)
- MDN: [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
