import type { RunStats } from "../game/types";
import { rawInitData } from "./telegram";

/**
 * Отправка результата забега боту.
 *
 * Бот живёт на Cloudflare Workers, а не на нашей ВМ: её сеть режет
 * исходящие к api.telegram.org (см. worker/README.md).
 */
const ENDPOINT = "https://workaem-game-bot.gevorg-kara.workers.dev/result";

/** Один забег - одно сообщение. Иначе переигрывание засыпало бы чат. */
let sent = false;

export function resetReport(): void {
  sent = false;
}

export async function reportRun(stats: RunStats): Promise<void> {
  if (sent) return;

  const initData = rawInitData();
  // Вне Telegram отправлять нечего и некому: подписи нет, адресата тоже.
  if (!initData) return;

  sent = true;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, stats }),
      // Результат нужен боту, а не игре: ответ не влияет на экран.
      keepalive: true,
    });
  } catch (err) {
    // Сообщение в чат - приятное дополнение, а не часть игры.
    // Упавший запрос не должен ничего ломать на финальном экране.
    console.warn("результат не отправлен:", err);
  }
}
