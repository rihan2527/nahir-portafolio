# Simple static server using nginx
FROM nginx:alpine

# Copy all project files into the nginx web root
COPY . /usr/share/nginx/html

EXPOSE 80
