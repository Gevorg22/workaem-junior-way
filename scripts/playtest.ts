/**
 * Автопрохождение уровней настоящей игровой физикой.
 *
 * Проверки проходимости смотрят на геометрию: нет ли непрыгаемых ям и
 * не перекрыт ли проход. Но геометрия может быть в порядке, а уровень
 * всё равно непроходим - например, если враг стоит ровно в единственном
 * узком месте. Этот тест играет по-настоящему и говорит, дошёл ли бот.
 */
import { LEVELS } from "../src/game/levels";
import { heightFor, World } from "../src/game/world";
import type { InputState } from "../src/game/world";
import { TUNING as T } from "../src/game/tuning";

const JUMP_REACH = (Math.abs(T.jumpImpulse) / T.gravity) * 2;

/** Есть ли опора под точкой - по ней бот понимает, где яма. */
function groundUnder(w: World, x: number, feet: number): boolean {
  return w.level.platforms.some(
    (p) => x >= p.x - 1 && x <= p.x + p.w + 1 && p.y >= feet - 2 && p.y <= feet + 26,
  );
}

/**
 * Прыжок в этой игре зависит от длительности нажатия: отпустил сразу -
 * подскочил на 8 пикселей вместо 43. Бот обязан держать кнопку, иначе
 * он проверяет не ту игру, в которую играют люди.
 */
let hold = 0;

function decide(w: World): InputState {
  const p = w.player;
  const feet = p.y + p.h;
  const edge = p.x + p.w;

  if (hold > 0) hold -= 1;

  if (p.onGround) {
    // Край земли близко - пора прыгать.
    let gap = false;
    for (let d = 2; d <= 16; d += 2) {
      if (!groundUnder(w, edge + d, feet)) { gap = true; break; }
    }

    const danger =
      w.foes.some((f) => !f.squashed && f.x > p.x && f.x - p.x < 24 && Math.abs(f.y - feet) < 26) ||
      w.level.hazards.some((h) => h.x > edge && h.x - edge < 20);

    // Упёрлись во что-то на пути - перепрыгиваем.
    const blocked = Math.abs(p.vx) < 0.15;

    if (gap || danger || blocked) hold = 16;
  }

  const jump = hold > 0;
  return { left: false, right: true, jump, jumpPressed: jump };
}

let failed = 0;

for (const [index, spec] of LEVELS.entries()) {
  const w = new World();
  // Ставим нужный уровень напрямую: проверяем каждый по отдельности.
  w.loadLevel(index);
  w.phase = "play";
  w.lives = 99;

  let best = 0;
  let stuckFor = 0;
  let frames = 0;
  let cleared = false;

  for (; frames < 20000; frames++) {
    w.update(decide(w));
    if (w.phase === "clear") { cleared = true; break; }
    if (w.phase === "over") break;

    if (w.player.x > best + 0.5) { best = w.player.x; stuckFor = 0; }
    else if (++stuckFor > 900) break;
  }

  const pct = Math.round((best / spec.width) * 100);
  const seconds = (frames / 60).toFixed(0);
  if (!cleared) failed++;

  console.log(
    `${index + 1}. ${spec.name.padEnd(8)} ` +
      `${cleared ? "ПРОЙДЕН" : "НЕ ПРОЙДЕН"}  ` +
      `дошёл до ${String(Math.round(best)).padStart(4)}/${spec.width} (${String(pct).padStart(3)}%)  ` +
      `${String(seconds).padStart(3)} с  ` +
      `грейд ${w.player.grade}  скиллов ${w.skills}  ` +
      `${stuckFor > 900 ? "ЗАСТРЯЛ" : ""}`,
  );
}

console.log(
  failed === 0
    ? "\nбот проходит все уровни"
    : `\nНЕ ПРОЙДЕНО УРОВНЕЙ: ${failed} - смотри, где именно застревает`,
);
process.exit(failed === 0 ? 0 : 1);
