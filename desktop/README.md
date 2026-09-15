# 竞策智能体 — 桌面端（本地一体化 + 远程双模式）

把整个系统打包成一个可直接安装运行的桌面应用：本地模式下内嵌 Node.js 运行时，
启动后端服务并由其托管前端，数据落在用户目录；也可切换为连接远程控制台。

## 两种模式

| 模式 | 说明 |
|------|------|
| **本地（默认）** | 启动内嵌 Node，运行打包后的 NestJS 服务，SQLite 数据存于用户目录，前端由服务托管。开箱即用。 |
| **远程** | 仅作为壳，加载远程控制台 URL（菜单「模式 → 设置远程控制台地址…」）。 |

桌面端固定使用 **SQLite**，数据库文件（`data/bidstrat.db`）在首次启动时**自动创建**，
目录不存在会递归创建，表结构与种子数据自动完成，无需任何手工初始化。

数据目录（菜单「帮助 → 打开数据目录」）：

- Windows: `%APPDATA%/BidStratAgent/data`
- macOS: `~/Library/Application Support/BidStratAgent/data`
- Linux: `~/.config/BidStratAgent/data`

## 开发运行

```bash
# 1) 安装桌面端依赖
pnpm desktop:install

# 2) 生成运行时（构建 shared/server/web 并暂存到 desktop/runtime）
#    首次会 npm 安装后端生产依赖；可加 BIDSTRAT_SKIP_NODE=1 跳过内嵌 Node 下载
pnpm desktop:prepare

# 3) 启动桌面端（开发态用系统 node）
pnpm desktop:dev
```

## 打包安装包

```bash
# 生成当前平台安装包（Windows NSIS / macOS dmg / Linux AppImage+deb）
pnpm desktop:dist

# 或指定平台
npm --prefix desktop run dist:win
npm --prefix desktop run dist:mac
npm --prefix desktop run dist:linux
```

产物输出到 `desktop/release/`。

## 运行时结构

```
desktop/runtime/
  node/            内嵌 Node 运行时（可用 BIDSTRAT_SKIP_NODE=1 跳过）
  server/          NestJS 构建产物 + 生产依赖 + @bidstrat/shared
  web/             前端构建产物（由 server 通过 WEB_DIST 托管）
  manifest.json    构建元信息
```

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `BIDSTRAT_NODE_VERSION` | 内嵌 Node 版本 | `22.14.0` |
| `BIDSTRAT_SKIP_NODE` | 设为 `1` 跳过内嵌 Node（开发态用系统 node） | - |
| `BIDSTRAT_NODE_MIRROR` | Node 下载镜像前缀 | nodejs.org → npmmirror |
| `BIDSTRAT_CONSOLE_URL` | 远程模式默认控制台地址 | `http://localhost:3000` |

## 说明

- 前端静态资源由后端通过 `WEB_DIST` 环境变量挂载（含 SPA 回退），因此本地模式只需一个端口。
- 桌面端默认端口从 `3210` 起自动寻找空闲端口，避免冲突。
- `better-sqlite3` 为原生模块，需与内嵌 Node 主版本一致（默认同为 22.x）。
