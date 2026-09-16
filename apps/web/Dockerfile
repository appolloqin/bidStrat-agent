FROM node:20-alpine AS build
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN pnpm install --filter ./packages/shared... --filter ./apps/web... --frozen-lockfile=false
RUN pnpm --filter @bidstrat/shared build
RUN pnpm --filter @bidstrat/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
