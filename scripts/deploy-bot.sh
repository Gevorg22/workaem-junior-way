#!/usr/bin/env bash
# Заливает исходники бота на ВМ. Сборка образа - уже там, как и у основного
# приложения: реестра образов нет.
set -euo pipefail

HOST="${DEPLOY_HOST:-workaem@111.88.152.219}"
DIR="${BOT_PATH:-/home/workaem/deploy/junior-way-bot}"

echo "Заливаю бота на $HOST:$DIR"
ssh "$HOST" "mkdir -p '$DIR'"
rsync -az --delete server/ "$HOST:$DIR/"

echo "Готово. Дальше на сервере:"
echo "  cd /home/workaem/deploy && docker compose up -d --build bot"
