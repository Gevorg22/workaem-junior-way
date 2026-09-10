/**
 * Печатает константы для worker/anticheat.js.
 *
 * Они обязаны совпадать с игрой: если в игре стало двенадцать уровней, а в
 * воркере осталось четыре, то честный игрок, прошедший всё до конца, будет
 * отвергнут как накрутчик. Руками это не уследить, поэтому считаем из данных.
 *
 * Запуск: npm run anticheat
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEVELS, ROOM_GEMS } from "../src/game/levels";
import { COIN_HITS, COMBO_SCORE, MAX_CARRY_LIVES, POLE_BONUS_MAX, TUNING } from "../src/game/tuning";
import type { LevelSpec } from "../src/game/types";

const totalWidth = LEVELS.reduce((sum, lv) => sum + lv.width, 0);
// Скиллы из бонусных комнат и кирпичей-заначек считаются наравне с
// картовыми: иначе честный игрок, нашедший все секреты, соберёт больше,
// чем воркер считает возможным, и будет отвергнут как накрутчик.
// Комната открывается один раз на трубу, заначка пустеет после COIN_HITS.
const stashOf = (lv: LevelSpec): number =>
  lv.pipes.filter((pipe) => pipe.bonus).length * ROOM_GEMS +
  lv.blocks.filter((b) => b.kind === "coins").length * COIN_HITS;
const secretGems = LEVELS.reduce((sum, lv) => sum + stashOf(lv), 0);
const totalGems = LEVELS.reduce((sum, lv) => sum + lv.gems.length, 0) + secretGems;
const maxSpeed = Math.max(...LEVELS.map((lv) => lv.maxSpeed));
// Жизни, спрятанные в невидимых ящиках, - их тоже можно донести до финиша.
const hiddenLives = LEVELS.reduce(
  (sum, lv) => sum + lv.blocks.filter((b) => b.hidden && b.drop === "life").length,
  0,
);

// Самый короткий уровень задаёт минимум кадров на один зачёт: пройти
// карту быстрее, чем её длина делить на максимальную скорость, нельзя.
// Нужно для частичных забегов - полное прохождение сторожит MIN_FRAMES.
const minLevelFrames = Math.floor(Math.min(...LEVELS.map((lv) => lv.width)) / maxSpeed);

const WANT: Record<string, number> = {
  TOTAL_LEVEL_WIDTH: totalWidth,
  MAX_SPEED: maxSpeed,
  TOTAL_GEMS: totalGems,
  TOTAL_LEVELS: LEVELS.length,
  MIN_LEVEL_FRAMES: minLevelFrames,
  MAX_CARRY_LIVES,
  HIDDEN_LIVES: hiddenLives,
  // По мини-боссу в каждом замке.
  BOSS_SCORE: LEVELS.filter((lv) => lv.boss).length * TUNING.scoreBoss,
  // Норма у каждого уровня своя; для забега целиком берём самую щедрую.
  MAX_PAR: Math.max(...LEVELS.map((lv) => lv.par)),
};

/**
 * Минимум кадров на каждый уровень.
 *
 * Первая версия делила длину карты на предельную скорость - и отвергла
 * честный прогон бота по первому уровню: 1015 кадров при «минимуме» 1030.
 * Забыты были три вещи, и все три работают в одну сторону:
 *
 *  - финиш стоит на флагштоке, а не в конце карты: бежать надо на 46
 *    пикселей меньше, да и старт не в нуле, а на десятом;
 *  - кофе ускоряет игрока в COFFEE раз, то есть предельная скорость
 *    уровня - вовсе не предел;
 *  - проходные трубы срезают часть пути.
 *
 * Отсюда запас в 30%: проверка обязана ловить нелепое - уровень за
 * секунду, - а не наказывать за хорошую игру. Отвергнутый честный игрок
 * ломает отсечку надёжнее, чем пропущенный накрутчик: он просто уходит.
 */
const SPEEDRUN_MARGIN = 0.7;
const levelMinFrames = LEVELS.map((lv) => {
  const distance = lv.width - 46 - 10;
  const topSpeed = lv.maxSpeed * TUNING.coffeeMultiplier;
  return Math.floor((distance / topSpeed) * SPEEDRUN_MARGIN);
});

/**
 * Потолок очков за уровень - тоже из содержимого карты, а не на глаз:
 * все скиллы (включая заначки за трубами), все враги по цене самой длинной
 * цепочки, все ящики вместе с выпавшим предметом, кофе, верхушка флагштока,
 * финиш, полный бонус за скорость и собес на последнем уровне.
 *
 * Считается щедро: задача - отсечь невозможное, а не поймать того, кто
 * сыграл на пять процентов лучше ожидаемого. Но даже щедрый потолок,
 * посчитанный из карты, в разы строже общего «сколько-то за забег».
 */
const levelMaxScore = LEVELS.map((lv) => {
  return (
    (lv.gems.length + stashOf(lv)) * 100 +
    lv.foes.length * COMBO_SCORE[COMBO_SCORE.length - 1]! +
    lv.blocks.length * (50 + 400) +
    lv.coffee.length * 50 +
    POLE_BONUS_MAX +
    TUNING.scoreLevelClear +
    lv.par * TUNING.scorePerSecondLeft +
    (lv.boss ? TUNING.scoreBoss + lv.boss.maxHp * TUNING.scoreStomp : 0)
  );
});

/**
 * Таблица цепочки. В воркере она нужна, чтобы считать потолок очков не
 * от самого жирного звена, а от того, до которого игрок реально дошёл:
 * при цепочке в один прыжок каждое растаптывание стоит 200, а не 4000.
 */
const WANT_LISTS: Record<string, readonly number[]> = {
  COMBO_SCORE,
  LEVEL_MIN_FRAMES: levelMinFrames,
  LEVEL_MAX_SCORE: levelMaxScore,
};

/**
 * Названия уровней. Нужны боту: в таблице лидеров «7. Продукт» читается,
 * а «7. level:7» - нет. Генерируются из игры, чтобы переименование уровня
 * не разъехалось с тем, что пишет бот.
 */
const WANT_STRINGS: Record<string, readonly string[]> = {
  LEVEL_NAMES: LEVELS.map((lv) => lv.name),
};

// Режим сверки для сборки. Без него расхождение живёт молча: бот просто
// перестаёт отвечать честным игрокам, а на клиенте это никак не видно -
// report.ts не смотрит на код ответа.
if (process.argv.includes("--check")) {
  // Считаем от корня проекта, а не от import.meta.url: esbuild кладёт
  // бандл в node_modules/.cache, и относительный путь оттуда не туда ведёт.
  const path = join(process.cwd(), "worker", "anticheat.js");
  const src = readFileSync(path, "utf8");
  const bad: string[] = [];
  for (const [name, want] of Object.entries(WANT)) {
    const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(src);
    const have = m ? Number(m[1]) : NaN;
    if (have !== want) bad.push(`  ${name}: в воркере ${m ? m[1] : "нет"}, в игре ${want}`);
  }
  for (const [name, want] of Object.entries(WANT_LISTS)) {
    const m = new RegExp(`const ${name} = \\[([0-9, ]+)\\];`).exec(src);
    const have = m ? m[1]!.split(",").map((v) => Number(v.trim())).join(",") : "нет";
    if (have !== want.join(",")) bad.push(`  ${name}: в воркере [${have}], в игре [${want.join(",")}]`);
  }
  for (const [name, want] of Object.entries(WANT_STRINGS)) {
    const m = new RegExp(`const ${name} = \\[([^\\]]+)\\];`).exec(src);
    const have = m
      ? m[1]!.split(",").map((v) => v.trim().replace(/^"|"$/g, "")).join("|")
      : "нет";
    if (have !== want.join("|")) bad.push(`  ${name}: в воркере ${have}, в игре ${want.join("|")}`);
  }
  if (bad.length) {
    console.error("КОНСТАНТЫ АНТИЧИТА РАЗОШЛИСЬ С ИГРОЙ:");
    console.error(bad.join("\n"));
    console.error("\nПочини worker/anticheat.js по выводу `npm run anticheat`.");
    console.error("Иначе честный игрок, прошедший игру до конца, получит отказ,");
    console.error("и поздравление в чат не придёт никому - молча.");
    process.exit(1);
  }
  console.log(
    `античит совпадает с игрой: ${LEVELS.length} уровней, ${totalGems} скиллов` +
      ` (из них ${secretGems} в секретах), ширина ${totalWidth}`,
  );
} else {
  console.log("// Сгенерировано: npm run anticheat. Не править руками.");
  for (const [name, value] of Object.entries(WANT)) console.log(`const ${name} = ${value};`);
  for (const [name, list] of Object.entries(WANT_LISTS)) {
    console.log(`const ${name} = [${list.join(", ")}];`);
  }
  for (const [name, list] of Object.entries(WANT_STRINGS)) {
    console.log(`const ${name} = [${list.map((v) => `"${v}"`).join(", ")}];`);
  }
  console.log();
  console.log(`// минимум кадров на полное прохождение: ${Math.floor(totalWidth / maxSpeed)}`);
}
