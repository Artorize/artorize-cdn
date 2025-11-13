#!/bin/bash
set -e

# Artorize CDN - One-line Deployment & Update Script
#
# Usage:
#   Initial deployment:
#     curl -sSL https://raw.githubusercontent.com/Artorize/artorize-cdn/main/scripts/deploy.sh | sudo bash
#
#   Update existing installation:
#     curl -sSL https://raw.githubusercontent.com/Artorize/artorize-cdn/main/scripts/deploy.sh | sudo bash
#
# The script automatically detects if this is a new installation or an update.
#
# Note: The CDN service also auto-updates on startup by checking GitHub for new commits.
# This script provides manual deployment/update control when needed.

echo "=== Artorize CDN Deployment & Update Script ==="
echo ""

# Configuration
INSTALL_DIR="/opt/artorize-cdn"
SERVICE_USER="artorize"
REPO_URL="https://github.com/Artorize/artorize-cdn.git"
NODE_VERSION="20"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root (use sudo)"
fi

info "Step 1/7: Checking system requirements..."

# Check OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
        warn "This script is designed for Ubuntu/Debian. Continuing anyway..."
    fi
else
    warn "Cannot detect OS version. Continuing anyway..."
fi

info "Step 2/7: Installing Node.js..."

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    info "Node.js not found. Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
else
    NODE_CURRENT=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_CURRENT" -lt "$NODE_VERSION" ]; then
        warn "Node.js version ${NODE_CURRENT} is older than ${NODE_VERSION}. Upgrading..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
    else
        info "Node.js $(node -v) already installed"
    fi
fi

# Install git if not present
if ! command -v git &> /dev/null; then
    info "Installing git..."
    apt-get update
    apt-get install -y git
fi

info "Step 3/7: Setting up application user..."

# Create service user if doesn't exist
if ! id -u "$SERVICE_USER" &>/dev/null; then
    info "Creating user ${SERVICE_USER}..."
    useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$SERVICE_USER"
else
    info "User ${SERVICE_USER} already exists"
fi

info "Step 4/7: Installing/updating repository..."

# Clone or update repository
if [ -d "$INSTALL_DIR/.git" ]; then
    info "Existing installation detected. Updating to latest version..."

    # Backup .env file if it exists
    if [ -f "$INSTALL_DIR/.env" ]; then
        info "Backing up .env file..."
        cp "$INSTALL_DIR/.env" /tmp/artorize-cdn.env.backup
        chmod 600 /tmp/artorize-cdn.env.backup
    fi

    # Stop service if running
    if systemctl is-active --quiet artorize-cdn.service; then
        info "Stopping service..."
        systemctl stop artorize-cdn.service
    fi

    # Clear the installation directory
    info "Clearing installation directory..."
    rm -rf "$INSTALL_DIR"

    # Clone fresh repository
    info "Cloning latest version..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    # Set proper ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

    # Restore .env file if it was backed up
    if [ -f /tmp/artorize-cdn.env.backup ]; then
        info "Restoring .env file..."
        mv /tmp/artorize-cdn.env.backup "$INSTALL_DIR/.env"
        chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
    fi

    info "✅ Updated to latest commit: $(sudo -u "$SERVICE_USER" git rev-parse --short HEAD)"
else
    info "New installation. Cloning repository..."

    # Clone repository as root to avoid parent directory permission issues
    # Then fix ownership of all files afterward
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    # Set proper ownership recursively for all cloned files
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

    info "✅ Cloned repository at commit: $(sudo -u "$SERVICE_USER" git rev-parse --short HEAD)"
fi

info "Step 5/7: Installing dependencies and building..."

# Install npm dependencies
sudo -u "$SERVICE_USER" npm install

# Build the project
sudo -u "$SERVICE_USER" npm run build:all

# Create .env file if it doesn't exist
if [ ! -f "$INSTALL_DIR/.env" ]; then
    info "Creating default .env file..."
    cat > "$INSTALL_DIR/.env" << 'EOF'
# Artorize CDN Configuration
NODE_ENV=production
PORT=3000
BACKEND_API_URL=http://localhost:3002
CORS_ORIGIN=*
SKIP_AUTO_UPDATE=false
EOF
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
    warn "Please edit /opt/artorize-cdn/.env to configure your backend URL"
fi

info "Step 6/7: Setting up systemd service with logging..."

# Create log directory
mkdir -p /var/log/artorize-cdn
chown "$SERVICE_USER:$SERVICE_USER" /var/log/artorize-cdn

# Create systemd service file
cat > /etc/systemd/system/artorize-cdn.service << EOF
[Unit]
Description=Artorize CDN - AI Art Protection System
After=network.target
Documentation=https://github.com/Artorize/artorize-cdn

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
EnvironmentFile=$INSTALL_DIR/.env

# Main service command
ExecStart=/usr/bin/node $INSTALL_DIR/server/index.js

# Logging configuration
StandardOutput=append:/var/log/artorize-cdn/access.log
StandardError=append:/var/log/artorize-cdn/error.log
SyslogIdentifier=artorize-cdn

# Restart policy
Restart=always
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/artorize-cdn $INSTALL_DIR/version.json

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

# Setup logrotate for log management
cat > /etc/logrotate.d/artorize-cdn << EOF
/var/log/artorize-cdn/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 $SERVICE_USER $SERVICE_USER
    sharedscripts
    postrotate
        systemctl reload artorize-cdn.service > /dev/null 2>&1 || true
    endscript
}
EOF

info "Step 7/7: Starting service..."

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable artorize-cdn.service

# Start or restart service
if systemctl is-active --quiet artorize-cdn.service; then
    info "Restarting service..."
    systemctl restart artorize-cdn.service
else
    info "Starting service..."
    systemctl start artorize-cdn.service
fi

# Wait a moment for service to start
sleep 2

# Check service status
if systemctl is-active --quiet artorize-cdn.service; then
    info "✅ Deployment successful!"
    echo ""
    echo "=== Service Information ==="
    echo "Status:       $(systemctl is-active artorize-cdn.service)"
    echo "Logs:         journalctl -u artorize-cdn.service -f"
    echo "Access Log:   tail -f /var/log/artorize-cdn/access.log"
    echo "Error Log:    tail -f /var/log/artorize-cdn/error.log"
    echo "Config:       $INSTALL_DIR/.env"
    echo ""
    echo "=== Useful Commands ==="
    echo "Start:        sudo systemctl start artorize-cdn"
    echo "Stop:         sudo systemctl stop artorize-cdn"
    echo "Restart:      sudo systemctl restart artorize-cdn"
    echo "Status:       sudo systemctl status artorize-cdn"
    echo "Logs:         sudo journalctl -u artorize-cdn -f"
    echo ""

    # Try to get version info
    sleep 1
    PORT=$(grep '^PORT=' "$INSTALL_DIR/.env" | cut -d'=' -f2)
    PORT=${PORT:-3000}

    if command -v curl &> /dev/null; then
        echo "=== Service Health Check ==="
        if curl -s "http://localhost:${PORT}/health" > /dev/null 2>&1; then
            echo "✅ Service is responding on port ${PORT}"
            echo "   Visit: http://localhost:${PORT}"
        else
            warn "Service may still be starting up. Check logs if it doesn't respond soon."
        fi
    fi

    echo ""
    warn "IMPORTANT: Edit $INSTALL_DIR/.env to configure your BACKEND_API_URL"
    warn "Then restart: sudo systemctl restart artorize-cdn"
else
    error "Service failed to start. Check logs: journalctl -u artorize-cdn.service -n 50"
fi
