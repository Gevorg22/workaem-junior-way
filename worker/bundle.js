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

// worker/auth.js
var enc2 = new TextEncoder();
function fromBase64Url(part) {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
var decodeJson = (part) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
async function verifyWorkaem(token, secret) {
  if (!secret) return { ok: false, reason: "\u0441\u0435\u043A\u0440\u0435\u0442 workaem \u043D\u0435 \u0437\u0430\u0434\u0430\u043D" };
  if (typeof token !== "string" || token.length > 4096) return { ok: false, reason: "\u043D\u0435\u0442 \u0442\u043E\u043A\u0435\u043D\u0430" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "\u043D\u0435 JWT" };
  const [head, body, signature] = parts;
  let header;
  let payload;
  try {
    header = decodeJson(head);
    payload = decodeJson(body);
  } catch {
    return { ok: false, reason: "\u0431\u0438\u0442\u044B\u0439 \u0442\u043E\u043A\u0435\u043D" };
  }
  if (header?.alg !== "HS256") return { ok: false, reason: `\u0430\u043B\u0433\u043E\u0440\u0438\u0442\u043C ${header?.alg}` };
  const key = await crypto.subtle.importKey(
    "raw",
    enc2.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    enc2.encode(`${head}.${body}`)
  );
  if (!valid) return { ok: false, reason: "\u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0441\u0445\u043E\u0434\u0438\u0442\u0441\u044F" };
  const now = Math.floor(Date.now() / 1e3);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, reason: "\u0442\u043E\u043A\u0435\u043D \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D" };
  }
  if (typeof payload.iat === "number" && payload.iat > now + 300) {
    return { ok: false, reason: "\u0442\u043E\u043A\u0435\u043D \u0438\u0437 \u0431\u0443\u0434\u0443\u0449\u0435\u0433\u043E" };
  }
  if (!payload.sub) return { ok: false, reason: "\u043D\u0435\u0442 sub" };
  return { ok: true, user: { id: String(payload.sub), name: payload.name ?? "" } };
}

// worker/anticheat.js
var TOTAL_LEVEL_WIDTH = 34116;
var MAX_SPEED = 1.8;
var TOTAL_GEMS = 936;
var TOTAL_LEVELS = 12;
var MIN_LEVEL_FRAMES = 744;
var MAX_CARRY_LIVES = 5;
var HIDDEN_LIVES = 4;
var BOSS_SCORE = 8e3;
var MAX_PAR = 80;
var COMBO_SCORE = [200, 400, 800, 1e3, 2e3, 4e3];
var LEVEL_MIN_FRAMES = [446, 845, 907, 838, 799, 920, 822, 836, 960, 810, 756, 875];
var LEVEL_MAX_SCORE = [24310, 72960, 75860, 83660, 13800, 120110, 91160, 94710, 76910, 110460, 18250, 97e3];
var LEVEL_NAMES = ["\u0421\u0442\u0430\u0436\u0438\u0440\u043E\u0432\u043A\u0430", "\u0413\u0430\u043B\u0435\u0440\u0430", "\u0422\u0435\u0441\u0442\u043E\u0432\u043E\u0435", "\u0410\u0443\u0442\u0441\u043E\u0440\u0441", "\u041E\u0431\u043B\u0430\u043A\u043E", "HR-\u0441\u043A\u0440\u0438\u043D\u0438\u043D\u0433", "\u0421\u0442\u0430\u0440\u0442\u0430\u043F", "\u041B\u0435\u0433\u0430\u0441\u0438", "\u0422\u0435\u0445\u0441\u043E\u0431\u0435\u0441", "\u041A\u043E\u0440\u043F\u043E\u0440\u0430\u0446\u0438\u044F", "\u0425\u0430\u0439\u043B\u043E\u0430\u0434", "\u041E\u0444\u0444\u0435\u0440"];
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
  if (stats.frames < stats.levelsCleared * MIN_LEVEL_FRAMES) {
    return { ok: false, reason: `${stats.frames} \u043A\u0430\u0434\u0440\u043E\u0432 \u043D\u0430 ${stats.levelsCleared} \u0443\u0440\u043E\u0432\u043D\u0435\u0439` };
  }
  if (stats.levelsCleared > 0 && stats.jumps === 0) {
    return { ok: false, reason: "\u0443\u0440\u043E\u0432\u043D\u0438 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u044B \u0431\u0435\u0437 \u0435\u0434\u0438\u043D\u043E\u0433\u043E \u043F\u0440\u044B\u0436\u043A\u0430" };
  }
  const combo = stats.maxCombo ?? 0;
  if (!Number.isInteger(combo) || combo < 0 || combo > stats.stomps) {
    return { ok: false, reason: `\u0446\u0435\u043F\u043E\u0447\u043A\u0430 ${combo} \u043F\u0440\u0438 ${stats.stomps} \u0440\u0430\u0441\u0442\u043E\u043F\u0442\u0430\u043D\u043D\u044B\u0445` };
  }
  const maxLives = MAX_CARRY_LIVES + Math.floor(stats.skills / 100) + Math.floor(stats.stomps / 7) + HIDDEN_LIVES;
  const perStomp = COMBO_SCORE[Math.min(Math.max(combo, 1), COMBO_SCORE.length) - 1];
  const maxScore = stats.skills * 100 + stats.stomps * perStomp + stats.blocks * 50 + (stats.tested ?? 0) * 150 + // Оффер из блока даёт 300, кофе 50; блоков на картах заметно меньше сотни.
  100 * 300 + // Мини-боссы в замках.
  BOSS_SCORE + // За уровень: финиш, жизни, верхушка флагштока и бонус за скорость.
  stats.levelsCleared * (500 + maxLives * 250 + 3e3 + MAX_PAR * 12);
  if (stats.score > maxScore) {
    return { ok: false, reason: `${stats.score} \u043E\u0447\u043A\u043E\u0432 \u043F\u0440\u0438 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C\u0435 ${maxScore}` };
  }
  return { ok: true };
}
function gradeFor(levelsCleared) {
  return ["\u0421\u0442\u0430\u0436\u0451\u0440", "\u0414\u0436\u0443\u043D", "\u041C\u0438\u0434\u043B", "\u0421\u0435\u043D\u044C\u043E\u0440", "\u041B\u0438\u0434"][Math.min(Math.floor(levelsCleared / 3), 4)] ?? "\u0421\u0442\u0430\u0436\u0451\u0440";
}
function checkLevel(result) {
  if (!result || typeof result !== "object") return { ok: false, reason: "\u043D\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430" };
  const level = result.level;
  if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) {
    return { ok: false, reason: `\u0443\u0440\u043E\u0432\u043D\u044F ${level} \u0432 \u0438\u0433\u0440\u0435 \u043D\u0435\u0442` };
  }
  for (const key of ["score", "frames", "deaths", "skills"]) {
    const v = result[key];
    if (!Number.isInteger(v) || v < 0) return { ok: false, reason: `${key}: \u043D\u0435 \u0446\u0435\u043B\u043E\u0435 \u043D\u0435\u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435` };
  }
  const minFrames = LEVEL_MIN_FRAMES[level - 1];
  if (result.frames < minFrames) {
    return { ok: false, reason: `${result.frames} \u043A\u0430\u0434\u0440\u043E\u0432 \u043D\u0430 \u0443\u0440\u043E\u0432\u043D\u0435 ${level} \u043F\u0440\u0438 \u043C\u0438\u043D\u0438\u043C\u0443\u043C\u0435 ${minFrames}` };
  }
  const maxScore = LEVEL_MAX_SCORE[level - 1];
  if (result.score > maxScore) {
    return { ok: false, reason: `${result.score} \u043E\u0447\u043A\u043E\u0432 \u043D\u0430 \u0443\u0440\u043E\u0432\u043D\u0435 ${level} \u043F\u0440\u0438 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C\u0435 ${maxScore}` };
  }
  if (result.deaths > 0 && result.frames < minFrames * (1 + result.deaths * 0.05)) {
    return { ok: false, reason: `${result.deaths} \u0441\u043C\u0435\u0440\u0442\u0435\u0439 \u0437\u0430 ${result.frames} \u043A\u0430\u0434\u0440\u043E\u0432` };
  }
  return { ok: true };
}

// worker/board.js
var TOP_LIMIT = 10;
var COOLDOWN_MS = 8e3;
async function hashId(source, id, salt) {
  const data = new TextEncoder().encode(`${source}:${id}:${salt ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function cleanName(raw) {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim();
  const safe = text.replace(/[*_`[\]()~>#+=|{}]/g, "").replace(/\s+/g, " ");
  return safe.slice(0, 18) || "\u0414\u0436\u0443\u043D";
}
var anonName = (who) => `\u0414\u0436\u0443\u043D #${who.slice(0, 4)}`;
async function saveRun(db, run) {
  const now = Date.now();
  const last = await db.prepare("SELECT at FROM runs WHERE who = ?1 AND mode = ?2 ORDER BY at DESC LIMIT 1").bind(run.who, run.mode).first();
  if (last && now - last.at < COOLDOWN_MS) {
    return { ok: false, reason: "\u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0447\u0430\u0441\u0442\u043E" };
  }
  await db.prepare(
    `INSERT INTO runs (who, name, source, mode, bucket, score, skills, levels, deaths, combo, frames, at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  ).bind(
    run.who,
    run.name,
    run.source,
    run.mode,
    run.bucket,
    run.score,
    run.skills,
    run.levels,
    run.deaths,
    run.combo,
    run.frames,
    now
  ).run();
  await bumpTotals(db, run);
  const standing = await placeOf(db, run.mode, run.bucket, run.who);
  return { ok: true, ...standing };
}
async function bumpTotals(db, run) {
  const add = [
    ["runs", 1],
    ["skills", run.skills],
    ["stomps", run.stomps ?? 0],
    ["deaths", run.deaths],
    ["blocks", run.blocks ?? 0],
    ["pipes", run.pipes ?? 0],
    ["seconds", Math.round(run.frames / 75)],
    ["finished", run.levels >= 12 ? 1 : 0]
  ];
  const stmt = db.prepare(
    `INSERT INTO totals (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = value + ?2`
  );
  await db.batch(add.filter(([, v]) => v > 0).map(([key, value]) => stmt.bind(key, value)));
}
async function placeOf(db, mode, bucket, who) {
  const best = await db.prepare("SELECT MAX(score) AS score FROM runs WHERE mode = ?1 AND bucket = ?2 AND who = ?3").bind(mode, bucket, who).first();
  if (!best || best.score === null) return { place: 0, total: 0, best: 0 };
  const row = await db.prepare(
    `WITH bests AS (
         SELECT who, MAX(score) AS score FROM runs
         WHERE mode = ?1 AND bucket = ?2 GROUP BY who
       )
       SELECT
         (SELECT COUNT(*) FROM bests WHERE score > ?3) AS above,
         (SELECT COUNT(*) FROM bests) AS total`
  ).bind(mode, bucket, best.score).first();
  return { place: (row?.above ?? 0) + 1, total: row?.total ?? 1, best: best.score };
}
async function topOf(db, mode, bucket, limit = TOP_LIMIT) {
  const { results } = await db.prepare(
    `SELECT name, source, MAX(score) AS score, levels, deaths, combo
       FROM runs WHERE mode = ?1 AND bucket = ?2
       GROUP BY who ORDER BY score DESC LIMIT ?3`
  ).bind(mode, bucket, limit).all();
  return results ?? [];
}
async function totalsOf(db) {
  const { results } = await db.prepare("SELECT key, value FROM totals").all();
  const out = {};
  for (const row of results ?? []) out[row.key] = row.value;
  return out;
}
var ALL_TIME = "all";
var SEASON = "s2";
var CAREER = `career:${SEASON}`;
var LEVEL_PREFIX = `level:${SEASON}:`;
async function boardOf(db) {
  const [career, totals] = await Promise.all([
    topOf(db, CAREER, ALL_TIME),
    totalsOf(db)
  ]);
  return { career, totals };
}
var levelMode = (level) => `${LEVEL_PREFIX}${level}`;
var levelOf = (mode) => Number(String(mode).slice(LEVEL_PREFIX.length));
async function levelStats(db) {
  const { results } = await db.prepare(
    `WITH bests AS (
         SELECT mode, who, name, MAX(score) AS score, frames FROM runs
         WHERE mode LIKE ?1 GROUP BY mode, who
       ), ranked AS (
         SELECT mode, name, score, frames,
                ROW_NUMBER() OVER (PARTITION BY mode ORDER BY score DESC) AS rn,
                COUNT(*) OVER (PARTITION BY mode) AS players
         FROM bests
       )
       SELECT mode, name, score, frames, rn, players FROM ranked
       WHERE rn <= 3 ORDER BY mode, rn`
  ).bind(`${LEVEL_PREFIX}%`).all();
  const byLevel = {};
  for (const row of results ?? []) {
    const level = levelOf(row.mode);
    if (!Number.isInteger(level)) continue;
    byLevel[level] ??= { level, players: row.players, top: [] };
    byLevel[level].top.push({ name: row.name, score: row.score, frames: row.frames });
  }
  return Object.values(byLevel).sort((a, b) => a.level - b.level);
}
async function myLevels(db, who) {
  const { results } = await db.prepare(
    `WITH bests AS (
         SELECT mode, who, MAX(score) AS score, frames FROM runs
         WHERE mode LIKE ?1 GROUP BY mode, who
       )
       SELECT m.mode, m.score, m.frames,
              (SELECT COUNT(*) FROM bests b WHERE b.mode = m.mode AND b.score > m.score) + 1 AS place,
              (SELECT COUNT(*) FROM bests b WHERE b.mode = m.mode) AS players
       FROM bests m WHERE m.who = ?2`
  ).bind(`${LEVEL_PREFIX}%`, who).all();
  const mine = {};
  for (const row of results ?? []) {
    const level = levelOf(row.mode);
    if (!Number.isInteger(level)) continue;
    mine[level] = { score: row.score, frames: row.frames, place: row.place, players: row.players };
  }
  return mine;
}
async function statsOf(db, who) {
  const [career, levels, totals, mine] = await Promise.all([
    topOf(db, CAREER, ALL_TIME),
    levelStats(db),
    totalsOf(db),
    who ? myLevels(db, who) : Promise.resolve({})
  ]);
  return { career, levels, totals, mine };
}
var PAGE_SIZE = 10;
async function playersPage(db, offset = 0, limit = PAGE_SIZE) {
  const take = Math.max(1, Math.min(50, Math.floor(limit) || PAGE_SIZE));
  const skip = Math.max(0, Math.floor(offset) || 0);
  const { results } = await db.prepare(
    `WITH bests AS (
         SELECT who, name, source, MAX(score) AS score, levels, deaths
         FROM runs WHERE mode = ?4 AND bucket = ?1 GROUP BY who
       )
       SELECT name, source, score, levels, deaths,
              ROW_NUMBER() OVER (ORDER BY score DESC) AS place
       FROM bests ORDER BY score DESC LIMIT ?2 OFFSET ?3`
  ).bind(ALL_TIME, take, skip, CAREER).all();
  const counted = await db.prepare(
    `SELECT COUNT(*) AS total FROM (
         SELECT who FROM runs WHERE mode = ?2 AND bucket = ?1 GROUP BY who
       )`
  ).bind(ALL_TIME, CAREER).first();
  return { rows: results ?? [], total: counted?.total ?? 0, offset: skip, limit: take };
}

// worker/index.js
var SITE = "https://www.workaem.com";
var ALLOWED_ORIGINS = [
  "https://game.workaem.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
var link = (path, medium) => `${SITE}${path}?utm_source=game&utm_medium=${medium}&utm_campaign=junior-way`;
var GREETING = [
  "\u0422\u044B \u0441\u0442\u0430\u0436\u0451\u0440. \u0412\u043F\u0435\u0440\u0435\u0434\u0438 \u0433\u0430\u043B\u0435\u0440\u0430, \u0430\u0443\u0442\u0441\u043E\u0440\u0441, \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u0430\u044F, \u043B\u0435\u0433\u0430\u0441\u0438 \u0438 \u043E\u0444\u0444\u0435\u0440.",
  "",
  "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435\u0440 \u0432 \u0441\u0442\u0438\u043B\u0435 \u043A\u043B\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u041C\u0430\u0440\u0438\u043E, \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E IT: \u0440\u0430\u0441\u0442\u0430\u043F\u0442\u044B\u0432\u0430\u0439",
  "\u043B\u0435\u0433\u0430\u0441\u0438 \u0441\u0432\u0435\u0440\u0445\u0443, \u043E\u0431\u0445\u043E\u0434\u0438 \u0441\u043E\u0437\u0432\u043E\u043D\u044B - \u0438\u0445 \u043F\u0440\u044B\u0436\u043A\u043E\u043C \u043D\u0435 \u0440\u0435\u0448\u0438\u0442\u044C, \u043D\u0435 \u043F\u0440\u043E\u0432\u0430\u043B\u0438\u0432\u0430\u0439\u0441\u044F",
  "\u0432 \u043F\u0440\u043E\u0434 \u0438 \u0441\u043E\u0431\u0438\u0440\u0430\u0439 \u0441\u043A\u0438\u043B\u043B\u044B.",
  "",
  "*\u0414\u0432\u0435\u043D\u0430\u0434\u0446\u0430\u0442\u044C \u0443\u0440\u043E\u0432\u043D\u0435\u0439* - \u043E\u0442 \u0441\u0442\u0430\u0436\u0451\u0440\u0430 \u0434\u043E \u043E\u0444\u0444\u0435\u0440\u0430. \u0421 \u043A\u0430\u0436\u0434\u044B\u043C \u0438\u0433\u0440\u0430 \u0443\u0441\u043A\u043E\u0440\u044F\u0435\u0442\u0441\u044F:",
  "\u0441\u0435\u043D\u044C\u043E\u0440 \u043F\u0440\u043E\u0441\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0431\u044B\u0441\u0442\u0440\u0435\u0435. \u0412 \u043A\u043E\u043D\u0446\u0435 \u0436\u0434\u0451\u0442 \u0444\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u043E\u0431\u0435\u0441.",
  "",
  "\u0423\u043C\u0435\u0440 - \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0441 \u0434\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442\u043E\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F, \u0430 \u043D\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E.",
  "\u0415\u0441\u0442\u044C \u0438 \u0437\u0430\u0434\u0430\u0447\u0430 \u0434\u043D\u044F: \u043E\u0434\u0438\u043D \u0443\u0440\u043E\u0432\u0435\u043D\u044C, \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u0439 \u0443 \u0432\u0441\u0435\u0445, \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0432 \u0441\u0443\u0442\u043A\u0438.",
  "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0438\u0437 Telegram \u043F\u043E\u043F\u0430\u0434\u0430\u044E\u0442 \u0432 \u043E\u0431\u0449\u0443\u044E \u0442\u0430\u0431\u043B\u0438\u0446\u0443 - /top."
].join("\n");
var ABOUT = [
  "*workaem* - \u0430\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440 IT-\u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0439.",
  "",
  "\u2022 16 000+ \u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0439 \u0438 2 000+ \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0439",
  "\u2022 \u0421\u043E\u0431\u0438\u0440\u0430\u0435\u043C \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E \u0441 \u043A\u0430\u0440\u044C\u0435\u0440\u043D\u044B\u0445 \u0441\u0442\u0440\u0430\u043D\u0438\u0446 300+ \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0439, \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043A\u0430\u0436\u0434\u044B\u0435 4 \u0447\u0430\u0441\u0430",
  "\u2022 \u0414\u0443\u0431\u043B\u0438 \u0441\u043A\u043B\u0435\u0435\u043D\u044B, \u043C\u0451\u0440\u0442\u0432\u044B\u0435 \u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438 \u0432\u0438\u0434\u043D\u043E \u0441\u0440\u0430\u0437\u0443",
  "\u2022 13 000+ \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432 \u0441 \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439 \u0441 \u0440\u0430\u0437\u0431\u043E\u0440\u0430\u043C\u0438",
  "\u2022 \u0417\u0430\u0440\u043F\u043B\u0430\u0442\u043D\u0430\u044F \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0430 \u043F\u043E \u0433\u0440\u0435\u0439\u0434\u0430\u043C, \u0430 \u043D\u0435 \u0441\u0440\u0435\u0434\u043D\u044F\u044F \u043F\u043E \u0440\u044B\u043D\u043A\u0443",
  "",
  "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u0430\u044F.",
  "",
  "\xAB\u041F\u0443\u0442\u044C \u0434\u0436\u0443\u043D\u0430\xBB - \u043D\u0430\u0448\u0430 \u0438\u0433\u0440\u0430 \u043F\u0440\u043E \u0442\u043E \u0436\u0435 \u0441\u0430\u043C\u043E\u0435, \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0436\u0430\u043D\u0440\u0435 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435\u0440\u0430.",
  "\u041F\u0440\u043E\u0448\u0451\u043B \u043F\u0443\u0442\u044C \u0432 \u0438\u0433\u0440\u0435 - \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438, \u0447\u0442\u043E \u0435\u0441\u0442\u044C \u043D\u0430 \u0442\u0432\u043E\u0439 \u0433\u0440\u0435\u0439\u0434 \u0432 \u0436\u0438\u0437\u043D\u0438."
].join("\n");
var HELP = [
  "*\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435*",
  "\u0421\u0442\u0440\u0435\u043B\u043A\u0438 \u0432\u043D\u0438\u0437\u0443 - \u0438\u0434\u0442\u0438, \u25B2 - \u043F\u0440\u044B\u0436\u043E\u043A. \u0414\u0435\u0440\u0436\u0438\u0448\u044C \u0434\u043E\u043B\u044C\u0448\u0435 - \u043F\u0440\u044B\u0433\u0430\u0435\u0448\u044C \u0432\u044B\u0448\u0435.",
  "\u25BC - \u0441\u043F\u0443\u0441\u0442\u0438\u0442\u044C\u0441\u044F \u0432 \u0442\u0440\u0443\u0431\u0443. \u2697 - \u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0442\u0435\u0441\u0442, \u043F\u043E\u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0443 \u0441\u0435\u043D\u044C\u043E\u0440\u0430.",
  "\u0421 \u043A\u043B\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u044B: \u0441\u0442\u0440\u0435\u043B\u043A\u0438 \u0438\u043B\u0438 A/D, \u043F\u0440\u043E\u0431\u0435\u043B, \u0441\u0442\u0440\u0435\u043B\u043A\u0430 \u0432\u043D\u0438\u0437, X.",
  "",
  "*\u041F\u0440\u0430\u0432\u0438\u043B\u0430*",
  "\u2022 \u041F\u0440\u044B\u0433\u043D\u0438 \u043D\u0430 \u0432\u0440\u0430\u0433\u0430 \u0441\u0432\u0435\u0440\u0445\u0443 - \u0440\u0430\u0437\u0434\u0430\u0432\u0438\u0448\u044C",
  "\u2022 \u0426\u0435\u043F\u043E\u0447\u043A\u0430 \u0431\u0435\u0437 \u043A\u0430\u0441\u0430\u043D\u0438\u044F \u0437\u0435\u043C\u043B\u0438 \u043F\u043B\u0430\u0442\u0438\u0442 \u043F\u043E \u043D\u0430\u0440\u0430\u0441\u0442\u0430\u044E\u0449\u0435\u0439: 200, 400, 800",
  "  \u0438 \u0434\u0430\u043B\u044C\u0448\u0435; \u043F\u043E\u0441\u043B\u0435 \u0448\u0435\u0441\u0442\u043E\u0433\u043E \u043F\u043E\u0434\u0440\u044F\u0434 \u0434\u0430\u044E\u0442 \u0436\u0438\u0437\u043D\u044C",
  "\u2022 \u041A\u0430\u0436\u0434\u0430\u044F \u0441\u043E\u0442\u043D\u044F \u0441\u043A\u0438\u043B\u043B\u043E\u0432 - \u0442\u043E\u0436\u0435 \u0436\u0438\u0437\u043D\u044C",
  "\u2022 \u0421\u043E\u0437\u0432\u043E\u043D \u0440\u0430\u0441\u0442\u043E\u043F\u0442\u0430\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F, \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u043E\u0439\u0442\u0438 \u0438\u043B\u0438 \u0437\u0430\u043A\u0438\u0434\u0430\u0442\u044C \u0442\u0435\u0441\u0442\u0430\u043C\u0438",
  "\u2022 \u0420\u043E\u0442\u0430\u0446\u0438\u044E \u0430\u043B\u0435\u0440\u0442\u043E\u0432 \u043D\u0435 \u0443\u0431\u0438\u0442\u044C \u043D\u0438\u043A\u0430\u043A - \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0436\u0434\u0430\u0442\u044C",
  "\u2022 \u042F\u0449\u0438\u043A \u0441\u043E \u0437\u043D\u0430\u043A\u043E\u043C \u0432\u043E\u043F\u0440\u043E\u0441\u0430 \u0431\u044C\u044E\u0442 \u0441\u043D\u0438\u0437\u0443, \u0433\u043E\u043B\u043E\u0432\u043E\u0439",
  "\u2022 \u041E\u0444\u0444\u0435\u0440 \u043F\u043E\u0432\u044B\u0448\u0430\u0435\u0442 \u0433\u0440\u0435\u0439\u0434, \u043A\u043E\u0444\u0435 \u0443\u0441\u043A\u043E\u0440\u044F\u0435\u0442, \u043E\u0442\u043F\u0443\u0441\u043A \u0434\u0430\u0451\u0442 \u043D\u0435\u0443\u044F\u0437\u0432\u0438\u043C\u043E\u0441\u0442\u044C",
  "\u2022 \u0424\u043B\u0430\u0436\u043E\u043A - \u043A\u043E\u043C\u043C\u0438\u0442: \u0441 \u043D\u0435\u0433\u043E \u043D\u0430\u0447\u043D\u0451\u0448\u044C \u043F\u043E\u0441\u043B\u0435 \u0441\u043C\u0435\u0440\u0442\u0438",
  "\u2022 \u0422\u0440\u0443\u0431\u0430 \u0441 \u0447\u0451\u0440\u043D\u044B\u043C \u0436\u0435\u0440\u043B\u043E\u043C \u043F\u0440\u043E\u0445\u043E\u0434\u043D\u0430\u044F \u0438\u043B\u0438 \u0432\u0435\u0434\u0451\u0442 \u0432 \u0437\u0430\u043D\u0430\u0447\u043A\u0443:",
  "  \u0432\u0441\u0442\u0430\u043D\u044C \u0441\u0432\u0435\u0440\u0445\u0443 \u0438 \u0436\u043C\u0438 \u25BC",
  "\u2022 \u0412 \u043F\u0440\u043E\u0434 \u043D\u0435 \u043F\u0430\u0434\u0430\u0439, \u0430 \u043E\u0442 \u0441\u0442\u0435\u043D\u044B \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u0430 \u0431\u0435\u0433\u0438",
  "\u2022 \u041D\u0430 \u0444\u0438\u043D\u0438\u0448\u0435 \u0444\u043B\u0430\u0433\u0448\u0442\u043E\u043A: \u0447\u0435\u043C \u0432\u044B\u0448\u0435 \u0437\u0430\u0446\u0435\u043F\u0438\u043B\u0441\u044F, \u0442\u0435\u043C \u0431\u043E\u043B\u044C\u0448\u0435 \u0431\u043E\u043D\u0443\u0441",
  "",
  "*\u0424\u0438\u043D\u0430\u043B*",
  "\u041D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u043C \u0443\u0440\u043E\u0432\u043D\u0435 \u0434\u0432\u0435\u0440\u044C \u0437\u0430\u043F\u0435\u0440\u0442\u0430, \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D \u0441\u043E\u0431\u0435\u0441. \u041E\u043D \u0445\u043E\u0434\u0438\u0442",
  "\u0437\u0430 \u0442\u043E\u0431\u043E\u0439 \u0438 \u043A\u0438\u0434\u0430\u0435\u0442 \u0432\u043E\u043F\u0440\u043E\u0441\u044B - \u0442\u0440\u0438 \u043F\u043E\u043F\u0430\u0434\u0430\u043D\u0438\u044F \u043F\u043E \u0433\u043E\u043B\u043E\u0432\u0435 \u0438\u043B\u0438 \u0442\u0435\u0441\u0442\u043E\u043C."
].join("\n");
var AUTHOR = [
  "\u0418\u0433\u0440\u0443 \u0438 *workaem* \u0441\u0434\u0435\u043B\u0430\u043B \u0413\u0435\u0432\u043E\u0440\u0433 \u041A\u0430\u0440\u0430\u0433\u043E\u0437\u044F\u043D - @Gevorg1989.",
  "",
  "\u041D\u0430\u043F\u0438\u0441\u0430\u043D\u043E \u0431\u0435\u0437 \u0434\u0432\u0438\u0436\u043A\u0430 \u0438 \u0431\u0435\u0437 \u0444\u0440\u0435\u0439\u043C\u0432\u043E\u0440\u043A\u0430: \u0441\u0432\u043E\u044F \u0444\u0438\u0437\u0438\u043A\u0430 \u043D\u0430 canvas,",
  "\u0432\u0441\u044F \u0433\u0440\u0430\u0444\u0438\u043A\u0430 \u0440\u0438\u0441\u0443\u0435\u0442\u0441\u044F \u043A\u043E\u0434\u043E\u043C, \u0432\u0435\u0441\u044C \u0437\u0432\u0443\u043A \u0441\u0438\u043D\u0442\u0435\u0437\u0438\u0440\u0443\u0435\u0442\u0441\u044F - \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E",
  "\u0444\u0430\u0439\u043B\u0430 \u0430\u0441\u0441\u0435\u0442\u043E\u0432. \u041F\u043E\u044D\u0442\u043E\u043C\u0443 \u0438\u0433\u0440\u0430 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0438\u0437 \u0447\u0430\u0442\u0430 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E.",
  "",
  "\u0412\u043E\u043F\u0440\u043E\u0441\u044B, \u0431\u0430\u0433\u0438 \u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F - \u043F\u0438\u0448\u0438\u0442\u0435 \u0432 \u043B\u0438\u0447\u043A\u0443: @Gevorg1989",
  "\u0418\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044B, \u0441\u0441\u044B\u043B\u043A\u0430 \u043D\u0438\u0436\u0435."
].join("\n");
async function topMessage(env) {
  if (!env.DB) return "\u0422\u0430\u0431\u043B\u0438\u0446\u0430 \u0440\u0435\u043A\u043E\u0440\u0434\u043E\u0432 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430.";
  try {
    const [career, levels] = await Promise.all([
      topOf(env.DB, CAREER, ALL_TIME, 5),
      levelStats(env.DB)
    ]);
    const lines = ["*\u0412\u0435\u0441\u044C \u043F\u0443\u0442\u044C* - \u043B\u0443\u0447\u0448\u0438\u0439 \u0437\u0430\u0431\u0435\u0433 \u0446\u0435\u043B\u0438\u043A\u043E\u043C"];
    if (career.length === 0) lines.push("\u041F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u043E - \u043C\u043E\u0436\u043D\u043E \u0441\u0442\u0430\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u043C.");
    career.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.name} - ${row.score} \u043E\u0447\u043A\u043E\u0432, \u0443\u0440\u043E\u0432\u043D\u0435\u0439 ${row.levels}`);
    });
    lines.push("", "*\u041B\u0438\u0434\u0435\u0440\u044B \u0443\u0440\u043E\u0432\u043D\u0435\u0439*");
    if (levels.length === 0) {
      lines.push("\u041D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F \u043F\u043E\u043A\u0430 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0441\u0434\u0430\u043B.");
    } else {
      for (const row of levels) {
        const best = row.top[0];
        if (!best) continue;
        const name = LEVEL_NAMES[row.level - 1] ?? `\u0423\u0440\u043E\u0432\u0435\u043D\u044C ${row.level}`;
        lines.push(`${row.level}. ${name} - ${best.name}, ${best.score} (\u0438\u0433\u0440\u043E\u043A\u043E\u0432 ${row.players})`);
      }
    }
    lines.push("", "\u041F\u043E\u043B\u043D\u0430\u044F \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u043F\u043E \u0443\u0440\u043E\u0432\u043D\u044F\u043C - \u043D\u0430 \u0441\u0442\u0430\u0440\u0442\u043E\u0432\u043E\u043C \u044D\u043A\u0440\u0430\u043D\u0435 \u0438\u0433\u0440\u044B.");
    return lines.join("\n");
  } catch (err) {
    console.error(`\u0442\u043E\u043F \u043D\u0435 \u0441\u043E\u0431\u0440\u0430\u043B\u0441\u044F: ${err}`);
    return "\u0422\u0430\u0431\u043B\u0438\u0446\u0430 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 - \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u043F\u043E\u0437\u0436\u0435.";
  }
}
var playRow = (gameUrl) => [{ text: "\u0418\u0433\u0440\u0430\u0442\u044C", web_app: { url: gameUrl } }];
function startKeyboard(gameUrl) {
  return {
    inline_keyboard: [
      playRow(gameUrl),
      [{ text: "\u0412\u0430\u043A\u0430\u043D\u0441\u0438\u0438", url: link("/jobs", "bot_start") }],
      [
        { text: "\u041A\u0430\u043A \u0438\u0433\u0440\u0430\u0442\u044C", callback_data: "help" },
        { text: "\u0422\u0430\u0431\u043B\u0438\u0446\u0430 \u0440\u0435\u043A\u043E\u0440\u0434\u043E\u0432", callback_data: "top" }
      ],
      [{ text: "\u041E\u0431 \u0430\u0432\u0442\u043E\u0440\u0435", callback_data: "author" }]
    ]
  };
}
function authorKeyboard(gameUrl) {
  return {
    inline_keyboard: [
      [{ text: "\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0430\u0432\u0442\u043E\u0440\u0443", url: "https://t.me/Gevorg1989" }],
      [{ text: "\u0418\u0441\u0445\u043E\u0434\u043D\u0438\u043A\u0438 \u043D\u0430 GitHub", url: "https://github.com/Gevorg22/workaem-junior-way" }],
      [{ text: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C workaem", url: link("", "bot_author") }],
      playRow(gameUrl)
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
var MAX_PHOTO = 9e5;
function decodePng(dataUrl) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) return null;
  if (dataUrl.length > MAX_PHOTO) return null;
  try {
    const binary = atob(dataUrl.slice(prefix.length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes[0] !== 137 || bytes[1] !== 80) return null;
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
    body: form
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
    link_preview_options: { is_disabled: true }
  });
}
async function handleUpdate(update, env) {
  const gameUrlForCb = env.GAME_URL ?? "https://game.workaem.com";
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
    const source = text.slice("/start".length).trim();
    if (source) console.log(`start \u043E\u0442 ${chatId}, \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A: ${source}`);
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
    await send(env, chatId, "\u0421\u0432\u0435\u0436\u0438\u0435 IT-\u0432\u0430\u043A\u0430\u043D\u0441\u0438\u0438, \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0435 4 \u0447\u0430\u0441\u0430:", jobsKeyboard());
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
    await send(env, chatId, "\u041F\u043E\u0433\u043D\u0430\u043B\u0438:", { inline_keyboard: [playRow(gameUrl)] });
    return;
  }
  await send(env, chatId, "\u0422\u0430\u043A\u043E\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u043D\u0435\u0442. \u0414\u0435\u0440\u0436\u0438 \u043A\u043D\u043E\u043F\u043A\u0443:", startKeyboard(gameUrl));
}
function resultMessage(user, stats, standing) {
  const grade = gradeFor(stats.levelsCleared);
  const name = user.first_name ? `${user.first_name}, \u0442\u044B` : "\u0422\u044B";
  const lines = [
    `${name} \u0434\u043E\u0448\u0451\u043B \u0434\u043E \u0433\u0440\u0435\u0439\u0434\u0430 *${grade}*.`,
    "",
    `\u0421\u043A\u0438\u043B\u043B\u043E\u0432 \u0441\u043E\u0431\u0440\u0430\u043D\u043E: ${stats.skills}`,
    `\u041E\u0447\u043A\u043E\u0432: ${stats.score}`
  ];
  if (stats.deaths > 0) lines.push(`\u0421\u043C\u0435\u0440\u0442\u0435\u0439: ${stats.deaths}`);
  if (stats.maxCombo > 2) lines.push(`\u041B\u0443\u0447\u0448\u0430\u044F \u0446\u0435\u043F\u043E\u0447\u043A\u0430: ${stats.maxCombo} \u043F\u043E\u0434\u0440\u044F\u0434`);
  if (stats.pipes > 0) lines.push(`\u041D\u0430\u0439\u0434\u0435\u043D\u043E \u0437\u0430\u043D\u0430\u0447\u0435\u043A \u0438 \u0442\u0440\u0443\u0431: ${stats.pipes}`);
  if (standing?.place) {
    lines.push("", `\u041C\u0435\u0441\u0442\u043E \u0432 \u043E\u0431\u0449\u0435\u043C \u0437\u0430\u0447\u0451\u0442\u0435: *${standing.place}* \u0438\u0437 ${standing.total}`);
  }
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
function cors(request, extra = {}) {
  const origin = request?.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    ...extra
  };
}
var json = (request, body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: cors(request, { "content-type": "application/json", ...extra })
});
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
      user: auth.user
    };
  }
  if (payload.wa) {
    const auth = await verifyWorkaem(payload.wa, env.WORKAEM_SECRET);
    if (!auth.ok) return { ok: false, reason: auth.reason, status: 401 };
    return { ok: true, source: "wa", id: auth.user.id, name: auth.user.name, chatId: null };
  }
  return { ok: false, reason: "\u0433\u043E\u0441\u0442\u044C", status: 403, guest: true };
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
    if (!who.guest) console.warn(`\u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043E\u0442\u043A\u043B\u043E\u043D\u0451\u043D: ${who.reason}`);
    return json(request, { ok: false, error: who.guest ? "guest" : "unauthorized" }, who.status);
  }
  const stats = payload.stats;
  const check = checkRun(stats);
  if (!check.ok) {
    console.warn(`\u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u044B\u0439 \u0437\u0430\u0431\u0435\u0433 \u043E\u0442 ${who.source}:${who.id}: ${check.reason}`);
    return json(request, { ok: false, error: "invalid run" }, 422);
  }
  const id = await hashId(who.source, who.id, env.BOARD_SALT);
  const name = payload.anon ? anonName(id) : cleanName(who.name);
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
        pipes: stats.pipes ?? 0
      });
      if (saved.ok) standing = { place: saved.place, total: saved.total, best: saved.best };
      else console.log(`\u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 ${who.source}:${id}: ${saved.reason}`);
    } catch (err) {
      console.error(`\u0437\u0430\u043F\u0438\u0441\u044C \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0443 \u043D\u0435 \u0443\u0434\u0430\u043B\u0430\u0441\u044C: ${err}`);
    }
  }
  let delivered = false;
  if (who.chatId && forBoard) {
    const text = resultMessage(who.user, stats, standing);
    const photo = decodePng(payload.photo);
    const res = photo ? await sendPhoto(env, who.chatId, photo, text, resultKeyboard()) : await call(env, "sendMessage", {
      chat_id: who.chatId,
      text,
      reply_markup: resultKeyboard(),
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true }
    });
    if (!res.ok) console.log(`\u043D\u0435 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E ${who.chatId}: ${res.description}`);
    delivered = Boolean(res.ok);
  }
  return json(request, { ok: true, delivered, recorded: Boolean(standing), standing, name });
}
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
    console.warn(`\u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u044B\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u043E\u0442 ${who.source}:${who.id}: ${check.reason}`);
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
      pipes: 0
    });
    if (!saved.ok) return json(request, { ok: true, recorded: false, reason: saved.reason });
    return json(request, {
      ok: true,
      recorded: true,
      level: result.level,
      standing: { place: saved.place, total: saved.total, best: saved.best }
    });
  } catch (err) {
    console.error(`\u0443\u0440\u043E\u0432\u0435\u043D\u044C \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043B\u0441\u044F: ${err}`);
    return json(request, { ok: true, recorded: false });
  }
}
async function handleStats(request, env) {
  if (!env.DB) return json(request, { ok: false, error: "no board" });
  let payload = {};
  try {
    payload = await request.json();
  } catch {
  }
  let who = null;
  const auth = await identify(payload, env);
  if (auth.ok) who = `${auth.source}:${await hashId(auth.source, auth.id, env.BOARD_SALT)}`;
  try {
    const data = await statsOf(env.DB, who);
    return json(request, { ok: true, ...data });
  } catch (err) {
    console.error(`\u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u043D\u0435 \u0441\u043E\u0431\u0440\u0430\u043B\u0430\u0441\u044C: ${err}`);
    return json(request, { ok: false, error: "stats failed" });
  }
}
async function handlePlayers(request, env) {
  if (!env.DB) return json(request, { ok: false, error: "no board" });
  let payload = {};
  try {
    payload = await request.json();
  } catch {
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
    console.error(`\u0441\u043F\u0438\u0441\u043E\u043A \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u043D\u0435 \u0441\u043E\u0431\u0440\u0430\u043B\u0441\u044F: ${err}`);
    return json(request, { ok: false, error: "players failed" });
  }
}
async function handleBoard(request, env) {
  if (!env.DB) return json(request, { ok: false, error: "no board" });
  try {
    const data = await boardOf(env.DB);
    return json(request, { ok: true, ...data }, 200, { "cache-control": "public, max-age=30" });
  } catch (err) {
    console.error(`\u0442\u0430\u0431\u043B\u0438\u0446\u0430 \u043D\u0435 \u043E\u0442\u0434\u0430\u043B\u0430\u0441\u044C: ${err}`);
    return json(request, { ok: false, error: "board failed" });
  }
}
var worker_default = {
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
