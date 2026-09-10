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
import { verifyWorkaem } from "./auth.js";
import { checkLevel, checkRun, gradeFor, LEVEL_NAMES } from "./anticheat.js";
import {
  ALL_TIME, anonName, boardOf, CAREER, cleanName, hashId, levelMode, levelStats, PAGE_SIZE, placeOf,
  playersPage, saveRun, statsOf, topOf,
} from "./board.js";

const SITE = "https://www.workaem.com";
/**
 * Игра живёт на другом домене, поэтому запросы к воркеру - кросс-доменные.
 * Локальные адреса нужны для разработки: без них таблицу рекордов нельзя
 * посмотреть, не выложив игру на сервер.
 *
 * CORS тут не защита, а разрешение для браузера: подделать Origin из
 * скрипта ничего не стоит. Защита - подпись личности и античит.
 */
const ALLOWED_ORIGINS = [
  "https://game.workaem.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/** UTM проставляем на каждой ссылке: без них не отличить трафик из бота. */
const link = (path, medium) =>
  `${SITE}${path}?utm_source=game&utm_medium=${medium}&utm_campaign=junior-way`;

const GREETING = [
  "Ты стажёр. Впереди галера, аутсорс, серверная, легаси и оффер.",
  "",
  "Платформер в стиле классических Марио, только про IT: растаптывай",
  "легаси сверху, обходи созвоны - их прыжком не решить, не проваливайся",
  "в прод и собирай скиллы.",
  "",
  "*Двенадцать уровней* - от стажёра до оффера. С каждым игра ускоряется:",
  "сеньор просто работает быстрее. В конце ждёт финальный собес.",
  "",
  "Умер - можно продолжить с достигнутого уровня, а не начинать заново.",
  "Есть и задача дня: один уровень, одинаковый у всех, меняется в сутки.",
  "Результаты из Telegram попадают в общую таблицу - /top.",
].join("\n");

/**
 * Про workaem рассказываем цифрами, а не прилагательными: «16 000+ вакансий»
 * убедительнее, чем «удобный агрегатор». Числа округлены намеренно: точные
 * устаревают в тот же день, а править текст бота ради двух десятков вакансий
 * никто не станет.
 */
const ABOUT = [
  "*workaem* - агрегатор IT-вакансий.",
  "",
  "• 16 000+ вакансий и 2 000+ компаний",
  "• Собираем напрямую с карьерных страниц 300+ компаний, обновление каждые 4 часа",
  "• Дубли склеены, мёртвые вакансии видно сразу",
  "• 13 000+ вопросов с собеседований с разборами",
  "• Зарплатная аналитика по грейдам, а не средняя по рынку",
  "",
  "Регистрация бесплатная.",
  "",
  "«Путь джуна» - наша игра про то же самое, только в жанре платформера.",
  "Прошёл путь в игре - посмотри, что есть на твой грейд в жизни.",
].join("\n");

const HELP = [
  "*Управление*",
  "Стрелки внизу - идти, ▲ - прыжок. Держишь дольше - прыгаешь выше.",
  "▼ - спуститься в трубу. ⚗ - бросить тест, появляется у сеньора.",
  "С клавиатуры: стрелки или A/D, пробел, стрелка вниз, X.",
  "",
  "*Правила*",
  "• Прыгни на врага сверху - раздавишь",
  "• Цепочка без касания земли платит по нарастающей: 200, 400, 800",
  "  и дальше; после шестого подряд дают жизнь",
  "• Каждая сотня скиллов - тоже жизнь",
  "• Созвон растоптать нельзя, только обойти или закидать тестами",
  "• Ротацию алертов не убить никак - только выждать",
  "• Ящик со знаком вопроса бьют снизу, головой",
  "• Оффер повышает грейд, кофе ускоряет, отпуск даёт неуязвимость",
  "• Флажок - коммит: с него начнёшь после смерти",
  "• Труба с чёрным жерлом проходная или ведёт в заначку:",
  "  встань сверху и жми ▼",
  "• В прод не падай, а от стены дедлайна беги",
  "• На финише флагшток: чем выше зацепился, тем больше бонус",
  "",
  "*Финал*",
  "На последнем уровне дверь заперта, пока не пройден собес. Он ходит",
  "за тобой и кидает вопросы - три попадания по голове или тестом.",
].join("\n");

/**
 * Про автора спрашивают - лучше ответить, чем промолчать.
 *
 * Ник стоит прямо в тексте, а не только на кнопке: кнопки легко пропустить,
 * и при пересылке сообщения они не едут вместе с текстом. Написанный ник
 * можно скопировать и переслать.
 */
const AUTHOR = [
  "Игру и *workaem* сделал Геворг Карагозян - @Gevorg1989.",
  "",
  "Написано без движка и без фреймворка: своя физика на canvas,",
  "вся графика рисуется кодом, весь звук синтезируется - ни одного",
  "файла ассетов. Поэтому игра открывается из чата мгновенно.",
  "",
  "Вопросы, баги и предложения - пишите в личку: @Gevorg1989",
  "Исходники открыты, ссылка ниже.",
].join("\n");

/**
 * Таблица рекордов текстом для бота.
 *
 * В чате она уместнее, чем в игре: её пересылают, на неё отвечают, и она
 * поднимает бота в списке чатов. Недельная и дневная рядом - первая про
 * упорство, вторая про честное сравнение на одной и той же карте.
 */
async function topMessage(env) {
  if (!env.DB) return "Таблица рекордов ещё не подключена.";
  try {
    const [career, levels] = await Promise.all([
      topOf(env.DB, CAREER, ALL_TIME, 5),
      levelStats(env.DB),
    ]);

    const lines = ["*Весь путь* - лучший забег целиком"];
    if (career.length === 0) lines.push("Пока пусто - можно стать первым.");
    career.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.name} - ${row.score} очков, уровней ${row.levels}`);
    });

    // Уровни - главная таблица: карта у всех одна и та же, поэтому
    // сравнение честное, в отличие от общего счёта за забег.
    lines.push("", "*Лидеры уровней*");
    if (levels.length === 0) {
      lines.push("Ни одного уровня пока никто не сдал.");
    } else {
      for (const row of levels) {
        const best = row.top[0];
        if (!best) continue;
        const name = LEVEL_NAMES[row.level - 1] ?? `Уровень ${row.level}`;
        lines.push(`${row.level}. ${name} - ${best.name}, ${best.score} (игроков ${row.players})`);
      }
    }

    lines.push("", "Полная статистика по уровням - на стартовом экране игры.");
    return lines.join("\n");
  } catch (err) {
    console.error(`топ не собрался: ${err}`);
    return "Таблица сейчас недоступна - попробуй позже.";
  }
}

/** Кнопка web_app открывает Mini App прямо в чате, не уводя в браузер. */
const playRow = (gameUrl) => [{ text: "Играть", web_app: { url: gameUrl } }];

function startKeyboard(gameUrl) {
  return {
    inline_keyboard: [
      playRow(gameUrl),
      [{ text: "Вакансии", url: link("/jobs", "bot_start") }],
      [
        { text: "Как играть", callback_data: "help" },
        { text: "Таблица рекордов", callback_data: "top" },
      ],
      [{ text: "Об авторе", callback_data: "author" }],
    ],
  };
}

function authorKeyboard(gameUrl) {
  return {
    inline_keyboard: [
      [{ text: "Написать автору", url: "https://t.me/Gevorg1989" }],
      [{ text: "Исходники на GitHub", url: "https://github.com/Gevorg22/workaem-junior-way" }],
      [{ text: "Открыть workaem", url: link("", "bot_author") }],
      playRow(gameUrl),
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

/**
 * Картинка результата. Приходит с клиента data-URL'ом и уходит в чат
 * фотографией: расшаренную картинку открывают, ссылку пролистывают.
 *
 * Шлём multipart: у Telegram нет способа принять base64 в JSON, а держать
 * файл на своей стороне ради одного сообщения незачем.
 */
const MAX_PHOTO = 900_000;

function decodePng(dataUrl) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) return null;
  if (dataUrl.length > MAX_PHOTO) return null;
  try {
    const binary = atob(dataUrl.slice(prefix.length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // Подпись PNG: без неё это что угодно, но не картинка.
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
    return bytes;
  } catch {
    return null;
  }
}

async function sendPhoto(env, chatId, bytes, caption, keyboard) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("parse_mode", "Markdown");
  form.append("reply_markup", JSON.stringify(keyboard));
  form.append("photo", new Blob([bytes], { type: "image/png" }), "put-djuna.png");
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!data.ok) console.error(`sendPhoto: ${data.description}`);
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
  const gameUrlForCb = env.GAME_URL ?? "https://game.workaem.com";

  // Нажатие на инлайн-кнопку. Без ответа на callback_query Telegram крутит
  // спиннер на кнопке несколько секунд, и бот выглядит зависшим.
  const cb = update.callback_query;
  if (cb) {
    await call(env, "answerCallbackQuery", { callback_query_id: cb.id });
    const chat = cb.message?.chat?.id;
    if (!chat) return;
    if (cb.data === "help") {
      await send(env, chat, HELP, { inline_keyboard: [playRow(gameUrlForCb)] });
    } else if (cb.data === "author") {
      await send(env, chat, AUTHOR, authorKeyboard(gameUrlForCb));
    } else if (cb.data === "top") {
      await send(env, chat, await topMessage(env), { inline_keyboard: [playRow(gameUrlForCb)] });
    }
    return;
  }

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

  if (text.startsWith("/author") || text.startsWith("/me")) {
    await send(env, chatId, AUTHOR, authorKeyboard(gameUrl));
    return;
  }

  if (text.startsWith("/jobs")) {
    await send(env, chatId, "Свежие IT-вакансии, обновляются каждые 4 часа:", jobsKeyboard());
    return;
  }

  if (text.startsWith("/top")) {
    await send(env, chatId, await topMessage(env), { inline_keyboard: [playRow(gameUrl)] });
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
function resultMessage(user, stats, standing) {
  const grade = gradeFor(stats.levelsCleared);
  const name = user.first_name ? `${user.first_name}, ты` : "Ты";
  const lines = [
    `${name} дошёл до грейда *${grade}*.`,
    "",
    `Скиллов собрано: ${stats.skills}`,
    `Очков: ${stats.score}`,
  ];
  if (stats.deaths > 0) lines.push(`Смертей: ${stats.deaths}`);
  // Цепочка растаптываний - то, чем хвастаются. Пишем её, только если
  // она случилась: «цепочка 1» это не достижение, а просто прыжок.
  if (stats.maxCombo > 2) lines.push(`Лучшая цепочка: ${stats.maxCombo} подряд`);
  if (stats.pipes > 0) lines.push(`Найдено заначек и труб: ${stats.pipes}`);
  // Место важнее топа: в первую десятку не попадёт почти никто, а своё
  // место есть у каждого - и именно оно возвращает играть.
  if (standing?.place) {
    lines.push("", `Место в общем зачёте: *${standing.place}* из ${standing.total}`);
  }
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

function cors(request, extra = {}) {
  const origin = request?.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    ...extra,
  };
}

const json = (request, body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: cors(request, { "content-type": "application/json", ...extra }),
  });

/**
 * Кто это играл.
 *
 * В таблицу рекордов пускаем только проверяемую личность: подпись Telegram
 * или токен workaem. Гостей нет смысла отвергать грубо - им отвечаем так,
 * чтобы игра могла предложить войти, а не просто показать ошибку.
 */
async function identify(payload, env) {
  if (payload.initData) {
    const auth = await verifyInitData(payload.initData, env.BOT_TOKEN);
    if (!auth.ok) return { ok: false, reason: auth.reason, status: 401 };
    return {
      ok: true,
      source: "tg",
      id: String(auth.user.id),
      name: auth.user.first_name ?? auth.user.username ?? "",
      chatId: auth.user.id,
      user: auth.user,
    };
  }
  if (payload.wa) {
    const auth = await verifyWorkaem(payload.wa, env.WORKAEM_SECRET);
    if (!auth.ok) return { ok: false, reason: auth.reason, status: 401 };
    return { ok: true, source: "wa", id: auth.user.id, name: auth.user.name, chatId: null };
  }
  // Гость: не ошибка, а состояние. Игра по этому ответу покажет, что
  // результат остался в браузере, и предложит войти.
  return { ok: false, reason: "гость", status: 403, guest: true };
}

async function handleResult(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, { ok: false, error: "bad json" }, 400);
  }

  const who = await identify(payload, env);
  if (!who.ok) {
    if (!who.guest) console.warn(`результат отклонён: ${who.reason}`);
    return json(request, { ok: false, error: who.guest ? "guest" : "unauthorized" }, who.status);
  }

  const stats = payload.stats;
  const check = checkRun(stats);
  if (!check.ok) {
    console.warn(`невозможный забег от ${who.source}:${who.id}: ${check.reason}`);
    return json(request, { ok: false, error: "invalid run" }, 422);
  }

  const id = await hashId(who.source, who.id, env.BOARD_SALT);
  const name = payload.anon ? anonName(id) : cleanName(who.name);

  // В общий зачёт идёт только путь с первого уровня. Продолжения в игре
  // больше нет, а уровни с карты мира клиент сюда не шлёт, - но проверяем
  // на сервере: полагаться на то, чего клиент не пришлёт, нельзя.
  const forBoard = Number(stats.startLevel ?? 0) === 0;

  let standing = null;
  if (env.DB && forBoard) {
    try {
      const saved = await saveRun(env.DB, {
        who: `${who.source}:${id}`,
        name,
        source: who.source,
        mode: CAREER,
        bucket: ALL_TIME,
        score: stats.score,
        skills: stats.skills,
        levels: stats.levelsCleared,
        deaths: stats.deaths,
        combo: stats.maxCombo ?? 0,
        frames: stats.frames,
        stomps: stats.stomps,
        blocks: stats.blocks,
        pipes: stats.pipes ?? 0,
      });
      if (saved.ok) standing = { place: saved.place, total: saved.total, best: saved.best };
      else console.log(`не записан результат ${who.source}:${id}: ${saved.reason}`);
    } catch (err) {
      // Таблица - приятное дополнение. Не записалось - забег всё равно
      // состоялся, и сообщение в чат уйдёт.
      console.error(`запись в таблицу не удалась: ${err}`);
    }
  }

  // Сообщение в чат уходит только тем, у кого чат есть, - то есть игрокам
  // из Telegram. Для входа через workaem чата нет, и это нормально:
  // результат он видит в самой игре и в таблице.
  let delivered = false;
  if (who.chatId && forBoard) {
    const text = resultMessage(who.user, stats, standing);
    const photo = decodePng(payload.photo);
    const res = photo
      ? await sendPhoto(env, who.chatId, photo, text, resultKeyboard())
      : await call(env, "sendMessage", {
          chat_id: who.chatId,
          text,
          reply_markup: resultKeyboard(),
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: true },
        });
    // Если человек открыл игру по прямой ссылке и ни разу не нажимал /start,
    // Telegram запрещает боту писать первым. Это не ошибка игры.
    if (!res.ok) console.log(`не доставлено ${who.chatId}: ${res.description}`);
    delivered = Boolean(res.ok);
  }

  return json(request, { ok: true, delivered, recorded: Boolean(standing), standing, name });
}

/**
 * Результат одного уровня.
 *
 * Приходит на каждом финише, а не в конце забега: уровень - самостоятельное
 * соревнование, и уровень, сыгранный отдельно с карты мира, честно
 * участвует в таблице своего уровня.
 */
async function handleLevel(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, { ok: false, error: "bad json" }, 400);
  }

  const who = await identify(payload, env);
  if (!who.ok) {
    return json(request, { ok: false, error: who.guest ? "guest" : "unauthorized" }, who.status);
  }

  const result = payload.result;
  const check = checkLevel(result);
  if (!check.ok) {
    console.warn(`невозможный уровень от ${who.source}:${who.id}: ${check.reason}`);
    return json(request, { ok: false, error: "invalid level" }, 422);
  }

  if (!env.DB) return json(request, { ok: true, recorded: false });

  const id = await hashId(who.source, who.id, env.BOARD_SALT);
  const name = payload.anon ? anonName(id) : cleanName(who.name);
  try {
    const saved = await saveRun(env.DB, {
      who: `${who.source}:${id}`,
      name,
      source: who.source,
      mode: levelMode(result.level),
      bucket: ALL_TIME,
      score: result.score,
      skills: result.skills,
      levels: 1,
      deaths: result.deaths,
      combo: 0,
      frames: result.frames,
      stomps: 0,
      blocks: 0,
      pipes: 0,
    });
    if (!saved.ok) return json(request, { ok: true, recorded: false, reason: saved.reason });
    return json(request, {
      ok: true,
      recorded: true,
      level: result.level,
      standing: { place: saved.place, total: saved.total, best: saved.best },
    });
  } catch (err) {
    console.error(`уровень не записался: ${err}`);
    return json(request, { ok: true, recorded: false });
  }
}

/**
 * Экран статистики: сводка по всем уровням, общий зачёт и свои места.
 * Личность необязательна - без неё приходит только общая часть.
 */
async function handleStats(request, env) {
  if (!env.DB) return json(request, { ok: false, error: "no board" });

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    // Запрос без тела - это гость, который просто смотрит.
  }

  let who = null;
  const auth = await identify(payload, env);
  if (auth.ok) who = `${auth.source}:${await hashId(auth.source, auth.id, env.BOARD_SALT)}`;

  try {
    const data = await statsOf(env.DB, who);
    return json(request, { ok: true, ...data });
  } catch (err) {
    console.error(`статистика не собралась: ${err}`);
    return json(request, { ok: false, error: "stats failed" });
  }
}

/**
 * Список игроков постранично.
 *
 * Постранично, а не целиком: строк со временем станет тысячи, а список
 * открывают с телефона в вебвью Telegram. Смещение считает клиент, но своё
 * место приходит с сервера - по нему игра умеет прыгнуть сразу на нужную
 * страницу, чего в бесконечной прокрутке не сделать.
 */
async function handlePlayers(request, env) {
  if (!env.DB) return json(request, { ok: false, error: "no board" });

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    // Без тела - первая страница.
  }

  try {
    const page = await playersPage(env.DB, payload.offset ?? 0, payload.limit ?? PAGE_SIZE);
    const auth = await identify(payload, env);
    let mine = null;
    if (auth.ok) {
      const who = `${auth.source}:${await hashId(auth.source, auth.id, env.BOARD_SALT)}`;
      const standing = await placeOf(env.DB, CAREER, ALL_TIME, who);
      if (standing.place) mine = standing;
    }
    return json(request, { ok: true, ...page, mine });
  } catch (err) {
    console.error(`список игроков не собрался: ${err}`);
    return json(request, { ok: false, error: "players failed" });
  }
}

/** Таблица рекордов для стартового экрана: всё нужное одним ответом. */
async function handleBoard(request, env) {
  if (!env.DB) return json(request, { ok: false, error: "no board" });
  try {
    const data = await boardOf(env.DB);
    // Полминуты кеша: таблица меняется медленнее, чем её открывают.
    return json(request, { ok: true, ...data }, 200, { "cache-control": "public, max-age=30" });
  } catch (err) {
    console.error(`таблица не отдалась: ${err}`);
    return json(request, { ok: false, error: "board failed" });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    if (request.method === "POST" && url.pathname === "/result") {
      return handleResult(request, env);
    }

    if (request.method === "GET" && url.pathname === "/board") {
      return handleBoard(request, env);
    }

    if (request.method === "POST" && url.pathname === "/level") {
      return handleLevel(request, env);
    }

    if (request.method === "POST" && url.pathname === "/stats") {
      return handleStats(request, env);
    }

    if (request.method === "POST" && url.pathname === "/players") {
      return handlePlayers(request, env);
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
