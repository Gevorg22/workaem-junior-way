/**
 * Проверка подписи initData из Telegram Mini App.
 *
 * Всё, что приходит из игры, - это данные из браузера, то есть их можно
 * подделать. Единственное, чему можно верить, - подпись Telegram:
 *
 *   secret_key = HMAC-SHA256(ключ: "WebAppData", данные: токен бота)
 *   hash       = HMAC-SHA256(ключ: secret_key,  данные: data_check_string)
 *
 * data_check_string - все поля кроме hash, отсортированные по имени
 * и склеенные через \n в виде key=value.
 */

const enc = new TextEncoder();

async function hmac(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, messageBytes));
}

const toHex = (bytes) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Сравнение за постоянное время: обычное === утекает длину совпадения. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * @returns {Promise<{ok: true, user: object, authDate: number} | {ok: false, reason: string}>}
 */
export async function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData) return { ok: false, reason: "пустой initData" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "нет подписи" };

  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await hmac(enc.encode("WebAppData"), enc.encode(botToken));
  const computed = toHex(await hmac(secretKey, enc.encode(checkString)));

  if (!timingSafeEqual(computed, hash)) return { ok: false, reason: "подпись не сходится" };

  // Свежесть обязательна: без неё однажды перехваченный initData
  // работал бы вечно.
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate) return { ok: false, reason: "нет auth_date" };
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSeconds) return { ok: false, reason: `initData устарел на ${age} с` };

  let user;
  try {
    user = JSON.parse(params.get("user") ?? "null");
  } catch {
    return { ok: false, reason: "user не разобрался" };
  }
  if (!user?.id) return { ok: false, reason: "нет user.id" };

  return { ok: true, user, authDate };
}
