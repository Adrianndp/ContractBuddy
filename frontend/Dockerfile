# Build stage: node 24 ships npm 11 (npm 9/10 crash on this dependency tree).
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Baked into the bundle at build time (Vite).
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Runtime stage: static files only, no Node.
FROM nginx:1-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Remove nginx's default welcome page (index.html, 50x.html), so only the app is served.
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/client /usr/share/nginx/html
