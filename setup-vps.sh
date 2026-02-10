#!/bin/bash
set -e

echo "=== MathCam VPS Setup Script ==="
echo "Starting installation of dependencies..."

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18.x
echo "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
echo "Installing PostgreSQL..."
sudo apt-get install -y postgresql postgresql-contrib

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Install Cloudflared
echo "Installing Cloudflared..."
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
rm cloudflared-linux-amd64.deb

# Create project directory
echo "Creating project directory..."
mkdir -p /home/ubuntu/mathcam
mkdir -p /home/ubuntu/mathcam/backend
mkdir -p /home/ubuntu/mathcam/frontend
mkdir -p /home/ubuntu/mathcam/database

# Setup PostgreSQL
echo "Setting up PostgreSQL database..."
sudo -u postgres psql <<EOF
CREATE DATABASE mathcam;
CREATE USER mathcam_user WITH ENCRYPTED PASSWORD 'mathcam_secure_pass';
GRANT ALL PRIVILEGES ON DATABASE mathcam TO mathcam_user;
\c mathcam
GRANT ALL ON SCHEMA public TO mathcam_user;
EOF

echo "=== Setup Complete ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "PostgreSQL version: $(psql --version)"
echo "PM2 version: $(pm2 --version)"
echo "Cloudflared version: $(cloudflared --version)"
