/**
 * Таблица рекордов на D1.
 *
 * Почему D1, а не KV: таблице нужны ORDER BY и COUNT - без них нельзя
 * сказать «ты 14-й из 320», а место важнее самого топа, потому что в
 * топ-10 не попадёт почти никто, а своё место есть у каждого. В KV
 * сортировки нет вовсе: пришлось бы держать топ одним JSON-блобом и
 * перезаписывать целиком, а KV к тому же согласован не сразу - два
 * игрока, финишировавшие одновременно, затёрли бы друг друга.
 *
 * Всё здесь молча деградирует: если база не привязана, игра работает
 * как раньше - просто без таблицы.
 */

/** Сколько строк отдаём в топе. Больше на экране всё равно не читают. */
const TOP_LIMIT = 10;

/**
 * Пауза между результатами от одного игрока в одной и той же таблице.
 * Против скриптов, не против людей: считаем на таблицу, а не на игрока
 * вообще, иначе результат второго уровня отбрасывался бы из-за первого -
 * они приходят подряд, по мере прохождения.
 */
const COOLDOWN_MS = 8_000;

/**
 * Ключ недели по ISO: год и номер недели. Неделя начинается с понедельника,
 * поэтому сброс происходит в ночь с воскресенья на понедельник по UTC.
 *
 * Считаем по правилу ISO-8601: неделя принадлежит тому году, на который
 * приходится её четверг. Иначе конец декабря и начало января попадали бы
 * в разные таблицы посреди одной и той же недели.
 */
export function weekKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Ключ дня для задачи дня. */
export function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Хеш идентификатора с солью. Сырой id игрока в таблице не нужен: по нему
 * ничего не показывается, он служит только для «это тот же человек».
 */
export async function hashId(source, id, salt) {
  const data = new TextEncoder().encode(`${source}:${id}:${salt ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Имя для таблицы. Обрезаем, чистим управляющие символы и разметку: имя
 * приходит из Telegram или из workaem, но показывается всем, а Markdown
 * в сообщении бота от чужого имени - это уже инъекция.
 */
export function cleanName(raw) {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim();
  const safe = text.replace(/[*_`[\]()~>#+=|{}]/g, "").replace(/\s+/g, " ");
  return safe.slice(0, 18) || "Джун";
}

/** Анонимное имя: узнаваемо между забегами, но ничего не выдаёт. */
export const anonName = (who) => `Джун #${who.slice(0, 4)}`;

/**
 * Запись забега. Возвращает место игрока в своей таблице - его и показывает
 * игра сразу после финиша: «ты 14-й из 320» это причина сыграть ещё раз,
 * а сам топ-10 такой причиной быть не может.
 */
export async function saveRun(db, run) {
  const now = Date.now();

  // Рейт-лимит: один результат в двадцать секунд на игрока. Забег быстрее
  // этого физически невозможен, значит это скрипт.
  const last = await db
    .prepare("SELECT at FROM runs WHERE who = ?1 AND mode = ?2 ORDER BY at DESC LIMIT 1")
    .bind(run.who, run.mode)
    .first();
  if (last && now - last.at < COOLDOWN_MS) {
    return { ok: false, reason: "слишком часто" };
  }

  await db
    .prepare(
      `INSERT INTO runs (who, name, source, mode, bucket, score, skills, levels, deaths, combo, frames, at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      run.who, run.name, run.source, run.mode, run.bucket,
      run.score, run.skills, run.levels, run.deaths, run.combo, run.frames, now,
    )
    .run();

  await bumpTotals(db, run);
  const standing = await placeOf(db, run.mode, run.bucket, run.who);
  return { ok: true, ...standing };
}

/**
 * Общие счётчики. Считаются приростом за забег: сумма по всей таблице
 * стоила бы полного скана, а числа тут нужны для витрины, а не для суда.
 */
async function bumpTotals(db, run) {
  const add = [
    ["runs", 1],
    ["skills", run.skills],
    ["stomps", run.stomps ?? 0],
    ["deaths", run.deaths],
    ["blocks", run.blocks ?? 0],
    ["pipes", run.pipes ?? 0],
    ["seconds", Math.round(run.frames / 75)],
    ["finished", run.levels >= 12 ? 1 : 0],
  ];
  const stmt = db.prepare(
    `INSERT INTO totals (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = value + ?2`,
  );
  await db.batch(add.filter(([, v]) => v > 0).map(([key, value]) => stmt.bind(key, value)));
}

/**
 * Место игрока: сколько игроков в этой таблице набрали больше его лучшего
 * результата. Считаем по лучшему на игрока, а не по каждому забегу -
 * иначе один человек занимал бы всю первую страницу.
 */
export async function placeOf(db, mode, bucket, who) {
  const best = await db
    .prepare("SELECT MAX(score) AS score FROM runs WHERE mode = ?1 AND bucket = ?2 AND who = ?3")
    .bind(mode, bucket, who)
    .first();
  if (!best || best.score === null) return { place: 0, total: 0, best: 0 };

  const row = await db
    .prepare(
      `WITH bests AS (
         SELECT who, MAX(score) AS score FROM runs
         WHERE mode = ?1 AND bucket = ?2 GROUP BY who
       )
       SELECT
         (SELECT COUNT(*) FROM bests WHERE score > ?3) AS above,
         (SELECT COUNT(*) FROM bests) AS total`,
    )
    .bind(mode, bucket, best.score)
    .first();

  return { place: (row?.above ?? 0) + 1, total: row?.total ?? 1, best: best.score };
}

/** Топ таблицы: по лучшему результату на игрока. */
export async function topOf(db, mode, bucket, limit = TOP_LIMIT) {
  const { results } = await db
    .prepare(
      `SELECT name, source, MAX(score) AS score, levels, deaths, combo
       FROM runs WHERE mode = ?1 AND bucket = ?2
       GROUP BY who ORDER BY score DESC LIMIT ?3`,
    )
    .bind(mode, bucket, limit)
    .all();
  return results ?? [];
}

export async function totalsOf(db) {
  const { results } = await db.prepare("SELECT key, value FROM totals").all();
  const out = {};
  for (const row of results ?? []) out[row.key] = row.value;
  return out;
}

/**
 * Ключ таблицы забегов. Раньше здесь была неделя с обнулением в понедельник,
 * но статистика по уровням честнее любого недельного зачёта: карта уровня
 * у всех одна и та же. Поэтому общий зачёт стал сквозным, а колонка bucket
 * осталась - недельный вид можно вернуть, не трогая схему.
 */
export const ALL_TIME = "all";

/** Всё, что нужно стартовому экрану, одним ответом - в один запрос. */
export async function boardOf(db) {
  const [career, totals] = await Promise.all([
    topOf(db, "career", ALL_TIME),
    totalsOf(db),
  ]);
  return { career, totals };
}

/* ------------------------------------------------------------------ *
 * Статистика по уровням
 *
 * Главная таблица игры, и не случайно: карты процедурные, но
 * детерминированные - у каждого уровня фиксированный сид, значит «Стартап»
 * у всех абсолютно одинаковый. Сравнивать результаты на одном уровне
 * честно, а общий счёт за забег - нет: он зависит от того, сколько игрок
 * успел набегать до смерти.
 *
 * Строки уровней лежат в той же таблице runs с mode вида "level:7".
 * Отдельной таблицы не понадобилось: у забега и у уровня один и тот же
 * набор чисел.
 * ------------------------------------------------------------------ */

export const levelMode = (level) => `level:${level}`;

/** Номер уровня из ключа таблицы. */
const levelOf = (mode) => Number(String(mode).slice("level:".length));

/**
 * Сводка по всем уровням одним запросом: сколько игроков и первая тройка.
 * Двенадцать отдельных запросов на один экран - это двенадцать поездок
 * к базе там, где хватает одной.
 */
export async function levelStats(db) {
  const { results } = await db
    .prepare(
      `WITH bests AS (
         SELECT mode, who, name, MAX(score) AS score, frames FROM runs
         WHERE mode LIKE 'level:%' GROUP BY mode, who
       ), ranked AS (
         SELECT mode, name, score, frames,
                ROW_NUMBER() OVER (PARTITION BY mode ORDER BY score DESC) AS rn,
                COUNT(*) OVER (PARTITION BY mode) AS players
         FROM bests
       )
       SELECT mode, name, score, frames, rn, players FROM ranked
       WHERE rn <= 3 ORDER BY mode, rn`,
    )
    .all();

  const byLevel = {};
  for (const row of results ?? []) {
    const level = levelOf(row.mode);
    if (!Number.isInteger(level)) continue;
    byLevel[level] ??= { level, players: row.players, top: [] };
    byLevel[level].top.push({ name: row.name, score: row.score, frames: row.frames });
  }
  return Object.values(byLevel).sort((a, b) => a.level - b.level);
}

/** Мои результаты по уровням: лучший счёт, время и место. */
export async function myLevels(db, who) {
  const { results } = await db
    .prepare(
      `WITH bests AS (
         SELECT mode, who, MAX(score) AS score, frames FROM runs
         WHERE mode LIKE 'level:%' GROUP BY mode, who
       )
       SELECT m.mode, m.score, m.frames,
              (SELECT COUNT(*) FROM bests b WHERE b.mode = m.mode AND b.score > m.score) + 1 AS place,
              (SELECT COUNT(*) FROM bests b WHERE b.mode = m.mode) AS players
       FROM bests m WHERE m.who = ?1`,
    )
    .bind(who)
    .all();

  const mine = {};
  for (const row of results ?? []) {
    const level = levelOf(row.mode);
    if (!Number.isInteger(level)) continue;
    mine[level] = { score: row.score, frames: row.frames, place: row.place, players: row.players };
  }
  return mine;
}

/** Всё, что нужно экрану статистики. Личность необязательна. */
export async function statsOf(db, who) {
  const [career, levels, totals, mine] = await Promise.all([
    topOf(db, "career", ALL_TIME),
    levelStats(db),
    totalsOf(db),
    who ? myLevels(db, who) : Promise.resolve({}),
  ]);
  return { career, levels, totals, mine };
}

/* ------------------------------------------------------------------ *
 * Список игроков
 *
 * Постранично, а не целиком: строк со временем станет тысячи, а открывают
 * список с телефона в вебвью Telegram. Смещение считается на сервере,
 * поэтому можно прыгнуть прямо на страницу со своим местом - в
 * бесконечной прокрутке до него пришлось бы доскроллить.
 * ------------------------------------------------------------------ */

/** Сколько строк на странице. Больше на экране телефона всё равно не видно. */
export const PAGE_SIZE = 10;

export async function playersPage(db, offset = 0, limit = PAGE_SIZE) {
  const take = Math.max(1, Math.min(50, Math.floor(limit) || PAGE_SIZE));
  const skip = Math.max(0, Math.floor(offset) || 0);

  const { results } = await db
    .prepare(
      `WITH bests AS (
         SELECT who, name, source, MAX(score) AS score, levels, deaths
         FROM runs WHERE mode = 'career' AND bucket = ?1 GROUP BY who
       )
       SELECT name, source, score, levels, deaths,
              ROW_NUMBER() OVER (ORDER BY score DESC) AS place
       FROM bests ORDER BY score DESC LIMIT ?2 OFFSET ?3`,
    )
    .bind(ALL_TIME, take, skip)
    .all();

  const counted = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM (
         SELECT who FROM runs WHERE mode = 'career' AND bucket = ?1 GROUP BY who
       )`,
    )
    .bind(ALL_TIME)
    .first();

  return { rows: results ?? [], total: counted?.total ?? 0, offset: skip, limit: take };
}
