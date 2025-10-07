#!/usr/bin/env node

/**
 * Deployment script for Artorize CDN
 *
 * Usage:
 *   node scripts/deploy.js staging
 *   node scripts/deploy.js production
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV = process.argv[2] || 'staging';

if (!['staging', 'production'].includes(ENV)) {
  console.error('❌ Invalid environment. Use "staging" or "production"');
  process.exit(1);
}

console.log(`\n🚀 Deploying to ${ENV.toUpperCase()}...\n`);

async function runCommand(command, description) {
  console.log(`📦 ${description}...`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.log(`✅ ${description} complete\n`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...\n');

  // Check if dist directory exists
  const distPath = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist/ directory not found. Run "npm run build:all" first.');
    return false;
  }

  // Check if node_modules exists
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.error('❌ node_modules not found. Run "npm install" first.');
    return false;
  }

  console.log('✅ Prerequisites check passed\n');
  return true;
}

async function createDeploymentArchive() {
  console.log('📦 Creating deployment archive...\n');

  const files = [
    'dist/',
    'server/',
    'public/',
    'test_data/',
    'package.json',
    'package-lock.json',
    'ecosystem.config.js',
    'index.html',
    'test.html',
  ];

  const tarCommand = `tar -czf deploy-${ENV}.tar.gz ${files.filter(f => {
    const fullPath = path.join(__dirname, '..', f);
    return fs.existsSync(fullPath);
  }).join(' ')}`;

  return await runCommand(tarCommand, 'Creating archive');
}

async function uploadToServer() {
  // Load environment variables
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key] = value;
      }
    });
  }

  const host = process.env.DEPLOY_HOST;
  const user = process.env.DEPLOY_USER;
  const deployPath = process.env.DEPLOY_PATH;

  if (!host || !user || !deployPath) {
    console.log('⚠️  Deployment credentials not configured in .env');
    console.log('   Create a .env file with DEPLOY_HOST, DEPLOY_USER, and DEPLOY_PATH');
    console.log('   Skipping upload...\n');
    return true;
  }

  console.log(`📤 Uploading to ${user}@${host}:${deployPath}...\n`);

  const commands = [
    // Create directory if it doesn't exist
    `ssh ${user}@${host} "mkdir -p ${deployPath}"`,

    // Upload archive
    `scp deploy-${ENV}.tar.gz ${user}@${host}:${deployPath}/`,

    // Extract on server
    `ssh ${user}@${host} "cd ${deployPath} && tar -xzf deploy-${ENV}.tar.gz && rm deploy-${ENV}.tar.gz"`,

    // Install dependencies on server
    `ssh ${user}@${host} "cd ${deployPath} && npm ci --production"`,

    // Create logs directory
    `ssh ${user}@${host} "mkdir -p ${deployPath}/logs"`,
  ];

  for (const cmd of commands) {
    const success = await runCommand(cmd, `Executing: ${cmd.split(' ')[0]}`);
    if (!success) return false;
  }

  return true;
}

async function restartServer() {
  const host = process.env.DEPLOY_HOST;
  const user = process.env.DEPLOY_USER;
  const deployPath = process.env.DEPLOY_PATH;

  if (!host || !user || !deployPath) {
    console.log('⚠️  Server restart skipped (no deployment credentials)\n');
    return true;
  }

  console.log('🔄 Restarting server with PM2...\n');

  const pm2Commands = [
    // Install PM2 globally if not present
    `ssh ${user}@${host} "command -v pm2 || npm install -g pm2"`,

    // Restart or start application
    `ssh ${user}@${host} "cd ${deployPath} && pm2 restart ecosystem.config.js --env ${ENV} || pm2 start ecosystem.config.js --env ${ENV}"`,

    // Save PM2 process list
    `ssh ${user}@${host} "pm2 save"`,

    // Setup PM2 startup script
    `ssh ${user}@${host} "pm2 startup | tail -n 1 | bash || true"`,
  ];

  for (const cmd of pm2Commands) {
    await runCommand(cmd, `PM2: ${cmd.split(' ').slice(-3).join(' ')}`);
  }

  return true;
}

async function cleanupLocal() {
  console.log('🧹 Cleaning up local files...\n');
  const archivePath = path.join(__dirname, '..', `deploy-${ENV}.tar.gz`);
  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
    console.log('✅ Removed deployment archive\n');
  }
}

async function deploy() {
  try {
    // Step 1: Check prerequisites
    if (!await checkPrerequisites()) {
      process.exit(1);
    }

    // Step 2: Create deployment archive
    if (!await createDeploymentArchive()) {
      process.exit(1);
    }

    // Step 3: Upload to server
    if (!await uploadToServer()) {
      process.exit(1);
    }

    // Step 4: Restart server
    if (!await restartServer()) {
      process.exit(1);
    }

    // Step 5: Cleanup
    await cleanupLocal();

    console.log('✨ Deployment complete!\n');

    if (process.env.DEPLOY_HOST) {
      const port = ENV === 'production' ? 3000 : 3001;
      console.log(`🌐 Visit: http://${process.env.DEPLOY_HOST}:${port}`);
      console.log(`🏥 Health: http://${process.env.DEPLOY_HOST}:${port}/health\n`);
    }

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    await cleanupLocal();
    process.exit(1);
  }
}

deploy();
