#!/usr/bin/env bash
# Выкладка на сервер. Адрес и путь берутся из окружения:
#   DEPLOY_HOST=user@server DEPLOY_PATH=/var/www/junior-way npm run deploy
set -euo pipefail

HOST="${DEPLOY_HOST:-}"
PATH_ON_SERVER="${DEPLOY_PATH:-/var/www/junior-way}"

if [ -z "$HOST" ]; then
  echo "Не задан DEPLOY_HOST." >&2
  echo "Пример: DEPLOY_HOST=user@server npm run deploy" >&2
  exit 1
fi

echo "Сборка..."
npm run build

echo "Выкладка на $HOST:$PATH_ON_SERVER"
rsync -az --delete --human-readable dist/ "$HOST:$PATH_ON_SERVER/"

echo "Готово. Проверяю..."
curl -sS -o /dev/null -w "  https://game.workaem.com — HTTP %{http_code}\n" \
  --max-time 15 https://game.workaem.com/ || echo "  домен ещё не отвечает"
