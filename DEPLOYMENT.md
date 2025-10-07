# Artorize CDN Deployment Guide

Complete guide for testing and deploying the Artorize CDN to your friend's server.

## Table of Contents

1. [Running Tests Locally](#running-tests-locally)
2. [Local Development Server](#local-development-server)
3. [Server Requirements](#server-requirements)
4. [Initial Server Setup](#initial-server-setup)
5. [Deployment Methods](#deployment-methods)
6. [Post-Deployment](#post-deployment)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Running Tests Locally

### 1. Install Dependencies

```bash
npm install
```

### 2. Run All Tests

```bash
# Run both unit and integration tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests in watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### 3. Build the Project

```bash
# Build TypeScript
npm run build

# Build browser test suite
npm run build:test

# Build everything
npm run build:all
```

### 4. Test the Browser Interface

```bash
# Start development server
npm run serve:dev

# Or use auto-reload
npm run serve

# Visit http://localhost:3000/test.html
```

---

## Local Development Server

### Start the Server

```bash
# Development mode (port 3000)
npm run serve:dev

# Production mode
NODE_ENV=production npm run serve
```

### Test Endpoints

- **Main page**: http://localhost:3000/
- **Test page**: http://localhost:3000/test.html
- **Health check**: http://localhost:3000/health
- **API (list images)**: http://localhost:3000/api/images

---

## Server Requirements

Your friend's server should have:

- **OS**: Linux (Ubuntu 20.04+ or similar)
- **Node.js**: v18.x or v20.x
- **npm**: v9.x or higher
- **Memory**: Minimum 512MB, recommended 1GB+
- **Disk**: 1GB free space minimum
- **Optional**: Nginx (for reverse proxy and static file serving)
- **Optional**: PM2 (for process management)

---

## Initial Server Setup

### 1. Connect to the Server

```bash
ssh your-user@your-server.com
```

### 2. Install Node.js

```bash
# Using NodeSource repository (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 3. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Verify installation
pm2 --version
```

### 4. Install Nginx (Optional but Recommended)

```bash
sudo apt-get update
sudo apt-get install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 5. Create Deployment Directory

```bash
sudo mkdir -p /var/www/artorize-cdn
sudo chown $USER:$USER /var/www/artorize-cdn
cd /var/www/artorize-cdn
```

---

## Deployment Methods

### Method 1: Manual Deployment (Simplest)

Perfect for testing with your friend's server.

#### Step 1: Build Locally

```bash
cd /Users/leoli/WebstormProjects/artorize-cdn
npm install
npm run build:all
npm test  # Make sure tests pass
```

#### Step 2: Create Deployment Archive

```bash
tar -czf deploy.tar.gz \
  dist/ \
  server/ \
  test_data/ \
  package.json \
  package-lock.json \
  ecosystem.config.js \
  index.html \
  test.html \
  README.md
```

#### Step 3: Copy to Server

```bash
# Replace with your friend's server details
scp deploy.tar.gz user@server-ip:/var/www/artorize-cdn/

# Or use rsync for faster transfers
rsync -avz --progress deploy.tar.gz user@server-ip:/var/www/artorize-cdn/
```

#### Step 4: Deploy on Server

```bash
ssh user@server-ip

cd /var/www/artorize-cdn
tar -xzf deploy.tar.gz
npm ci --production  # Install production dependencies only

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Follow the instructions to setup auto-start
```

### Method 2: Automated Deployment Script

#### Step 1: Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
nano .env
```

Update with your server details:

```env
NODE_ENV=production
PORT=3000
DEPLOY_HOST=your-server-ip
DEPLOY_USER=your-username
DEPLOY_PATH=/var/www/artorize-cdn
```

#### Step 2: Setup SSH Key

```bash
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "deploy@artorize-cdn"

# Copy public key to server
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server-ip
```

#### Step 3: Deploy

```bash
# Deploy to staging
npm run deploy:staging

# Or deploy to production
npm run deploy:production
```

### Method 3: Git-based Deployment

#### Step 1: On the Server

```bash
ssh user@server-ip
cd /var/www/artorize-cdn

# Clone the repository
git clone <your-repo-url> .

# Or if already cloned, pull updates
git pull origin main

# Install dependencies
npm ci --production

# Build
npm run build:all

# Start/restart
pm2 restart ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
pm2 save
```

---

## Post-Deployment

### 1. Verify Deployment

```bash
# Check if server is running
curl http://localhost:3000/health

# Check PM2 status
pm2 status

# View logs
pm2 logs artorize-cdn

# Monitor in real-time
pm2 monit
```

### 2. Configure Nginx (Optional)

```bash
# Copy nginx configuration
sudo cp /var/www/artorize-cdn/nginx.conf /etc/nginx/sites-available/artorize-cdn

# Edit with your domain
sudo nano /etc/nginx/sites-available/artorize-cdn

# Enable the site
sudo ln -s /etc/nginx/sites-available/artorize-cdn /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 3. Setup SSL with Let's Encrypt (Optional)

```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d cdn.artorize.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

### 4. Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If not using Nginx, allow Node.js port
sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

---

## Monitoring & Maintenance

### PM2 Commands

```bash
# View all processes
pm2 list

# View logs
pm2 logs artorize-cdn
pm2 logs artorize-cdn --lines 100

# Restart
pm2 restart artorize-cdn

# Stop
pm2 stop artorize-cdn

# Delete from PM2
pm2 delete artorize-cdn

# Monitor resources
pm2 monit

# Save current process list
pm2 save
```

### System Logs

```bash
# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# System logs
journalctl -u nginx -f
```

### Health Checks

```bash
# Check server health
curl http://your-server-ip:3000/health

# Check with domain
curl https://cdn.artorize.com/health

# Load test (optional)
ab -n 1000 -c 10 http://your-server-ip:3000/health
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Or change port in ecosystem.config.js
```

### Permission Denied

```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/artorize-cdn

# Fix permissions
chmod -R 755 /var/www/artorize-cdn
```

### Module Not Found

```bash
# Reinstall dependencies
cd /var/www/artorize-cdn
rm -rf node_modules
npm install
```

### Server Won't Start

```bash
# Check PM2 logs
pm2 logs artorize-cdn --err

# Check Node.js version
node --version  # Should be 18.x or 20.x

# Manually run to see errors
cd /var/www/artorize-cdn
node server/index.js
```

### Nginx 502 Bad Gateway

```bash
# Check if Node.js is running
pm2 status

# Check Nginx configuration
sudo nginx -t

# Check firewall
sudo ufw status

# Restart services
pm2 restart artorize-cdn
sudo systemctl restart nginx
```

### Tests Failing

```bash
# Update dependencies
npm update

# Clear cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Run tests with verbose output
npm test -- --verbose
```

---

## Quick Deployment Checklist

For deploying to your friend's server:

- [ ] Server has Node.js 18+ installed
- [ ] PM2 installed globally
- [ ] Created `/var/www/artorize-cdn` directory
- [ ] Built project locally: `npm run build:all`
- [ ] All tests pass: `npm test`
- [ ] Created deployment archive: `tar -czf deploy.tar.gz ...`
- [ ] Copied archive to server: `scp deploy.tar.gz user@server:/var/www/artorize-cdn/`
- [ ] Extracted on server: `tar -xzf deploy.tar.gz`
- [ ] Installed dependencies: `npm ci --production`
- [ ] Started with PM2: `pm2 start ecosystem.config.js --env production`
- [ ] Saved PM2 config: `pm2 save`
- [ ] Setup auto-start: `pm2 startup`
- [ ] Verified deployment: `curl http://localhost:3000/health`
- [ ] Configured firewall if needed
- [ ] (Optional) Setup Nginx reverse proxy
- [ ] (Optional) Setup SSL certificate

---

## Support

If you encounter issues:

1. Check the logs: `pm2 logs artorize-cdn`
2. Verify health endpoint: `curl http://localhost:3000/health`
3. Review this guide's troubleshooting section
4. Check GitHub issues if using version control

Good luck with your deployment! 🚀
