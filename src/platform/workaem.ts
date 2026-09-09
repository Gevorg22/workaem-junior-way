/**
 * Вход через workaem.
 *
 * В общую таблицу пускаем только тех, чью личность можно проверить: игроков
 * из Telegram по подписи бота и владельцев аккаунта workaem по токену. Все
 * остальные - гости: их рекорд живёт в браузере, и это честнее, чем таблица,
 * в которой к вечеру первого дня стоит «Дуров» с миллиардом очков.
 *
 * Заодно это ровно то, ради чего игра и сделана: чтобы результат сохранился
 * навсегда, человек регистрируется на workaem - а там вакансии, зарплаты
 * и вопросы с собеседований, то есть то, за чем он и пришёл.
 *
 * Протокол описан в worker/auth.js. Со стороны игры он такой:
 *
 *   1. Игрок жмёт «Войти через workaem».
 *   2. Уходим на /game/auth?back=<адрес игры>&nonce=<строка>.
 *   3. workaem показывает вход или регистрацию и возвращает нас на
 *      <back>#wa=<токен>&nonce=<та же строка>.
 *   4. Проверяем nonce, кладём токен в localStorage и шлём его вместе
 *      с результатом; подпись проверяет воркер.
 *
 * Токен приходит во фрагменте, а не в query: фрагмент не уходит ни в логи
 * сервера, ни в Referer.
 */

/**
 * Готовность стороны workaem. Пока страницы /game/auth там нет, кнопка
 * входа не показывается - вместо неё зовём зарегистрироваться обычной
 * ссылкой, и это работает уже сегодня. Когда страница появится, здесь
 * меняется одно значение.
 */
export const AUTH_READY = false;

const AUTH_URL = "https://www.workaem.com/game/auth";
/**
 * Страница регистрации на workaem. Адрес именно /auth/register - я сначала
 * поставил наугад /signup, и он отдавал 404: у сайта раздел авторизации
 * лежит под /auth. Рядом с ним /auth/login для тех, у кого аккаунт уже есть.
 */
const SIGNUP_URL =
  "https://www.workaem.com/auth/register?utm_source=game&utm_medium=board&utm_campaign=junior-way";
const LOGIN_URL =
  "https://www.workaem.com/auth/login?utm_source=game&utm_medium=board&utm_campaign=junior-way";
const KEY = "junior-way:wa";
const NONCE_KEY = "junior-way:wa-nonce";

export interface Account {
  name: string;
  token: string;
  /** Срок токена, секунды epoch. */
  exp: number;
}

export const signupUrl = (): string => SIGNUP_URL;
export const loginUrl = (): string => LOGIN_URL;

function read(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Account>;
    if (!data.token || typeof data.exp !== "number") return null;
    // Просроченный токен не удаляем молча: пусть игра предложит войти снова.
    if (data.exp * 1000 < Date.now()) return null;
    return { name: data.name ?? "Джун", token: data.token, exp: data.exp };
  } catch {
    return null;
  }
}

/** Полезная нагрузка токена без проверки подписи - только чтобы показать имя. */
function peek(token: string): { name?: string; exp?: number } | null {
  const body = token.split(".")[1];
  if (!body) return null;
  try {
    const padded = body.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    // Имя в токене - в UTF-8, а atob отдаёт байты: без декодера кириллица
    // превращается в кракозябры.
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as { name?: string; exp?: number };
  } catch {
    return null;
  }
}

/**
 * Разбор возврата с workaem. Зовётся один раз при запуске: если во
 * фрагменте лежит токен и nonce совпал - запоминаем и чистим адрес,
 * чтобы токен не остался в истории браузера.
 */
export function pickUpToken(): Account | null {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!hash.includes("wa=")) return read();

  const params = new URLSearchParams(hash);
  const token = params.get("wa");
  const nonce = params.get("nonce");
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(NONCE_KEY);
    sessionStorage.removeItem(NONCE_KEY);
  } catch {
    // Приватный режим: nonce проверить нечем. Токен всё равно проверяется
    // подписью на сервере, так что это не дыра, а лишь потеря защиты
    // от подсунутой ссылки.
  }

  history.replaceState(null, "", location.pathname + location.search);

  if (!token || (expected && nonce !== expected)) return read();
  const payload = peek(token);
  if (!payload?.exp) return read();

  const account: Account = { name: payload.name ?? "Джун", token, exp: payload.exp };
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // Не сохранилось - работает в этой сессии.
  }
  return account;
}

export function account(): Account | null {
  return read();
}

export function login(): void {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    sessionStorage.setItem(NONCE_KEY, nonce);
  } catch {
    // Без nonce вход всё равно состоится - см. оговорку выше.
  }
  const back = location.origin + location.pathname;
  location.href = `${AUTH_URL}?back=${encodeURIComponent(back)}&nonce=${encodeURIComponent(nonce)}`;
}

export function logout(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего удалять.
  }
}
