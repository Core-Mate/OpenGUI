# ============================================
# Base stage - 基础镜像
# 使用 Debian slim 替代 Alpine，因为 Claude Agent SDK 的原生模块需要 glibc
# ============================================
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ============================================
# Prepare stage - 使用 turbo prune 生成精简的 monorepo
# ============================================
FROM base AS prepare
RUN npm install -g turbo@^2
COPY . .
# 生成只包含 backend 及其依赖的精简 monorepo
RUN turbo prune backend --docker

# ============================================
# Builder stage - 安装依赖并构建应用
# ============================================
FROM base AS builder

# 设置构建时所需的环境变量 (Prisma generate 需要，但不会真正连接)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# 首先复制 package.json 和 lockfile (变化较少,利用缓存)
COPY --from=prepare /app/out/json/ .

# 启用 corepack 并准备 pnpm (只需一次)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY --from=prepare /app/out/full/ .

# 生成 Prisma Client
RUN pnpm turbo db:generate --filter=@repo/db

# 构建应用
RUN pnpm turbo build --filter=backend

# 使用 pnpm deploy 创建独立部署包（解决 pnpm 符号链接问题）
RUN pnpm deploy --filter=backend --prod --legacy /app/deploy

# ============================================
# Runner stage - 运行阶段 (最小化镜像)
# ============================================
FROM base AS runner

# 创建非 root 用户
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs --create-home nestjs
USER nestjs

WORKDIR /app

# 从 pnpm deploy 输出复制独立部署包（包含所有依赖，无符号链接）
COPY --from=builder --chown=nestjs:nodejs /app/deploy/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/deploy/package.json ./

# 复制 @repo/db workspace 包到 node_modules（pnpm deploy 不包含构建产物）
# 包含: dist/ (编译输出), generated/ (Prisma Client), package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/dist ./node_modules/@repo/db/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/generated ./node_modules/@repo/db/generated
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/package.json ./node_modules/@repo/db/

ENV NODE_ENV=production
ENV PORT=7777

EXPOSE 7777

CMD ["node", "dist/main"]
