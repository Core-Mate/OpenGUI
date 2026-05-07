#!/usr/bin/env bash
set -e

# ============================================
# OpenGUI Server — quick start script
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
# 1. Check prerequisites
# --------------------------------------------------
command -v node >/dev/null 2>&1 || error "Node.js 22+ is required. Please install it first."
command -v pnpm >/dev/null 2>&1 || error "pnpm is required. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || error "Docker is required. Please install it first."

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 22 ]; then
  error "Node.js version must be >= 22. Current: $(node -v)"
fi
info "Node.js $(node -v) / pnpm $(pnpm -v)"

# --------------------------------------------------
# 2. Start PostgreSQL + Redis (docker run)
# --------------------------------------------------
POSTGRES_HOST_PORT=55432
REDIS_HOST_PORT=56379

if docker ps --format '{{.Names}}' | grep -q "^opengui-postgres$"; then
  if docker port opengui-postgres 5432/tcp 2>/dev/null | grep -q ":${POSTGRES_HOST_PORT}$"; then
    info "PostgreSQL is already running"
  else
    warn "Recreating PostgreSQL with host port ${POSTGRES_HOST_PORT} ..."
    docker rm -f opengui-postgres >/dev/null
  fi
fi

if ! docker ps --format '{{.Names}}' | grep -q "^opengui-postgres$"; then
  warn "Starting PostgreSQL ..."
  docker rm -f opengui-postgres 2>/dev/null || true
  docker run -d \
    --name opengui-postgres \
    -p ${POSTGRES_HOST_PORT}:5432 \
    -e POSTGRES_USER=opengui \
    -e POSTGRES_PASSWORD=opengui \
    -e POSTGRES_DB=opengui \
    -v opengui-pgdata:/var/lib/postgresql/data \
    postgres:16-alpine >/dev/null
  echo -n "    Waiting for PostgreSQL "
  for i in $(seq 1 30); do
    if docker exec opengui-postgres pg_isready -U opengui >/dev/null 2>&1; then
      echo ""
      info "PostgreSQL is ready"
      break
    fi
    echo -n "."
    sleep 1
    if [ "$i" -eq 30 ]; then
      echo ""
      error "PostgreSQL startup timed out"
    fi
  done
fi

if docker ps --format '{{.Names}}' | grep -q "^opengui-redis$"; then
  if docker port opengui-redis 6379/tcp 2>/dev/null | grep -q ":${REDIS_HOST_PORT}$"; then
    info "Redis is already running"
  else
    warn "Recreating Redis with host port ${REDIS_HOST_PORT} ..."
    docker rm -f opengui-redis >/dev/null
  fi
fi

if ! docker ps --format '{{.Names}}' | grep -q "^opengui-redis$"; then
  warn "Starting Redis ..."
  docker rm -f opengui-redis 2>/dev/null || true
  docker run -d \
    --name opengui-redis \
    -p ${REDIS_HOST_PORT}:6379 \
    -v opengui-redisdata:/data \
    redis:7-alpine >/dev/null
  info "Redis started"
fi

# --------------------------------------------------
# 3. Environment variables
# --------------------------------------------------
ENV_FILE=apps/backend/.env
ENV_EXAMPLE=apps/backend/.env.example

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    warn ".env was created from .env.example. Please edit it and add your API keys:"
    warn "  File: $ENV_FILE"
    warn "  VLM_API_KEY, VLM_BASE_URL, VLM_MODEL"
    warn "Run this script again after editing the file."
    exit 0
  else
    error "Missing $ENV_EXAMPLE"
  fi
fi

set -a; source "$ENV_FILE" 2>/dev/null || true; set +a

if [ -z "$VLM_API_KEY" ]; then
  warn "VLM_API_KEY is not set. Please edit .env."
fi

if [ -z "$VLM_MODEL" ]; then
  warn "VLM_MODEL is not set. Please edit .env."
fi

if [ -z "$VLM_BASE_URL" ]; then
  warn "VLM_BASE_URL is not set. Please edit .env."
fi

info ".env loaded"

# --------------------------------------------------
# 4. Install dependencies
# --------------------------------------------------
if [ ! -d node_modules ]; then
  warn "Installing dependencies. This can take a while on the first run ..."
  pnpm install
else
  info "Dependencies are already installed"
fi

# --------------------------------------------------
# 5. Generate Prisma Client
# --------------------------------------------------
if [ ! -d packages/database/generated ]; then
  warn "Generating Prisma Client ..."
  pnpm --filter @repo/db db:generate
else
  info "Prisma Client already generated"
fi

# --------------------------------------------------
# 6. Sync database schema
# --------------------------------------------------
TABLE_EXISTS=$(docker exec opengui-postgres psql -U opengui -d opengui -tAc \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users');" 2>/dev/null || echo "f")

if [ "$TABLE_EXISTS" != "t" ]; then
  warn "Initializing database schema ..."
  pnpm --filter @repo/db exec prisma db push --accept-data-loss
  info "Database schema synced"

  warn "Importing Agent configuration seed data ..."
  docker exec -i opengui-postgres psql -U opengui -d opengui \
    < packages/database/prisma/seed/system_prompt_config.sql
  info "Agent configuration imported"

  warn "Creating default user ..."
  docker exec opengui-postgres psql -U opengui -d opengui -c "
    INSERT INTO users (id, name, email, \"emailVerified\", \"createdAt\", \"updatedAt\", role, tenant_id, is_deleted, is_active, region, finish_onboarding)
    VALUES (1, 'OpenGUI User', 'user@opengui.local', true, NOW(), NOW(), 'user', 0, false, true, 'CN', true)
    ON CONFLICT (id) DO NOTHING;
  "
  info "Default user created"
else
  info "Database already initialized"
fi

warn "Syncing default client app mappings ..."
docker exec opengui-postgres psql -U opengui -d opengui -c "
  INSERT INTO app_config (config_key, config_value, description, is_active, is_deleted, created_at, updated_at)
  VALUES (
    'supportApp',
    '[
      {\"appName\":\"browser\",\"package\":\"com.heytap.browser\"},
      {\"appName\":\"\\u6d4f\\u89c8\\u5668\",\"package\":\"com.heytap.browser\"},
      {\"appName\":\"chrome\",\"package\":\"com.android.chrome\"},
      {\"appName\":\"google chrome\",\"package\":\"com.android.chrome\"},
      {\"appName\":\"\\u8c37\\u6b4c\\u6d4f\\u89c8\\u5668\",\"package\":\"com.android.chrome\"},
      {\"appName\":\"bilibili\",\"package\":\"tv.danmaku.bili\"},
      {\"appName\":\"bilbil\",\"package\":\"tv.danmaku.bili\"},
      {\"appName\":\"bili\",\"package\":\"tv.danmaku.bili\"},
      {\"appName\":\"b\\u7ad9\",\"package\":\"tv.danmaku.bili\"},
      {\"appName\":\"\\u54d4\\u54e9\\u54d4\\u54e9\",\"package\":\"tv.danmaku.bili\"},
      {\"appName\":\"wechat\",\"package\":\"com.tencent.mm\"},
      {\"appName\":\"\\u5fae\\u4fe1\",\"package\":\"com.tencent.mm\"},
      {\"appName\":\"douyin\",\"package\":\"com.ss.android.ugc.aweme\"},
      {\"appName\":\"tiktok\",\"package\":\"com.ss.android.ugc.aweme\"},
      {\"appName\":\"\\u6296\\u97f3\",\"package\":\"com.ss.android.ugc.aweme\"}
    ]'::jsonb,
    'Client app launch aliases',
    true,
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    is_active = true,
    is_deleted = false,
    updated_at = NOW();
"
info "Default client app mappings synced"

# --------------------------------------------------
# 7. Build shared packages
# --------------------------------------------------
if [ ! -d packages/database/dist ]; then
  warn "Building @repo/db ..."
  pnpm --filter @repo/db build
else
  info "@repo/db already built"
fi

# --------------------------------------------------
# 8. Start development server
# --------------------------------------------------
info "Starting OpenGUI Server ..."
echo ""
echo "  The backend will print API docs and GitHub star links after startup."
echo ""

pnpm backend
