/**
 * Играбельность: то, на что жалуется живой игрок, а проходимость не видит.
 *
 * Уровень может быть проходим от начала до конца - и всё равно нечестен:
 * враг ходит под низким рядом ящиков, где его не растоптать, проходит
 * сквозь трубу, шагает над ямой по воздуху, а на ряд ящиков нельзя
 * запрыгнуть, потому что верх ряда выше вершины прыжка. Всё это было в
 * собранных картах разом: шестьдесят один враг под ящиками, тридцать
 * сквозь опоры, пять над ямами, и ни одна проверка этого не видела.
 *
 * Со звёздами добавился ещё один вид нечестности: скилл, до которого не
 * достать. Раньше он был просто недосягаемой наградой, теперь он делает
 * невозможной звезду «собрать все скиллы карты».
 */
import { LEVELS } from "../src/game/levels";
import { FLYING_FOES, FOE_SIZE, PLAYER_H_BIG, TUNING as T } from "../src/game/tuning";
import type { LevelSpec, Vec } from "../src/game/types";

const BLOCK = 12;
/** Столько же запаса закладывает сборка уровня в clampPatrols. */
const STOMP_ROOM = 4;
/** Размер скилла - как в столкновениях мира. */
const GEM_W = 8;
const GEM_H = 9;

const rise = (T.jumpImpulse * T.jumpImpulse) / (2 * T.gravity);

interface Surface { x: number; y: number; w: number; block: boolean }

/** Как далеко по горизонтали долетает прыжок на скорости уровня, с запасом. */
function reachOf(lv: LevelSpec): number {
  const airFrames = (2 * Math.abs(T.jumpImpulse)) / T.gravity;
  return airFrames * lv.maxSpeed * 0.62;
}

/**
 * Опоры, на которые можно встать. Обход от пола: опора считается
 * достижимой, если до неё можно допрыгнуть с уже достижимой - то есть
 * ноги в верхней точке прыжка выше её верха, а по горизонтали она рядом.
 * Ряд ящиков сам себя «достижимым» не делает: считаем только от пола.
 * Лифт - опора во всю длину своего хода: где-то на ней он окажется.
 */
function reachable(lv: LevelSpec): { all: Surface[]; reached: Set<Surface> } {
  const reach = reachOf(lv);
  const all: Surface[] = [
    ...lv.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, block: false })),
    ...lv.pipes.map((p) => ({ x: p.x, y: p.y, w: p.w, block: false })),
    ...lv.blocks.map((b) => ({ x: b.x, y: b.y, w: BLOCK, block: true })),
    ...lv.moving.map((m) =>
      m.axis === "x"
        ? { x: Math.min(m.x, m.x + m.span), y: m.y, w: m.w + Math.abs(m.span), block: false }
        : { x: m.x, y: Math.min(m.y, m.y + m.span), w: m.w, block: false },
    ),
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
  return { all, reached };
}

/** Ящики, на которые не встать сверху. */
function unreachableBlocks(lv: LevelSpec): Surface[] {
  const { all, reached } = reachable(lv);
  return all.filter((s) => s.block && !reached.has(s));
}

/**
 * Скиллы, которые не взять ни с одной достижимой опоры: макушка выросшего
 * игрока в верхней точке прыжка до них не дотягивается.
 */
function unreachableGems(lv: LevelSpec): Vec[] {
  const { reached } = reachable(lv);
  const reach = reachOf(lv);
  const from = [...reached];
  return lv.gems.filter((g) => !from.some((s) => {
    const gap = Math.max(g.x - (s.x + s.w), s.x - (g.x + GEM_W), 0);
    const head = s.y - rise - PLAYER_H_BIG;
    return gap <= reach && g.y + GEM_H > head && g.y < s.y;
  }));
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
  for (const g of unreachableGems(lv)) found.push(`скилл x=${g.x} y=${g.y} не достать - звезда за все скиллы невозможна`);

  problems += found.length;
  const grounded = lv.foes.filter((f) => !FLYING_FOES[f.kind]).length;
  console.log(
    `${String(i + 1).padStart(2)}. ${lv.name.padEnd(11)} ` +
      `наземных врагов ${String(grounded).padStart(2)} · ящиков ${String(lv.blocks.length).padStart(2)} · ` +
      `скиллов ${String(lv.gems.length).padStart(2)} · ` +
      (found.length ? `ПРОБЛЕМ ${found.length}` : "чисто"),
  );
  for (const line of found.slice(0, 4)) console.log(`      ${line}`);
});

console.log(
  problems === 0
    ? "\nкаждого врага можно растоптать, каждый ящик и скилл достаётся, по воздуху никто не ходит"
    : `\nПРОБЛЕМ ИГРАБЕЛЬНОСТИ: ${problems}`,
);
process.exit(problems === 0 ? 0 : 1);
