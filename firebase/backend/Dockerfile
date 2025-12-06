# Multi-stage build for security and optimization
# Stage 1: Build stage
FROM node:22-alpine AS builder

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production stage
FROM node:22-alpine AS production

# Security: Install dumb-init to handle signals properly
# RUN apk add --no-cache dumb-init

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Security: Remove unnecessary files
RUN rm -rf .git .gitignore .env.example

# Security: Set proper permissions
RUN chmod -R 755 /app && \
    chmod -R 555 /app/node_modules

# Expose port
EXPOSE 5000

# Security: Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals
# ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]
