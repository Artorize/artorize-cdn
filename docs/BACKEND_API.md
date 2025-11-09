# Artorize Storage Backend API Reference

The Artorize CDN integrates with a Node.js/Express storage backend for secure artwork storage and retrieval using MongoDB GridFS.

## Configuration

Configure the backend URL in your `.env` file:

```env
BACKEND_API_URL=http://localhost:3002
```

**Default**: `http://localhost:3002`

## Architecture

```
Client Browser → CDN Server → Backend API → MongoDB GridFS
                     ↓
              (Caches responses)
```

The CDN acts as a caching proxy between clients and the backend storage service.

## CDN Endpoints

The CDN provides these endpoints that proxy to the backend:

### `GET /api/artworks/:id`
Fetch artwork file (protected or original variant).

**Query Parameters**:
- `variant` - `original|protected` (default: `protected`)

**Response**: Binary image file with appropriate MIME type
- Cache headers: `public, max-age=31536000, immutable`

**Example**:
```bash
# Get protected variant (default)
curl http://localhost:3000/api/artworks/60f7b3b3b3b3b3b3b3b3b3b3

# Get original variant
curl http://localhost:3000/api/artworks/60f7b3b3b3b3b3b3b3b3b3b3?variant=original
```

---

### `GET /api/artworks/:id/mask`
Fetch artwork mask file in SAC v1.1 binary format.

**Response**: Binary SAC file (application/octet-stream)
- Cache headers: `public, max-age=31536000, immutable`
- Content-Disposition: `inline; filename="{id}-mask.sac"`

**Example**:
```bash
curl http://localhost:3000/api/artworks/60f7b3b3b3b3b3b3b3b3b3b3/mask -o mask.sac
```

---

### `GET /api/artworks/:id/metadata`
Fetch complete artwork metadata.

**Response**: `200 OK`
```json
{
  "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
  "title": "Artwork Title",
  "artist": "Artist Name",
  "description": "Description...",
  "tags": ["tag1", "tag2"],
  "createdAt": "2023-07-20T15:30:00Z",
  "uploadedAt": "2023-07-21T09:15:00Z",
  "formats": {
    "original": {
      "contentType": "image/jpeg",
      "bytes": 1048576,
      "checksum": "sha256:abc123..."
    }
  }
}
```

**Cache**: 1 hour

---

### `GET /api/artworks`
Search artworks with query parameters.

**Query Parameters**:
- `artist` - Filter by artist name
- `q` - Full-text search (title/description)
- `tags` - Comma-separated tags
- `limit` - Results per page (1-10000, default: 20)
- `skip` - Pagination offset (0-5000, default: 0)

**Response**: Array of artwork metadata objects

**Cache**: 5 minutes

**Example**:
```bash
# Search by artist
curl "http://localhost:3000/api/artworks?artist=Picasso&limit=5"

# Full-text search
curl "http://localhost:3000/api/artworks?q=landscape"
```

---

## Backend Storage API (Reference)

The backend storage service (typically on port 3002) provides these endpoints. **Note**: These are accessed via the CDN proxy above, not directly by clients.

### Authentication

**Protected Endpoints**:
- `POST /artworks` - Upload artwork (requires Bearer token)

**Public Endpoints**:
- All `GET` endpoints (search, metadata, file retrieval)

### Token-Based Authentication

1. **Router generates token**: `POST /tokens`
2. **Router passes token to processor and backend**
3. **Processor uploads with token**: `Authorization: Bearer <token>`
4. **Token consumed** (single-use) on successful upload
5. **Expired/used tokens rejected** with 401

**Security Benefits**:
- One-time tokens prevent replay attacks
- Time-limited (1 hour default)
- Per-artwork isolation
- No static credentials

### Processor Workflow

```
1. Router receives submission
2. Router generates token (POST /tokens)
3. Router passes token to processor and backend
4. Processor processes artwork (variants, masks, analysis)
5. Processor uploads to backend (POST /artworks with Bearer token)
6. Backend validates and consumes token
7. Backend returns artwork ID
8. Processor sends ID to router
9. Router retrieves files via CDN as needed
```

### Upload Endpoint

**`POST /artworks`** (Backend only - not exposed by CDN)

Upload artwork with multiple file variants.

**Authentication**: Required - `Authorization: Bearer <token>`

**Content-Type**: `multipart/form-data`

**Required Files**:
- `original` - Original image (JPEG/PNG/WebP/AVIF/GIF, max 256MB)
- `protected` - Protected variant
- `mask` - Grayscale mask (SAC v1.1 binary format, .sac extension)
- `analysis` - Analysis JSON document
- `summary` - Summary JSON document

**Optional Fields**:
- `title`, `artist`, `description`, `tags`, `createdAt`, `extra`

**Response**: `201 Created`
```json
{
  "id": "60f7b3b3b3b3b3b3b3b3b3b3",
  "formats": {
    "original": {
      "contentType": "image/jpeg",
      "bytes": 1048576,
      "checksum": "sha256:abc123...",
      "fileId": "60f7b3b3b3b3b3b3b3b3b3b4"
    }
  }
}
```

---

## File Format Support

**Images**: JPEG, PNG, WebP, AVIF, GIF
**Masks**: SAC v1.1 binary format (.sac files)
**Metadata**: JSON
**Max Size**: 256MB per file

### SAC v1.1 Format

Masks use the Simple Array Container (SAC) v1.1 protocol - a compact binary format optimized for CDN delivery:

- Minimal overhead (24-byte header + raw int16 data)
- Fixed little-endian layout for browser compatibility
- Single-array mode for grayscale (50% smaller files)
- Immutable caching support
- Efficient parsing in JavaScript

See [poison-mask-grayscale-protocol.md](poison-mask-grayscale-protocol.md) for complete specification.

---

## Rate Limits

- **General**: 300 requests/15min per IP
- **Uploads**: 30 uploads/hour per IP
- **Health**: No limits

---

## Health Check

### `GET /health`

Service health status including backend connectivity.

**Response**: `200 OK`
```json
{
  "status": "ok",
  "env": "development",
  "timestamp": "2023-07-21T09:15:00.000Z",
  "uptime": 12345.67,
  "backend": {
    "url": "http://localhost:3002",
    "status": "ok",
    "details": {
      "ok": true,
      "uptime": 54321.0
    }
  }
}
```

---

## Error Responses

All errors return JSON:
```json
{ "error": "Human-readable error message" }
```

**Status Codes**:
- `400` - Bad Request (invalid ID format, malformed parameters)
- `401` - Unauthorized (missing/invalid/expired token)
- `404` - Not Found (artwork/variant doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## Storage Architecture

**GridFS Buckets**:
- `artwork_originals` - Original images
- `artwork_protected` - Protected variants
- `artwork_masks` - Grayscale masks (SAC v1.1 binary format)

**Features**:
- 1MB chunk size
- SHA256 checksums for integrity
- Automatic compression (WiredTiger + zstd)
- Masks stored in SAC v1.1 format for efficient CDN delivery

**Database Indexes**:
- `{ artist: 1, createdAt: -1 }` - Artist queries
- `{ tags: 1 }` - Tag filtering
- `{ title: "text", description: "text" }` - Full-text search

---

## Security Features

- Token-based authentication (one-time use)
- Rate limiting per IP
- Input validation (Zod schemas)
- Security headers (Helmet.js)
- Structured logging with header redaction
- File type validation
- Size limits enforcement

---

## Examples

### Complete Integration Flow

```bash
# 1. Start backend (port 3002)
cd artorize-backend
npm start

# 2. Start CDN (port 3000)
cd artorize-cdn
npm run serve

# 3. Check health
curl http://localhost:3000/health

# 4. Fetch artwork via CDN (caching proxy)
curl http://localhost:3000/api/artworks/671924a5c3d8e8f9a1b2c3d4 -o artwork.jpg

# 5. Fetch mask via CDN
curl http://localhost:3000/api/artworks/671924a5c3d8e8f9a1b2c3d4/mask -o mask.sac

# 6. Fetch metadata
curl http://localhost:3000/api/artworks/671924a5c3d8e8f9a1b2c3d4/metadata

# 7. Search artworks
curl "http://localhost:3000/api/artworks?artist=Picasso&limit=5"
```

### Client-Side Usage

```html
<!DOCTYPE html>
<html>
<head>
  <title>Protected Artwork</title>
</head>
<body>
  <div class="viewer" style="position: relative; display: inline-block;">
    <!-- Fetch protected image from CDN -->
    <img id="protected-image"
         src="/api/artworks/671924a5c3d8e8f9a1b2c3d4"
         alt="Protected artwork"
         style="display: block;">

    <!-- Canvas overlay for mask -->
    <canvas id="mask-canvas"
            style="position: absolute; top: 0; left: 0; pointer-events: none;"></canvas>
  </div>

  <script src="dist/index.js"></script>
  <script>
    // Client code automatically constructs mask URL:
    // /api/artworks/671924a5c3d8e8f9a1b2c3d4.sac
    //
    // Update to use the mask endpoint:
    const img = document.querySelector('#protected-image');
    const artworkId = '671924a5c3d8e8f9a1b2c3d4';
    const maskUrl = `/api/artworks/${artworkId}/mask`;
  </script>
</body>
</html>
```

---

## Deployment Notes

1. **Set BACKEND_API_URL** in CDN's `.env` file
2. **Ensure network connectivity** between CDN and backend
3. **Configure CORS** if CDN and backend are on different domains
4. **Enable caching** on CDN for optimal performance
5. **Monitor backend health** via `/health` endpoint
6. **Set appropriate timeouts** (default: 30s for file fetches)

---

## Troubleshooting

### Backend Connection Issues

**Symptom**: 500 errors or timeout messages

**Check**:
1. Backend service is running on configured port
2. `BACKEND_API_URL` is correctly set in `.env`
3. Network connectivity between CDN and backend
4. Firewall rules allow connections

**Debug**:
```bash
# Check CDN health endpoint
curl http://localhost:3000/health

# Response should show backend status
```

### File Not Found (404)

**Possible causes**:
1. Invalid artwork ID format (must be 24-char hex)
2. Artwork doesn't exist in backend database
3. Requested variant not available

### Performance Issues

**Optimize**:
1. Increase CDN cache durations for static files
2. Enable compression (Brotli/Gzip) for SAC files
3. Use HTTP/2 between CDN and backend
4. Add Redis caching layer if needed
5. Scale backend horizontally with load balancer

---

## Related Documentation

- **[Client Integration Guide](CLIENT_INTEGRATION.md)** - Integrate protection into websites
- **[SAC v1.1 Protocol](poison-mask-grayscale-protocol.md)** - Binary format specification
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment
- **[README](../README.md)** - Project overview
