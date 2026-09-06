/**
 * Проверка блоков на конфликты с остальной геометрией.
 *
 * Блок - твёрдый объект 12x12, и он легко ссорится с соседями:
 * может воткнуться в платформу, перекрыть проход, оказаться недостижимым
 * снизу или выронить предмет внутрь другой платформы. Глазами такое
 * не видно, потому что карты собираются из кусков автоматически.
 */
import { LEVELS } from "../src/game/levels";
import { World } from "../src/game/world";
import { MAX_PLATFORM_Y, PLAYER_H_BIG, PLAYER_H_SMALL, PLAYER_W, TUNING as T } from "../src/game/tuning";
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

    // Блок в стопке - часть конструкции: по ней лезут наверх или ломают,
    // а не подходят снизу. Требовать от неё прохода под собой и удара
    // снизу бессмысленно - это правила для одиночного подвесного блока.
    const inStack = lv.blocks.some(
      (o) => o !== b && Math.abs(o.x - b.x) < BLOCK && Math.abs(o.y - b.y - BLOCK) < 2,
    );
    const hasBlockAbove = lv.blocks.some(
      (o) => o !== b && Math.abs(o.x - b.x) < BLOCK && Math.abs(b.y - o.y - BLOCK) < 2,
    );
    const structural = inStack || hasBlockAbove;

    for (const s of solids) {
      if (hit(box, s)) found.push({ kind: "пересекает опору", x: b.x, detail: `опора x=${s.x} y=${s.y}` });
    }

    for (let j = i + 1; j < lv.blocks.length; j++) {
      const o = lv.blocks[j]!;
      if (hit(box, { x: o.x, y: o.y, w: BLOCK, h: BLOCK })) {
        found.push({ kind: "пересекает другой блок", x: b.x, detail: `с блоком x=${o.x}` });
      }
    }

    // Опора под блоком: с неё к блоку и подходят.
    const floors = [...solids, { x: 0, y: lv.groundY, w: lv.width, h: 20 }]
      .filter((f) => f.x < b.x + BLOCK && f.x + f.w > b.x && f.y >= b.y + BLOCK)
      .sort((f1, f2) => f1.y - f2.y);
    const launch = floors[0] ? floors[0].y : lv.groundY;

    // Под одиночным блоком нужно помещаться стоя. Для блока в стопке это
    // требование бессмысленно: по стопке лезут наверх, а не ходят под ней.
    if (!structural && b.y + BLOCK > launch - PLAYER_H_BIG) {
      found.push({
        kind: "не встать под блоком",
        x: b.x,
        detail: `опора y=${launch}, зазор ${launch - (b.y + BLOCK)} при росте ${PLAYER_H_BIG}`,
      });
    }

    // Бьют по блоку ГОЛОВОЙ, а не ногами - это разница в целый рост.
    // В верхней точке прыжка ноги на launch - jumpH, макушка ещё на рост выше.
    if (!hasBlockAbove) {
      const headTop = launch - jumpH - PLAYER_H_SMALL - (inStack ? BLOCK : 0);
      if (b.y + BLOCK < headTop) {
        found.push({
          kind: "не достать прыжком",
          x: b.x,
          detail: `низ на ${b.y + BLOCK}, макушка достаёт до ${headTop.toFixed(0)}`,
        });
      }
    }

    // Куда выйдет предмет.
    const itemSpace: Rect = { x: b.x + 1, y: b.y - ITEM_H, w: ITEM_H, h: ITEM_H };
    for (const s of solids) {
      if (hit(itemSpace, s)) found.push({ kind: "предмету некуда выйти", x: b.x, detail: `сверху опора y=${s.y}` });
    }
  });

  // Между блоком и балкой должно помещаться тело игрока. Иначе они
  // мешают друг другу: подойти к блоку и запрыгнуть на балку одинаково
  // невозможно, потому что в щель шириной меньше игрока не пролезть.
  const MIN_GAP = PLAYER_W + 4;
  for (const b of lv.blocks) {
    for (const pl of lv.platforms) {
      if (pl.h > 6) continue;
      if (Math.abs(pl.y - (b.y + BLOCK)) > 34) continue;
      const right = pl.x - (b.x + BLOCK);
      const left = b.x - (pl.x + pl.w);
      const gap = right >= 0 ? right : left >= 0 ? left : -1;
      if (gap >= 0 && gap < MIN_GAP) {
        found.push({
          kind: "блок и балка теснят друг друга",
          x: b.x,
          detail: `зазор ${gap}px при ширине игрока ${PLAYER_W}`,
        });
      }
    }
  }

  // На платформу надо не только запрыгнуть, но и уместиться на ней стоя.
  // Блок прямо над балкой делает её бесполезной: бьёшься головой и падаешь.
  for (const pl of lv.platforms) {
    if (pl.h > 6) continue;
    const standing: Rect = {
      x: pl.x, y: pl.y - PLAYER_H_BIG, w: pl.w, h: PLAYER_H_BIG,
    };
    for (const b of lv.blocks) {
      const box: Rect = { x: b.x, y: b.y, w: BLOCK, h: BLOCK };
      if (!hit(standing, box)) continue;
      // Насколько блок перекрывает площадку - если чуть с краю, ещё терпимо.
      const shared = Math.min(pl.x + pl.w, b.x + BLOCK) - Math.max(pl.x, b.x);
      found.push({
        kind: "не встать на платформу",
        x: pl.x,
        detail: `блок x=${b.x} закрывает ${shared} из ${pl.w} px площадки`,
      });
    }
  }

  // Лифт не должен задевать землю ни в одной точке своего хода: над землёй
  // он перекрывает проход - идущий по ней большой игрок упирается головой
  // и встаёт намертво.
  for (const m of lv.moving) {
    const sweep: Rect =
      m.axis === "x"
        ? { x: Math.min(m.x, m.x + m.span), y: m.y, w: m.w + Math.abs(m.span), h: 4 }
        : { x: m.x, y: Math.min(m.y, m.y + m.span), w: m.w, h: 4 + Math.abs(m.span) };
    for (const g of lv.platforms) {
      if (g.h <= 6) continue;
      const overlapX = sweep.x < g.x + g.w && sweep.x + sweep.w > g.x;
      if (overlapX && sweep.y + sweep.h > g.y - PLAYER_H_BIG) {
        found.push({
          kind: "лифт задевает землю",
          x: Math.round(m.x),
          detail: `ход до y=${(sweep.y + sweep.h).toFixed(0)}, земля y=${g.y}`,
        });
        break;
      }
    }
  }

  // Заодно: висящие платформы не должны перекрывать проход по земле.
  for (const p of lv.platforms) {
    if (p.h > 6 || p.x > lv.width - 130) continue;
    if (p.y > MAX_PLATFORM_Y && p.y + p.h > lv.groundY - PLAYER_H_BIG) {
      found.push({ kind: "не пройти под платформой", x: p.x, detail: `y=${p.y}` });
    }
  }

  return found;
}

/**
 * Движущаяся платформа обязана реально проходить свой размах.
 * Если границы хода перепутаны местами, разворот срабатывает в обе
 * стороны каждый кадр: платформа дрожит на месте, а стоящего на ней
 * игрока трясёт вместе с ней. Со стороны это выглядит как невесомость.
 */
function checkLifts(index: number): string[] {
  const w = new World();
  w.loadLevel(index);
  w.phase = "play";
  if (!w.moving.length) return [];

  const seen = w.moving.map(() => ({ lo: Infinity, hi: -Infinity }));
  for (let f = 0; f < 500; f++) {
    w.update({ left: false, right: false, jump: false, jumpPressed: false });
    w.moving.forEach((m, k) => {
      const v = m.axis === "x" ? m.x : m.y;
      seen[k]!.lo = Math.min(seen[k]!.lo, v);
      seen[k]!.hi = Math.max(seen[k]!.hi, v);
    });
  }

  const bad: string[] = [];
  w.moving.forEach((m, k) => {
    const travelled = seen[k]!.hi - seen[k]!.lo;
    const expected = m.to - m.from;
    if (Math.abs(travelled - expected) > 3) {
      bad.push(`лифт x=${Math.round(m.x)} прошёл ${travelled.toFixed(1)} вместо ${expected.toFixed(1)}`);
    }
  });
  return bad;
}

let total = 0;
for (const [i, lv] of LEVELS.entries()) {
  const problems = inspect(lv);
  const liftIssues = checkLifts(i);
  total += problems.length + liftIssues.length;
  const summary = new Map<string, number>();
  for (const p of problems) summary.set(p.kind, (summary.get(p.kind) ?? 0) + 1);

  console.log(
    `${i + 1}. ${lv.name.padEnd(11)} блоков ${String(lv.blocks.length).padStart(2)}  ` +
      (problems.length
        ? [...summary].map(([k, n]) => `${k}: ${n}`).join(", ")
        : "конфликтов нет") +
      (lv.moving.length ? `  лифтов ${lv.moving.length}${liftIssues.length ? " - ПРОБЛЕМА" : " ok"}` : ""),
  );
  for (const p of problems.slice(0, 3)) console.log(`     x=${p.x}: ${p.kind} - ${p.detail}`);
  for (const l of liftIssues) console.log(`     ${l}`);
}

console.log(total === 0 ? "\nблоки ни с чем не конфликтуют" : `\nКОНФЛИКТОВ: ${total}`);
process.exit(total === 0 ? 0 : 1);
