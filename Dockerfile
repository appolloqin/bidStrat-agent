# 单镜像：NestJS API + 静态前端（与 pnpm dev 同端口模型）
FROM node:20-alpine
WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate \
  && pnpm install --filter ./packages/shared... --filter ./apps/server... --filter ./apps/web... --frozen-lockfile=false \
  && pnpm --filter @bidstrat/shared build \
  && pnpm --filter @bidstrat/web build \
  && pnpm --filter @bidstrat/server build

ENV NODE_ENV=production
ENV WEB_DIST=/app/apps/web/dist
ENV UPLOAD_DIR=/app/uploads

WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/main.js"]
