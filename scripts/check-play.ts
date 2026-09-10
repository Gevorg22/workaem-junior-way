/**
 * Играбельность: то, на что жалуется живой игрок, а проходимость не видит.
 *
 * Уровень может быть проходим от начала до конца - и всё равно нечестен:
 * враг ходит под низким рядом ящиков, где его не растоптать, проходит
 * сквозь трубу, шагает над ямой по воздуху, а на ряд ящиков нельзя
 * запрыгнуть, потому что верх ряда выше вершины прыжка. Всё это было в
 * собранных картах разом: шестьдесят один враг под ящиками, тридцать
 * сквозь опоры, пять над ямами, и ни одна проверка этого не видела.
 */
import { LEVELS } from "../src/game/levels";
import { FLYING_FOES, FOE_SIZE, PLAYER_H_BIG, TUNING as T } from "../src/game/tuning";
import type { LevelSpec } from "../src/game/types";

const BLOCK = 12;
/** Столько же запаса закладывает сборка уровня в clampPatrols. */
const STOMP_ROOM = 4;

const rise = (T.jumpImpulse * T.jumpImpulse) / (2 * T.gravity);

interface Surface { x: number; y: number; w: number; block: boolean }

/**
 * На какие ящики можно встать сверху. Обход от пола: опора считается
 * достижимой, если до неё можно допрыгнуть с уже достижимой - то есть
 * ноги в верхней точке прыжка выше её верха, а по горизонтали она рядом.
 * Ряд ящиков сам себя «достижимым» не делает: считаем только от пола.
 */
function unreachableBlocks(lv: LevelSpec): Surface[] {
  const airFrames = (2 * Math.abs(T.jumpImpulse)) / T.gravity;
  const reach = airFrames * lv.maxSpeed * 0.62;
  const all: Surface[] = [
    ...lv.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, block: false })),
    ...lv.pipes.map((p) => ({ x: p.x, y: p.y, w: p.w, block: false })),
    ...lv.blocks.map((b) => ({ x: b.x, y: b.y, w: BLOCK, block: true })),
  ];
  const reached = new Set<Surface>(all.filter((s) => s.y === lv.groundY));

  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all) {
      if (reached.has(s)) continue;
      for (const r of reached) {
        const gap = Math.max(s.x - (r.x + r.w), r.x - (s.x + s.w), 0);
        if (gap <= reach && r.y - rise <= s.y - 1) {
          reached.add(s);
          grew = true;
          break;
        }
      }
    }
  }
  return all.filter((s) => s.block && !reached.has(s));
}

let problems = 0;
console.log(`прыжок поднимает на ${rise.toFixed(1)}px, ноги в верхней точке на ${(90 - rise).toFixed(1)}\n`);

LEVELS.forEach((lv, i) => {
  const ground = lv.platforms.filter((p) => p.h > 6);
  const beams = lv.platforms.filter((p) => p.h <= 6);
  const boxes = lv.blocks.map((b) => ({ x: b.x, y: b.y, w: BLOCK, h: BLOCK }));
  const found: string[] = [];

  for (const f of lv.foes) {
    if (FLYING_FOES[f.kind]) continue;
    const size = FOE_SIZE[f.kind];
    const top = f.baseY - size.h;
    const from = f.min;
    const to = f.max + size.w;

    for (const edge of [from, to - 0.01]) {
      if (!ground.some((g) => edge >= g.x && edge <= g.x + g.w)) {
        found.push(`${f.kind} x=${Math.round(from)} ходит над ямой`);
        break;
      }
    }
    const walls = [...lv.pipes, ...boxes].filter(
      (z) => z.x < to && z.x + z.w > from && z.y < f.baseY && z.y + z.h > top,
    );
    if (walls.length) found.push(`${f.kind} x=${Math.round(from)} проходит сквозь опору`);

    const roofs = [...boxes, ...beams].filter(
      (z) => z.x < to && z.x + z.w > from &&
        z.y + z.h <= top && z.y + z.h > top - PLAYER_H_BIG - STOMP_ROOM,
    );
    if (roofs.length) found.push(`${f.kind} x=${Math.round(from)} ходит под опорой, где его не растоптать`);
  }

  for (const b of unreachableBlocks(lv)) found.push(`на ящик x=${b.x} y=${b.y} не встать сверху`);

  problems += found.length;
  const grounded = lv.foes.filter((f) => !FLYING_FOES[f.kind]).length;
  console.log(
    `${String(i + 1).padStart(2)}. ${lv.name.padEnd(11)} ` +
      `наземных врагов ${String(grounded).padStart(2)} · ящиков ${String(lv.blocks.length).padStart(2)} · ` +
      (found.length ? `ПРОБЛЕМ ${found.length}` : "чисто"),
  );
  for (const line of found.slice(0, 4)) console.log(`      ${line}`);
});

console.log(
  problems === 0
    ? "\nкаждого врага можно растоптать, каждый ящик достаётся сверху, по воздуху никто не ходит"
    : `\nПРОБЛЕМ ИГРАБЕЛЬНОСТИ: ${problems}`,
);
process.exit(problems === 0 ? 0 : 1);
