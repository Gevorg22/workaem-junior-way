/**
 * Автопрохождение уровней настоящей игровой физикой.
 *
 * Проверки геометрии смотрят, нет ли непрыгаемых ям и не перекрыт ли проход.
 * Но геометрия бывает в порядке, а уровень всё равно непроходим - например,
 * враг стоит ровно в единственном узком месте. Этот тест играет по-настоящему.
 *
 * Бот пробует несколько стратегий прыжка, а не одну. Живой игрок дозирует
 * прыжок по обстановке, и подделать это одной эвристикой не выходит: любая
 * настройка чинит одно место и ломает другое. Поэтому уровень считается
 * проходимым, если справилась хотя бы одна стратегия - это и есть вопрос
 * «можно ли тут пройти вообще», а не «умеет ли мой бот».
 */
import { LEVELS } from "../src/game/levels";
import { World } from "../src/game/world";
import type { InputState } from "../src/game/world";
import { TUNING as T } from "../src/game/tuning";

interface Policy {
  name: string;
  /** Сколько кадров держать прыжок. */
  hold: number;
  /** За сколько пикселей до края земли начинать прыгать. */
  lookahead: number;
}

const POLICIES: Policy[] = [
  { name: "короткий",   hold: 7,  lookahead: 10 },
  { name: "средний",    hold: 11, lookahead: 14 },
  { name: "длинный",    hold: 16, lookahead: 14 },
  { name: "ранний",     hold: 16, lookahead: 22 },
  { name: "поздний",    hold: 16, lookahead: 6 },
  { name: "осторожный", hold: 13, lookahead: 20 },
];

function groundUnder(w: World, x: number, feet: number): boolean {
  const lifts = w.moving;
  return [...w.level.platforms, ...w.level.pipes, ...lifts].some(
    (p) => x >= p.x - 1 && x <= p.x + p.w + 1 && p.y >= feet - 2 && p.y <= feet + 26,
  );
}

function attempt(index: number, policy: Policy) {
  const w = new World();
  w.loadLevel(index);
  w.phase = "play";
  w.lives = 99;

  let hold = 0;
  let best = 0;
  let stuck = 0;
  let frames = 0;

  for (; frames < 24000; frames++) {
    const p = w.player;
    const feet = p.y + p.h;
    const edge = p.x + p.w;
    if (hold > 0) hold -= 1;

    if (p.onGround) {
      let gap = false;
      for (let d = 2; d <= policy.lookahead; d += 2) {
        if (!groundUnder(w, edge + d, feet)) { gap = true; break; }
      }
      const danger =
        w.foes.some((f) => !f.squashed && f.x > p.x && f.x - p.x < 26 && Math.abs(f.y - feet) < 30) ||
        w.level.hazards.some((h) => h.x > edge && h.x - edge < 22);
      if (gap || danger || Math.abs(p.vx) < 0.15) hold = policy.hold;
    }

    const jump = hold > 0;
    const input: InputState = { left: false, right: true, jump, jumpPressed: jump };
    w.update(input);

    if (w.phase === "clear") return { cleared: true, best: w.player.x, frames };
    if (w.phase === "over") break;

    if (w.player.x > best + 0.5) { best = w.player.x; stuck = 0; }
    else if (++stuck > 1200) break;
  }
  return { cleared: false, best, frames };
}

const jumpH = (T.jumpImpulse ** 2) / (2 * T.gravity);
const airTime = (2 * Math.abs(T.jumpImpulse)) / T.gravity;
console.log(`прыжок: высота ${jumpH.toFixed(0)}px, ${airTime.toFixed(0)} кадров в воздухе\n`);

let failed = 0;

for (const [index, spec] of LEVELS.entries()) {
  let bestRun = { cleared: false, best: 0, frames: 0 };
  let winner = "";

  for (const policy of POLICIES) {
    const run = attempt(index, policy);
    if (run.cleared) { bestRun = run; winner = policy.name; break; }
    if (run.best > bestRun.best) bestRun = run;
  }

  if (!bestRun.cleared) failed++;
  const pct = Math.round((bestRun.best / spec.width) * 100);

  console.log(
    `${index + 1}. ${spec.name.padEnd(11)}` +
      `${bestRun.cleared ? "ПРОЙДЕН" : "НЕ ПРОЙДЕН"}  ` +
      `${String(Math.round(bestRun.best)).padStart(4)}/${spec.width} (${String(pct).padStart(3)}%)  ` +
      `${String((bestRun.frames / 60).toFixed(0)).padStart(3)} с  ` +
      `${winner ? `стратегия: ${winner}` : "не справилась ни одна"}`,
  );
}

console.log(
  failed === 0
    ? "\nкаждый уровень проходится хотя бы одной стратегией"
    : `\nНЕПРОХОДИМЫХ УРОВНЕЙ: ${failed}`,
);
process.exit(failed === 0 ? 0 : 1);
