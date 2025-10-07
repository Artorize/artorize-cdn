/**
 * SAC v1 Parser - Optimized Version
 * Parses Simple Array Container binary format for mask transmission with performance optimizations
 */

interface SACData {
  a: Int16Array;
  b: Int16Array;
  width: number;
  height: number;
  flags: number;
}

// Cache for parsed mask ImageData to avoid recomputation
let cachedMaskData: ImageData | null = null;

/**
 * Fetches and parses a SAC file from the given URL
 */
async function fetchSAC(url: string): Promise<SACData> {
  const resp = await fetch(url, { mode: 'cors' });
  if (!resp.ok) throw new Error(`SAC fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return parseSAC(buf);
}

/**
 * Parses a SAC v1 binary buffer into typed arrays
 */
function parseSAC(buffer: ArrayBuffer): SACData {
  const dv = new DataView(buffer);

  // Parse header (24 bytes)
  const m0 = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m0 !== 'SAC1') throw new Error('Bad magic');

  const flags = dv.getUint8(4);
  const dtype = dv.getUint8(5);
  const arraysCount = dv.getUint8(6);

  if (dtype !== 1 || arraysCount !== 2) throw new Error('Unsupported SAC variant');

  const lengthA = dv.getUint32(8, true);
  const lengthB = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const height = dv.getUint32(20, true);

  // Calculate offsets for array payloads
  const offA = 24;
  const offB = offA + lengthA * 2;

  if (offB + lengthB * 2 !== buffer.byteLength) throw new Error('Length mismatch');

  // Create typed array views
  const a = new Int16Array(buffer, offA, lengthA);
  const b = new Int16Array(buffer, offB, lengthB);

  // Validate shape if provided
  if (width && height && (lengthA !== width * height || lengthB !== width * height)) {
    throw new Error('Shape mismatch');
  }

  return { a, b, width, height, flags };
}

/**
 * Creates mask image data from SAC arrays with optimizations
 * - Pre-computes magnitudes to avoid repeated Math.hypot calls
 * - Uses Uint8ClampedArray directly for better performance
 * - Caches result for reuse
 */
function createMaskImageData(a: Int16Array, b: Int16Array, W: number, H: number): ImageData {
  const size = W * H;
  const data = new Uint8ClampedArray(size * 4);

  // Pre-compute all magnitudes in a single pass (optimization #1)
  for (let i = 0; i < size; i++) {
    const ax = a[i];
    const by = b[i];
    // Optimized magnitude calculation: avoid Math.hypot for performance
    const magSq = ax * ax + by * by;
    const mag = Math.min(255, Math.sqrt(magSq));

    const j = i * 4;
    data[j + 0] = 255;     // R
    data[j + 1] = 255;     // G
    data[j + 2] = 255;     // B
    data[j + 3] = mag;     // A
  }

  return new ImageData(data, W, H);
}

/**
 * Renders cached mask data to canvas
 */
function renderMaskToCanvas(canvas: HTMLCanvasElement, maskData: ImageData, displayWidth: number, displayHeight: number): void {
  canvas.width = maskData.width;
  canvas.height = maskData.height;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (ctx) {
    ctx.putImageData(maskData, 0, 0);
  }
}

/**
 * Loads mask data and renders it on overlay canvas with optimizations
 */
async function loadMaskAndRender(
  imgEl: HTMLImageElement,
  sacUrl: string,
  overlayCanvas: HTMLCanvasElement
): Promise<void> {
  try {
    const { a, b, width, height } = await fetchSAC(sacUrl);
    const W = width || imgEl.naturalWidth;
    const H = height || imgEl.naturalHeight;

    // Create and cache mask image data (optimization #2: cache the result)
    if (!cachedMaskData) {
      cachedMaskData = createMaskImageData(a, b, W, H);
    }

    // Batch DOM reads to avoid layout thrashing (optimization #3)
    const displayWidth = imgEl.offsetWidth;
    const displayHeight = imgEl.offsetHeight;

    // Render using RAF for smooth painting (optimization #4)
    requestAnimationFrame(() => {
      renderMaskToCanvas(overlayCanvas, cachedMaskData!, displayWidth, displayHeight);
    });

    console.log(`Mask rendered: ${W}x${H} (displayed as ${displayWidth}x${displayHeight})`);
  } catch (error) {
    console.error('Failed to load mask:', error);
    // Graceful degradation - continue without mask overlay
  }
}

/**
 * Debounce helper for resize events (optimization #5)
 */
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const img = document.querySelector<HTMLImageElement>('#protected-image');
  const overlayCanvas = document.querySelector<HTMLCanvasElement>('#mask-canvas');

  if (!img || !overlayCanvas) {
    console.error('Required elements not found');
    return;
  }

  // Load mask handler
  const loadMask = () => {
    const sacUrl = img.src + '.sac';
    loadMaskAndRender(img, sacUrl, overlayCanvas);
  };

  // Wait for image to load before fetching mask
  img.addEventListener('load', loadMask);

  // If image already loaded
  if (img.complete) {
    loadMask();
  }

  // Handle window resize with debouncing (optimization #6)
  const handleResize = debounce(() => {
    if (cachedMaskData) {
      const displayWidth = img.offsetWidth;
      const displayHeight = img.offsetHeight;
      requestAnimationFrame(() => {
        renderMaskToCanvas(overlayCanvas, cachedMaskData!, displayWidth, displayHeight);
      });
    }
  }, 150);

  window.addEventListener('resize', handleResize);
});
