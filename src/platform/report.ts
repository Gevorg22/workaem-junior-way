import type { RunStats } from "../game/types";
import type { LevelResult } from "../game/world";
import { identityBody, WORKER } from "./board";
import type { Standing } from "./board";

/**
 * Отправка результатов.
 *
 * Один адрес делает две вещи: пишет результат в общую статистику и присылает
 * поздравление в чат. Бот живёт на Cloudflare Workers, а не на нашей ВМ:
 * её сеть режет исходящие к api.telegram.org (см. worker/README.md).
 *
 * Отправляется только проверяемая личность - подпись Telegram или токен
 * workaem. У гостя запрос вообще не уходит: незачем ходить в сеть, чтобы
 * узнать то, что известно заранее.
 */
const RESULT = `${WORKER}/result`;
const LEVEL = `${WORKER}/level`;

/** Один забег - одно сообщение. Иначе переигрывание засыпало бы чат. */
let sent = false;

export function resetReport(): void {
  sent = false;
}

/**
 * Картинка результата уходит вместе со счётом: бот пришлёт её фотографией,
 * а не строчкой текста. Расшаренную картинку открывают и обсуждают, ссылку
 * пролистывают. Слишком большую не шлём - у Telegram свои пределы, да и
 * держать сотни килобайт в теле запроса незачем.
 */
const MAX_PHOTO = 900_000;

export interface RunReport {
  /** Записан ли результат в общую статистику. */
  recorded: boolean;
  /** Место в общем зачёте, если записан. */
  standing: Standing | null;
  /** Почему не записан: guest - нет проверяемой личности. */
  reason?: "guest" | "offline" | "rejected";
}

export interface ReportInput {
  stats: RunStats;
  /** PNG-картинка результата для чата. */
  photo?: string;
  /** Показываться в таблицах безымянно. */
  anon?: boolean;
}

export async function reportRun(input: ReportInput): Promise<RunReport> {
  const offline: RunReport = { recorded: false, standing: null, reason: "offline" };
  if (sent) return offline;

  const who = identityBody();
  if (!who) return { recorded: false, standing: null, reason: "guest" };

  sent = true;
  const picture =
    input.photo && input.photo.startsWith("data:image/png;base64,") && input.photo.length < MAX_PHOTO
      ? input.photo
      : undefined;

  const body: Record<string, unknown> = { ...who, stats: input.stats };
  if (input.anon) body["anon"] = true;
  if (picture) body["photo"] = picture;

  try {
    const res = await fetch(RESULT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Результат нужен серверу, а не игре: экран не должен ждать сеть.
      keepalive: true,
    });
    if (res.status === 403) return { recorded: false, standing: null, reason: "guest" };
    if (!res.ok) return { recorded: false, standing: null, reason: "rejected" };
    const data = (await res.json()) as { recorded?: boolean; standing?: Standing | null };
    return { recorded: Boolean(data.recorded), standing: data.standing ?? null };
  } catch (err) {
    // Сообщение в чат и место в таблице - приятное дополнение, а не часть
    // игры. Упавший запрос не должен ничего ломать на финальном экране.
    console.warn("результат не отправлен:", err);
    return offline;
  }
}

/**
 * Результат одного уровня. Уходит на каждом финише, а не в конце забега:
 * уровень - самостоятельное соревнование на одной и той же для всех карте,
 * и выход в меню посреди пути не должен обнулять пройденное.
 */
export async function reportLevel(
  result: LevelResult,
  anon = false,
): Promise<{ recorded: boolean; standing: Standing | null }> {
  const nothing = { recorded: false, standing: null };
  const who = identityBody();
  if (!who) return nothing;

  try {
    const res = await fetch(LEVEL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(anon ? { ...who, result, anon: true } : { ...who, result }),
      keepalive: true,
    });
    if (!res.ok) return nothing;
    const data = (await res.json()) as { recorded?: boolean; standing?: Standing | null };
    return { recorded: Boolean(data.recorded), standing: data.standing ?? null };
  } catch {
    return nothing;
  }
}
