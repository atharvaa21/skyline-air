# Skyline Air is a static website (HTML + CSS + JS), so the simplest
# production-grade way to serve it is the official nginx web server image.
FROM nginx:stable-alpine

# Copy our page into the folder nginx serves files from
COPY index.html /usr/share/nginx/html/index.html

# nginx listens on port 80 inside the container
EXPOSE 80

# (The base image already starts nginx, so no CMD is needed.)
