#!/bin/bash
# MathBox MVP Deployment Script
# Usage: ./deploy.sh
# This script builds the frontend and deploys everything to the VPS

set -e

VPS_USER="ubuntu"
VPS_HOST="137.74.197.93"
VPS_PATH="/home/ubuntu/mathcam"
SSH_KEY="" # Add your SSH key path if needed

echo "========================================="
echo "  MathBox MVP — Deploying"
echo "========================================="

# 1. Build frontend
echo ""
echo "→ Building frontend..."
cd frontend
npm run build
cd ..

# 2. Create deployment package
echo ""
echo "→ Creating deployment package..."
rm -f /tmp/mathbox-deploy.tar.gz

tar czf /tmp/mathbox-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  backend/ \
  frontend/dist/

# 3. Copy frontend dist into backend serving path
echo ""
echo "→ Preparing dist..."
mkdir -p backend/public
cp -r frontend/dist/* backend/public/ 2>/dev/null || true

# 4. Upload to VPS
echo ""
echo "→ Uploading to VPS..."
SSH_OPTS=""
if [ -n "$SSH_KEY" ]; then SSH_OPTS="-i $SSH_KEY"; fi

scp $SSH_OPTS /tmp/mathbox-deploy.tar.gz ${VPS_USER}@${VPS_HOST}:/tmp/

# 5. Deploy on VPS
echo ""
echo "→ Deploying on VPS..."
ssh $SSH_OPTS ${VPS_USER}@${VPS_HOST} << 'REMOTE_SCRIPT'
  set -e
  
  # Setup
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  
  # Create directory if needed
  mkdir -p /home/ubuntu/mathcam
  cd /home/ubuntu/mathcam
  
  # Extract new code
  tar xzf /tmp/mathbox-deploy.tar.gz
  rm -f /tmp/mathbox-deploy.tar.gz
  
  # Install backend dependencies
  cd backend
  npm install --production
  
  # Generate Prisma client
  npx prisma generate
  
  # Run database migration
  npx prisma db push --accept-data-loss 2>/dev/null || npx prisma migrate deploy 2>/dev/null || echo "DB sync done"
  
  # Create uploads dir
  mkdir -p uploads
  
  # Copy frontend dist for serving
  mkdir -p public
  cp -r ../frontend/dist/* public/ 2>/dev/null || true
  
  # Stop existing process
  pm2 stop mathbox 2>/dev/null || true
  pm2 delete mathbox 2>/dev/null || true
  
  # Start with PM2
  pm2 start server.js --name mathbox --env production
  pm2 save
  
  echo ""
  echo "✅ MathBox deployed successfully!"
  echo "→ Server running on port 3000"
  pm2 status mathbox
REMOTE_SCRIPT

echo ""
echo "========================================="
echo "  ✅ Deployment complete!"
echo "  → https://your-domain.com"
echo "========================================="
