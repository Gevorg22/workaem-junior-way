import { PAL } from "./palette";
import type { BlockDrop, BlockKind, FoeKind, Grade } from "./types";

/**
 * Спрайты рисуются прямоугольниками через Painter, а не через готовые картинки.
 * Так их можно переиспользовать где угодно - в игре, в превью каталога,
 * в картинке для кнопки «поделиться результатом».
 */
export type Painter = (x: number, y: number, w: number, h: number, color: string) => void;

export interface DevPose {
  face: 1 | -1;
  walking: boolean;
  airborne: boolean;
  /** Кадр цикла ходьбы: чередование ног. */
  stride: boolean;
  /** Грейд меняет только вид, хитбокс остаётся 9x15 - иначе не пролезть под платформы. */
  grade: Grade;
}

/** Джун: та же фигура, сжатая до 11 пикселей - короче торс и ноги. */
function drawSmallDev(p: Painter, x: number, y: number, pose: DevPose): void {
  const { face, walking, airborne, stride } = pose;

  p(x + 1, y, 7, 2, PAL.hair);
  p(x, y + 1, 9, 2, PAL.hair);
  p(x + 1, y + 2, 7, 3, PAL.skin);
  p(x + (face > 0 ? 5 : 2), y + 3, 1, 1, PAL.eye);

  p(x, y + 5, 9, 4, PAL.shirt);
  p(x, y + 5, 9, 1, PAL.shirtLite);
  p(x + (face > 0 ? 0 : 6), y + 6, 3, 2, PAL.shirtDark);

  if (airborne) {
    p(x + 1, y + 9, 3, 2, PAL.pants);
    p(x + 5, y + 9, 3, 1, PAL.pants);
  } else if (walking && stride) {
    p(x, y + 9, 3, 2, PAL.pants);
    p(x + 6, y + 9, 3, 2, PAL.pants);
  } else {
    p(x + 1, y + 9, 3, 2, PAL.pants);
    p(x + 5, y + 9, 3, 2, PAL.pants);
  }
  p(x, y + 10, 4, 1, PAL.shoe);
  p(x + 5, y + 10, 4, 1, PAL.shoe);

  const laptopX = face > 0 ? x + 8 : x - 3;
  p(laptopX, y + 6, 3, 2, PAL.laptop);
}

export function drawDev(p: Painter, x: number, y: number, pose: DevPose): void {
  const { face, walking, airborne, stride, grade } = pose;

  if (grade === 0) {
    drawSmallDev(p, x, y, pose);
    return;
  }

  if (grade === 2) {
    // Наушники - самый быстрый способ показать сеньора одним силуэтом.
    p(x - 1, y, 2, 5, PAL.headphones);
    p(x + 8, y, 2, 5, PAL.headphones);
    p(x, y - 2, 9, 2, PAL.headphones);
  }

  p(x + 1, y, 7, 2, PAL.hair);
  p(x, y + 1, 9, 3, PAL.hair);
  p(x + 1, y + 3, 7, 4, PAL.skin);
  p(x + (face > 0 ? 5 : 2), y + 4, 1, 2, PAL.eye);
  p(x + 1, y + 3, 2, 1, PAL.hair);

  p(x, y + 7, 9, 5, grade === 2 ? PAL.pants : PAL.shirt);
  p(x, y + 7, 9, 1, grade === 2 ? "#4A6ACC" : PAL.shirtLite);
  p(x + (face > 0 ? 0 : 6), y + 8, 3, 3, PAL.shirtDark);

  if (airborne) {
    p(x + 1, y + 12, 3, 3, PAL.pants);
    p(x + 5, y + 12, 3, 2, PAL.pants);
    p(x + 1, y + 14, 3, 1, PAL.shoe);
    p(x + 5, y + 13, 3, 1, PAL.shoe);
  } else if (walking && stride) {
    p(x, y + 12, 3, 3, PAL.pants);
    p(x + 6, y + 12, 3, 2, PAL.pants);
    p(x, y + 14, 4, 1, PAL.shoe);
    p(x + 6, y + 13, 3, 1, PAL.shoe);
  } else {
    p(x + 1, y + 12, 3, 3, PAL.pants);
    p(x + 5, y + 12, 3, 3, PAL.pants);
    p(x, y + 14, 4, 1, PAL.shoe);
    p(x + 5, y + 14, 4, 1, PAL.shoe);
  }

  const laptopX = face > 0 ? x + 8 : x - 3;
  p(laptopX, y + 8, 3, 3, PAL.laptop);
  p(laptopX, y + 8, 3, 1, PAL.door);
}

export function drawFoe(p: Painter, kind: FoeKind, x: number, y: number, legFrame = false): void {
  if (kind === "legacy") {
    p(x, y, 12, 9, PAL.legacy);
    p(x, y, 12, 2, PAL.legacyLite);
    p(x, y + 9, 12, 1, PAL.legacyDark);
    p(x + 2, y + 3, 2, 2, PAL.shirt);
    p(x + 8, y + 3, 2, 2, PAL.shirt);
    p(x + 3, y + 6, 6, 1, PAL.legacyDark);
    p(x + 5, y + 2, 1, 5, PAL.legacyDark);
    return;
  }
  if (kind === "bug") {
    p(x + 1, y + 1, 7, 5, PAL.bug);
    p(x + 1, y + 1, 7, 1, PAL.bugLite);
    p(x, y + 3, 1, 2, PAL.bugDark);
    p(x + 8, y + 3, 1, 2, PAL.bugDark);
    p(x + 2, y + 2, 1, 1, PAL.eye);
    p(x + 6, y + 2, 1, 1, PAL.eye);
    p(x + 1, y + 6, 2, legFrame ? 1 : 2, PAL.bugDark);
    p(x + 6, y + 6, 2, legFrame ? 2 : 1, PAL.bugDark);
    return;
  }
  // Созвон: два глаза-квадрата, растоптать нельзя.
  p(x, y + 1, 13, 8, PAL.call);
  p(x, y + 1, 13, 1, PAL.callLite);
  p(x + 1, y + 9, 11, 1, PAL.callDark);
  p(x + 2, y + 3, 3, 3, PAL.eye);
  p(x + 8, y + 3, 3, 3, PAL.eye);
  p(x + 3, y + 4, 1, 1, PAL.text);
  p(x + 9, y + 4, 1, 1, PAL.text);
  p(x + 5, y + 7, 3, 1, PAL.callDark);
}

export function drawSquashed(p: Painter, kind: FoeKind, x: number, y: number, w: number, h: number, frames: number): void {
  const flat = Math.min(frames / 2, 4);
  p(x, y + h - 1 - flat + 4, w, Math.max(1, 3 - flat * 0.5), kind === "bug" ? PAL.bugDark : PAL.legacyDark);
}

export function drawGem(p: Painter, x: number, y: number): void {
  p(x + 2, y, 4, 9, PAL.gem);
  p(x, y + 2, 8, 5, PAL.gem);
  p(x + 1, y + 3, 2, 2, PAL.gemLite);
  p(x + 2, y + 7, 4, 1, PAL.gemDark);
}

export function drawCoffee(p: Painter, x: number, y: number): void {
  p(x + 1, y + 2, 6, 6, PAL.coffee);
  p(x + 1, y + 2, 6, 1, PAL.coffeeLite);
  p(x + 7, y + 3, 2, 3, PAL.coffeeDark);
  p(x + 2, y + 8, 4, 1, PAL.coffeeDark);
  p(x + 2, y, 1, 2, "#5C4A66");
  p(x + 4, y, 1, 2, "#5C4A66");
}

export function drawProd(p: Painter, x: number, y: number, w: number): void {
  p(x, y + 2, w, 4, PAL.prodDark);
  for (let i = 0; i < w; i += 4) {
    p(x + i, y, 2, 3, PAL.prod);
    p(x + i + 1, y - 1, 1, 2, PAL.prod);
  }
}

export function drawSwamp(p: Painter, x: number, y: number, w: number, bubbleOffset: number): void {
  p(x, y, w, 4, PAL.swamp);
  p(x, y, w, 1, PAL.swampLite);
  for (let i = 0; i < w; i += 9) p(x + i + bubbleOffset, y - 1, 2, 1, PAL.swampLite);
}

export function drawDoor(p: Painter, x: number, y: number, open: boolean): void {
  p(x, y, 18, 33, PAL.doorFrame);
  p(x + 1, y + 1, 16, 32, open ? PAL.door : PAL.doorShut);
  p(x + 1, y + 1, 16, 2, "#4A4270");
  p(x + 13, y + 18, 2, 3, PAL.gem);
}

/** Чекпоинт - коммит. Пройденный загорается мятным, непройденный серый. */
export function drawCheckpoint(p: Painter, x: number, y: number, reached: boolean): void {
  const pole = reached ? PAL.door : PAL.legacyDark;
  const flag = reached ? PAL.door : PAL.doorShut;
  p(x, y - 28, 1, 28, pole);
  p(x - 2, y - 1, 5, 2, pole);
  p(x + 1, y - 28, 9, 6, flag);
  if (reached) {
    p(x + 3, y - 26, 2, 2, PAL.sky);
    p(x + 6, y - 26, 2, 2, PAL.sky);
    p(x + 3, y - 24, 5, 1, PAL.sky);
  }
}

/** Блок с вопросом - главный жест жанра: бьёшь снизу, выпадает предмет. */
export function drawBlock(
  p: Painter,
  kind: BlockKind,
  x: number,
  y: number,
  used: boolean,
  ticks: number,
): void {
  if (kind === "brick") {
    p(x, y, 12, 12, PAL.brick);
    p(x, y, 12, 1, PAL.brickLite);
    p(x, y + 11, 12, 1, PAL.brickDark);
    // Кладка вразбежку: два ряда со смещением читаются как кирпич.
    p(x, y + 5, 12, 1, PAL.brickDark);
    p(x + 5, y + 1, 1, 4, PAL.brickDark);
    p(x + 2, y + 6, 1, 5, PAL.brickDark);
    p(x + 9, y + 6, 1, 5, PAL.brickDark);
    return;
  }

  if (used) {
    p(x, y, 12, 12, PAL.blockUsed);
    p(x, y, 12, 1, "#B08A50");
    p(x, y + 11, 12, 1, PAL.blockUsedDark);
    return;
  }

  p(x, y, 12, 12, PAL.block);
  p(x, y, 12, 1, PAL.blockLite);
  p(x, y + 11, 12, 1, PAL.blockDark);
  // Заклёпки по углам.
  p(x + 1, y + 1, 2, 2, PAL.blockDark);
  p(x + 9, y + 1, 2, 2, PAL.blockDark);
  p(x + 1, y + 9, 2, 2, PAL.blockDark);
  p(x + 9, y + 9, 2, 2, PAL.blockDark);

  // Мигающий знак вопроса.
  const bright = Math.floor(ticks / 18) % 4 !== 0;
  const ink = bright ? PAL.textDark : PAL.blockDark;
  p(x + 4, y + 3, 4, 1, ink);
  p(x + 7, y + 4, 1, 2, ink);
  p(x + 5, y + 6, 2, 1, ink);
  p(x + 5, y + 7, 1, 1, ink);
  p(x + 5, y + 9, 1, 1, ink);
}

/** Предмет из блока: оффер поднимает грейд, кофе ускоряет. */
export function drawItem(p: Painter, kind: BlockDrop, x: number, y: number): void {
  if (kind === "tests") {
    // Колба: тесты - единственное, чем джун может отбиться от багов.
    p(x + 3, y, 4, 2, PAL.testDark);
    p(x + 2, y + 2, 6, 3, PAL.testLite);
    p(x + 1, y + 4, 8, 5, PAL.test);
    p(x + 1, y + 8, 8, 1, PAL.testDark);
    p(x + 3, y + 5, 2, 2, PAL.testLite);
    return;
  }

  if (kind === "vacation") {
    // Солнце: на отдыхе ничто не достанет.
    p(x + 2, y + 2, 6, 6, PAL.vacation);
    p(x + 3, y + 1, 4, 8, PAL.vacation);
    p(x + 1, y + 3, 8, 4, PAL.vacation);
    p(x + 3, y + 3, 3, 3, PAL.vacationLite);
    p(x, y, 1, 1, PAL.vacationLite);
    p(x + 9, y, 1, 1, PAL.vacationLite);
    p(x, y + 9, 1, 1, PAL.vacationLite);
    p(x + 9, y + 9, 1, 1, PAL.vacationLite);
    return;
  }

  if (kind === "offer") {
    p(x + 1, y + 1, 8, 8, PAL.offer);
    p(x + 1, y + 1, 8, 1, PAL.offerLite);
    p(x + 1, y + 8, 8, 1, PAL.offerDark);
    // Галочка - знак принятого оффера.
    p(x + 3, y + 5, 1, 2, PAL.text);
    p(x + 4, y + 6, 1, 1, PAL.text);
    p(x + 5, y + 4, 1, 2, PAL.text);
    p(x + 6, y + 3, 1, 2, PAL.text);
    return;
  }
  drawCoffee(p, x, y);
}

/** Труба - сплошное препятствие, на которое запрыгивают. */
export function drawPipe(p: Painter, x: number, y: number, w: number, h: number): void {
  // Раструб сверху шире ствола: по этому силуэту труба и узнаётся.
  p(x, y, w, 5, PAL.pipe);
  p(x, y, w, 1, PAL.pipeLite);
  p(x, y + 4, w, 1, PAL.pipeRim);
  p(x + 2, y + 5, w - 4, h - 5, PAL.pipe);
  p(x + 2, y + 5, 2, h - 5, PAL.pipeLite);
  p(x + w - 5, y + 5, 3, h - 5, PAL.pipeDark);
}

/** Движущаяся платформа: та же доска, но с заклёпками - видно, что механизм. */
export function drawLift(p: Painter, x: number, y: number, w: number): void {
  p(x, y, w, 4, PAL.lift);
  p(x, y, w, 1, PAL.liftLite);
  p(x, y + 3, w, 1, PAL.liftDark);
  for (let i = 2; i < w - 2; i += 6) p(x + i, y + 1, 1, 2, PAL.liftDark);
}

/** Брошенный тест - маленькая колба, летящая по дуге. */
export function drawShot(p: Painter, x: number, y: number, spin: number): void {
  p(x, y, 4, 4, PAL.test);
  p(x, y, 4, 1, PAL.testLite);
  p(x + (spin % 2 ? 0 : 2), y + 1, 2, 2, PAL.testLite);
}
