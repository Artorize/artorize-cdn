# Local Testing Guide

Quick guide to test the Artorize CDN on your local machine.

## Step 1: Install Dependencies

```bash
cd /Users/leoli/WebstormProjects/artorize-cdn
npm install
```

## Step 2: Run Tests

```bash
# Run all tests to make sure everything works
npm test

# If you see "PASS" for all tests, you're good!
```

## Step 3: Generate Test Data

You have two options:

### Option A: Use Python to Generate Real Test Files (Recommended)

```bash
# Install Python dependencies
pip install numpy pillow

# Generate test images and SAC files
python generate_test_sac.py
```

This creates `test_data/` with:
- `test_image.png` - A 400x300 gradient image
- `test_mask_radial.sac` - Radial mask pattern
- `test_mask_checkerboard.sac` - Checkerboard pattern
- `test_mask_gradient.sac` - Gradient pattern

### Option B: Use Built-in JavaScript Generator (No Python needed)

Skip this step - the test page has a built-in generator!

## Step 4: Build the Project

```bash
npm run build:all
```

This compiles TypeScript to JavaScript in the `dist/` folder.

## Step 5: Start the Local Server

```bash
npm run serve
```

You should see:
```
🚀 Artorize CDN Server
   Environment: development
   Port: 3000

   🌐 http://localhost:3000
   🏥 http://localhost:3000/health
```

## Step 6: Test in Your Browser

### Test the Interactive Demo

Open: **http://localhost:3000/test.html**

**Option 1: Use Built-in Sample (Easiest)**
1. Click "Load Sample Test Data"
2. You'll see a gradient test image with a radial mask overlay
3. Adjust the opacity slider to see the mask effect
4. Try different color modes

**Option 2: Upload Real Files (If you ran Python script)**
1. Click "Choose File" under "Polluted Image"
2. Select `test_data/test_image.png`
3. Click "Choose File" under "SAC Mask File"
4. Select `test_data/test_mask_radial.sac`
5. You'll see the image with mask overlay

### Test Different Features

**Opacity Control:**
- Move the slider from 0% to 100%
- Watch the mask fade in/out

**Color Modes:**
- White Overlay (default)
- Red/Green/Blue Heatmap
- Rainbow (magnitude-based)

**Try Different Masks:**
- `test_mask_radial.sac` - Circular fade from center
- `test_mask_checkerboard.sac` - Checkerboard pattern
- `test_mask_gradient.sac` - Directional gradients

## Step 7: Check Server Health

Open: **http://localhost:3000/health**

You should see:
```json
{
  "status": "ok",
  "env": "development",
  "timestamp": "2025-10-06T...",
  "uptime": 123.456
}
```

## Step 8: Test API Endpoints

Open: **http://localhost:3000/api/images**

See list of available test images with their SAC files.

## Testing Your Own Images

### Create Your Own SAC File

Use the Python script as a template:

```python
import numpy as np
from generate_test_sac import build_sac

# Load your image to get dimensions
from PIL import Image
img = Image.open('your_image.jpg')
width, height = img.size

# Create mask arrays (example: simple fade)
size = width * height
a = np.zeros(size, dtype=np.int16)
b = np.zeros(size, dtype=np.int16)

# Build SAC file
sac_bytes = build_sac(a, b, width, height)

# Save it
with open('your_image.jpg.sac', 'wb') as f:
    f.write(sac_bytes)
```

### Upload to Test Page

1. Put your image in `test_data/your_image.jpg`
2. Put SAC file in `test_data/your_image.jpg.sac`
3. Restart server: `Ctrl+C` then `npm run serve`
4. Open test.html and upload both files

## Common Testing Scenarios

### Scenario 1: Test SAC Parser Only

```bash
# Open Node.js REPL
node

# Paste this:
const fs = require('fs');
const buffer = fs.readFileSync('test_data/test_mask_radial.sac');
const dv = new DataView(buffer);
console.log('Magic:', String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)));
console.log('Width:', dv.getUint32(16, true));
console.log('Height:', dv.getUint32(20, true));
```

### Scenario 2: Test Different Image Sizes

Modify `generate_test_sac.py`:
```python
# Change these values
width = 1920
height = 1080
```

Run again:
```bash
python generate_test_sac.py
```

### Scenario 3: Test Performance

Open browser DevTools (F12) → Console:
```javascript
// Time the SAC loading
console.time('SAC Load');
fetch('/test_data/test_mask_radial.sac')
  .then(r => r.arrayBuffer())
  .then(buf => {
    console.timeEnd('SAC Load');
    console.log('Size:', buf.byteLength, 'bytes');
  });
```

## Troubleshooting

### Port 3000 Already in Use

```bash
# Kill process on port 3000
lsof -i :3000
kill -9 <PID>

# Or use different port
PORT=3001 npm run serve
```

### "Module not found" Error

```bash
npm install
npm run build:all
```

### Test Page Shows Blank Canvas

1. Check browser console (F12) for errors
2. Make sure server is running
3. Try the "Load Sample" button first
4. Check file paths are correct

### SAC File Not Loading

1. Check file exists: `ls test_data/`
2. Check file size: `ls -lh test_data/*.sac`
3. Verify it's a valid SAC file:
   ```bash
   hexdump -C test_data/test_mask_radial.sac | head -n 2
   # Should start with: 53 41 43 31 (ASCII "SAC1")
   ```

## What to Test

- [ ] Server starts without errors
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Test page loads
- [ ] "Load Sample" button works
- [ ] Opacity slider changes mask visibility
- [ ] Color modes change visualization
- [ ] File upload works (if using Python-generated files)
- [ ] Mask aligns perfectly with image
- [ ] Console shows no errors (F12)

## Next Steps

Once local testing works:
1. Test with your real polluted images
2. Generate real SAC masks using your protection algorithm
3. Verify the mask reconstruction quality
4. Then you're ready to deploy to the server!

## Quick Commands Reference

```bash
# Install everything
npm install

# Run tests
npm test

# Generate test data
python generate_test_sac.py

# Build project
npm run build:all

# Start server
npm run serve

# Open test page
open http://localhost:3000/test.html

# Stop server
Ctrl + C
```
