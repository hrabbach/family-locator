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
# Ensure the target directory exists
RUN mkdir -p /usr/share/nginx/html/familytrack/

COPY index.html /usr/share/nginx/html/familytrack/
COPY style.css /usr/share/nginx/html/familytrack/
COPY app.js /usr/share/nginx/html/familytrack/
COPY manifest.json /usr/share/nginx/html/familytrack/
COPY sw.js /usr/share/nginx/html/familytrack/
COPY icon.png /usr/share/nginx/html/familytrack/
COPY style.json /usr/share/nginx/html/familytrack/

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
