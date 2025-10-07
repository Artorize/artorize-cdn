/**
 * PM2 Configuration for Artorize CDN
 *
 * Deploy with:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 start ecosystem.config.js --env staging
 */

export default {
  apps: [
    {
      name: 'artorize-cdn',
      script: './server/index.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],

  deploy: {
    production: {
      user: process.env.DEPLOY_USER || 'deploy',
      host: process.env.DEPLOY_HOST || 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/artorize-cdn.git',
      path: process.env.DEPLOY_PATH || '/var/www/artorize-cdn',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build:all && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
    staging: {
      user: process.env.DEPLOY_USER || 'deploy',
      host: process.env.DEPLOY_HOST || 'staging.your-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/artorize-cdn.git',
      path: '/var/www/artorize-cdn-staging',
      'post-deploy': 'npm install && npm run build:all && pm2 reload ecosystem.config.js --env staging',
    },
  },
};
