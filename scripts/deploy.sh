#!/usr/bin/env bash
# Выкладка на сервер. Адрес и путь берутся из окружения:
#   DEPLOY_HOST=user@server DEPLOY_PATH=/var/www/junior-way npm run deploy
set -euo pipefail

HOST="${DEPLOY_HOST:-workaem@111.88.152.219}"
PATH_ON_SERVER="${DEPLOY_PATH:-/home/workaem/deploy/junior-way}"

echo "Сборка..."
npm run build

BUNDLE=$(ls dist/assets/*.js | head -1 | xargs basename)
echo
echo "Выкладка $BUNDLE на $HOST:$PATH_ON_SERVER"

# Без явной проверки rsync падал молча: set -e обрывал скрипт, и вывод
# кончался на полуслове. Человек видел обрыв и не понимал, выложилось или
# нет - а на сайте оставалась старая версия.
if ! rsync -az --delete --human-readable dist/ "$HOST:$PATH_ON_SERVER/"; then
  echo
  echo "ЗАЛИВКА НЕ ПРОШЛА. На сайте осталась предыдущая версия."
  echo "Чаще всего это SSH: попробуй вручную и посмотри, о чём он просит:"
  echo "  rsync -avz --delete dist/ $HOST:$PATH_ON_SERVER/"
  exit 1
fi

echo
echo "Проверяю, что сервер отдаёт именно эту сборку..."
LIVE=$(curl -sS --max-time 20 https://game.workaem.com/ \
  | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)

if [ -z "$LIVE" ]; then
  echo "  домен не ответил - проверь сам через минуту"
elif [ "$LIVE" = "$BUNDLE" ]; then
  echo "  https://game.workaem.com отдаёт $LIVE - совпадает, выложено"
else
  # Ровно этот случай и произошёл: заливка не дошла, а по коду ответа
  # 200 всё выглядело благополучно.
  echo "  ВНИМАНИЕ: сервер отдаёт $LIVE, а собрано $BUNDLE"
  echo "  Старая версия осталась на месте. Повтори заливку."
  exit 1
fi
