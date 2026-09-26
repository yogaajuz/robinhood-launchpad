# Multi-platform production Dockerfile for Robinhood Chain Launchpad
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (e.g. sqlite3)
RUN apk add --no-cache python3 make g++

# Copy root and backend package manifests
COPY package.json ./
COPY backend/package.json ./backend/

# Install dependencies
RUN npm install
RUN cd backend && npm install

# Copy application source code
COPY backend ./backend
COPY frontend ./frontend

# Create uploads directory and declare volume for persistent logo storage
RUN mkdir -p /app/backend/uploads
VOLUME ["/app/backend/uploads"]

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port for REST API, WebSockets, and Frontend UI
EXPOSE 3001

# Start monolith server (serves frontend + REST API + WebSockets)
CMD ["npm", "start"]
