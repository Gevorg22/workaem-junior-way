# Бот «Путь джуна»

Отвечает на `/start` приветствием и кнопкой запуска Mini App.
Работает на вебхуке: HTTPS уже есть на game.workaem.com, отдельный
опрашивающий процесс не нужен.

Зависимостей нет - Node 20 умеет fetch и http из коробки.

## Переменные окружения

| Переменная | Что это |
|---|---|
| `BOT_TOKEN` | токен от BotFather. **Только в .env, никогда в репозиторий** |
| `WEBHOOK_SECRET` | произвольная строка, Telegram шлёт её заголовком - так сервис отличает настоящие запросы |
| `GAME_URL` | адрес Mini App, по умолчанию https://game.workaem.com |

## Регистрация вебхука

Выполнить один раз после запуска контейнера:

```bash
curl -sS "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://game.workaem.com/tg/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"
```

Проверить:

```bash
curl -sS "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

## Что дальше

Сюда же ляжет приём результатов забегов для таблицы рекордов: валидация
`initData` и отсечка накрутки по `RunStats`.
