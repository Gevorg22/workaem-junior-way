/**
 * Спрайт обязан совпадать с хитбоксом.
 *
 * Хитбокс решает, где персонаж стоит; спрайт решает, где его видно. Если
 * спрайт ниже хитбокса, персонаж рисуется выше своих ног и парит над землёй.
 * Глазами это ловится плохо: выглядит как «странно прыгает», а не как ошибка
 * на семь пикселей. Поэтому меряем.
 *
 * Способ измерения: подсовываем рисовальщику подложный Painter, который вместо
 * закраски запоминает границы каждого прямоугольника. Разница между нижней и
 * верхней границей и есть настоящий рост спрайта.
 */
import { drawBoss, drawDev, drawFoe } from "../src/game/sprites";
import type { Painter } from "../src/game/sprites";
import { PLAYER_H_BIG, PLAYER_H_SMALL, PLAYER_W } from "../src/game/tuning";
import { FOE_SIZE } from "../src/game/world";

interface Bounds { top: number; bottom: number; left: number; right: number }

/**
 * Подложная кисть: вместо закраски запоминает габариты каждой формы.
 * Понимает все примитивы, иначе перерисованный на кривых спрайт измерялся
 * бы лишь по своим прямоугольникам и проверка врала бы.
 */
function measure(draw: (paint: Painter) => void): Bounds {
  const b: Bounds = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity };
  const add = (x: number, y: number, w: number, h: number): void => {
    if (w <= 0 || h <= 0) return;
    b.top = Math.min(b.top, y);
    b.bottom = Math.max(b.bottom, y + h);
    b.left = Math.min(b.left, x);
    b.right = Math.max(b.right, x + w);
  };
  const brush = ((x: number, y: number, w: number, h: number) => add(x, y, w, h)) as Painter;
  brush.round = (x, y, w, h) => add(x, y, w, h);
  brush.grad = (x, y, w, h) => add(x, y, w, h);
  brush.circle = (cx, cy, r) => add(cx - r, cy - r, r * 2, r * 2);
  brush.oval = (cx, cy, rx, ry) => add(cx - rx, cy - ry, rx * 2, ry * 2);
  // Мягкое пятно к силуэту не относится: это свечение вокруг, а не тело.
  brush.glow = () => undefined;
  brush.poly = (pts) => {
    for (const [x, y] of pts) add(x, y, 0.0001, 0.0001);
  };
  draw(brush);
  return b;
}

const POSES = [
  { name: "стоит",   walking: false, airborne: false, stride: false, coffee: 0 },
  { name: "шагает",  walking: true,  airborne: false, stride: true,  coffee: 0 },
  { name: "шагает2", walking: true,  airborne: false, stride: false, coffee: 0 },
  { name: "в прыжке", walking: false, airborne: true, stride: false, coffee: 0 },
  // С кофе в руке появляется кружка, а над головой пар. Кружка торчит вбок и
  // обязана уложиться в допуск по ширине; пар уходит вверх, а вниз за подошву
  // не лезет - иначе игрок снова начнёт парить над землёй.
  { name: "с кофе",  walking: true,  airborne: false, stride: true,  coffee: 300 },
];

let bad = 0;

console.log("игрок: спрайт против хитбокса\n");
for (const grade of [0, 1, 2] as const) {
  const expect = grade === 0 ? PLAYER_H_SMALL : PLAYER_H_BIG;
  for (const face of [1, -1] as const) {
    for (const pose of POSES) {
      const b = measure((paint) =>
        drawDev(paint, 0, 0, { face, walking: pose.walking, airborne: pose.airborne, stride: pose.stride, grade, coffee: pose.coffee }),
      );
      // Подошва обязана лежать ровно на нижней грани хитбокса. Верх может
      // торчать выше - наушники сеньора рисуются над головой намеренно.
      const soleOk = Math.abs(b.bottom - expect) < 0.51;
      const headOk = b.top <= 0;
      const widthOk = b.right - b.left <= PLAYER_W + 6; // ноутбук и наушники торчат по бокам
      const ok = soleOk && headOk && widthOk;
      if (!ok) {
        bad++;
        console.log(
          `  ✗ грейд ${grade} ${pose.name.padEnd(9)} лицом ${face > 0 ? "вправо" : "влево "}: ` +
            `подошва на ${b.bottom}, а хитбокс кончается на ${expect}` +
            (soleOk ? "" : `  → зазор ${expect - b.bottom}px`),
        );
      }
    }
  }
  console.log(`  грейд ${grade}: хитбокс ${expect}px, спрайт ${measure((paint) => drawDev(paint, 0, 0, { face: 1, walking: false, airborne: false, stride: false, grade })).bottom}px`);
}

console.log("\nбосс:");
{
  const H = 30;
  const W = 26;
  for (const hp of [3, 2, 1]) {
    const b = measure((paint) => drawBoss(paint, 0, 0, W, H, { face: 1, stride: false, flash: false, hp, maxHp: 3 }));
    // Деления жизни рисуются над головой - это осознанно, поэтому проверяем
    // только низ: босс обязан стоять на своей нижней грани, а не над ней.
    const ok = Math.abs(b.bottom - H) < 0.51;
    if (!ok) { bad++; console.log(`  ✗ hp=${hp}: низ на ${b.bottom}, а бокс ${H}`); }
    else console.log(`  hp=${hp}: бокс ${W}x${H}, нарисовано до ${b.bottom}, деления на ${b.top}`);
  }
}

console.log("\nвраги: спрайт против хитбокса");
for (const kind of ["legacy", "bug", "call", "debt", "hr"] as const) {
  const box = FOE_SIZE[kind];
  for (const step of [true, false]) {
    const b = measure((paint) => drawFoe(paint, kind, 0, 0, step));
    // Низ обязан совпасть точно: враг стоит на своей нижней грани.
    // Верх может быть ниже нуля у парящих - созвон намеренно не касается
    // верхней грани, он же висит в воздухе.
    const soleOk = Math.abs(b.bottom - box.h) < 0.51;
    const widthOk = b.right - b.left <= box.w;
    if (!soleOk || !widthOk) {
      bad++;
      console.log(
        `  ✗ ${kind} ${step ? "шаг1" : "шаг2"}: низ на ${b.bottom} при хитбоксе ${box.h}` +
          (widthOk ? "" : `, ширина ${b.right - b.left} при ${box.w}`),
      );
    }
  }
  const b = measure((paint) => drawFoe(paint, kind, 0, 0, true));
  if (Math.abs(b.bottom - box.h) < 0.51) {
    console.log(`  ${kind.padEnd(7)} хитбокс ${box.w}x${box.h}, спрайт до ${b.bottom} - совпадает`);
  }
}

console.log(
  bad === 0
    ? "\nспрайты совпадают с хитбоксами: никто не парит над землёй"
    : `\nРАСХОЖДЕНИЙ: ${bad}`,
);
process.exit(bad === 0 ? 0 : 1);
