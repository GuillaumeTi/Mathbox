#!/bin/bash

# Mathbox - Universal Deployment Script
# This script automates the installation and deployment of the Mathbox platform.

set -e

# --- Configuration & Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Mathbox Deployment Script ===${NC}"

# --- 1. OS Detection ---
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}Error: Cannot detect OS.${NC}"
    exit 1
fi

echo -e "Detected OS: ${GREEN}$OS${NC}"

# --- 2. Dependency Installation ---
install_dependencies() {
    echo -e "${BLUE}Installing dependencies for $OS...${NC}"
    
    case $OS in
        ubuntu|debian)
            sudo apt-get update
            sudo apt-get install -y curl wget git postgresql postgresql-contrib build-essential
            # Install Node.js 18
            if ! command -v node &> /dev/null; then
                curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                sudo apt-get install -y nodejs
            fi
            ;;
        fedora|centos|rhel)
            sudo dnf update -y
            sudo dnf install -y curl wget git postgresql-server postgresql-contrib
            if ! command -v node &> /dev/null; then
                sudo dnf module install nodejs:18 -y
            fi
            # Initialize PG on RedHat-like systems if needed
            if [ ! -d "/var/lib/pgsql/data" ]; then
                sudo postgresql-setup --initdb
                sudo systemctl enable --now postgresql
            fi
            ;;
        *)
            echo -e "${RED}Unsupported OS: $OS. Please install nodejs, postgresql, and pm2 manually.${NC}"
            exit 1
            ;;
    esac

    # Install PM2
    if ! command -v pm2 &> /dev/null; then
        sudo npm install -g pm2
    fi
}

install_dependencies

# --- 3. Database Setup ---
setup_database() {
    echo -e "${BLUE}Setting up PostgreSQL...${NC}"
    
    # Check if database already exists
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw mathcam; then
        echo -e "${GREEN}Database 'mathcam' already exists.${NC}"
    else
        read -s -p "Enter a secure password for the database user (mathcam_user): " DB_PASS
        echo ""
        
        sudo -u postgres psql <<EOF
CREATE DATABASE mathcam;
CREATE USER mathcam_user WITH ENCRYPTED PASSWORD '$DB_PASS';
GRANT ALL PRIVILEGES ON DATABASE mathcam TO mathcam_user;
\c mathcam
GRANT ALL ON SCHEMA public TO mathcam_user;
EOF
        echo -e "${GREEN}Database setup completed.${NC}"
        
        # Save password for .env creation
        FINAL_DB_PASS=$DB_PASS
    fi
    
    # Import schema if it exists and database is empty
    if [ -f "database/init-db.sql" ]; then
        echo "Importing initial schema..."
        PGPASSWORD=$FINAL_DB_PASS psql -h localhost -U mathcam_user -d mathcam -f database/init-db.sql || true
    fi
}

setup_database

# --- 4. Environment Configuration ---
setup_env() {
    echo -e "${BLUE}Configuring Environment Variables...${NC}"
    
    # Backend .env
    if [ ! -f "backend/.env" ]; then
        echo "Configuring backend/.env..."
        read -p "LiveKit URL (ex: wss://mathcam.livekit.cloud): " LK_URL
        read -p "LiveKit API Key: " LK_KEY
        read -s -p "LiveKit API Secret: " LK_SECRET
        echo ""
        read -p "JWT Secret (press enter for random): " JWT_SEC
        JWT_SEC=${JWT_SEC:-$(openssl rand -hex 32)}
        
        cat <<EOF > backend/.env
PORT=3000
DB_URL=postgres://mathcam_user:$FINAL_DB_PASS@localhost:5432/mathcam
JWT_SECRET=$JWT_SEC
LIVEKIT_URL=$LK_URL
LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_SECRET=$LK_SECRET
NODE_ENV=production
EOF
        echo -e "${GREEN}backend/.env created.${NC}"
    fi

    # Frontend .env (if needed for build)
    if [ ! -f "frontend/.env" ]; then
        # Example: if frontend needs to know where the API is
        echo "VITE_API_URL=/api" > frontend/.env
    fi
}

setup_env

# --- 5. Application Deployment ---
deploy_app() {
    echo -e "${BLUE}Building and Deploying Application...${NC}"
    
    # Backend
    echo "Setting up backend..."
    cd backend
    npm install
    pm2 stop mathbox-backend 2>/dev/null || true
    pm2 start server.js --name "mathbox-backend"
    cd ..

    # Frontend
    echo "Setting up frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
    
    # Persist PM2 across reboots
    sudo pm2 startup | grep "sudo" | bash
    pm2 save
}

deploy_app

# --- 6. Cloudflare Tunnel (Optional) ---
setup_cloudflare() {
    read -p "Do you want to set up a Cloudflare Tunnel? (y/n): " SETUP_CF
    if [[ $SETUP_CF =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Setting up Cloudflare Tunnel...${NC}"
        
        if ! command -v cloudflared &> /dev/null; then
            echo "Installing cloudflared..."
            wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
            sudo dpkg -i cloudflared-linux-amd64.deb || sudo apt-get install -f -y
            rm cloudflared-linux-amd64.deb
        fi
        
        echo -e "${RED}Manual Step Required:${NC} Follow the link that appears to authenticate."
        cloudflared tunnel login
        
        read -p "Enter a name for your tunnel: " TUNNEL_NAME
        cloudflared tunnel create $TUNNEL_NAME
        TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')
        
        read -p "Enter your domain name (ex: tutorat.mondomaine.com): " DOMAIN
        cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN
        
        # Create config file
        mkdir -p ~/.cloudflared
        cat <<EOF > ~/.cloudflared/config.yml
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF
        
        # Install as a background service
        sudo cloudflared service install
        sudo systemctl start cloudflared
        sudo systemctl enable cloudflared
        
        echo -e "${GREEN}Cloudflare Tunnel setup completed and persistent.${NC}"
    fi
}

setup_cloudflare

echo -e "${GREEN}=== Deployment Successful! ===${NC}"
echo -e "Your application is running via PM2."
echo -e "Check status with: ${BLUE}pm2 status${NC}"
echo -e "Check logs with: ${BLUE}pm2 logs mathbox-backend${NC}"
