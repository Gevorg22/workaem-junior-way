// worker/telegram.js
var enc = new TextEncoder();
async function hmac(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, messageBytes));
}
var toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData) return { ok: false, reason: "\u043F\u0443\u0441\u0442\u043E\u0439 initData" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "\u043D\u0435\u0442 \u043F\u043E\u0434\u043F\u0438\u0441\u0438" };
  params.delete("hash");
  const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = await hmac(enc.encode("WebAppData"), enc.encode(botToken));
  const computed = toHex(await hmac(secretKey, enc.encode(checkString)));
  if (!timingSafeEqual(computed, hash)) return { ok: false, reason: "\u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0441\u0445\u043E\u0434\u0438\u0442\u0441\u044F" };
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate) return { ok: false, reason: "\u043D\u0435\u0442 auth_date" };
  const age = Math.floor(Date.now() / 1e3) - authDate;
  if (age > maxAgeSeconds) return { ok: false, reason: `initData \u0443\u0441\u0442\u0430\u0440\u0435\u043B \u043D\u0430 ${age} \u0441` };
  let user;
  try {
    user = JSON.parse(params.get("user") ?? "null");
  } catch {
    return { ok: false, reason: "user \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B\u0441\u044F" };
  }
  if (!user?.id) return { ok: false, reason: "\u043D\u0435\u0442 user.id" };
  return { ok: true, user, authDate };
}

// worker/anticheat.js
var TOTAL_LEVEL_WIDTH = 36098;
var MAX_SPEED = 1.8;
var TOTAL_GEMS = 589;
var TOTAL_LEVELS = 12;
var MIN_FRAMES = Math.floor(TOTAL_LEVEL_WIDTH / MAX_SPEED);
function checkRun(stats) {
  if (!stats || typeof stats !== "object") return { ok: false, reason: "\u043D\u0435\u0442 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0438" };
  const nums = ["score", "skills", "levelsCleared", "frames", "jumps", "stomps", "deaths", "blocks"];
  for (const key of nums) {
    const v = stats[key];
    if (!Number.isInteger(v) || v < 0) return { ok: false, reason: `${key}: \u043D\u0435 \u0446\u0435\u043B\u043E\u0435 \u043D\u0435\u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435` };
  }
  if (stats.levelsCleared > TOTAL_LEVELS) {
    return { ok: false, reason: `\u0443\u0440\u043E\u0432\u043D\u0435\u0439 \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u0435\u0441\u0442\u044C: ${stats.levelsCleared}` };
  }
  if (stats.skills > TOTAL_GEMS) {
    return { ok: false, reason: `\u0441\u043A\u0438\u043B\u043B\u043E\u0432 \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043D\u0430 \u043A\u0430\u0440\u0442\u0430\u0445: ${stats.skills}` };
  }
  if (stats.levelsCleared === TOTAL_LEVELS && stats.frames < MIN_FRAMES) {
    return { ok: false, reason: `${stats.frames} \u043A\u0430\u0434\u0440\u043E\u0432 \u043F\u0440\u0438 \u043C\u0438\u043D\u0438\u043C\u0443\u043C\u0435 ${MIN_FRAMES}` };
  }
  if (stats.levelsCleared > 0 && stats.jumps === 0) {
    return { ok: false, reason: "\u0443\u0440\u043E\u0432\u043D\u0438 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u044B \u0431\u0435\u0437 \u0435\u0434\u0438\u043D\u043E\u0433\u043E \u043F\u0440\u044B\u0436\u043A\u0430" };
  }
  const maxScore = stats.skills * 100 + stats.stomps * 200 + stats.blocks * 50 + // Оффер из блока даёт 300, кофе 50; блоков на картах заметно меньше сотни.
  100 * 300 + stats.levelsCleared * (500 + 3 * 250);
  if (stats.score > maxScore) {
    return { ok: false, reason: `${stats.score} \u043E\u0447\u043A\u043E\u0432 \u043F\u0440\u0438 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C\u0435 ${maxScore}` };
  }
  return { ok: true };
}
function gradeFor(levelsCleared) {
  return ["\u0414\u0436\u0443\u043D", "\u041C\u0438\u0434\u043B", "\u0421\u0435\u043D\u044C\u043E\u0440", "\u041B\u0438\u0434", "\u041B\u0438\u0434"][Math.min(levelsCleared, 4)] ?? "\u0414\u0436\u0443\u043D";
}

// worker/index.js
var SITE = "https://www.workaem.com";
var ALLOWED_ORIGIN = "https://game.workaem.com";
var link = (path, medium) => `${SITE}${path}?utm_source=game&utm_medium=${medium}&utm_campaign=junior-way`;
var GREETING = [
  "\u0422\u044B \u0434\u0436\u0443\u043D. \u0412\u043F\u0435\u0440\u0435\u0434\u0438 \u0433\u0430\u043B\u0435\u0440\u0430, \u0430\u0443\u0442\u0441\u043E\u0440\u0441, \u043F\u0440\u043E\u0434\u0443\u043A\u0442 \u0438 \u043E\u0444\u0444\u0435\u0440.",
  "",
  "\u0420\u0430\u0441\u0442\u0430\u043F\u0442\u044B\u0432\u0430\u0439 \u043B\u0435\u0433\u0430\u0441\u0438 \u0441\u0432\u0435\u0440\u0445\u0443, \u043E\u0431\u0445\u043E\u0434\u0438 \u0441\u043E\u0437\u0432\u043E\u043D\u044B - \u0438\u0445 \u043F\u0440\u044B\u0436\u043A\u043E\u043C \u043D\u0435 \u0440\u0435\u0448\u0438\u0442\u044C,",
  "\u043D\u0435 \u043F\u0440\u043E\u0432\u0430\u043B\u0438\u0432\u0430\u0439\u0441\u044F \u0432 \u043F\u0440\u043E\u0434 \u0438 \u0441\u043E\u0431\u0438\u0440\u0430\u0439 \u0441\u043A\u0438\u043B\u043B\u044B.",
  "",
  "\u0427\u0435\u0442\u044B\u0440\u0435 \u0443\u0440\u043E\u0432\u043D\u044F - \u0447\u0435\u0442\u044B\u0440\u0435 \u0433\u0440\u0435\u0439\u0434\u0430. \u0421 \u043A\u0430\u0436\u0434\u044B\u043C \u0438\u0433\u0440\u0430 \u0443\u0441\u043A\u043E\u0440\u044F\u0435\u0442\u0441\u044F:",
  "\u0441\u0435\u043D\u044C\u043E\u0440 \u043F\u0440\u043E\u0441\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0431\u044B\u0441\u0442\u0440\u0435\u0435."
].join("\n");
var ABOUT = [
  "*workaem* - \u0430\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440 IT-\u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0439.",
  "",
  "\u2022 16 442 \u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438 \u0438 2 069 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0439",
  "\u2022 \u0421\u043E\u0431\u0438\u0440\u0430\u0435\u043C \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E \u0441 \u043A\u0430\u0440\u044C\u0435\u0440\u043D\u044B\u0445 \u0441\u0442\u0440\u0430\u043D\u0438\u0446 300+ \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0439, \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043A\u0430\u0436\u0434\u044B\u0435 4 \u0447\u0430\u0441\u0430",
  "\u2022 \u0414\u0443\u0431\u043B\u0438 \u0441\u043A\u043B\u0435\u0435\u043D\u044B, \u043C\u0451\u0440\u0442\u0432\u044B\u0435 \u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438 \u0432\u0438\u0434\u043D\u043E \u0441\u0440\u0430\u0437\u0443",
  "\u2022 2 389 \u0440\u0430\u0437\u0431\u043E\u0440\u043E\u0432 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432 \u0441 \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439",
  "\u2022 \u0417\u0430\u0440\u043F\u043B\u0430\u0442\u043D\u0430\u044F \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430 \u043F\u043E \u0433\u0440\u0435\u0439\u0434\u0430\u043C, \u0430 \u043D\u0435 \u0441\u0440\u0435\u0434\u043D\u044F\u044F \u043F\u043E \u0440\u044B\u043D\u043A\u0443",
  "",
  "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u0430\u044F."
].join("\n");
var HELP = [
  "\u0421\u0442\u0440\u0435\u043B\u043A\u0438 \u0432\u043D\u0438\u0437\u0443 \u044D\u043A\u0440\u0430\u043D\u0430 - \u0438\u0434\u0442\u0438, \u0442\u0440\u0435\u0443\u0433\u043E\u043B\u044C\u043D\u0438\u043A - \u043F\u0440\u044B\u0436\u043E\u043A. \u0414\u0435\u0440\u0436\u0438\u0448\u044C \u0434\u043E\u043B\u044C\u0448\u0435 - \u043F\u0440\u044B\u0433\u0430\u0435\u0448\u044C \u0432\u044B\u0448\u0435.",
  "",
  "\u2022 \u041F\u0440\u044B\u0433\u043D\u0438 \u043D\u0430 \u0432\u0440\u0430\u0433\u0430 \u0441\u0432\u0435\u0440\u0445\u0443 - \u0440\u0430\u0437\u0434\u0430\u0432\u0438\u0448\u044C",
  "\u2022 \u0421\u043E\u0437\u0432\u043E\u043D \u0440\u0430\u0441\u0442\u043E\u043F\u0442\u0430\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F, \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u043E\u0439\u0442\u0438",
  "\u2022 \u0424\u043B\u0430\u0436\u043E\u043A - \u043A\u043E\u043C\u043C\u0438\u0442: \u0441 \u043D\u0435\u0433\u043E \u043D\u0430\u0447\u043D\u0451\u0448\u044C \u043F\u043E\u0441\u043B\u0435 \u0441\u043C\u0435\u0440\u0442\u0438",
  "\u2022 \u0412 \u043F\u0440\u043E\u0434 \u043D\u0435 \u043F\u0430\u0434\u0430\u0439"
].join("\n");
var playRow = (gameUrl) => [{ text: "\u0418\u0433\u0440\u0430\u0442\u044C", web_app: { url: gameUrl } }];
function startKeyboard(gameUrl) {
  return {
    inline_keyboard: [
      playRow(gameUrl),
      [{ text: "\u0412\u0430\u043A\u0430\u043D\u0441\u0438\u0438", url: link("/jobs", "bot_start") }]
    ]
  };
}
function aboutKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C workaem", url: link("", "bot_about") }],
      [
        { text: "\u0412\u0430\u043A\u0430\u043D\u0441\u0438\u0438", url: link("/jobs", "bot_about") },
        { text: "\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u044B", url: link("/salary", "bot_about") }
      ],
      [{ text: "\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u0441 \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439", url: link("/questions", "bot_about") }]
    ]
  };
}
function jobsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "\u0412\u0441\u0435 \u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438", url: link("/jobs", "bot_jobs") }],
      [
        { text: "Frontend", url: link("/jobs/s/react", "bot_jobs") },
        { text: "Backend", url: link("/jobs/s/nodejs", "bot_jobs") }
      ],
      [
        { text: "Python", url: link("/jobs/s/python", "bot_jobs") },
        { text: "Go", url: link("/jobs/s/golang", "bot_jobs") }
      ],
      [{ text: "\u0423\u0434\u0430\u043B\u0451\u043D\u043A\u0430 \u0432 \u0434\u043E\u043B\u043B\u0430\u0440\u0430\u0445", url: link("/jobs/l/remote-usd", "bot_jobs") }]
    ]
  };
}
async function call(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
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
    link_preview_options: { is_disabled: true }
  });
}
async function handleUpdate(update, env) {
  const message = update.message;
  if (!message?.text) return;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const gameUrl = env.GAME_URL ?? "https://game.workaem.com";
  if (text.startsWith("/start")) {
    const source = text.slice("/start".length).trim();
    if (source) console.log(`start \u043E\u0442 ${chatId}, \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A: ${source}`);
    await send(env, chatId, GREETING, startKeyboard(gameUrl));
    return;
  }
  if (text.startsWith("/about")) {
    await send(env, chatId, ABOUT, aboutKeyboard());
    return;
  }
  if (text.startsWith("/jobs")) {
    await send(env, chatId, "\u0421\u0432\u0435\u0436\u0438\u0435 IT-\u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438, \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0435 4 \u0447\u0430\u0441\u0430:", jobsKeyboard());
    return;
  }
  if (text.startsWith("/help")) {
    await send(env, chatId, HELP, { inline_keyboard: [playRow(gameUrl)] });
    return;
  }
  if (text.startsWith("/game") || text.startsWith("/play")) {
    await send(env, chatId, "\u041F\u043E\u0433\u043D\u0430\u043B\u0438:", { inline_keyboard: [playRow(gameUrl)] });
    return;
  }
  await send(env, chatId, "\u0422\u0430\u043A\u043E\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u043D\u0435\u0442. \u0414\u0435\u0440\u0436\u0438 \u043A\u043D\u043E\u043F\u043A\u0443:", startKeyboard(gameUrl));
}
function resultMessage(user, stats) {
  const grade = gradeFor(stats.levelsCleared);
  const name = user.first_name ? `${user.first_name}, \u0442\u044B` : "\u0422\u044B";
  const lines = [
    `${name} \u0434\u043E\u0448\u0451\u043B \u0434\u043E \u0433\u0440\u0435\u0439\u0434\u0430 *${grade}*.`,
    "",
    `\u0421\u043A\u0438\u043B\u043B\u043E\u0432 \u0441\u043E\u0431\u0440\u0430\u043D\u043E: ${stats.skills}`,
    `\u041E\u0447\u043A\u043E\u0432: ${stats.score}`
  ];
  if (stats.deaths > 0) lines.push(`\u0421\u043C\u0435\u0440\u0442\u0435\u0439: ${stats.deaths}`);
  lines.push("", "\u0412 \u0436\u0438\u0437\u043D\u0438 \u0433\u0440\u0435\u0439\u0434 \u0440\u0430\u0441\u0442\u0451\u0442 \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u0435\u0435, \u043D\u043E \u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438 \u0435\u0441\u0442\u044C \u0443\u0436\u0435 \u0441\u0435\u0439\u0447\u0430\u0441:");
  return lines.join("\n");
}
function resultKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "\u0412\u0430\u043A\u0430\u043D\u0441\u0438\u0438 \u043D\u0430 \u043C\u043E\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C", url: link("/jobs", "bot_result") }],
      [{ text: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0435\u0431\u044F \u043D\u0430 \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438", url: link("/questions", "bot_result") }]
    ]
  };
}
function cors(extra = {}) {
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    ...extra
  };
}
var json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: cors({ "content-type": "application/json" })
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
    console.warn(`\u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043E\u0442\u043A\u043B\u043E\u043D\u0451\u043D: ${auth.reason}`);
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const check = checkRun(payload.stats);
  if (!check.ok) {
    console.warn(`\u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u044B\u0439 \u0437\u0430\u0431\u0435\u0433 \u043E\u0442 ${auth.user.id}: ${check.reason}`);
    return json({ ok: false, error: "invalid run" }, 422);
  }
  const res = await call(env, "sendMessage", {
    chat_id: auth.user.id,
    text: resultMessage(auth.user, payload.stats),
    reply_markup: resultKeyboard(),
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true }
  });
  if (!res.ok) console.log(`\u043D\u0435 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E ${auth.user.id}: ${res.description}`);
  return json({ ok: true, delivered: Boolean(res.ok) });
}
var worker_default = {
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
    if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
      return new Response(null, { status: 403 });
    }
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    ctx.waitUntil(handleUpdate(update, env));
    return new Response(null, { status: 200 });
  }
};
export {
  worker_default as default
};
