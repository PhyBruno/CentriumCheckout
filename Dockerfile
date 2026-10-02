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

# Provisório, só para o beta: proxy apps→prototype rodado como serviço à parte,
# com esta mesma imagem (`deploy/beta/docker-stack.yml`). Não tem dependência
# além do Node e fica inerte se nada o chamar. Sai junto com o proxy.
COPY deploy/beta/erp-proxy.mjs ./deploy/beta/erp-proxy.mjs

USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
