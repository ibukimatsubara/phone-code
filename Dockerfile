# Stage 1: Build frontend
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npx vite build

# Stage 2: Production
FROM node:20-slim
RUN apt-get update && apt-get install -y tmux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist/
COPY server/ ./server/
EXPOSE 3000
CMD ["node", "server/index.js"]
