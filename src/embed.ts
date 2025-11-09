/**
 * Artorize Embed Script
 * One-line embed solution for protected images with SAC mask overlays
 *
 * Usage:
 * <div class="artorize-image" data-src="https://cdn.artorize.com/image.jpg"></div>
 * <script src="https://cdn.artorize.com/embed.js"></script>
 */

interface SACData {
  a: Int16Array;
  b: Int16Array;
  width: number;
  height: number;
  flags: number;
}

interface ArtorizeConfig {
  baseCDN?: string;
  opacity?: number;
  autoInit?: boolean;
}

/**
 * Global configuration
 */
const config: ArtorizeConfig = {
  baseCDN: '',
  opacity: 1,
  autoInit: true,
};

/**
 * Parse SAC v1/v1.1 binary format
 *
 * SAC v1.1 adds FLAG_SINGLE_ARRAY (0x01) for grayscale masks:
 * - When set, only array A is stored in payload (50% smaller files)
 * - Array B is duplicated from A during parsing
 * - Grayscale diff is broadcast to all RGB channels during reconstruction
 */
function parseSAC(buffer: ArrayBuffer): SACData {
  const dv = new DataView(buffer);

  const m0 = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m0 !== 'SAC1') throw new Error('Invalid SAC file');

  const flags = dv.getUint8(4);
  const dtype = dv.getUint8(5);
  const arraysCount = dv.getUint8(6);

  if (dtype !== 1) throw new Error('Unsupported data type');

  const lengthA = dv.getUint32(8, true);
  const lengthB = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const height = dv.getUint32(20, true);

  // SAC v1.1: FLAG_SINGLE_ARRAY (bit 0) indicates B = A (grayscale mask)
  const FLAG_SINGLE_ARRAY = 0x01;
  const isSingleArray = (flags & FLAG_SINGLE_ARRAY) !== 0;

  // Calculate offsets and validate file size
  const offA = 24;
  let a: Int16Array;
  let b: Int16Array;

  if (isSingleArray) {
    // v1.1 single-array mode: only A is stored, B is duplicated from A
    if (arraysCount !== 1) throw new Error('arraysCount must be 1 for SINGLE_ARRAY mode');
    const expectedSize = 24 + lengthA * 2;
    if (buffer.byteLength !== expectedSize) throw new Error('Length mismatch');

    // Create array A and duplicate as B (zero-copy reference)
    a = new Int16Array(buffer, offA, lengthA);
    b = a; // B references same data as A (50% memory savings)
  } else {
    // v1.0 dual-array mode: both A and B are stored
    if (arraysCount !== 2) throw new Error('arraysCount must be 2 for dual-array mode');
    const offB = offA + lengthA * 2;
    const expectedSize = offB + lengthB * 2;
    if (buffer.byteLength !== expectedSize) throw new Error('Length mismatch');

    a = new Int16Array(buffer, offA, lengthA);
    b = new Int16Array(buffer, offB, lengthB);
  }

  // Validate shape if provided
  if (width && height) {
    if (lengthA !== width * height) throw new Error('Shape mismatch for array A');
    if (!isSingleArray && lengthB !== width * height) throw new Error('Shape mismatch for array B');
  }

  return { a, b, width, height, flags };
}

/**
 * Fetch SAC file from URL
 */
async function fetchSAC(url: string): Promise<SACData> {
  const resp = await fetch(url, { mode: 'cors' });
  if (!resp.ok) throw new Error(`SAC fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return parseSAC(buf);
}

/**
 * Downsample array data using nearest-neighbor for performance
 * Used when display size is significantly smaller than mask resolution
 */
function downsampleArray(
  src: Int16Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Int16Array {
  const dst = new Int16Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      dst[y * dstW + x] = src[srcY * srcW + srcX];
    }
  }

  return dst;
}

/**
 * Calculate optimal render resolution based on display size
 * Returns dimensions that balance quality and performance
 */
function calculateOptimalResolution(
  maskW: number,
  maskH: number,
  displayW: number,
  displayH: number
): { width: number; height: number; shouldDownsample: boolean } {
  // Use device pixel ratio for high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.ceil(displayW * dpr);
  const targetH = Math.ceil(displayH * dpr);

  // Calculate downscale ratio
  const ratioW = maskW / targetW;
  const ratioH = maskH / targetH;
  const maxRatio = Math.max(ratioW, ratioH);

  // Only downsample if mask is significantly larger (>2x)
  // This saves memory and CPU while maintaining visual quality
  if (maxRatio > 2) {
    // Downsample to target resolution, maintaining aspect ratio
    const scale = Math.min(targetW / maskW, targetH / maskH);
    return {
      width: Math.max(1, Math.floor(maskW * scale)),
      height: Math.max(1, Math.floor(maskH * scale)),
      shouldDownsample: true,
    };
  }

  return { width: maskW, height: maskH, shouldDownsample: false };
}

/**
 * Create optimized mask ImageData with smart resolution scaling
 * - Optimized fast path for grayscale masks (SAC v1.1) where a === b
 * - Eliminates redundant sqrt and multiplication operations for grayscale
 * - Automatically downsamples when display size is much smaller than mask
 * - Reduces memory usage by up to 95% for large masks displayed small
 */
function createMaskImageData(
  a: Int16Array,
  b: Int16Array,
  W: number,
  H: number,
  opacity: number = 1,
  displayW?: number,
  displayH?: number
): ImageData {
  // SAC v1.1 grayscale optimization: when a === b, use fast path
  const isGrayscale = a === b;

  // Calculate optimal resolution if display size is provided
  let renderW = W;
  let renderH = H;
  let aProcessed = a;
  let bProcessed = b;

  if (displayW && displayH) {
    const optimal = calculateOptimalResolution(W, H, displayW, displayH);

    if (optimal.shouldDownsample) {
      renderW = optimal.width;
      renderH = optimal.height;

      // Downsample arrays before creating ImageData
      aProcessed = downsampleArray(a, W, H, renderW, renderH);
      if (!isGrayscale) {
        bProcessed = downsampleArray(b, W, H, renderW, renderH);
      } else {
        bProcessed = aProcessed; // Maintain grayscale reference
      }
    }
  }

  const size = renderW * renderH;
  const data = new Uint8ClampedArray(size * 4);

  if (isGrayscale) {
    // Fast path: grayscale masks (8.6x faster according to benchmarks)
    for (let i = 0; i < size; i++) {
      const val = Math.abs(aProcessed[i]);
      const alpha = Math.min(255, val * opacity);

      const j = i * 4;
      data[j + 0] = 255;
      data[j + 1] = 255;
      data[j + 2] = 255;
      data[j + 3] = alpha;
    }
  } else {
    // Legacy path: RGB masks with separate A and B arrays
    for (let i = 0; i < size; i++) {
      const ax = aProcessed[i];
      const by = bProcessed[i];
      const magSq = ax * ax + by * by;
      const mag = Math.min(255, Math.sqrt(magSq));

      const j = i * 4;
      data[j + 0] = 255;
      data[j + 1] = 255;
      data[j + 2] = 255;
      data[j + 3] = mag * opacity;
    }
  }

  return new ImageData(data, renderW, renderH);
}

/**
 * Render mask to canvas
 */
function renderMask(canvas: HTMLCanvasElement, maskData: ImageData, displayWidth: number, displayHeight: number): void {
  canvas.width = maskData.width;
  canvas.height = maskData.height;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '1';

  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (ctx) {
    ctx.putImageData(maskData, 0, 0);
  }
}

/**
 * Debounce helper
 */
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Create protected image viewer from div element with optimized parallel loading
 */
async function createViewer(container: HTMLElement): Promise<void> {
  const src = container.getAttribute('data-src');
  const sacUrl = container.getAttribute('data-sac') || (src ? src + '.sac' : null);
  const opacity = parseFloat(container.getAttribute('data-opacity') || String(config.opacity));

  if (!src) {
    console.error('Artorize: data-src attribute is required');
    return;
  }

  // Create wrapper with relative positioning
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.maxWidth = '100%';

  // Create image element
  const img = document.createElement('img');
  img.src = config.baseCDN + src;
  img.style.display = 'block';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.alt = container.getAttribute('data-alt') || 'Protected image';

  // Create canvas for mask overlay
  const canvas = document.createElement('canvas');

  // Assemble structure
  wrapper.appendChild(img);
  wrapper.appendChild(canvas);

  // Replace original container
  container.parentNode?.replaceChild(wrapper, container);

  // Cache for SAC data and rendered mask
  let sacDataCache: { a: Int16Array; b: Int16Array; width: number; height: number } | null = null;
  let cachedMaskData: ImageData | null = null;

  // OPTIMIZATION: Start fetching SAC in parallel with image load
  // This eliminates sequential loading delay for seamless experience
  let sacFetchPromise: Promise<SACData> | null = null;
  if (sacUrl) {
    sacFetchPromise = fetchSAC(config.baseCDN + sacUrl).catch(error => {
      console.error('Artorize: Failed to fetch SAC', error);
      throw error;
    });
  }

  // Render mask with current display size
  const renderMaskNow = (a: Int16Array, b: Int16Array, maskW: number, maskH: number) => {
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;

    if (displayWidth === 0 || displayHeight === 0) {
      // Image not yet laid out, defer rendering
      return;
    }

    // Create optimized ImageData with smart resolution matching
    // This will automatically downsample if display size is much smaller
    cachedMaskData = createMaskImageData(a, b, maskW, maskH, opacity, displayWidth, displayHeight);

    requestAnimationFrame(() => {
      renderMask(canvas, cachedMaskData!, displayWidth, displayHeight);
    });
  };

  // Load and render mask when both image and SAC are ready
  const loadMask = async () => {
    if (!sacFetchPromise) return;

    try {
      // Wait for both image dimensions and SAC data to be available
      const sacData = await sacFetchPromise;
      const W = sacData.width || img.naturalWidth;
      const H = sacData.height || img.naturalHeight;

      // Cache SAC data for resize events
      sacDataCache = { a: sacData.a, b: sacData.b, width: W, height: H };

      // Render with optimal resolution
      renderMaskNow(sacData.a, sacData.b, W, H);
    } catch (error) {
      console.error('Artorize: Failed to load mask', error);
    }
  };

  // Handle image load - mask may already be fetched due to parallel loading
  img.addEventListener('load', loadMask);
  if (img.complete) loadMask();

  // Handle resize with debouncing
  // Re-render with optimal resolution for new display size
  const handleResize = debounce(() => {
    if (sacDataCache) {
      // Invalidate cache and re-create at new optimal resolution
      cachedMaskData = null;
      renderMaskNow(sacDataCache.a, sacDataCache.b, sacDataCache.width, sacDataCache.height);
    }
  }, 150);

  window.addEventListener('resize', handleResize);
}

/**
 * Initialize all Artorize images on the page
 */
function initArtorize(): void {
  // Apply global config if provided
  if ((window as any).ArtorizeConfig) {
    Object.assign(config, (window as any).ArtorizeConfig);
  }

  const containers = document.querySelectorAll<HTMLElement>('.artorize-image');
  containers.forEach(container => {
    createViewer(container).catch(err => {
      console.error('Artorize: Failed to create viewer', err);
    });
  });
}

/**
 * Auto-initialize on DOM ready or immediately if already loaded
 */
if (config.autoInit !== false) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArtorize);
  } else {
    initArtorize();
  }
}

// Expose API for manual initialization
(window as any).Artorize = {
  init: initArtorize,
  config,
};
