# Бот на Cloudflare Workers

Отвечает на `/start` приветствием и кнопкой запуска Mini App.

## Почему не на своей ВМ

Сеть хостинга режет исходящие соединения к `api.telegram.org`: DNS
резолвится (`149.154.166.110`), а connect висит в таймауте. Проверено
с двух адресов Telegram - это блокировка на уровне сети, настройками
контейнера не обходится.

Игру это не затрагивает: Telegram грузит `game.workaem.com` в webview
напрямую, минуя свой API. Через воркер идут только ответы бота.

## Развёртывание

```bash
cd worker
npx wrangler login
npx wrangler secret put BOT_TOKEN         # токен из BotFather
npx wrangler secret put WEBHOOK_SECRET    # тот же, что в .env на ВМ
npx wrangler deploy
```

Wrangler выведет адрес вида `https://workaem-game-bot.<поддомен>.workers.dev`.

## Регистрация вебхука

```bash
curl -sS "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://workaem-game-bot.<поддомен>.workers.dev/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"
```

Проверить:

```bash
curl -sS "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

В ответе `pending_update_count` должен быть 0, а `last_error_message` - отсутствовать.

## Логи

```bash
npx wrangler tail
```

## Лимиты бесплатного тарифа

100 000 запросов в сутки. Один `/start` - это один запрос, так что
упереться в лимит можно только при очень бурном успехе.
