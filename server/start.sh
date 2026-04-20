#!/usr/bin/env bash
set -e

# ============================================
# OpenGUI Server — 快速启动脚本
# ============================================

cd "$(dirname "$0")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --------------------------------------------------
# 1. 检查前置依赖
# --------------------------------------------------
command -v node >/dev/null 2>&1 || error "需要 Node.js 22+，请先安装"
command -v pnpm >/dev/null 2>&1 || error "需要 pnpm，运行: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || error "需要 Docker，请先安装"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 22 ]; then
  error "Node.js 版本需要 >= 22，当前: $(node -v)"
fi
info "Node.js $(node -v) / pnpm $(pnpm -v)"

# --------------------------------------------------
# 2. 启动 PostgreSQL + Redis (docker run)
# --------------------------------------------------
if docker ps --format '{{.Names}}' | grep -q "^opengui-postgres$"; then
  info "PostgreSQL 已在运行"
else
  warn "启动 PostgreSQL ..."
  docker rm -f opengui-postgres 2>/dev/null || true
  docker run -d \
    --name opengui-postgres \
    -p 5432:5432 \
    -e POSTGRES_USER=opengui \
    -e POSTGRES_PASSWORD=opengui \
    -e POSTGRES_DB=opengui \
    -v opengui-pgdata:/var/lib/postgresql/data \
    postgres:16-alpine >/dev/null
  echo -n "    等待 PostgreSQL 就绪 "
  for i in $(seq 1 30); do
    if docker exec opengui-postgres pg_isready -U opengui >/dev/null 2>&1; then
      echo ""
      info "PostgreSQL 就绪"
      break
    fi
    echo -n "."
    sleep 1
    if [ "$i" -eq 30 ]; then
      echo ""
      error "PostgreSQL 启动超时"
    fi
  done
fi

if docker ps --format '{{.Names}}' | grep -q "^opengui-redis$"; then
  info "Redis 已在运行"
else
  warn "启动 Redis ..."
  docker rm -f opengui-redis 2>/dev/null || true
  docker run -d \
    --name opengui-redis \
    -p 6379:6379 \
    -v opengui-redisdata:/data \
    redis:7-alpine >/dev/null
  info "Redis 已启动"
fi

# --------------------------------------------------
# 3. 环境变量
# --------------------------------------------------
ENV_FILE=apps/backend/.env
ENV_EXAMPLE=apps/backend/.env.example

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    warn ".env 已从 .env.example 创建，请编辑填入 API Key："
    warn "  文件位置: $ENV_FILE"
    warn "  CLAUDE_API_KEY, VLM_API_KEY, ANTHROPIC_API_KEY"
    warn "编辑完成后重新运行此脚本"
    exit 0
  else
    error "缺少 $ENV_EXAMPLE 文件"
  fi
fi

set -a; source "$ENV_FILE" 2>/dev/null || true; set +a

if [ -z "$CLAUDE_API_KEY" ]; then
  warn "CLAUDE_API_KEY 未设置，请编辑 .env"
fi

info ".env 已加载"

# --------------------------------------------------
# 4. 安装依赖
# --------------------------------------------------
if [ ! -d node_modules ]; then
  warn "安装依赖（首次较慢）..."
  pnpm install
else
  info "依赖已安装"
fi

# --------------------------------------------------
# 5. 生成 Prisma Client
# --------------------------------------------------
if [ ! -d packages/database/generated ]; then
  warn "生成 Prisma Client ..."
  pnpm --filter @repo/db db:generate
else
  info "Prisma Client 已生成"
fi

# --------------------------------------------------
# 6. 同步数据库 Schema
# --------------------------------------------------
TABLE_EXISTS=$(docker exec opengui-postgres psql -U opengui -d opengui -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users');" 2>/dev/null || echo "f")

if [ "$TABLE_EXISTS" != "t" ]; then
  warn "初始化数据库 Schema ..."
  pnpm --filter @repo/db exec prisma db push --accept-data-loss
  info "数据库 Schema 已同步"

  warn "导入 Agent 配置种子数据 ..."
  docker exec -i opengui-postgres psql -U opengui -d opengui \
    < packages/database/prisma/seed/system_prompt_config.sql
  info "Agent 配置已导入"

  warn "创建默认用户 ..."
  docker exec opengui-postgres psql -U opengui -d opengui -c "
    INSERT INTO users (id, name, email, \"emailVerified\", \"createdAt\", \"updatedAt\", role, tenant_id, is_deleted, is_active, region, finish_onboarding)
    VALUES (1, 'OpenGUI User', 'user@opengui.local', true, NOW(), NOW(), 'user', 0, false, true, 'CN', true)
    ON CONFLICT (id) DO NOTHING;
  "
  info "默认用户已创建"
else
  info "数据库已初始化"
fi

# --------------------------------------------------
# 7. 构建共享包
# --------------------------------------------------
if [ ! -d packages/database/dist ]; then
  warn "构建 @repo/db ..."
  pnpm --filter @repo/db build
else
  info "@repo/db 已构建"
fi

# --------------------------------------------------
# 8. 启动开发服务器
# --------------------------------------------------
info "启动 OpenGUI Server ..."
echo ""
echo "  API:  http://localhost:${PORT:-7777}/api"
echo "  Docs: http://localhost:${PORT:-7777}/docs"
echo ""

pnpm backend
