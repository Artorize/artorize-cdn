#!/usr/bin/env node

/**
 * Version CLI - Display current version information
 * Usage: npm run version
 */

import { getVersionInfo } from '../server/self-update.js';

async function displayVersion() {
  try {
    console.log('\n=== Artorize CDN Version Info ===\n');

    const versionInfo = await getVersionInfo();

    console.log(`  Name: ${versionInfo.name || 'artorize-cdn'}`);
    console.log(`  Version: ${versionInfo.version}`);
    console.log(`  Git Commit: ${versionInfo.gitCommit || 'unknown'}`);
    console.log(`  Git Commit (short): ${versionInfo.gitCommitShort || 'unknown'}`);
    console.log(`  Git Branch: ${versionInfo.gitBranch || 'unknown'}`);

    if (versionInfo.lastUpdate) {
      const lastUpdate = new Date(versionInfo.lastUpdate);
      const now = new Date();
      const timeDiff = Math.floor((now - lastUpdate) / 1000 / 60); // minutes

      let timeAgo;
      if (timeDiff < 1) {
        timeAgo = 'just now';
      } else if (timeDiff < 60) {
        timeAgo = `${timeDiff} minute${timeDiff > 1 ? 's' : ''} ago`;
      } else if (timeDiff < 1440) {
        const hours = Math.floor(timeDiff / 60);
        timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        const days = Math.floor(timeDiff / 1440);
        timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
      }

      console.log(`  Last Update: ${lastUpdate.toLocaleString()} (${timeAgo})`);
    } else {
      console.log(`  Last Update: never`);
    }

    if (versionInfo.description) {
      console.log(`\n  Description: ${versionInfo.description}`);
    }

    console.log('');
  } catch (error) {
    console.error('Error getting version info:', error.message);
    process.exit(1);
  }
}

displayVersion();
