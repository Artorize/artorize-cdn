import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const versionFile = path.join(rootDir, 'version.json');

/**
 * Get current git information
 */
async function getGitInfo() {
  try {
    const { stdout: commit } = await execAsync('git rev-parse HEAD', { cwd: rootDir });
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir });

    return {
      commit: commit.trim(),
      branch: branch.trim()
    };
  } catch (error) {
    console.warn('Warning: Unable to get git information:', error.message);
    return { commit: null, branch: null };
  }
}

/**
 * Read version.json file
 */
async function readVersionFile() {
  try {
    const content = await fs.readFile(versionFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // If file doesn't exist or is invalid, return default
    return {
      version: '1.0.0',
      lastUpdate: null,
      gitCommit: null,
      gitBranch: null
    };
  }
}

/**
 * Write version.json file
 */
async function writeVersionFile(data) {
  try {
    await fs.writeFile(versionFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing version file:', error.message);
  }
}

/**
 * Check if there are updates available
 */
async function checkForUpdates() {
  try {
    // Fetch latest changes
    console.log('Checking for updates...');
    await execAsync('git fetch origin', { cwd: rootDir });

    // Get current and remote commit hashes
    const { stdout: localCommit } = await execAsync('git rev-parse HEAD', { cwd: rootDir });
    const { stdout: remoteCommit } = await execAsync('git rev-parse @{u}', { cwd: rootDir });

    const hasUpdates = localCommit.trim() !== remoteCommit.trim();

    return {
      hasUpdates,
      localCommit: localCommit.trim(),
      remoteCommit: remoteCommit.trim()
    };
  } catch (error) {
    console.warn('Warning: Unable to check for updates:', error.message);
    return { hasUpdates: false, error: error.message };
  }
}

/**
 * Perform git pull to get latest changes
 */
async function pullUpdates() {
  try {
    console.log('Pulling latest changes...');
    const { stdout, stderr } = await execAsync('git pull', { cwd: rootDir });

    if (stderr && stderr.includes('error')) {
      throw new Error(stderr);
    }

    console.log('Git pull completed:', stdout.trim());
    return { success: true, output: stdout.trim() };
  } catch (error) {
    console.error('Error pulling updates:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Rebuild the application
 */
async function rebuild() {
  try {
    console.log('Rebuilding application...');
    const { stdout, stderr } = await execAsync('npm run build:all', { cwd: rootDir });

    if (stderr && stderr.includes('error')) {
      console.warn('Build warnings:', stderr);
    }

    console.log('Build completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Error during rebuild:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Perform self-update: check for updates, pull, and rebuild
 */
export async function performSelfUpdate(options = {}) {
  const { force = false, skipBuild = false } = options;

  console.log('=== Starting Self-Update Process ===');

  try {
    // Get current git info
    const gitInfo = await getGitInfo();

    // Check for updates
    const updateCheck = await checkForUpdates();

    if (!updateCheck.hasUpdates && !force) {
      console.log('Already up to date!');

      // Update version file with current info even if no updates
      const versionData = await readVersionFile();
      versionData.gitCommit = gitInfo.commit;
      versionData.gitBranch = gitInfo.branch;
      await writeVersionFile(versionData);

      return {
        updated: false,
        message: 'Already up to date',
        currentCommit: gitInfo.commit
      };
    }

    console.log(`Updates available! Local: ${updateCheck.localCommit?.substring(0, 7)}, Remote: ${updateCheck.remoteCommit?.substring(0, 7)}`);

    // Pull updates
    const pullResult = await pullUpdates();
    if (!pullResult.success) {
      return {
        updated: false,
        error: 'Failed to pull updates',
        details: pullResult.error
      };
    }

    // Rebuild if not skipped
    if (!skipBuild) {
      const buildResult = await rebuild();
      if (!buildResult.success) {
        console.warn('Build failed, but update was pulled successfully');
      }
    }

    // Get updated git info
    const newGitInfo = await getGitInfo();

    // Update version file
    const versionData = await readVersionFile();
    versionData.lastUpdate = new Date().toISOString();
    versionData.gitCommit = newGitInfo.commit;
    versionData.gitBranch = newGitInfo.branch;
    await writeVersionFile(versionData);

    console.log('=== Self-Update Completed Successfully ===');

    return {
      updated: true,
      message: 'Update completed successfully',
      previousCommit: updateCheck.localCommit,
      currentCommit: newGitInfo.commit,
      lastUpdate: versionData.lastUpdate
    };

  } catch (error) {
    console.error('Self-update failed:', error.message);
    return {
      updated: false,
      error: 'Self-update failed',
      details: error.message
    };
  }
}

/**
 * Get current version information
 */
export async function getVersionInfo() {
  try {
    // Read package.json for version
    const packageJson = JSON.parse(
      await fs.readFile(path.join(rootDir, 'package.json'), 'utf8')
    );

    // Read version.json
    const versionData = await readVersionFile();

    // Get current git info
    const gitInfo = await getGitInfo();

    return {
      version: packageJson.version,
      lastUpdate: versionData.lastUpdate,
      gitCommit: gitInfo.commit || versionData.gitCommit,
      gitCommitShort: (gitInfo.commit || versionData.gitCommit)?.substring(0, 7),
      gitBranch: gitInfo.branch || versionData.gitBranch,
      name: packageJson.name,
      description: packageJson.description
    };
  } catch (error) {
    console.error('Error getting version info:', error.message);
    return {
      version: '1.0.0',
      error: error.message
    };
  }
}

/**
 * Initialize version file on first run
 */
export async function initializeVersionFile() {
  try {
    const gitInfo = await getGitInfo();
    const packageJson = JSON.parse(
      await fs.readFile(path.join(rootDir, 'package.json'), 'utf8')
    );

    const versionData = {
      version: packageJson.version,
      lastUpdate: new Date().toISOString(),
      gitCommit: gitInfo.commit,
      gitBranch: gitInfo.branch
    };

    await writeVersionFile(versionData);
    console.log('Version file initialized');
  } catch (error) {
    console.error('Error initializing version file:', error.message);
  }
}
