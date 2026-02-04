# Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
FROM nginx:alpine

# Install Node.js and npm
RUN apk add --no-cache nodejs npm

# Setup Server
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --production
COPY server/server.js ./

# Setup Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Setup Client
# Copy files to root html directory
WORKDIR /usr/share/nginx/html
COPY index.html ./
COPY style.css ./
COPY app.js ./
COPY manifest.json ./
COPY sw.js ./
COPY icon.png ./
COPY style.json ./

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
