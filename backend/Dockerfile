# Build stage
FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile
COPY backend ./backend
RUN pnpm --dir backend build

FROM builder AS migrator
WORKDIR /app
CMD ["pnpm", "--dir", "backend", "db:push"]

# Production stage
FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY backend/package.json ./backend/
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/backend/dist ./backend/dist
WORKDIR /app/backend
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
