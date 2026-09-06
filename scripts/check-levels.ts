import { LEVELS } from "../src/game/levels";
import { TUNING as T } from "../src/game/tuning";
import type { LevelSpec } from "../src/game/types";

/** Горизонтальная дальность прыжка и высота подъёма из физики в tuning. */
function jumpBox(maxSpeed: number): { reach: number; rise: number } {
  const frames = (Math.abs(T.jumpImpulse) / T.gravity) * 2;
  return {
    reach: frames * maxSpeed,
    rise: (T.jumpImpulse * T.jumpImpulse) / (2 * T.gravity),
  };
}

/**
 * Жадный обход: идём слева направо и тянем достижимую границу.
 * Висящая платформа над ямой - такая же опора, как земля,
 * поэтому считаем все поверхности, а не только пол.
 */
function findBlocker(lv: LevelSpec): { x: number; gap: number } | null {
  const { reach, rise } = jumpBox(lv.maxSpeed);
  const maxGap = reach * 0.62;

  const surfaces = [...lv.platforms].sort((a, b) => a.x - b.x);
  const start = surfaces.find((s) => s.x <= 10 && s.x + s.w > 10);
  if (!start) return { x: 10, gap: 0 };

  let edge = start.x + start.w;
  let standY = start.y;
  let grew = true;

  while (grew) {
    grew = false;
    for (const s of surfaces) {
      if (s.x + s.w <= edge) continue;
      const gap = s.x - edge;
      if (gap > maxGap) continue;
      // Вверх прыгаем ограниченно, вниз падаем свободно.
      if (standY - s.y > rise) continue;
      edge = s.x + s.w;
      standY = Math.min(standY, s.y);
      grew = true;
    }
  }

  if (edge >= lv.door.x + 16) return null;
  const next = surfaces.find((s) => s.x > edge);
  return { x: edge, gap: next ? next.x - edge : Infinity };
}

let failures = 0;

for (const [i, lv] of LEVELS.entries()) {
  const blocker = findBlocker(lv);
  const ground = lv.platforms.filter((p) => p.h > 6);
  const doorOnGround = ground.some((g) => lv.door.x >= g.x && lv.door.x <= g.x + g.w);
  if (blocker || !doorOnGround) failures++;

  console.log(
    `${i + 1}. ${lv.name.padEnd(8)} ${lv.grade.padEnd(7)}` +
      ` длина ${String(lv.width).padStart(4)}` +
      `  коммитов ${String(lv.checkpoints.length).padStart(2)}` +
      `  врагов ${String(lv.foes.length).padStart(2)}` +
      `  скиллов ${String(lv.gems.length).padStart(3)}` +
      `  кофе ${lv.coffee.length}` +
      `  прод ${String(lv.hazards.length).padStart(2)}` +
      `  ${blocker ? `ТУПИК @${blocker.x} (яма ${blocker.gap})` : "проходима"}` +
      `${doorOnGround ? "" : "  ДВЕРЬ В ВОЗДУХЕ"}`,
  );
}

const total = LEVELS.reduce((sum, lv) => sum + lv.width, 0);
console.log(
  failures === 0
    ? `\nвсе карты проходимы · суммарная длина ${total} (было 2960)`
    : `\nПРОБЛЕМ: ${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
