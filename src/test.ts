/**
 * SAC v1 Test Suite
 * Interactive test for mask transmission protocol with stacked canvas rendering
 */

interface SACData {
  a: Int16Array;
  b: Int16Array;
  width: number;
  height: number;
  flags: number;
}

type ColorMode = 'white' | 'red' | 'green' | 'blue' | 'rainbow';

/**
 * Parses a SAC v1/v1.1 binary buffer into typed arrays
 *
 * SAC v1.1 adds FLAG_SINGLE_ARRAY (0x01) for grayscale masks:
 * - When set, only array A is stored in payload (50% smaller files)
 * - Array B is duplicated from A during parsing
 * - Grayscale diff is broadcast to all RGB channels during reconstruction
 */
function parseSAC(buffer: ArrayBuffer): SACData {
  const dv = new DataView(buffer);

  // Parse header (24 bytes)
  const m0 = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m0 !== 'SAC1') throw new Error('Bad magic');

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
 * Builds a SAC v1/v1.1 file from int16 arrays (for testing)
 *
 * @param a - First int16 array (grayscale diff for v1.1)
 * @param b - Second int16 array (ignored if singleArray=true)
 * @param width - Image width
 * @param height - Image height
 * @param singleArray - Use v1.1 SINGLE_ARRAY mode (50% smaller, for grayscale masks)
 */
function buildSAC(a: Int16Array, b: Int16Array, width: number, height: number, singleArray: boolean = true): ArrayBuffer {
  const lengthA = a.length;

  if (lengthA !== width * height) {
    throw new Error('Array A length must equal width * height');
  }

  const header = new ArrayBuffer(24);
  const dv = new DataView(header);

  // Magic "SAC1"
  dv.setUint8(0, 'S'.charCodeAt(0));
  dv.setUint8(1, 'A'.charCodeAt(0));
  dv.setUint8(2, 'C'.charCodeAt(0));
  dv.setUint8(3, '1'.charCodeAt(0));

  if (singleArray) {
    // SAC v1.1: SINGLE_ARRAY mode (grayscale masks)
    const FLAG_SINGLE_ARRAY = 0x01;
    dv.setUint8(4, FLAG_SINGLE_ARRAY);  // flags
    dv.setUint8(5, 1);  // dtype_code = int16
    dv.setUint8(6, 1);  // arrays_count = 1
    dv.setUint8(7, 0);  // reserved

    dv.setUint32(8, lengthA, true);
    dv.setUint32(12, lengthA, true);  // lengthB = lengthA (for header consistency)
    dv.setUint32(16, width, true);
    dv.setUint32(20, height, true);

    // Combine header + single array payload (50% smaller!)
    const total = new Uint8Array(24 + lengthA * 2);
    total.set(new Uint8Array(header), 0);
    total.set(new Uint8Array(a.buffer), 24);

    return total.buffer;
  } else {
    // SAC v1.0: dual-array mode (legacy RGB masks)
    const lengthB = b.length;

    if (lengthB !== width * height) {
      throw new Error('Array B length must equal width * height');
    }

    dv.setUint8(4, 0);  // flags = 0
    dv.setUint8(5, 1);  // dtype_code = int16
    dv.setUint8(6, 2);  // arrays_count = 2
    dv.setUint8(7, 0);  // reserved

    dv.setUint32(8, lengthA, true);
    dv.setUint32(12, lengthB, true);
    dv.setUint32(16, width, true);
    dv.setUint32(20, height, true);

    // Combine header + both array payloads
    const total = new Uint8Array(24 + lengthA * 2 + lengthB * 2);
    total.set(new Uint8Array(header), 0);
    total.set(new Uint8Array(a.buffer), 24);
    total.set(new Uint8Array(b.buffer), 24 + lengthA * 2);

    return total.buffer;
  }
}

/**
 * Generate a sample procedural test image
 */
function generateTestImage(width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Create a gradient pattern
      const r = Math.floor((x / width) * 255);
      const g = Math.floor((y / height) * 255);
      const b = Math.floor(((x + y) / (width + height)) * 255);

      imgData.data[i + 0] = r;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = b;
      imgData.data[i + 3] = 255;
    }
  }

  return imgData;
}

/**
 * Generate sample SAC mask data (synthetic test pattern)
 */
function generateTestMask(width: number, height: number): { a: Int16Array; b: Int16Array } {
  const size = width * height;
  const a = new Int16Array(size);
  const b = new Int16Array(size);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(cx * cx + cy * cy);

      // Create a radial pattern
      const intensity = Math.floor((1 - dist / maxDist) * 1000);
      a[i] = intensity;
      b[i] = intensity;
    }
  }

  return { a, b };
}

/**
 * Render mask on canvas with configurable visualization
 * - Optimized fast path for grayscale masks (SAC v1.1) where a === b
 */
function renderMask(
  canvas: HTMLCanvasElement,
  sacData: SACData,
  opacity: number,
  colorMode: ColorMode
): void {
  const { a, b, width, height } = sacData;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);

  // SAC v1.1 grayscale optimization: when a === b, use fast path
  const isGrayscale = a === b;

  for (let i = 0; i < a.length; i++) {
    let normalizedMag: number;

    if (isGrayscale) {
      // Fast path: grayscale masks (no sqrt needed)
      const val = Math.abs(a[i]);
      normalizedMag = Math.min(255, val / 4); // Scale for visibility
    } else {
      // Legacy path: RGB masks with magnitude calculation
      const ax = a[i];
      const by = b[i];
      const mag = Math.hypot(ax, by);
      normalizedMag = Math.min(255, mag / 4); // Scale for visibility
    }

    const j = i * 4;
    let r = 255, g = 255, blue = 255;

    switch (colorMode) {
      case 'red':
        r = 255; g = 0; blue = 0;
        break;
      case 'green':
        r = 0; g = 255; blue = 0;
        break;
      case 'blue':
        r = 0; g = 0; blue = 255;
        break;
      case 'rainbow':
        const hue = (normalizedMag / 255) * 360;
        [r, g, blue] = hslToRgb(hue, 100, 50);
        break;
      case 'white':
      default:
        r = 255; g = 255; blue = 255;
        break;
    }

    imgData.data[j + 0] = r;
    imgData.data[j + 1] = g;
    imgData.data[j + 2] = blue;
    imgData.data[j + 3] = normalizedMag * (opacity / 100);
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * HSL to RGB conversion
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Load and render polluted image from file
 */
function loadImageFromFile(file: File, canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve();
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Load SAC file
 */
function loadSACFromFile(file: File): Promise<SACData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const sacData = parseSAC(reader.result as ArrayBuffer);
        resolve(sacData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Update status message
 */
function setStatus(message: string, isError: boolean = false): void {
  const statusEl = document.getElementById('status')!;
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}

// Main application state
let currentSACData: SACData | null = null;
let currentOpacity = 100;
let currentColorMode: ColorMode = 'white';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const pollutedCanvas = document.getElementById('polluted-canvas') as HTMLCanvasElement;
  const maskCanvas = document.getElementById('mask-canvas') as HTMLCanvasElement;
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
  const sacUpload = document.getElementById('sac-upload') as HTMLInputElement;
  const loadSampleBtn = document.getElementById('load-sample-btn') as HTMLButtonElement;
  const opacitySlider = document.getElementById('opacity-slider') as HTMLInputElement;
  const opacityValue = document.getElementById('opacity-value') as HTMLSpanElement;
  const colorModeSelect = document.getElementById('color-mode') as HTMLSelectElement;

  // Load sample test data
  loadSampleBtn.addEventListener('click', () => {
    try {
      const width = 400;
      const height = 300;

      // Generate test image
      const testImg = generateTestImage(width, height);
      pollutedCanvas.width = width;
      pollutedCanvas.height = height;
      const ctx = pollutedCanvas.getContext('2d')!;
      ctx.putImageData(testImg, 0, 0);

      // Generate test mask
      const { a, b } = generateTestMask(width, height);
      currentSACData = { a, b, width, height, flags: 0 };

      // Render mask
      renderMask(maskCanvas, currentSACData, currentOpacity, currentColorMode);

      setStatus(`✓ Sample loaded: ${width}x${height} test pattern with radial mask`);
    } catch (error) {
      setStatus(`✗ Error generating sample: ${error}`, true);
    }
  });

  // Handle image upload
  imageUpload.addEventListener('change', async () => {
    const file = imageUpload.files?.[0];
    if (!file) return;

    try {
      await loadImageFromFile(file, pollutedCanvas);
      setStatus(`✓ Image loaded: ${pollutedCanvas.width}x${pollutedCanvas.height} - now upload a .sac file`);
    } catch (error) {
      setStatus(`✗ Error loading image: ${error}`, true);
    }
  });

  // Handle SAC upload
  sacUpload.addEventListener('change', async () => {
    const file = sacUpload.files?.[0];
    if (!file) return;

    try {
      currentSACData = await loadSACFromFile(file);
      const { width, height } = currentSACData;

      // Validate dimensions match
      if (pollutedCanvas.width !== width || pollutedCanvas.height !== height) {
        setStatus(
          `⚠ Warning: SAC dimensions (${width}x${height}) don't match image (${pollutedCanvas.width}x${pollutedCanvas.height})`,
          true
        );
      }

      renderMask(maskCanvas, currentSACData, currentOpacity, currentColorMode);
      setStatus(`✓ SAC loaded: ${width}x${height}, ${currentSACData.a.length} pixels`);
    } catch (error) {
      setStatus(`✗ Error loading SAC: ${error}`, true);
    }
  });

  // Handle opacity slider
  opacitySlider.addEventListener('input', () => {
    currentOpacity = parseInt(opacitySlider.value);
    opacityValue.textContent = `${currentOpacity}%`;

    if (currentSACData) {
      renderMask(maskCanvas, currentSACData, currentOpacity, currentColorMode);
    }
  });

  // Handle color mode change
  colorModeSelect.addEventListener('change', () => {
    currentColorMode = colorModeSelect.value as ColorMode;

    if (currentSACData) {
      renderMask(maskCanvas, currentSACData, currentOpacity, currentColorMode);
    }
  });

  // Initial message
  setStatus('Ready! Click "Load Sample Test Data" or upload your own files.');
});
