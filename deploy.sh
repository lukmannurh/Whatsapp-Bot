#!/usr/bin/env bash
# deploy.sh — Safe deploy for Docker Compose app
# Usage:
#   ./deploy.sh                # deploy branch 'main'
#   ./deploy.sh feature/xyz   # deploy specific branch
#
# Env overrides (optional):
#   COMPOSE_BIN="docker compose" HEALTH_URL="http://localhost:3000/health" ./deploy.sh
set -Eeuo pipefail

BRANCH="${1:-main}"
COMPOSE_BIN="${COMPOSE_BIN:-docker compose}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="/tmp/wwebjs-bot.deploy.lock"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-3}"

log()  { printf "\033[1;34m[deploy]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[error]\033[0m %s\n" "$*"; }

require_bin() { command -v "$1" >/dev/null 2>&1 || { err "Required binary '$1' not found"; exit 127; }; }

cleanup() {
  rc=$?
  if [[ -n "${LOCK_FD:-}" ]]; then flock -u "${LOCK_FD}" || true; fi
  exit "$rc"
}
trap cleanup EXIT

# Acquire lock to prevent concurrent deploys
exec {LOCK_FD}>"$LOCK_FILE"
if ! flock -n "${LOCK_FD}"; then
  err "Another deploy is running (lock: $LOCK_FILE)."
  exit 1
fi

cd "$PROJECT_DIR"

# Pre-flight checks
require_bin git
require_bin docker
require_bin curl

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon not available. Is the service running?"; exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  err "docker-compose.yml not found in $PROJECT_DIR"; exit 1
fi

if [[ ! -f .env ]]; then
  warn ".env not found. Copy .env.example to .env and adjust values before deploying."
  exit 1
fi

git config --global --add safe.directory "$PROJECT_DIR" || true

log "[1/6] Fetching latest refs"
git fetch --all --prune

log "[2/6] Checkout branch: $BRANCH"
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git checkout "$BRANCH"
else
  err "Remote branch 'origin/$BRANCH' not found"; exit 1
fi

log "[3/6] Pull with rebase (linear history)"
git pull --rebase origin "$BRANCH"

log "[4/6] Build image (pull latest base)"
$COMPOSE_BIN build --pull

log "[5/6] Deploy containers (detached)"
$COMPOSE_BIN up -d

if docker image ls -f dangling=true -q | grep -q .; then
  log "Pruning dangling images"
  docker image prune -f || true
fi

log "[6/6] Health check: $HEALTH_URL (timeout: ${HEALTH_TIMEOUT}s)"
SECS=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if (( SECS >= HEALTH_TIMEOUT )); then
    err "Health check failed after ${HEALTH_TIMEOUT}s. Check logs: 'docker logs -f wwebjs-bot'"
    exit 1
  fi
  sleep "$HEALTH_INTERVAL"
  SECS=$((SECS + HEALTH_INTERVAL))
done

log "Deploy OK on branch '$BRANCH'"
$COMPOSE_BIN ps
