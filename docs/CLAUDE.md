# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artorize CDN is an AI art protection system that serves "polluted" images to scrapers while maintaining original quality for legitimate viewers. It uses the SAC v1 (Simple Array Container) binary format to transmit reconstruction masks alongside images.

**Core concept**: Images are degraded on the server; two int16 arrays (A and B) containing reconstruction data are transmitted as `.sac` files; client-side JavaScript overlays the mask to reveal the original quality.

## Build Commands

```bash
# Install dependencies
npm install

# Build all TypeScript files
npm run build:all

# Build individual components
npm run build          # Main index.ts only
npm run build:test     # Test suite only
npm run build:embed    # Embed script only

# Run tests
npm run test           # All tests (unit + integration)
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests only
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report

# Local development server
npm run serve          # Start server
npm run serve:dev      # Start with auto-reload (--watch)

# Deployment (builds, tests, then deploys)
npm run deploy:staging
npm run deploy:production
```

## Code Architecture

### Three Main Entry Points

1. **`src/index.ts`** - Production viewer for single images
   - Targets specific `#protected-image` and `#mask-canvas` elements
   - Fetches `.sac` file automatically (image URL + `.sac` extension)
   - Optimized with caching, debouncing, and RAF for performance
   - Single-page integration pattern

2. **`src/test.ts`** - Interactive test/development UI
   - Stacked canvas rendering (polluted image + mask overlay)
   - File upload for testing custom images/SAC files
   - In-browser test data generation (no external files needed)
   - Visualization controls (opacity slider, color modes: white/red/green/blue/rainbow)
   - Used with `test.html`

3. **`src/embed.ts`** - Drop-in embed script for multi-image pages
   - Declarative HTML API: `<div class="artorize-image" data-src="..."></div>`
   - Auto-initialization via DOMContentLoaded
   - Global configuration: `window.ArtorizeConfig`
   - Multiple images per page support
   - Used with `embed.html`

### SAC v1 Binary Format

All three entry points share the SAC parser implementation:

**Header (24 bytes, little-endian)**
- Bytes 0-3: Magic `SAC1`
- Byte 4: Flags (reserved)
- Byte 5: Data type (1 = int16)
- Byte 6: Array count (must be 2)
- Byte 7: Reserved
- Bytes 8-11: Length of array A (uint32)
- Bytes 12-15: Length of array B (uint32)
- Bytes 16-19: Width (uint32, optional)
- Bytes 20-23: Height (uint32, optional)

**Payload**: Raw int16 arrays (A, then B) after header

**Critical**: All parsers validate magic, dtype, array count, and shape. Gracefully degrade if mask fetch fails.

### Key Optimizations in index.ts

The production viewer uses several performance optimizations:

1. **Cached mask data** - `cachedMaskData` avoids recomputation on resize
2. **Pre-computed magnitudes** - Single pass through arrays, avoiding repeated Math.hypot
3. **Batched DOM reads** - Read `offsetWidth`/`offsetHeight` before RAF
4. **RequestAnimationFrame** - Smooth painting for render calls
5. **Debounced resize handler** - 150ms debounce on window resize
6. **Context hints** - `willReadFrequently: false` for canvas context

These patterns should be maintained when modifying the rendering pipeline.

### Mask Visualization

The magnitude of vector (a[i], b[i]) maps to alpha channel:
```typescript
const mag = Math.sqrt(ax * ax + by * by);
const alpha = Math.min(255, mag);
```

White overlay (RGB: 255,255,255) is the standard visualization mode. Test suite adds color modes for debugging.

## Project Structure

```
src/
├── index.ts       # Production single-image viewer
├── test.ts        # Interactive test UI with controls
└── embed.ts       # Multi-image embed script

tests/
├── unit/
│   └── sac-parser.test.ts        # SAC format parsing tests
└── integration/
    └── cdn-delivery.test.ts      # End-to-end delivery tests

server/
└── index.js       # Local Express dev server (serves static files)

examples/
├── index.html     # Single-image example
├── test.html      # Interactive test page
└── embed.html     # Multi-image embed example

docs/
├── CLIENT_INTEGRATION.md         # Client-side integration guide
├── DEPLOYMENT.md                 # Deployment guide
├── LOCAL_TESTING.md              # Local testing guide
├── QUICKSTART.md                 # Quick start guide
└── sac_v_1_cdn_mask_transfer_protocol.md  # Protocol spec

config/
├── ecosystem.config.js           # PM2 configuration
└── nginx.conf                    # Nginx configuration

scripts/
└── generate_test_sac.py          # Generate test SAC files
```

## CDN URL Convention

Images and masks follow a strict naming convention:
- Image: `https://cdn.example.com/i/abc123.jpg`
- Mask: `https://cdn.example.com/i/abc123.jpg.sac`

The `.sac` extension is **appended** to the full image filename (including `.jpg`). This ensures same cache lifetime and easy client-side URL construction.

## Development Workflow

**Local testing with Python-generated test files:**
```bash
# Generate test data (requires numpy)
python scripts/generate_test_sac.py

# Start local server
npm run serve:dev

# Open test page
# Navigate to http://localhost:3000/examples/test.html
```

**Local testing without Python:**
```bash
npm run build:test
# Open test.html in browser
# Click "Load Sample Test Data" button
```

## Testing Notes

- Unit tests focus on SAC parser correctness (header validation, shape matching, error cases)
- Integration tests verify end-to-end delivery (fetch, parse, render)
- Test suite includes test vector validation from protocol spec (2×3 sample)
- Always run full test suite before deployment: `npm run deploy:build`

## File References

- Client integration: `docs/CLIENT_INTEGRATION.md`
- SAC v1 Protocol: `docs/sac_v_1_cdn_mask_transfer_protocol.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Local testing: `docs/LOCAL_TESTING.md`
- Quick start: `docs/QUICKSTART.md`
