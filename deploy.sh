#!/bin/sh
# Deploy to a Linux server over SSH:  ./deploy.sh ubuntu@<server-ip>
# Copies the code and .env, then builds and restarts one Docker container on port 80.
# Data survives redeploys in the "pills-data" Docker volume.
set -eu
TARGET=${1:?usage: ./deploy.sh user@server-ip}
SSH="ssh -o StrictHostKeyChecking=accept-new"
cd "$(dirname "$0")"
tar czf - --exclude=./node_modules --exclude=./dist --exclude=./data --exclude=./.git --exclude=./.impeccable . |
  $SSH "$TARGET" 'mkdir -p ~/intelligence-pills && tar xzf - -C ~/intelligence-pills'
$SSH "$TARGET" 'set -e
  command -v docker >/dev/null || curl -fsSL https://get.docker.com | sudo sh
  cd ~/intelligence-pills
  sudo docker build -t intelligence-pills .
  sudo docker rm -f intelligence-pills 2>/dev/null || true
  sudo docker run -d --name intelligence-pills --restart unless-stopped -p 80:8080 \
    --env-file .env -v pills-data:/app/data intelligence-pills'
echo "Deployed: http://${TARGET#*@}"
