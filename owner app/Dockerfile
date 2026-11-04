FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css script.js config.js manifest.json sw.js icon.svg /usr/share/nginx/html/
COPY icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png fenix-logo-png.png /usr/share/nginx/html/
EXPOSE 80
