# syntax=docker/dockerfile:1.7

# ---------- build stage: compile Vite bundle ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Vite reads VITE_* at build time and inlines them into the bundle.
# Pass via --build-arg to point the SPA at a specific API host. Default
# is `/api/v1`, which lets nginx (next stage) reverse-proxy to backend.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage: nginx serves dist/ + proxies /api ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
