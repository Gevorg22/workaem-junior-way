/**
 * Личность из workaem.
 *
 * В таблицу рекордов пускаем только тех, чью личность можно проверить.
 * Для Telegram это initData с подписью бота (см. telegram.js), для сайта -
 * короткий токен, который workaem выдаёт после входа. Всё остальное -
 * гости: их результат живёт в браузере и в общую таблицу не идёт, иначе
 * туда за день приедет «Дуров» с миллиардом очков.
 *
 * Формат токена - JWT с HS256 на общем секрете. Почему так:
 *
 * - игра и сайт живут на разных поддоменах, и на cookie полагаться нельзя:
 *   session-cookie у workaem может быть host-only, а перевыпускать её
 *   ради игры - трогать авторизацию продукта;
 * - подпись проверяется воркером сам, без обращения к workaem: сайт может
 *   лежать, а таблица рекордов от этого падать не должна;
 * - секрет один и тот же с двух сторон, и хранится он в переменных
 *   окружения, а не в репозитории.
 *
 * Что должен сделать workaem (одна страница и один секрет):
 *
 *   GET /game/auth?back=<url игры>&nonce=<строка>
 *     - если не залогинен, показать обычный вход или регистрацию
 *       (это и есть смысл затеи: игра приводит регистрации);
 *     - после входа редиректом вернуть игрока на
 *       <back>#wa=<jwt>&nonce=<та же строка>
 *
 *   JWT: alg HS256, полезная нагрузка { sub, name, iat, exp, nonce }
 *     sub  - идентификатор пользователя в workaem (в таблицу попадёт
 *            только его хеш с солью)
 *     name - ник, как показывать в топе
 *     exp  - срок, разумно месяц: игру открывают снова и снова
 *
 * Токен уезжает во фрагменте, а не в query: фрагмент не попадает
 * ни в логи Caddy, ни в Referer.
 */

const enc = new TextEncoder();

function fromBase64Url(part) {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const decodeJson = (part) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));

/**
 * Проверка токена workaem.
 *
 * @returns {Promise<{ok: true, user: {id: string, name: string}} | {ok: false, reason: string}>}
 */
export async function verifyWorkaem(token, secret) {
  if (!secret) return { ok: false, reason: "секрет workaem не задан" };
  if (typeof token !== "string" || token.length > 4096) return { ok: false, reason: "нет токена" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "не JWT" };
  const [head, body, signature] = parts;

  let header;
  let payload;
  try {
    header = decodeJson(head);
    payload = decodeJson(body);
  } catch {
    return { ok: false, reason: "битый токен" };
  }

  // Алгоритм читаем из заголовка только чтобы отвергнуть чужой: доверять
  // ему нельзя - иначе токен с alg:none подписывал бы сам себя.
  if (header?.alg !== "HS256") return { ok: false, reason: `алгоритм ${header?.alg}` };

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    enc.encode(`${head}.${body}`),
  );
  if (!valid) return { ok: false, reason: "подпись не сходится" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, reason: "токен просрочен" };
  }
  // Пять минут на расхождение часов - обычный допуск.
  if (typeof payload.iat === "number" && payload.iat > now + 300) {
    return { ok: false, reason: "токен из будущего" };
  }
  if (!payload.sub) return { ok: false, reason: "нет sub" };

  return { ok: true, user: { id: String(payload.sub), name: payload.name ?? "" } };
}
