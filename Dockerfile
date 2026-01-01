# Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/familytrack/
COPY style.css /usr/share/nginx/html/familytrack/
COPY app.js /usr/share/nginx/html/familytrack/
COPY manifest.json /usr/share/nginx/html/familytrack/
COPY sw.js /usr/share/nginx/html/familytrack/
COPY icon.png /usr/share/nginx/html/familytrack/
EXPOSE 80
