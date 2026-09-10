/**
 * Форма сложности.
 *
 * С этого всё и началось: на шестом уровне стояло 23 наземных врага -
 * больше, чем на любом из следующих. Сложность скакала, потому что её
 * никто не мерил: каждый уровень собирался сам по себе. Теперь уровни
 * сложены в миры, и у сложности есть форма, которую держит сборка:
 *
 *   - внутри мира растёт от первого уровня к замку;
 *   - первый уровень мира легче замка предыдущего - передышка на входе;
 *   - в среднем каждый мир тяжелее предыдущего;
 *   - самый населённый уровень - во второй половине игры, а не посередине.
 *
 * Врагов по мирам в среднем не сравниваем: небо собрано из ям и лифтов,
 * наземных врагов там нет вовсе, и мир с небом «легчал» бы по врагам,
 * становясь при этом тяжелее по всему остальному.
 *
 * Мерило - levelDanger: те же веса, что и у выбора кусков, но по готовой
 * карте вместе с концовкой, боссом и стеной дедлайна.
 */
import { levelCode, LEVELS, levelDanger, STAGES_PER_WORLD, WORLDS } from "../src/game/levels";
import { FLYING_FOES } from "../src/game/tuning";

const danger = LEVELS.map(levelDanger);
const grounded = LEVELS.map((lv) => lv.foes.filter((f) => !FLYING_FOES[f.kind]).length);
const at = (world: number, stage: number): number => danger[world * STAGES_PER_WORLD + stage] ?? 0;
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const ofWorld = <T>(xs: T[], wi: number): T[] =>
  xs.slice(wi * STAGES_PER_WORLD, (wi + 1) * STAGES_PER_WORLD);

console.log("уровень            сложность        наземных  длина  норма");
LEVELS.forEach((lv, i) => {
  if (i > 0 && i % STAGES_PER_WORLD === 0) console.log("");
  const d = danger[i] ?? 0;
  console.log(
    `${levelCode(i)} ${lv.name.padEnd(12)} ${d.toFixed(1).padStart(6)} ${"#".repeat(Math.round(d / 6)).padEnd(14)}` +
      `${String(grounded[i]).padStart(4)}  ${String(lv.width).padStart(6)}  ${String(lv.par).padStart(4)} с`,
  );
});

const bad: string[] = [];
const worldDanger = WORLDS.map((_, wi) => avg(ofWorld(danger, wi)));
const worldFoes = WORLDS.map((_, wi) => avg(ofWorld(grounded, wi)));

WORLDS.forEach((info, wi) => {
  for (let s = 1; s < STAGES_PER_WORLD; s++) {
    if (at(wi, s) <= at(wi, s - 1)) {
      bad.push(`мир ${info.name}: ${wi + 1}-${s + 1} не тяжелее ${wi + 1}-${s}`);
    }
  }
  if (wi === 0) return;
  if (at(wi, 0) >= at(wi - 1, STAGES_PER_WORLD - 1)) {
    bad.push(`${wi + 1}-1 не легче замка ${wi}-${STAGES_PER_WORLD}: на входе в мир нет передышки`);
  }
  if ((worldDanger[wi] ?? 0) <= (worldDanger[wi - 1] ?? 0)) {
    bad.push(`мир ${info.name} в среднем не тяжелее предыдущего`);
  }
});

// Ровно та жалоба, с которой всё началось: уровень посередине игры,
// населённый гуще любого из следующих.
const half = Math.floor(LEVELS.length / 2);
const earlyPeak = Math.max(...grounded.slice(0, half));
const latePeak = Math.max(...grounded.slice(half));
if (earlyPeak > latePeak) {
  bad.push(`в первой половине до ${earlyPeak} наземных врагов на уровне, во второй - не больше ${latePeak}`);
}

console.log(
  "\nпо мирам: " +
    WORLDS.map((info, wi) => `${info.name} ${worldDanger[wi]?.toFixed(0)} (врагов ${worldFoes[wi]?.toFixed(0)})`).join(" · "),
);
if (bad.length) {
  console.log("\nФОРМА СЛОЖНОСТИ СЛОМАНА:");
  for (const line of bad) console.log(`  ${line}`);
  process.exit(1);
}
console.log("внутри мира сложность растёт, в начале следующего проседает, от мира к миру выше");
