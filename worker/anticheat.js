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
// Числа ниже обязаны совпадать с игрой, иначе честный игрок, прошедший все
// уровни, будет отвергнут как накрутчик. Пересчитать: npm run anticheat
const TOTAL_LEVEL_WIDTH = 37764;
const MAX_SPEED = 1.8;
const TOTAL_GEMS = 833;
const TOTAL_LEVELS = 12;
const MIN_LEVEL_FRAMES = 744;
const COMBO_SCORE = [200, 400, 800, 1000, 2000, 4000];
const LEVEL_MIN_FRAMES = [446, 921, 961, 880, 972, 947, 950, 860, 917, 934, 918, 912];
const LEVEL_MAX_SCORE = [24400, 47100, 77150, 57600, 89000, 113550, 106450, 88800, 114150, 98350, 104350, 113550];

/** Названия уровней - для сообщений бота. Тоже из игры, чтобы не разъехались. */
export const LEVEL_NAMES = ["Стажировка", "Галера", "Аутсорс", "Серверная", "Студия", "Стартап", "Продукт", "Легаси", "Платформа", "Корпорация", "Своя фирма", "Оффер"];

/** Даже идеальный проход не быстрее, чем длина карт делить на максимальную скорость. */
const MIN_FRAMES = Math.floor(TOTAL_LEVEL_WIDTH / MAX_SPEED);

export function checkRun(stats) {
  if (!stats || typeof stats !== "object") return { ok: false, reason: "нет статистики" };

  const nums = ["score", "skills", "levelsCleared", "frames", "jumps", "stomps", "deaths", "blocks"];
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

  // Частичный забег: каждый зачтённый уровень тоже стоит времени. Самая
  // короткая карта на максимальной скорости - это MIN_LEVEL_FRAMES кадров,
  // и меньше не бывает даже у идеального бегуна.
  if (stats.frames < stats.levelsCleared * MIN_LEVEL_FRAMES) {
    return { ok: false, reason: `${stats.frames} кадров на ${stats.levelsCleared} уровней` };
  }

  // Пройти платформер, ни разу не прыгнув, нельзя.
  if (stats.levelsCleared > 0 && stats.jumps === 0) {
    return { ok: false, reason: "уровни пройдены без единого прыжка" };
  }

  // Цепочка растаптываний не может быть длиннее, чем всего растоптано.
  const combo = stats.maxCombo ?? 0;
  if (!Number.isInteger(combo) || combo < 0 || combo > stats.stomps) {
    return { ok: false, reason: `цепочка ${combo} при ${stats.stomps} растоптанных` };
  }

  /*
   * Верхняя граница очков. Считается по потолку каждого слагаемого, а не по
   * среднему: задача - отсечь миллиард за три секунды, а не поймать того,
   * кто накрутил на десять процентов.
   *
   * Жизни растут по ходу забега: сотня скиллов даёт жизнь, и цепочка
   * растаптываний после шестого подряд - тоже. Поэтому бонус за жизни на
   * финише уровня считается не от трёх, а от достижимого максимума.
   */
  const maxLives = 3 + Math.floor(stats.skills / 100) + Math.floor(stats.stomps / 7);
  // Потолок за одного растоптанного - не самое жирное звено таблицы, а то,
  // до которого игрок реально дошёл: цепочка платит COMBO_SCORE[combo-1],
  // и при цепочке в один прыжок каждое растаптывание стоит 200, а не 4000.
  // Без этого потолок был в двадцать раз выше правды, и подменённые очки
  // проходили проверку не хуже честных.
  const perStomp = COMBO_SCORE[Math.min(Math.max(combo, 1), COMBO_SCORE.length) - 1];
  const maxScore =
    stats.skills * 100 +
    stats.stomps * perStomp +
    stats.blocks * 50 +
    (stats.tested ?? 0) * 150 +
    // Оффер из блока даёт 300, кофе 50; блоков на картах заметно меньше сотни.
    100 * 300 +
    // Собес в финале.
    2000 +
    // За уровень: финиш, жизни, верхушка флагштока и бонус за скорость.
    stats.levelsCleared * (500 + maxLives * 250 + 3000 + 75 * 12);
  if (stats.score > maxScore) {
    return { ok: false, reason: `${stats.score} очков при максимуме ${maxScore}` };
  }

  return { ok: true };
}

/** Грейд по числу пройденных уровней - та же шкала, что показывает игра. */
export function gradeFor(levelsCleared) {
  return ["Джун", "Мидл", "Сеньор", "Лид", "Лид"][Math.min(levelsCleared, 4)] ?? "Джун";
}

/**
 * Проверка результата одного уровня.
 *
 * Это самая сильная отсечка в игре, и по простой причине: и минимум кадров,
 * и потолок очков посчитаны из самой карты - её длины, числа скиллов,
 * врагов, ящиков и заначек, - а не выведены на глаз из общих соображений.
 * Обе таблицы генерируются командой `npm run anticheat` из данных игры,
 * поэтому разъехаться с ней не могут.
 *
 * Уровни, в отличие от забега, сравнимы между игроками: карты
 * детерминированные, у каждого уровня фиксированный сид, значит «Стартап»
 * у всех одинаковый.
 */
export function checkLevel(result) {
  if (!result || typeof result !== "object") return { ok: false, reason: "нет результата" };

  const level = result.level;
  if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) {
    return { ok: false, reason: `уровня ${level} в игре нет` };
  }

  for (const key of ["score", "frames", "deaths", "skills"]) {
    const v = result[key];
    if (!Number.isInteger(v) || v < 0) return { ok: false, reason: `${key}: не целое неотрицательное` };
  }

  const minFrames = LEVEL_MIN_FRAMES[level - 1];
  if (result.frames < minFrames) {
    return { ok: false, reason: `${result.frames} кадров на уровне ${level} при минимуме ${minFrames}` };
  }

  const maxScore = LEVEL_MAX_SCORE[level - 1];
  if (result.score > maxScore) {
    return { ok: false, reason: `${result.score} очков на уровне ${level} при максимуме ${maxScore}` };
  }

  // Смерть стоит времени: возрождение отбрасывает к последнему коммиту,
  // и этот путь надо пробежать заново. Доля намеренно скромная - коммиты
  // стоят часто, и откат бывает совсем коротким. Первая версия требовала
  // четверть уровня за смерть и отвергала честный забег с одной смертью:
  // проверка обязана ловить нелепое, а не наказывать за неудачу.
  if (result.deaths > 0 && result.frames < minFrames * (1 + result.deaths * 0.05)) {
    return { ok: false, reason: `${result.deaths} смертей за ${result.frames} кадров` };
  }

  return { ok: true };
}
