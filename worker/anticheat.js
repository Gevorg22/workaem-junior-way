/**
 * Отсечка невозможных результатов.
 *
 * Очки считаются в браузере, значит подделываются за минуту. Поэтому в
 * таблицу и в сообщения идут не только очки, а всё состояние забега -
 * и отсекается то, что физически недостижимо.
 *
 * Цель не поймать всех, а не дать рекорду в 10^9 очков за 3 секунды:
 * такой результат обесценивает таблицу для всех остальных.
 */

/** Суммарная длина всех карт и максимальная скорость - из levels.ts и tuning.ts. */
const TOTAL_LEVEL_WIDTH = 12350;
const MAX_SPEED = 2.15;
const TOTAL_GEMS = 214;
const TOTAL_LEVELS = 4;

/** Даже идеальный проход не быстрее, чем длина карт делить на максимальную скорость. */
const MIN_FRAMES = Math.floor(TOTAL_LEVEL_WIDTH / MAX_SPEED);

export function checkRun(stats) {
  if (!stats || typeof stats !== "object") return { ok: false, reason: "нет статистики" };

  const nums = ["score", "skills", "levelsCleared", "frames", "jumps", "stomps", "deaths"];
  for (const key of nums) {
    const v = stats[key];
    if (!Number.isInteger(v) || v < 0) return { ok: false, reason: `${key}: не целое неотрицательное` };
  }

  if (stats.levelsCleared > TOTAL_LEVELS) {
    return { ok: false, reason: `уровней больше, чем есть: ${stats.levelsCleared}` };
  }
  if (stats.skills > TOTAL_GEMS) {
    return { ok: false, reason: `скиллов больше, чем на картах: ${stats.skills}` };
  }

  // Прошёл все уровни - значит провёл в игре хотя бы физический минимум кадров.
  if (stats.levelsCleared === TOTAL_LEVELS && stats.frames < MIN_FRAMES) {
    return { ok: false, reason: `${stats.frames} кадров при минимуме ${MIN_FRAMES}` };
  }

  // Пройти платформер, ни разу не прыгнув, нельзя.
  if (stats.levelsCleared > 0 && stats.jumps === 0) {
    return { ok: false, reason: "уровни пройдены без единого прыжка" };
  }

  // Очки складываются из известных слагаемых - верхнюю границу можно посчитать.
  const maxScore =
    stats.skills * 100 + stats.stomps * 200 + stats.levelsCleared * (500 + 3 * 250) + 50 * 20;
  if (stats.score > maxScore) {
    return { ok: false, reason: `${stats.score} очков при максимуме ${maxScore}` };
  }

  return { ok: true };
}

/** Грейд по числу пройденных уровней - та же шкала, что показывает игра. */
export function gradeFor(levelsCleared) {
  return ["Джун", "Мидл", "Сеньор", "Лид", "Лид"][Math.min(levelsCleared, 4)] ?? "Джун";
}
