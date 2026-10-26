# Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the frontend (Vite) + gateway bundle, then drop dev-only packages
RUN npm run build && npm prune --omit=dev

# Production Stage
FROM node:20-slim

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Expose the gateway port
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=5000

USER node

# Run the gateway
CMD ["npm", "run", "start"]
