/**
 * Artorize Backend API Client
 * Handles communication with the Artorize Storage Backend
 *
 * Note: Requires Node.js 18+ for native fetch support
 */

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3002';
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Fetch artwork file from backend
 * @param {string} artworkId - MongoDB ObjectId of the artwork
 * @param {string} variant - File variant (original|protected|mask)
 * @returns {Promise<{buffer: Buffer, contentType: string, size: number}>}
 */
export async function fetchArtworkFile(artworkId, variant = 'original') {
  const url = `${BACKEND_API_URL}/artworks/${artworkId}?variant=${variant}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error (${response.status}): ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return {
      buffer,
      contentType,
      size: buffer.length,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Backend API request timeout');
    }
    throw error;
  }
}

/**
 * Fetch artwork mask file from backend
 * @param {string} artworkId - MongoDB ObjectId of the artwork
 * @returns {Promise<{buffer: Buffer, contentType: string, size: number}>}
 */
export async function fetchArtworkMask(artworkId) {
  const url = `${BACKEND_API_URL}/artworks/${artworkId}/mask`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error (${response.status}): ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return {
      buffer,
      contentType,
      size: buffer.length,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Backend API request timeout');
    }
    throw error;
  }
}

/**
 * Fetch artwork metadata from backend
 * @param {string} artworkId - MongoDB ObjectId of the artwork
 * @returns {Promise<Object>}
 */
export async function fetchArtworkMetadata(artworkId) {
  const url = `${BACKEND_API_URL}/artworks/${artworkId}/metadata`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Backend API request timeout');
    }
    throw error;
  }
}

/**
 * Search artworks in backend
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>}
 */
export async function searchArtworks(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${BACKEND_API_URL}/artworks${queryString ? `?${queryString}` : ''}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Backend API request timeout');
    }
    throw error;
  }
}

/**
 * Check backend health
 * @returns {Promise<Object>}
 */
export async function checkBackendHealth() {
  const url = `${BACKEND_API_URL}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health checks

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Backend unhealthy (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Backend health check timeout');
    }
    throw error;
  }
}

/**
 * Get artwork variants information
 * @param {string} artworkId - MongoDB ObjectId of the artwork
 * @returns {Promise<Object>}
 */
export async function fetchArtworkVariants(artworkId) {
  const url = `${BACKEND_API_URL}/artworks/${artworkId}/variants`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Backend API request timeout');
    }
    throw error;
  }
}
