import { LEVELS } from "../src/game/levels";
import { MAX_PLATFORM_Y, PLAYER_H_BIG, TUNING as T } from "../src/game/tuning";
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

  // Движущаяся платформа - тоже опора, просто доезжающая до места.
  // Для проверки достижимости считаем её полосой во всю длину хода.
  const lifts = lv.moving.map((m) =>
    m.axis === "x"
      ? { x: Math.min(m.x, m.x + m.span), y: m.y, w: m.w + Math.abs(m.span), h: 4 }
      : { x: m.x, y: Math.min(m.y, m.y + m.span), w: m.w, h: 4 },
  );

  const surfaces = [...lv.platforms, ...lv.pipes, ...lifts].sort((a, b) => a.x - b.x);
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

/**
 * Платформа, под которой нельзя пройти, намертво запирает уровень:
 * большой игрок упирается в неё, стоя на земле. Проверка ловит именно это -
 * ошибка, которую валидатор проходимости не видел, потому что смотрел
 * только на дырки в полу.
 *
 * Лестницу финиша исключаем: на неё запрыгивают, а не проходят под ней.
 */
function blockedClearance(lv: LevelSpec): Array<{ x: number; y: number }> {
  const ground = lv.platforms.filter((p) => p.h > 6);
  const headroom = lv.groundY - PLAYER_H_BIG;
  return lv.platforms
    .filter((p) => p.h <= 6 && p.y > MAX_PLATFORM_Y && p.y + p.h > headroom)
    .filter((p) => ground.some((g) => p.x < g.x + g.w && p.x + p.w > g.x))
    .filter((p) => p.x < lv.width - 120)
    .map((p) => ({ x: p.x, y: p.y }));
}

let failures = 0;

for (const [i, lv] of LEVELS.entries()) {
  const blocker = findBlocker(lv);
  const tooLow = blockedClearance(lv);
  const ground = lv.platforms.filter((p) => p.h > 6);
  const doorOnGround = ground.some((g) => lv.door.x >= g.x && lv.door.x <= g.x + g.w);
  if (blocker || !doorOnGround || tooLow.length) failures++;

  console.log(
    `${i + 1}. ${lv.name.padEnd(8)} ${lv.grade.padEnd(7)}` +
      ` длина ${String(lv.width).padStart(4)}` +
      `  коммитов ${String(lv.checkpoints.length).padStart(2)}` +
      `  врагов ${String(lv.foes.length).padStart(2)}` +
      `  скиллов ${String(lv.gems.length).padStart(3)}` +
      `  кофе ${lv.coffee.length}` +
      `  прод ${String(lv.hazards.length).padStart(2)}` +
      `  ${blocker ? `ТУПИК @${blocker.x} (яма ${blocker.gap})` : "проходима"}` +
      `${doorOnGround ? "" : "  ДВЕРЬ В ВОЗДУХЕ"}` +
      `${tooLow.length ? `  НЕ ПРОЛЕЗТЬ под ${tooLow.length} платформами @${tooLow[0]!.x}` : ""}`,
  );
}

const total = LEVELS.reduce((sum, lv) => sum + lv.width, 0);
console.log(
  failures === 0
    ? `\nвсе карты проходимы · суммарная длина ${total} (было 2960)`
    : `\nПРОБЛЕМ: ${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
