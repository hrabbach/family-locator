#!/bin/sh

# Start Node.js server in the background
echo "Starting Node.js server..."
cd /app/server
node server.js &
NODE_PID=$!

# Start Nginx in the foreground
echo "Starting Nginx..."
nginx -g "daemon off;"
