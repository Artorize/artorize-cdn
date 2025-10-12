# Client-Side Integration Guide

This guide covers all client-side integration patterns for the Artorize CDN protection system. Choose the method that best fits your use case.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Integration Methods](#integration-methods)
   - [Method 1: Embed Script (Recommended)](#method-1-embed-script-recommended)
   - [Method 2: Manual Integration](#method-2-manual-integration)
   - [Method 3: Programmatic API](#method-3-programmatic-api)
3. [Configuration Options](#configuration-options)
4. [Advanced Usage](#advanced-usage)
5. [Browser Compatibility](#browser-compatibility)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

The fastest way to integrate Artorize protection is using the embed script:

```html
<div class="artorize-image" data-src="https://cdn.example.com/artwork.jpg"></div>
<script src="https://cdn.artorize.com/embed.js"></script>
```

That's it! The script automatically:
- Fetches the polluted image
- Downloads the `.sac` mask file
- Renders the protection overlay
- Handles responsive resizing

---

## Integration Methods

### Method 1: Embed Script (Recommended)

**Best for:** Multiple images per page, blogs, galleries, CMSs

The embed script provides a declarative HTML API with automatic initialization.

#### Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
  <title>Protected Gallery</title>
</head>
<body>
  <!-- Single image -->
  <div class="artorize-image" data-src="https://cdn.example.com/art1.jpg"></div>

  <!-- Multiple images -->
  <div class="artorize-image" data-src="https://cdn.example.com/art2.jpg"></div>
  <div class="artorize-image" data-src="https://cdn.example.com/art3.jpg"></div>

  <!-- Load the embed script (once at the end) -->
  <script src="https://cdn.artorize.com/embed.js"></script>
</body>
</html>
```

#### HTML Attributes

| Attribute | Description | Default | Example |
|-----------|-------------|---------|---------|
| `data-src` | **Required.** URL of the polluted image | - | `data-src="/art/pic.jpg"` |
| `data-sac` | Custom SAC mask URL | `{data-src}.sac` | `data-sac="/masks/pic.sac"` |
| `data-opacity` | Mask opacity (0-1) | `1` | `data-opacity="0.8"` |
| `data-alt` | Alt text for the image | `"Protected image"` | `data-alt="My Artwork"` |

#### Global Configuration

Configure all images at once using `window.ArtorizeConfig`:

```html
<script>
  // Set before loading embed.js
  window.ArtorizeConfig = {
    baseCDN: 'https://cdn.example.com',  // Prepend to all URLs
    opacity: 0.9,                         // Global opacity
    autoInit: true                        // Auto-initialize on load
  };
</script>
<script src="https://cdn.artorize.com/embed.js"></script>
```

#### Manual Initialization

Disable auto-init and control when images load:

```html
<script>
  window.ArtorizeConfig = { autoInit: false };
</script>
<script src="https://cdn.artorize.com/embed.js"></script>

<script>
  // Initialize when ready
  window.Artorize.init();
</script>
```

#### Example: Gallery with Custom Masks

```html
<div class="gallery">
  <div class="artorize-image"
       data-src="/images/portrait.jpg"
       data-sac="/masks/portrait-heavy.sac"
       data-alt="Portrait"
       data-opacity="0.95">
  </div>

  <div class="artorize-image"
       data-src="/images/landscape.jpg"
       data-sac="/masks/landscape-light.sac"
       data-alt="Landscape"
       data-opacity="0.7">
  </div>
</div>

<script src="https://cdn.artorize.com/embed.js"></script>
```

---

### Method 2: Manual Integration

**Best for:** Single-page apps, custom layouts, full control

Use this method when you need precise control over DOM structure and rendering.

#### HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>Protected Image</title>
  <style>
    .viewer {
      position: relative;
      display: inline-block;
    }

    #protected-image {
      display: block;
      max-width: 100%;
      height: auto;
    }

    #mask-canvas {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 1;
    }
  </style>
</head>
<body>
  <div class="viewer">
    <img id="protected-image" src="https://cdn.example.com/artwork.jpg" alt="Protected artwork">
    <canvas id="mask-canvas"></canvas>
  </div>

  <script src="dist/index.js"></script>
</body>
</html>
```

#### Key Requirements

1. **Wrapper container** with `position: relative`
2. **Image element** with a unique ID (e.g., `#protected-image`)
3. **Canvas element** with `position: absolute` and `pointer-events: none`
4. Canvas must have `z-index` higher than the image

#### CSS Best Practices

```css
.viewer {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

#protected-image {
  display: block;
  width: 100%;
  height: auto;
}

#mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
```

---

### Method 3: Programmatic API

**Best for:** React/Vue/Angular apps, dynamic content, custom workflows

Import the TypeScript module directly for maximum flexibility.

#### Installation

```bash
npm install @artorize/cdn-client
```

#### Basic API Usage

```typescript
import { fetchSAC, parseSAC, loadMaskAndRender } from '@artorize/cdn-client';

// Example 1: Fetch and parse a SAC file
const sacData = await fetchSAC('https://cdn.example.com/mask.sac');
console.log(sacData.width, sacData.height); // 1920, 1080
console.log(sacData.a.length); // Width × Height (int16 array)

// Example 2: Render mask to canvas
const img = document.querySelector('#my-image');
const canvas = document.querySelector('#my-canvas');
await loadMaskAndRender(img, 'mask.sac', canvas);

// Example 3: Parse from ArrayBuffer
const response = await fetch('/masks/artwork.sac');
const buffer = await response.arrayBuffer();
const sacData = parseSAC(buffer);
```

#### React Component Example

```tsx
import React, { useEffect, useRef } from 'react';
import { loadMaskAndRender } from '@artorize/cdn-client';

interface ProtectedImageProps {
  src: string;
  sacUrl?: string;
  alt?: string;
}

export const ProtectedImage: React.FC<ProtectedImageProps> = ({ src, sacUrl, alt }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;

    if (!img || !canvas) return;

    const maskUrl = sacUrl || `${src}.sac`;

    const loadMask = async () => {
      try {
        await loadMaskAndRender(img, maskUrl, canvas);
      } catch (error) {
        console.error('Failed to load mask:', error);
      }
    };

    if (img.complete) {
      loadMask();
    } else {
      img.addEventListener('load', loadMask);
      return () => img.removeEventListener('load', loadMask);
    }
  }, [src, sacUrl]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img ref={imgRef} src={src} alt={alt} style={{ display: 'block' }} />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 1
        }}
      />
    </div>
  );
};
```

#### Vue Component Example

```vue
<template>
  <div class="protected-image">
    <img ref="image" :src="src" :alt="alt" @load="loadMask" />
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { loadMaskAndRender } from '@artorize/cdn-client';

interface Props {
  src: string;
  sacUrl?: string;
  alt?: string;
}

const props = defineProps<Props>();
const image = ref<HTMLImageElement>();
const canvas = ref<HTMLCanvasElement>();

const loadMask = async () => {
  if (!image.value || !canvas.value) return;

  const maskUrl = props.sacUrl || `${props.src}.sac`;

  try {
    await loadMaskAndRender(image.value, maskUrl, canvas.value);
  } catch (error) {
    console.error('Failed to load mask:', error);
  }
};

onMounted(() => {
  if (image.value?.complete) {
    loadMask();
  }
});
</script>

<style scoped>
.protected-image {
  position: relative;
  display: inline-block;
}

img {
  display: block;
  max-width: 100%;
}

canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}
</style>
```

---

## Configuration Options

### CDN URL Convention

Images and masks follow a strict naming pattern:

```
Image: https://cdn.example.com/i/abc123.jpg
Mask:  https://cdn.example.com/i/abc123.jpg.sac
```

The `.sac` extension is **appended** to the full image filename. This ensures:
- Same cache lifetime and invalidation
- Easy client-side URL construction
- Predictable CDN routing

### CORS Requirements

SAC files must be served with appropriate CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
```

For nginx:

```nginx
location ~* \.(sac)$ {
  add_header Access-Control-Allow-Origin *;
  add_header Access-Control-Allow-Methods GET;
}
```

### Cache Headers

Recommended cache configuration for SAC files:

```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/octet-stream
Content-Encoding: br
```

The `immutable` directive tells browsers the file will never change (content-addressable URLs recommended).

---

## Advanced Usage

### Responsive Images

Handle responsive image resizing automatically:

```typescript
// The library handles resize events internally
// Canvas automatically scales to match image display size

window.addEventListener('resize', () => {
  // Mask re-renders automatically via debounced handler
});
```

### Custom Mask Visualization

Modify mask rendering for debugging or custom effects:

```typescript
// Override default white overlay with custom colors
function createCustomMaskImageData(a: Int16Array, b: Int16Array, W: number, H: number): ImageData {
  const size = W * H;
  const data = new Uint8ClampedArray(size * 4);

  for (let i = 0; i < size; i++) {
    const ax = a[i];
    const by = b[i];
    const mag = Math.min(255, Math.sqrt(ax * ax + by * by));

    const j = i * 4;
    // Custom rainbow visualization
    const hue = (mag / 255) * 360;
    const [r, g, b] = hslToRgb(hue, 1, 0.5);

    data[j + 0] = r;
    data[j + 1] = g;
    data[j + 2] = b;
    data[j + 3] = mag;
  }

  return new ImageData(data, W, H);
}
```

### Error Handling

Always handle mask loading failures gracefully:

```typescript
try {
  await loadMaskAndRender(img, maskUrl, canvas);
} catch (error) {
  console.warn('Mask failed to load, showing image only:', error);
  // Fallback: Hide canvas, show image only
  canvas.style.display = 'none';
}
```

### Performance Optimization

The library includes several built-in optimizations:

1. **Cached mask data** - Avoids recomputation on resize
2. **Pre-computed magnitudes** - Single pass through arrays
3. **RequestAnimationFrame** - Smooth rendering
4. **Debounced resize** - 150ms debounce on window resize
5. **Optimized context** - `willReadFrequently: false` hint

To maintain performance:
- Use content-addressable URLs for long-term caching
- Enable Brotli/Gzip compression for `.sac` files
- Leverage HTTP/2 multiplexing for parallel image + mask fetch
- Avoid unnecessary re-renders (resize handlers are already optimized)

---

## Browser Compatibility

### Minimum Requirements

| Feature | Minimum Version |
|---------|----------------|
| Chrome | 45+ |
| Firefox | 52+ |
| Safari | 10.1+ |
| Edge | 12+ |
| iOS Safari | 10.3+ |
| Android Chrome | 45+ |

### Required APIs

- `fetch()` - Network requests
- `ArrayBuffer` and `DataView` - Binary parsing
- `Int16Array` - Typed array views
- `Canvas 2D` - Mask rendering
- `Uint8ClampedArray` - Image data manipulation

### Polyfills

If you need to support older browsers:

```html
<script src="https://cdn.polyfill.io/v3/polyfill.min.js?features=fetch,TypedArray"></script>
<script src="https://cdn.artorize.com/embed.js"></script>
```

---

## Troubleshooting

### Mask not appearing

**Check:**
1. Canvas has `position: absolute` and `z-index > 0`
2. Image URL ends with `.jpg` or `.png`
3. SAC file exists at `{imageUrl}.sac`
4. CORS headers are set correctly
5. Browser console shows no fetch errors

**Debug:**
```javascript
window.Artorize.config.debug = true; // Enable verbose logging
```

### Image loads but mask doesn't

**Possible causes:**
1. SAC file has incorrect header format
2. Shape mismatch (mask dimensions ≠ image dimensions)
3. Network error (404, CORS, etc.)

**Validate SAC file:**
```bash
# Check file header (should start with "SAC1")
head -c 4 mask.sac | od -c
```

### Performance issues

**Optimize:**
1. Use Brotli compression for `.sac` files (50-70% smaller)
2. Enable HTTP/2 on your CDN
3. Use content-addressed URLs for aggressive caching
4. Reduce image dimensions (mask computation is O(n))

### CORS errors

**Fix:**
Add CORS headers to your CDN:

```nginx
location / {
  add_header Access-Control-Allow-Origin *;
}
```

Or use a CDN that supports CORS (Cloudflare, AWS CloudFront, etc.).

### TypeScript errors

**Ensure types are installed:**
```bash
npm install --save-dev @types/node
```

---

## Examples

### Example 1: Simple Blog Post

```html
<article>
  <h1>My Artwork</h1>
  <div class="artorize-image" data-src="/images/artwork.jpg" data-alt="My Artwork"></div>
  <p>This is my latest creation...</p>
</article>

<script src="https://cdn.artorize.com/embed.js"></script>
```

### Example 2: E-commerce Product Gallery

```html
<div class="product-gallery">
  <div class="artorize-image" data-src="/products/print-001.jpg" data-opacity="0.9"></div>
  <div class="artorize-image" data-src="/products/print-002.jpg" data-opacity="0.9"></div>
  <div class="artorize-image" data-src="/products/print-003.jpg" data-opacity="0.9"></div>
</div>

<script>
  window.ArtorizeConfig = {
    baseCDN: 'https://cdn.mystore.com',
    opacity: 0.9
  };
</script>
<script src="https://cdn.artorize.com/embed.js"></script>
```

### Example 3: Dynamic Content (React)

```tsx
import { ProtectedImage } from './ProtectedImage';

export const Portfolio = () => {
  const artworks = [
    { id: 1, url: '/art/sunset.jpg' },
    { id: 2, url: '/art/portrait.jpg' },
    { id: 3, url: '/art/abstract.jpg' }
  ];

  return (
    <div className="portfolio">
      {artworks.map(art => (
        <ProtectedImage
          key={art.id}
          src={art.url}
          alt={`Artwork ${art.id}`}
        />
      ))}
    </div>
  );
};
```

---

## Next Steps

- **Local Testing:** See [LOCAL_TESTING.md](LOCAL_TESTING.md)
- **CDN Deployment:** See [DEPLOYMENT.md](DEPLOYMENT.md)
- **SAC Protocol Spec:** See [sac_v_1_cdn_mask_transfer_protocol.md](sac_v_1_cdn_mask_transfer_protocol.md)
- **Quick Start Guide:** See [QUICKSTART.md](QUICKSTART.md)

---

## Support

For issues or questions:
- Check the [GitHub Issues](https://github.com/artorize/cdn/issues)
- Review [SAC Protocol Specification](sac_v_1_cdn_mask_transfer_protocol.md)
- Contact: support@artorize.com
