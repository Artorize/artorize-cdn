# Quick Start - Test Locally in 5 Minutes

## Step 1: Fix npm Cache (One Time Only)

You have a permission issue with npm. Run this once:

```bash
sudo chown -R $(whoami) ~/.npm
```

## Step 2: Install Dependencies

```bash
cd /Users/leoli/WebstormProjects/artorize-cdn
npm install
```

## Step 3: Build the Project

```bash
npm run build:all
```

## Step 4: Generate Test Data (Optional)

**Option A: Use Python (Recommended)**
```bash
pip install numpy pillow
python scripts/generate_test_sac.py
```

**Option B: Skip this** - The test page has built-in sample data!

## Step 5: Start the Server

```bash
npm run serve
```

You'll see:
```
🚀 Artorize CDN Server
   🌐 http://localhost:3000
```

## Step 6: Open Your Browser

Go to: **http://localhost:3000/examples/test.html**

Click the big button: **"Load Sample Test Data"**

You should see:
- A colorful gradient image on the left
- A white glowing mask overlay on top
- Controls to adjust opacity and colors

## That's It!

### What You're Looking At

- **Polluted Canvas** (bottom layer): The degraded image AI scrapers see
- **Mask Canvas** (top layer): The protection mask rendered from the SAC file
- **Stacked Together**: Shows how the CDN delivers both pieces

### Try These

1. **Opacity Slider**: Drag to see mask fade in/out
2. **Color Mode**: Change to "Rainbow" for a cool effect
3. **Upload Your Own**: If you generated test files, upload `test_data/test_image.png` and `test_data/test_mask_radial.sac`

## Troubleshooting

### npm install fails with permission errors

```bash
# Fix npm cache permissions
sudo chown -R $(whoami) ~/.npm

# Or bypass cache
npm install --cache /tmp/empty-cache
```

### Port 3000 in use

```bash
# Kill the process
lsof -i :3000
kill -9 <PID>

# Or use a different port
PORT=3001 npm run serve
```

### Build fails

```bash
# Make sure TypeScript is installed
npm install -g typescript

# Rebuild
npm run build:all
```

### Test page is blank

1. Check browser console (F12) for errors
2. Click "Load Sample Test Data" button
3. Make sure server is running (`npm run serve`)

## What's Next?

Once this works:

1. **Run the tests**: `npm test`
2. **Try your own images**: Put them in `test_data/` with matching `.sac` files
3. **Read DEPLOYMENT.md** when ready to deploy to your friend's server

## Quick Command Summary

```bash
# One-time setup
sudo chown -R $(whoami) ~/.npm
npm install
npm run build:all

# Every time you want to test
npm run serve
# Then open http://localhost:3000/examples/test.html

# Stop server
Ctrl + C
```
