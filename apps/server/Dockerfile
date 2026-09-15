FROM node:20-alpine
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN pnpm install --filter ./packages/shared... --filter ./apps/server... --frozen-lockfile=false
RUN pnpm --filter @bidstrat/shared build
RUN pnpm --filter @bidstrat/server build
ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/main.js"]