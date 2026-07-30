# VoxDesk - AI Voice Receptionist
# Zero runtime dependencies: we run TypeScript directly via Node's built-in
# type-stripping, so there is no build step and no node_modules to install.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Copy source. (No `npm install` — the app uses only Node built-ins.)
COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public

# The app listens on $PORT (default 3000).
EXPOSE 3000

# Run directly from TypeScript. Requires Node >= 22.6 (type stripping).
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/index.ts"]
