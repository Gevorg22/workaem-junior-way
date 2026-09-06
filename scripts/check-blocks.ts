/**
 * Проверка блоков на конфликты с остальной геометрией.
 *
 * Блок - твёрдый объект 12x12, и он легко ссорится с соседями:
 * может воткнуться в платформу, перекрыть проход, оказаться недостижимым
 * снизу или выронить предмет внутрь другой платформы. Глазами такое
 * не видно, потому что карты собираются из кусков автоматически.
 */
import { LEVELS } from "../src/game/levels";
import { MAX_PLATFORM_Y, PLAYER_H_BIG, TUNING as T } from "../src/game/tuning";
import type { LevelSpec, Rect } from "../src/game/types";

const BLOCK = 12;
/** Предмет выезжает на крышу блока - этому месту надо быть свободным. */
const ITEM_H = 10;

const hit = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

interface Problem { kind: string; x: number; detail: string }

function inspect(lv: LevelSpec): Problem[] {
  const found: Problem[] = [];
  const jumpH = (T.jumpImpulse ** 2) / (2 * T.gravity);
  const solids: Rect[] = [
    ...lv.platforms,
    ...lv.pipes,
    ...lv.moving.map((m) => ({
      x: m.axis === "x" ? Math.min(m.x, m.x + m.span) : m.x,
      y: m.axis === "y" ? Math.min(m.y, m.y + m.span) : m.y,
      w: m.w + (m.axis === "x" ? Math.abs(m.span) : 0),
      h: 4 + (m.axis === "y" ? Math.abs(m.span) : 0),
    })),
  ];

  lv.blocks.forEach((b, i) => {
    const box: Rect = { x: b.x, y: b.y, w: BLOCK, h: BLOCK };

    for (const s of solids) {
      if (hit(box, s)) found.push({ kind: "пересекает опору", x: b.x, detail: `опора x=${s.x} y=${s.y}` });
    }

    for (let j = i + 1; j < lv.blocks.length; j++) {
      const o = lv.blocks[j]!;
      if (hit(box, { x: o.x, y: o.y, w: BLOCK, h: BLOCK })) {
        found.push({ kind: "пересекает другой блок", x: b.x, detail: `с блоком x=${o.x}` });
      }
    }

    // Проход под блоком: тоже от ближайшей опоры, а не от земли.
    const floors = [...solids, { x: 0, y: lv.groundY, w: lv.width, h: 20 }]
      .filter((s) => s.x < b.x + BLOCK && s.x + s.w > b.x && s.y >= b.y + BLOCK);
    for (const f of floors) {
      if (b.y + BLOCK > f.y - PLAYER_H_BIG) {
        found.push({ kind: "не встать под блоком", x: b.x, detail: `опора y=${f.y}, зазор ${f.y - (b.y + BLOCK)} при росте ${PLAYER_H_BIG}` });
        break;
      }
    }

    // Достаём ли прыжком - считаем от ближайшей опоры под блоком, а не
    // от земли: блок над платформой берут, стоя на этой платформе.
    const stands = [...solids, { x: 0, y: lv.groundY, w: lv.width, h: 20 }]
      .filter((s) => s.x < b.x + BLOCK && s.x + s.w > b.x && s.y >= b.y + BLOCK)
      .sort((a, s2) => a.y - s2.y)[0];
    const launch = stands ? stands.y : lv.groundY;
    if (b.y + BLOCK < launch - jumpH) {
      found.push({ kind: "не достать прыжком", x: b.x, detail: `низ на ${b.y + BLOCK}, с опоры y=${launch} достаёт до ${(launch - jumpH).toFixed(0)}` });
    }

    // Куда выйдет предмет.
    const itemSpace: Rect = { x: b.x + 1, y: b.y - ITEM_H, w: ITEM_H, h: ITEM_H };
    for (const s of solids) {
      if (hit(itemSpace, s)) found.push({ kind: "предмету некуда выйти", x: b.x, detail: `сверху опора y=${s.y}` });
    }
  });

  // Заодно: висящие платформы не должны перекрывать проход по земле.
  for (const p of lv.platforms) {
    if (p.h > 6 || p.x > lv.width - 130) continue;
    if (p.y > MAX_PLATFORM_Y && p.y + p.h > lv.groundY - PLAYER_H_BIG) {
      found.push({ kind: "не пройти под платформой", x: p.x, detail: `y=${p.y}` });
    }
  }

  return found;
}

let total = 0;
for (const [i, lv] of LEVELS.entries()) {
  const problems = inspect(lv);
  total += problems.length;
  const summary = new Map<string, number>();
  for (const p of problems) summary.set(p.kind, (summary.get(p.kind) ?? 0) + 1);

  console.log(
    `${i + 1}. ${lv.name.padEnd(11)} блоков ${String(lv.blocks.length).padStart(2)}  ` +
      (problems.length
        ? [...summary].map(([k, n]) => `${k}: ${n}`).join(", ")
        : "конфликтов нет"),
  );
  for (const p of problems.slice(0, 3)) console.log(`     x=${p.x}: ${p.kind} - ${p.detail}`);
}

console.log(total === 0 ? "\nблоки ни с чем не конфликтуют" : `\nКОНФЛИКТОВ: ${total}`);
process.exit(total === 0 ? 0 : 1);
