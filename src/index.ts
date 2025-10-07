/**
 * SAC v1 Parser
 * Parses Simple Array Container binary format for mask transmission
 */

interface SACData {
  a: Int16Array;
  b: Int16Array;
  width: number;
  height: number;
  flags: number;
}

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
 * Loads mask data and renders it on a canvas
 */
async function loadMaskAndRender(imgEl: HTMLImageElement, sacUrl: string, canvas: HTMLCanvasElement): Promise<void> {
  try {
    const { a, b, width, height } = await fetchSAC(sacUrl);
    const W = width || imgEl.naturalWidth;
    const H = height || imgEl.naturalHeight;

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    const imgData = ctx.createImageData(W, H);

    // Render mask: using magnitude of (a,b) as visualization
    for (let i = 0; i < a.length; i++) {
      const ax = a[i];
      const by = b[i];
      const mag = Math.min(255, Math.hypot(ax, by));
      const j = i * 4;
      imgData.data[j + 0] = 255;     // R
      imgData.data[j + 1] = 255;     // G
      imgData.data[j + 2] = 255;     // B
      imgData.data[j + 3] = mag;     // A
    }

    ctx.putImageData(imgData, 0, 0);
    console.log(`Mask rendered: ${W}x${H}`);
  } catch (error) {
    console.error('Failed to load mask:', error);
    // Graceful degradation - continue without mask overlay
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const img = document.querySelector<HTMLImageElement>('#protected-image');
  const canvas = document.querySelector<HTMLCanvasElement>('#mask-canvas');

  if (!img || !canvas) {
    console.error('Required elements not found');
    return;
  }

  // Wait for image to load before fetching mask
  img.addEventListener('load', () => {
    const sacUrl = img.src + '.sac';
    loadMaskAndRender(img, sacUrl, canvas);
  });

  // If image already loaded
  if (img.complete) {
    const sacUrl = img.src + '.sac';
    loadMaskAndRender(img, sacUrl, canvas);
  }
});
