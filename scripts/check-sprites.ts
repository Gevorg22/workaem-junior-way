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
import { PLAYER_H_BIG, PLAYER_H_SMALL, PLAYER_W } from "../src/game/tuning";
import { FOE_SIZE } from "../src/game/world";

interface Bounds { top: number; bottom: number; left: number; right: number }

function measure(draw: (paint: (x: number, y: number, w: number, h: number, c: string) => void) => void): Bounds {
  const b: Bounds = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity };
  draw((x, y, w, h) => {
    if (w <= 0 || h <= 0) return;
    b.top = Math.min(b.top, y);
    b.bottom = Math.max(b.bottom, y + h);
    b.left = Math.min(b.left, x);
    b.right = Math.max(b.right, x + w);
  });
  return b;
}

const POSES = [
  { name: "стоит",   walking: false, airborne: false, stride: false },
  { name: "шагает",  walking: true,  airborne: false, stride: true },
  { name: "шагает2", walking: true,  airborne: false, stride: false },
  { name: "в прыжке", walking: false, airborne: true, stride: false },
];

let bad = 0;

console.log("игрок: спрайт против хитбокса\n");
for (const grade of [0, 1, 2] as const) {
  const expect = grade === 0 ? PLAYER_H_SMALL : PLAYER_H_BIG;
  for (const face of [1, -1] as const) {
    for (const pose of POSES) {
      const b = measure((paint) =>
        drawDev(paint, 0, 0, { face, walking: pose.walking, airborne: pose.airborne, stride: pose.stride, grade }),
      );
      // Подошва обязана лежать ровно на нижней грани хитбокса. Верх может
      // торчать выше - наушники сеньора рисуются над головой намеренно.
      const soleOk = b.bottom === expect;
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
    const b = measure((paint) => drawBoss(paint, 0, 0, W, H, { face: 1, stride: false, flash: false, hp }));
    // Деления жизни рисуются над головой - это осознанно, поэтому проверяем
    // только низ: босс обязан стоять на своей нижней грани, а не над ней.
    const ok = b.bottom === H;
    if (!ok) { bad++; console.log(`  ✗ hp=${hp}: низ на ${b.bottom}, а бокс ${H}`); }
    else console.log(`  hp=${hp}: бокс ${W}x${H}, нарисовано до ${b.bottom}, деления на ${b.top}`);
  }
}

console.log("\nвраги: спрайт против хитбокса");
for (const kind of ["legacy", "bug", "call"] as const) {
  const box = FOE_SIZE[kind];
  for (const step of [true, false]) {
    const b = measure((paint) => drawFoe(paint, kind, 0, 0, step));
    // Низ обязан совпасть точно: враг стоит на своей нижней грани.
    // Верх может быть ниже нуля у парящих - созвон намеренно не касается
    // верхней грани, он же висит в воздухе.
    const soleOk = b.bottom === box.h;
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
  if (b.bottom === box.h) {
    console.log(`  ${kind.padEnd(7)} хитбокс ${box.w}x${box.h}, спрайт до ${b.bottom} - совпадает`);
  }
}

console.log(
  bad === 0
    ? "\nспрайты совпадают с хитбоксами: никто не парит над землёй"
    : `\nРАСХОЖДЕНИЙ: ${bad}`,
);
process.exit(bad === 0 ? 0 : 1);
