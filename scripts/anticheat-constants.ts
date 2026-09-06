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
import { LEVELS } from "../src/game/levels";

const totalWidth = LEVELS.reduce((sum, lv) => sum + lv.width, 0);
const totalGems = LEVELS.reduce((sum, lv) => sum + lv.gems.length, 0);
const maxSpeed = Math.max(...LEVELS.map((lv) => lv.maxSpeed));

const WANT: Record<string, number> = {
  TOTAL_LEVEL_WIDTH: totalWidth,
  MAX_SPEED: maxSpeed,
  TOTAL_GEMS: totalGems,
  TOTAL_LEVELS: LEVELS.length,
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
  if (bad.length) {
    console.error("КОНСТАНТЫ АНТИЧИТА РАЗОШЛИСЬ С ИГРОЙ:");
    console.error(bad.join("\n"));
    console.error("\nПочини worker/anticheat.js по выводу `npm run anticheat`.");
    console.error("Иначе честный игрок, прошедший игру до конца, получит отказ,");
    console.error("и поздравление в чат не придёт никому - молча.");
    process.exit(1);
  }
  console.log(`античит совпадает с игрой: ${LEVELS.length} уровней, ${totalGems} скиллов, ширина ${totalWidth}`);
} else {
  console.log("// Сгенерировано: npm run anticheat. Не править руками.");
  for (const [name, value] of Object.entries(WANT)) console.log(`const ${name} = ${value};`);
  console.log();
  console.log(`// минимум кадров на полное прохождение: ${Math.floor(totalWidth / maxSpeed)}`);
}
