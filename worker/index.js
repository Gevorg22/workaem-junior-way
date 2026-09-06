/**
 * Бот «Путь джуна» на Cloudflare Workers.
 *
 * Живёт не на нашей ВМ, потому что её сеть режет исходящие соединения
 * к api.telegram.org: DNS резолвится, а connect висит в таймауте.
 * Проверено с двух адресов Telegram - блокировка на уровне сети хостинга,
 * настройками контейнера не обходится.
 *
 * Игру это не затрагивает: Telegram грузит game.workaem.com в webview
 * напрямую, минуя свой API. Через воркер идут только ответы бота.
 */

const GREETING = [
  "Ты джун. Впереди галера, аутсорс, продукт и оффер.",
  "",
  "Растаптывай легаси сверху, обходи созвоны - их прыжком не решить,",
  "не проваливайся в прод и собирай скиллы.",
  "",
  "Четыре уровня - четыре грейда. С каждым игра ускоряется:",
  "сеньор просто работает быстрее.",
].join("\n");

const HELP = "Нажми «Играть» - откроется игра. Стрелки внизу экрана: идти и прыгать.";

/** Кнопка web_app открывает Mini App прямо в чате, не уводя в браузер. */
function keyboard(gameUrl) {
  return {
    inline_keyboard: [
      [{ text: "Играть", web_app: { url: gameUrl } }],
      [{
        text: "Вакансии на workaem",
        url: "https://www.workaem.com/jobs?utm_source=game&utm_medium=bot&utm_campaign=junior-way",
      }],
    ],
  };
}

async function call(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) console.error(`${method}: ${data.description}`);
  return data;
}

async function handleUpdate(update, env) {
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const gameUrl = env.GAME_URL ?? "https://game.workaem.com";

  if (text.startsWith("/start")) {
    // Метка из deep link (t.me/bot?start=habr) - видно, откуда пришёл игрок.
    const source = text.slice("/start".length).trim();
    if (source) console.log(`start от ${chatId}, источник: ${source}`);
    await call(env, "sendMessage", {
      chat_id: chatId,
      text: GREETING,
      reply_markup: keyboard(gameUrl),
    });
    return;
  }

  if (text.startsWith("/help")) {
    await call(env, "sendMessage", { chat_id: chatId, text: HELP, reply_markup: keyboard(gameUrl) });
    return;
  }

  // На всё остальное отвечаем той же кнопкой, а не молчим:
  // молчащий бот выглядит сломанным.
  await call(env, "sendMessage", {
    chat_id: chatId,
    text: "Такой команды нет. Держи кнопку:",
    reply_markup: keyboard(gameUrl),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response(null, { status: 404 });
    }

    // Telegram присылает секрет заголовком - так отличаем настоящие запросы.
    // Без этой проверки эндпоинт открыт всему интернету.
    if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
      return new Response(null, { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }

    // Отвечаем Telegram сразу, работу доделываем после ответа: он ждёт
    // подтверждения приёма, а не результата обработки.
    ctx.waitUntil(handleUpdate(update, env));
    return new Response(null, { status: 200 });
  },
};
