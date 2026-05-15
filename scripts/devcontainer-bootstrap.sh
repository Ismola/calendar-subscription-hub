#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-create}"
STATE_DIR=".devcontainer"
WORKER_PID_FILE="$STATE_DIR/dev-worker.pid"
WORKER_LOG_FILE="$STATE_DIR/dev-worker.log"

ensure_state_dir() {
    mkdir -p "$STATE_DIR"
}

start_dependencies() {
    docker compose up -d postgres redis asismetro-automations
}

install_dependencies_if_missing() {
    if [[ ! -d node_modules ]]; then
        npm ci
    fi
}

worker_running() {
    if [[ -f "$WORKER_PID_FILE" ]]; then
        local pid
        pid="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi

    local existing_pid
    existing_pid="$(pgrep -f "tsx watch src/worker/index.ts" | head -n 1 || true)"
    if [[ -n "$existing_pid" ]]; then
        echo "$existing_pid" > "$WORKER_PID_FILE"
        return 0
    fi

    return 1
}

start_worker_if_needed() {
    if worker_running; then
        echo "[devcontainer] Worker already running"
        return
    fi

    nohup npm run dev:worker > "$WORKER_LOG_FILE" 2>&1 &
    echo "$!" > "$WORKER_PID_FILE"
    echo "[devcontainer] Worker started (pid $(cat "$WORKER_PID_FILE"))"
}

run_migrations() {
    npm run prisma:migrate:deploy
}

main() {
    ensure_state_dir
    start_dependencies

    case "$MODE" in
        create)
            npm ci
            run_migrations
            start_worker_if_needed
            ;;
        start)
            install_dependencies_if_missing
            run_migrations
            start_worker_if_needed
            ;;
        *)
            echo "Usage: $0 [create|start]" >&2
            exit 1
            ;;
    esac
}

main