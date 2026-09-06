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

import { verifyInitData } from "./telegram.js";
import { checkRun, gradeFor } from "./anticheat.js";

const SITE = "https://www.workaem.com";
/** Игра живёт на другом домене, поэтому запросы к воркеру - кросс-доменные. */
const ALLOWED_ORIGIN = "https://game.workaem.com";

/** UTM проставляем на каждой ссылке: без них не отличить трафик из бота. */
const link = (path, medium) =>
  `${SITE}${path}?utm_source=game&utm_medium=${medium}&utm_campaign=junior-way`;

const GREETING = [
  "Ты джун. Впереди галера, аутсорс, продукт и оффер.",
  "",
  "Растаптывай легаси сверху, обходи созвоны - их прыжком не решить,",
  "не проваливайся в прод и собирай скиллы.",
  "",
  "Четыре уровня - четыре грейда. С каждым игра ускоряется:",
  "сеньор просто работает быстрее.",
].join("\n");

/**
 * Про workaem рассказываем цифрами, а не прилагательными: «16 442 вакансии»
 * убедительнее, чем «удобный агрегатор».
 */
const ABOUT = [
  "*workaem* - агрегатор IT-вакансий.",
  "",
  "• 16 442 вакансии и 2 069 компаний",
  "• Собираем напрямую с карьерных страниц 300+ компаний, обновление каждые 4 часа",
  "• Дубли склеены, мёртвые вакансии видно сразу",
  "• 2 389 разборов вопросов с собеседований",
  "• Зарплатная аналитика по грейдам, а не средняя по рынку",
  "",
  "Регистрация бесплатная.",
].join("\n");

const HELP = [
  "Стрелки внизу экрана - идти, треугольник - прыжок. Держишь дольше - прыгаешь выше.",
  "",
  "• Прыгни на врага сверху - раздавишь",
  "• Созвон растоптать нельзя, только обойти",
  "• Флажок - коммит: с него начнёшь после смерти",
  "• В прод не падай",
].join("\n");

/** Кнопка web_app открывает Mini App прямо в чате, не уводя в браузер. */
const playRow = (gameUrl) => [{ text: "Играть", web_app: { url: gameUrl } }];

function startKeyboard(gameUrl) {
  return {
    inline_keyboard: [
      playRow(gameUrl),
      [{ text: "Вакансии", url: link("/jobs", "bot_start") }],
    ],
  };
}

function aboutKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Открыть workaem", url: link("", "bot_about") }],
      [
        { text: "Вакансии", url: link("/jobs", "bot_about") },
        { text: "Зарплаты", url: link("/salary", "bot_about") },
      ],
      [{ text: "Вопросы с собеседований", url: link("/questions", "bot_about") }],
    ],
  };
}

function jobsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Все вакансии", url: link("/jobs", "bot_jobs") }],
      [
        { text: "Frontend", url: link("/jobs/s/react", "bot_jobs") },
        { text: "Backend", url: link("/jobs/s/nodejs", "bot_jobs") },
      ],
      [
        { text: "Python", url: link("/jobs/s/python", "bot_jobs") },
        { text: "Go", url: link("/jobs/s/golang", "bot_jobs") },
      ],
      [{ text: "Удалёнка в долларах", url: link("/jobs/l/remote-usd", "bot_jobs") }],
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

function send(env, chatId, text, keyboard) {
  return call(env, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard,
    parse_mode: "Markdown",
    // Превью ссылок в сообщении со списком кнопок только мешает.
    link_preview_options: { is_disabled: true },
  });
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
    await send(env, chatId, GREETING, startKeyboard(gameUrl));
    return;
  }

  if (text.startsWith("/about")) {
    await send(env, chatId, ABOUT, aboutKeyboard());
    return;
  }

  if (text.startsWith("/jobs")) {
    await send(env, chatId, "Свежие IT-вакансии, обновляются каждые 4 часа:", jobsKeyboard());
    return;
  }

  if (text.startsWith("/help")) {
    await send(env, chatId, HELP, { inline_keyboard: [playRow(gameUrl)] });
    return;
  }

  if (text.startsWith("/game") || text.startsWith("/play")) {
    await send(env, chatId, "Погнали:", { inline_keyboard: [playRow(gameUrl)] });
    return;
  }

  // На всё остальное отвечаем кнопкой, а не молчим:
  // молчащий бот выглядит сломанным.
  await send(env, chatId, "Такой команды нет. Держи кнопку:", startKeyboard(gameUrl));
}


/** Сообщение после финала: не реклама, а уместное предложение в нужный момент. */
function resultMessage(user, stats) {
  const grade = gradeFor(stats.levelsCleared);
  const name = user.first_name ? `${user.first_name}, ты` : "Ты";
  const lines = [
    `${name} дошёл до грейда *${grade}*.`,
    "",
    `Скиллов собрано: ${stats.skills}`,
    `Очков: ${stats.score}`,
  ];
  if (stats.deaths > 0) lines.push(`Смертей: ${stats.deaths}`);
  lines.push("", "В жизни грейд растёт медленнее, но вакансии есть уже сейчас:");
  return lines.join("\n");
}

function resultKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Вакансии на мой уровень", url: link("/jobs", "bot_result") }],
      [{ text: "Проверить себя на собеседовании", url: link("/questions", "bot_result") }],
    ],
  };
}

function cors(extra = {}) {
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    ...extra,
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: cors({ "content-type": "application/json" }),
  });

async function handleResult(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  const auth = await verifyInitData(payload.initData, env.BOT_TOKEN);
  if (!auth.ok) {
    console.warn(`результат отклонён: ${auth.reason}`);
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const check = checkRun(payload.stats);
  if (!check.ok) {
    console.warn(`невозможный забег от ${auth.user.id}: ${check.reason}`);
    return json({ ok: false, error: "invalid run" }, 422);
  }

  // В личном чате chat_id совпадает с id пользователя.
  const res = await call(env, "sendMessage", {
    chat_id: auth.user.id,
    text: resultMessage(auth.user, payload.stats),
    reply_markup: resultKeyboard(),
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true },
  });

  // Если человек открыл игру по прямой ссылке и ни разу не нажимал /start,
  // Telegram запрещает боту писать первым. Это не ошибка игры - молча пропускаем.
  if (!res.ok) console.log(`не доставлено ${auth.user.id}: ${res.description}`);

  return json({ ok: true, delivered: Boolean(res.ok) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (request.method === "OPTIONS" && url.pathname === "/result") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (request.method === "POST" && url.pathname === "/result") {
      return handleResult(request, env);
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
