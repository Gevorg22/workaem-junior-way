/**
 * Бот «Путь джуна».
 *
 * Работает на вебхуке, а не на long polling: HTTPS у нас уже есть на
 * game.workaem.com, и держать вечный опрашивающий процесс незачем.
 * Тот же сервис позже примет результаты забегов для таблицы рекордов.
 *
 * Зависимостей нет намеренно: Node 20 умеет и fetch, и http.
 */
import { createServer } from "node:http";

const TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.WEBHOOK_SECRET;
const GAME_URL = process.env.GAME_URL ?? "https://game.workaem.com";
const PORT = Number(process.env.PORT ?? 8080);

if (!TOKEN) {
  console.error("Не задан BOT_TOKEN");
  process.exit(1);
}
if (!SECRET) {
  console.error("Не задан WEBHOOK_SECRET");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function call(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) console.error(`${method}:`, data.description);
  return data;
}

const GREETING = [
  "Ты джун. Впереди галера, аутсорс, продукт и оффер.",
  "",
  "Растаптывай легаси сверху, обходи созвоны - их прыжком не решить,",
  "не проваливайся в прод и собирай скиллы.",
  "",
  "Четыре уровня - четыре грейда. С каждым игра ускоряется:",
  "сеньор просто работает быстрее.",
].join("\n");

/** Кнопка web_app открывает Mini App прямо в чате, не уводя в браузер. */
function startKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Играть", web_app: { url: GAME_URL } }],
      [{ text: "Вакансии на workaem", url: "https://www.workaem.com/jobs?utm_source=game&utm_medium=bot&utm_campaign=junior-way" }],
    ],
  };
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text.startsWith("/start")) {
    // Метка из deep link (t.me/bot?start=habr) - видно, откуда пришёл игрок.
    const source = text.slice("/start".length).trim();
    if (source) console.log(`start от ${chatId}, источник: ${source}`);

    await call("sendMessage", {
      chat_id: chatId,
      text: GREETING,
      reply_markup: startKeyboard(),
    });
    return;
  }

  if (text.startsWith("/help")) {
    await call("sendMessage", {
      chat_id: chatId,
      text: "Нажми «Играть» - откроется игра. Стрелки внизу экрана: идти и прыгать.",
      reply_markup: startKeyboard(),
    });
    return;
  }

  // На всё остальное отвечаем той же кнопкой, а не молчим:
  // молчащий бот выглядит сломанным.
  await call("sendMessage", {
    chat_id: chatId,
    text: "Такой команды нет. Держи кнопку:",
    reply_markup: startKeyboard(),
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      // Обновление от Telegram не бывает большим - обрываем аномалии.
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/tg/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/tg/webhook")) {
    res.writeHead(404);
    res.end();
    return;
  }

  // Telegram присылает секрет заголовком - это подтверждает, что запрос от него.
  if (req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    console.warn("Запрос с неверным секретом");
    res.writeHead(403);
    res.end();
    return;
  }

  // Отвечаем сразу: Telegram ждёт ответ, а не выполнение работы.
  res.writeHead(200);
  res.end();

  try {
    const update = JSON.parse(await readBody(req));
    await handleUpdate(update);
  } catch (err) {
    console.error("Ошибка обработки:", err);
  }
});

server.listen(PORT, () => console.log(`Бот слушает :${PORT}, игра: ${GAME_URL}`));
