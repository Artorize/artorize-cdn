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
 * Parse SAC v1 binary format
 */
function parseSAC(buffer: ArrayBuffer): SACData {
  const dv = new DataView(buffer);

  const m0 = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m0 !== 'SAC1') throw new Error('Invalid SAC file');

  const flags = dv.getUint8(4);
  const dtype = dv.getUint8(5);
  const arraysCount = dv.getUint8(6);

  if (dtype !== 1 || arraysCount !== 2) throw new Error('Unsupported SAC variant');

  const lengthA = dv.getUint32(8, true);
  const lengthB = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const height = dv.getUint32(20, true);

  const offA = 24;
  const offB = offA + lengthA * 2;

  if (offB + lengthB * 2 !== buffer.byteLength) throw new Error('Length mismatch');

  const a = new Int16Array(buffer, offA, lengthA);
  const b = new Int16Array(buffer, offB, lengthB);

  if (width && height && (lengthA !== width * height || lengthB !== width * height)) {
    throw new Error('Shape mismatch');
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
 * Create optimized mask ImageData
 */
function createMaskImageData(a: Int16Array, b: Int16Array, W: number, H: number, opacity: number = 1): ImageData {
  const size = W * H;
  const data = new Uint8ClampedArray(size * 4);

  for (let i = 0; i < size; i++) {
    const ax = a[i];
    const by = b[i];
    const magSq = ax * ax + by * by;
    const mag = Math.min(255, Math.sqrt(magSq));

    const j = i * 4;
    data[j + 0] = 255;
    data[j + 1] = 255;
    data[j + 2] = 255;
    data[j + 3] = mag * opacity;
  }

  return new ImageData(data, W, H);
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
 * Create protected image viewer from div element
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

  // Cache for mask data
  let cachedMaskData: ImageData | null = null;

  // Load and render mask
  const loadMask = async () => {
    if (!sacUrl) return;

    try {
      const { a, b, width, height } = await fetchSAC(config.baseCDN + sacUrl);
      const W = width || img.naturalWidth;
      const H = height || img.naturalHeight;

      if (!cachedMaskData) {
        cachedMaskData = createMaskImageData(a, b, W, H, opacity);
      }

      const displayWidth = img.offsetWidth;
      const displayHeight = img.offsetHeight;

      requestAnimationFrame(() => {
        renderMask(canvas, cachedMaskData!, displayWidth, displayHeight);
      });
    } catch (error) {
      console.error('Artorize: Failed to load mask', error);
    }
  };

  // Handle image load
  img.addEventListener('load', loadMask);
  if (img.complete) loadMask();

  // Handle resize with debouncing
  const handleResize = debounce(() => {
    if (cachedMaskData) {
      const displayWidth = img.offsetWidth;
      const displayHeight = img.offsetHeight;
      requestAnimationFrame(() => {
        renderMask(canvas, cachedMaskData!, displayWidth, displayHeight);
      });
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
