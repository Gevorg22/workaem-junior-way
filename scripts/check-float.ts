/**
 * Ловит невесомость: кадры, где игрок ни на чём не стоит, но и не падает.
 *
 * Такой баг глазами почти не виден - он длится доли секунды и списывается
 * на «показалось». Поэтому измеряем: если опоры нет, вертикальная скорость
 * обязана расти на величину гравитации. Если она несколько кадров подряд
 * висит около нуля - игрок парит, и это ошибка.
 *
 * Отдельно считаем зависания сразу после удара по ящику: именно там
 * разрешение столкновения раньше выносило игрока не туда.
 */
import { LEVELS } from "../src/game/levels";
import { World } from "../src/game/world";
import type { InputState } from "../src/game/world";
import { PLAYER_H_BIG, TUNING as T } from "../src/game/tuning";

const HOVER_LIMIT = 4;
const NEAR_ZERO = 0.05;

interface Report {
  level: string;
  hovers: number;
  afterBump: number;
  insideBlock: number;
  worst: { x: number; y: number; frames: number } | null;
}

function run(index: number, seed: number): Report {
  const w = new World();
  w.loadLevel(index);
  w.phase = "play";
  w.lives = 999;

  let hovers = 0;
  let afterBump = 0;
  let insideBlock = 0;
  let hover = 0;
  let sinceBump = 999;
  let worst: Report["worst"] = null;

  // Псевдослучайный, но воспроизводимый игрок: он и прыгает, и бьёт ящики
  // снизу, и топчется под ними - то есть попадает в интересные положения.
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let holdJump = 0;
  let dir = 1;

  for (let f = 0; f < 9000; f++) {
    const p = w.player;
    const prevGrade = p.grade;

    if (rnd() < 0.05) dir = rnd() < 0.78 ? 1 : -1;
    if (p.onGround && rnd() < 0.14) holdJump = 4 + Math.floor(rnd() * 14);
    if (holdJump > 0) holdJump -= 1;

    const jump = holdJump > 0;
    const input: InputState = {
      left: dir < 0, right: dir > 0, jump, jumpPressed: jump, downPressed: rnd() < 0.02,
    };

    const bumpedBefore = w.stats.blocks;
    w.update(input);
    if (w.phase !== "play") { w.phase = "play"; }

    if (w.stats.blocks !== bumpedBefore || p.grade !== prevGrade) sinceBump = 0;
    else sinceBump += 1;
    // Удар снизу тоже считаем: он не всегда ломает блок и не всегда даёт грейд.
    for (const b of w.blocks) if (b.bump === 8) sinceBump = 0;

    if (w.warp) { hover = 0; continue; }

    // Есть ли под ногами опора - проверяем тем же способом, что и физика.
    const feet = p.y + p.h;
    const support = [...w.level.platforms, ...w.level.pipes, ...w.moving].some(
      (o) => p.x < o.x + o.w && p.x + p.w > o.x && Math.abs(o.y - feet) <= 1.5,
    ) || w.blocks.some(
      (b) => !b.broken && p.x < b.x + 12 && p.x + p.w > b.x && Math.abs(b.y - feet) <= 1.5,
    );

    if (!support && !p.onGround && Math.abs(p.vy) < NEAR_ZERO) {
      hover += 1;
      if (hover >= HOVER_LIMIT) {
        hovers += 1;
        if (sinceBump < 20) afterBump += 1;
        if (!worst || hover > worst.frames) {
          worst = { x: Math.round(p.x), y: Math.round(p.y), frames: hover };
        }
      }
    } else {
      hover = 0;
    }

    // Заодно: не остался ли игрок внутри целого ящика.
    for (const b of w.blocks) {
      if (b.broken) continue;
      if (p.x + p.w > b.x + 1.5 && p.x < b.x + 10.5 && p.y + p.h > b.y + 1.5 && p.y < b.y + 10.5) {
        insideBlock += 1;
        break;
      }
    }
  }
  return { level: LEVELS[index]!.name, hovers, afterBump, insideBlock, worst };
}

console.log(`гравитация ${T.gravity}/кадр · зависанием считаем ${HOVER_LIMIT}+ кадров без опоры при |vy| < ${NEAR_ZERO}`);
console.log(`рост большого игрока ${PLAYER_H_BIG}px\n`);

let bad = 0;
for (let i = 0; i < LEVELS.length; i++) {
  let hovers = 0, afterBump = 0, insideBlock = 0;
  let worst: Report["worst"] = null;
  for (const seed of [1, 7, 23, 91, 404]) {
    const r = run(i, seed + i * 1000);
    hovers += r.hovers;
    afterBump += r.afterBump;
    insideBlock += r.insideBlock;
    if (r.worst && (!worst || r.worst.frames > worst.frames)) worst = r.worst;
  }
  const ok = hovers === 0 && insideBlock === 0;
  if (!ok) bad++;
  console.log(
    `${String(i + 1).padStart(2)}. ${LEVELS[i]!.name.padEnd(11)}` +
      (ok
        ? "чисто"
        : `зависаний ${hovers} (после ящика ${afterBump}) · в ящике ${insideBlock}` +
          (worst ? ` · худшее ${worst.frames} кадров на ${worst.x},${worst.y}` : "")),
  );
}

console.log(
  bad === 0
    ? "\nневесомости нет: без опоры игрок всегда падает, внутри ящиков не застревает"
    : `\nПРОБЛЕМНЫХ УРОВНЕЙ: ${bad}`,
);
process.exit(bad === 0 ? 0 : 1);
