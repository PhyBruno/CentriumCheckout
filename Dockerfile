# Build multi-stage: compila a SPA (Vite) + o BFF (esbuild) e serve os dois
# a partir de um único processo Node (`.specs/codebase/ARCHITECTURE.md`, AD-022).

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
