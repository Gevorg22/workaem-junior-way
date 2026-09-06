import { PAL } from "./palette";
import type { BlockDrop, BlockKind, FoeKind, Grade } from "./types";

/**
 * Спрайты рисуются прямоугольниками через Painter, а не через готовые картинки.
 * Так их можно переиспользовать где угодно - в игре, в превью каталога,
 * в картинке для кнопки «поделиться результатом».
 */
/**
 * Кисть. Вызывается как раньше - p(x, y, w, h, цвет) рисует прямоугольник,
 * поэтому весь старый код спрайтов работает без правок. Методы добавляют
 * гладкие формы: скругления, круги, овалы, градиенты и многоугольники.
 *
 * Координаты дробные. Раньше рисовалка округляла их до целых, из-за чего
 * всё падало в крупную сетку и картинка выглядела сложенной из кубиков.
 */
export interface Painter {
  (x: number, y: number, w: number, h: number, color: string): void;
  /** Скруглённый прямоугольник. */
  round(x: number, y: number, w: number, h: number, r: number, color: string): void;
  /** Круг. */
  circle(cx: number, cy: number, r: number, color: string): void;
  /** Овал - основа почти любой органической формы. */
  oval(cx: number, cy: number, rx: number, ry: number, color: string): void;
  /**
   * Прямоугольник с вертикальным градиентом. Скругление необязательно.
   * Градиент и есть главный инструмент против «кубиков»: объём получается
   * переходом цвета, а не ступенькой из двух заливок.
   */
  grad(x: number, y: number, w: number, h: number, top: string, bottom: string, r?: number): void;
  /** Мягкое пятно: радиальный градиент от цвета к прозрачности. */
  glow(cx: number, cy: number, r: number, color: string): void;
  /** Произвольный многоугольник по точкам. */
  poly(pts: Array<readonly [number, number]>, color: string): void;
}

export interface DevPose {
  face: 1 | -1;
  walking: boolean;
  airborne: boolean;
  /** Кадр цикла ходьбы: чередование ног. */
  stride: boolean;
  /** Грейд меняет только вид, хитбокс остаётся 9x15 - иначе не пролезть под платформы. */
  grade: Grade;
}

/**
 * Джун: те же формы, но ниже вдвое - PLAYER_H_SMALL (11) от y до y + 11.
 * Голова нарочно крупная относительно тела: так силуэт читается «младшим»
 * с одного взгляда, без всяких подписей.
 */
function drawSmallDev(p: Painter, x: number, y: number, pose: DevPose): void {
  const { face, walking, airborne, stride } = pose;
  const cx = x + 4.5;
  const front = face > 0 ? 1 : -1;

  const spread = airborne ? 0.5 : walking && stride ? 1.4 : 1;
  const backLeg = cx - 1.9 * spread;
  const frontLeg = cx + 1.9 * spread;
  p.grad(backLeg - 1.5, y + 7.6, 3, 3.4, PAL.pantsLite, PAL.pantsDark, 1.3);
  p.grad(frontLeg - 1.5, y + 7.6, 3, 3.4, PAL.pantsLite, PAL.pants, 1.3);
  p.round(backLeg - 1.9, y + 9.4, 3.8, 1.6, 0.8, PAL.shoe);
  p.round(frontLeg - 1.9, y + 9.4, 3.8, 1.6, 0.8, PAL.shoeLite);

  p.grad(x + 0.4, y + 4.6, 8.2, 4.6, PAL.shirtLite, PAL.shirt, 2);
  p.round(cx - front * 4 - 0.6, y + 5.2, 1.5, 3.4, 0.7, PAL.shirtDark);
  p.round(cx + front * 3.4 - 1, y + 5.6, 2.2, 2.4, 1, PAL.laptop);

  p.oval(cx, y + 2.9, 3.7, 3.1, PAL.skin);
  p.oval(cx - front * 0.4, y + 2.4, 3.3, 2.3, PAL.skinLite);
  p.oval(cx, y + 1.5, 4, 2.2, PAL.hair);
  p.oval(cx - front * 1.3, y + 1.2, 2.9, 1.7, PAL.hairLite);
  p.oval(cx + front * 1.4, y + 3.1, 0.55, 0.75, PAL.eye);
}

/**
 * Выросший разработчик, ровно PLAYER_H_BIG (22) от y до y + 22.
 *
 * Рисуется кривыми и градиентами, а не набором прямоугольников: объём даёт
 * переход цвета, а край - скругление. Раньше фигура складывалась из кубиков,
 * и на крупном масштабе это читалось как лесенка.
 *
 * Раскладка: голова до y+10, корпус до y+17, ноги до y+22. Подошва обязана
 * лежать ровно на y+22 - это нижняя грань хитбокса, её сторожит check:sprites.
 */
export function drawDev(p: Painter, x: number, y: number, pose: DevPose): void {
  const { face, walking, airborne, stride, grade } = pose;

  if (grade === 0) {
    drawSmallDev(p, x, y, pose);
    return;
  }

  const cx = x + 4.5;
  const front = face > 0 ? 1 : -1;

  // Ноги. Шаг разводит их, в прыжке поджимаются.
  const spread = airborne ? 0.6 : walking && stride ? 1.5 : 1;
  const backLeg = cx - 2.2 * spread;
  const frontLeg = cx + 2.2 * spread;
  const backTop = airborne ? y + 16.4 : y + 16.6;
  p.grad(backLeg - 1.7, backTop, 3.4, 5.4, PAL.pantsLite, PAL.pantsDark, 1.5);
  p.grad(frontLeg - 1.7, y + 16.6, 3.4, 5.4, PAL.pantsLite, PAL.pants, 1.5);

  // Ботинки: подошва садится ровно на y + 22.
  p.round(backLeg - 2.1, y + 20.2, 4.2, 1.8, 0.85, PAL.shoe);
  p.round(frontLeg - 2.1, y + 20.2, 4.2, 1.8, 0.85, PAL.shoeLite);

  // Корпус. Градиент сверху вниз плюс мягкая тень по спине.
  const body = grade === 2 ? PAL.pants : PAL.shirt;
  const bodyLite = grade === 2 ? PAL.pantsLite : PAL.shirtLite;
  const bodyDark = grade === 2 ? PAL.pantsDark : PAL.shirtDark;
  p.grad(x + 0.2, y + 9.2, 8.6, 8.4, bodyLite, body, 2.6);
  p.round(cx - front * 4.3 - 0.6, y + 10, 1.6, 7, 0.8, bodyDark);

  // Рука с ноутбуком - маленькая деталь, но именно она делает силуэт
  // айтишным, а не абстрактным человечком.
  p.round(cx + front * 3.2 - 1.1, y + 11.4, 2.4, 4.4, 1.1, body);
  p.round(cx + front * 4.6 - 1.4, y + 12.2, 2.8, 2.8, 0.7, PAL.laptop);
  p.round(cx + front * 4.6 - 1.4, y + 12.2, 2.8, 1.1, 0.5, PAL.door);

  // Шея
  p.round(cx - 1.2, y + 8, 2.4, 2, 0.9, PAL.skinShade);

  // Голова: овал лица, сверху шапка волос, чёлка со стороны взгляда.
  p.oval(cx, y + 5.4, 3.9, 4.4, PAL.skin);
  p.oval(cx - front * 0.5, y + 4.6, 3.6, 3.2, PAL.skinLite);
  p.oval(cx, y + 3.1, 4.2, 3.1, PAL.hair);
  p.oval(cx - front * 1.4, y + 2.6, 3.1, 2.4, PAL.hairLite);
  p.round(cx - front * 3.9 - 0.5, y + 2.6, 1.6, 3.4, 0.8, PAL.hair);

  // Глаз
  p.oval(cx + front * 1.5, y + 5.6, 0.62, 0.86, PAL.eye);

  if (grade === 2) {
    // Наушники сеньора. Дужка дугой над головой, чашки по бокам -
    // светлые, иначе на тёмных волосах сливаются в пятно.
    p.round(cx - 4.6, y + 0.4, 9.2, 1.5, 0.75, PAL.headphonesLite);
    p.round(cx - 4.6, y + 0.4, 9.2, 0.7, 0.35, PAL.headphones);
    p.round(cx - 5.4, y + 2.4, 2.3, 5.2, 1.1, PAL.headphonesLite);
    p.round(cx + 3.1, y + 2.4, 2.3, 5.2, 1.1, PAL.headphonesLite);
    p.round(cx - 5.4, y + 2.4, 0.8, 5.2, 0.4, PAL.headphones);
    p.round(cx + 4.6, y + 2.4, 0.8, 5.2, 0.4, PAL.headphones);
  }
}

/**
 * Враги. Силуэт обязан читаться за долю секунды: коробка легаси, жук и окно
 * созвона. Формы кривые, объём градиентом - как и у героя.
 *
 * Низ спрайта совпадает с нижней гранью хитбокса из FOE_SIZE, это сторожит
 * check:sprites. Верх свободен: созвон намеренно висит в воздухе.
 */
export function drawFoe(p: Painter, kind: FoeKind, x: number, y: number, legFrame = false): void {
  if (kind === "legacy") {
    // Заклеенная скотчем коробка - наследство, которое никто не хочет
    // открывать. Скотч по центру и делает её узнаваемой.
    p.round(x + (legFrame ? 0.8 : 1.8), y + 7.6, 3, 2.4, 1, PAL.legacyDark);
    p.round(x + (legFrame ? 8.2 : 7.2), y + 7.6, 3, 2.4, 1, PAL.legacyDark);

    p.grad(x + 0.2, y + 0.2, 11.6, 8.6, PAL.legacyLite, PAL.legacy, 1.8);
    p.round(x + 5.2, y + 0.4, 1.6, 8.2, 0.5, PAL.legacyLite);
    p.round(x + 0.6, y + 6.6, 10.8, 2, 1, PAL.legacyDark);

    p.oval(x + 3.4, y + 3.6, 1.5, 1.3, PAL.headphones);
    p.oval(x + 8.6, y + 3.6, 1.5, 1.3, PAL.headphones);
    p.circle(x + 3.6, y + 3.5, 0.55, PAL.shirt);
    p.circle(x + 8.8, y + 3.5, 0.55, PAL.shirt);
    p.round(x + 3.6, y + 5.8, 4.8, 0.9, 0.45, PAL.legacyDark);
    return;
  }

  if (kind === "bug") {
    // Жук: панцирь со швом, усики и лапы вразнобой.
    p.round(x, y + 5.6, 2.4, legFrame ? 2.4 : 1.6, 0.7, PAL.bugDark);
    p.round(x + 6.6, y + 5.6, 2.4, legFrame ? 1.6 : 2.4, 0.7, PAL.bugDark);

    p.circle(x + 1.6, y + 0.5, 0.5, PAL.bugDark);
    p.circle(x + 7.4, y + 0.5, 0.5, PAL.bugDark);

    p.oval(x + 4.5, y + 3.4, 4, 2.9, PAL.bugDark);
    p.oval(x + 4.5, y + 3.2, 3.5, 2.5, PAL.bug);
    p.oval(x + 4.5, y + 2.4, 2.6, 1.2, PAL.bugLite);
    p.round(x + 4.2, y + 1.2, 0.6, 4.2, 0.3, PAL.bugDark);
    p.circle(x + 2.6, y + 2.4, 0.55, PAL.eye);
    p.circle(x + 6.4, y + 2.4, 0.55, PAL.eye);
    return;
  }

  // Созвон - окно видеозвонка: полоса заголовка с кнопками и лицо внутри.
  // Растоптать нельзя, поэтому силуэт нарочно не похож на остальных.
  p.round(x + 0.6, y + 8.4, 11.8, 1.6, 0.8, PAL.callDark);
  p.grad(x + 0.2, y + 1, 12.6, 8.2, PAL.callLite, PAL.call, 1.8);
  p.round(x + 0.2, y + 1, 12.6, 2.8, 1.6, PAL.callLite);
  p.circle(x + 1.8, y + 2.2, 0.55, PAL.text);
  p.circle(x + 3.6, y + 2.2, 0.55, PAL.text);
  p.oval(x + 3.6, y + 5.4, 1.5, 1.5, PAL.eye);
  p.oval(x + 9.4, y + 5.4, 1.5, 1.5, PAL.eye);
  p.circle(x + 4, y + 5.1, 0.5, PAL.text);
  p.circle(x + 9.8, y + 5.1, 0.5, PAL.text);
  p.round(x + 5, y + 7.2, 3, 0.9, 0.45, PAL.callDark);
}

/** Растоптанный враг: сплющивается в лепёшку и тает. */
export function drawSquashed(p: Painter, kind: FoeKind, x: number, y: number, w: number, h: number, frames: number): void {
  const flat = Math.min(frames / 2, 4);
  const height = Math.max(0.6, 3 - flat * 0.5);
  p.round(x + flat * 0.3, y + h + 3 - flat, w - flat * 0.6, height, height / 2,
    kind === "bug" ? PAL.bugDark : PAL.legacyDark);
}

/** Скилл: гранёный камень. Блик сверху и тень снизу дают объём. */
export function drawGem(p: Painter, x: number, y: number): void {
  p.glow(x + 4, y + 4.5, 6, "rgba(255,214,74,.30)");
  p.poly([[x + 4, y], [x + 8, y + 4.5], [x + 4, y + 9], [x, y + 4.5]], PAL.gemDark);
  p.poly([[x + 4, y + 0.7], [x + 7.2, y + 4.5], [x + 4, y + 8.3], [x + 0.8, y + 4.5]], PAL.gem);
  p.poly([[x + 4, y + 1.4], [x + 6, y + 4], [x + 4, y + 4.6], [x + 2, y + 4]], PAL.gemLite);
}

/** Кофе: кружка с ручкой и парой завитков пара. */
export function drawCoffee(p: Painter, x: number, y: number): void {
  p.round(x + 6.4, y + 3.4, 2.4, 3, 1.2, PAL.coffeeDark);
  p.grad(x + 0.8, y + 2, 6.2, 6.4, PAL.coffeeLite, PAL.coffee, 1.4);
  p.oval(x + 3.9, y + 2.4, 2.9, 0.9, PAL.coffeeLite);
  p.round(x + 1.6, y + 8, 4.6, 1, 0.5, PAL.coffeeDark);
  p.round(x + 2.2, y - 0.4, 0.8, 2.4, 0.4, "rgba(255,255,255,.55)");
  p.round(x + 4.4, y - 0.8, 0.8, 2.6, 0.4, "rgba(255,255,255,.4)");
}

/** Прод: раскалённые шипы. Касание - минус жизнь. */
export function drawProd(p: Painter, x: number, y: number, w: number): void {
  p.round(x, y + 2, w, 4, 1, PAL.prodDark);
  for (let i = 0; i < w - 1; i += 4) {
    p.poly([[x + i, y + 3], [x + i + 2, y - 1], [x + i + 4, y + 3]], PAL.prod);
  }
  p.round(x, y + 2, w, 1, 0.5, "rgba(255,255,255,.18)");
}

/** Болото легаси: вязкая жижа с пузырями. */
export function drawSwamp(p: Painter, x: number, y: number, w: number, bubbleOffset: number): void {
  p.grad(x, y, w, 4.4, PAL.swampLite, PAL.swamp, 1);
  for (let i = 0; i < w; i += 9) {
    p.circle(x + i + bubbleOffset + 1, y - 0.4, 0.9, PAL.swampLite);
  }
}

/** Дверь оффера. Открытая светится, закрытая глухая. */
export function drawDoor(p: Painter, x: number, y: number, open: boolean): void {
  if (open) p.glow(x + 9, y + 16, 18, "rgba(122,240,200,.28)");
  p.round(x, y, 18, 33, 2.5, PAL.doorFrame);
  p.grad(x + 1.2, y + 1.2, 15.6, 30.6, open ? "#7AF0C8" : "#5A5478", open ? PAL.door : PAL.doorShut, 1.8);
  p.round(x + 1.2, y + 1.2, 15.6, 3, 1.5, "rgba(255,255,255,.18)");
  p.circle(x + 14, y + 19, 1.2, PAL.gem);
}

/** Чекпоинт - коммит. Пройденный загорается, непройденный серый. */
export function drawCheckpoint(p: Painter, x: number, y: number, reached: boolean): void {
  const pole = reached ? PAL.door : PAL.legacyDark;
  const flag = reached ? PAL.door : PAL.doorShut;
  if (reached) p.glow(x + 5, y - 25, 12, "rgba(122,240,200,.22)");
  p.round(x - 0.4, y - 28, 1.6, 28, 0.8, pole);
  p.oval(x + 0.4, y - 0.4, 3, 1.2, pole);
  p.poly([[x + 1.2, y - 28.4], [x + 10.5, y - 25.4], [x + 1.2, y - 22.4]], flag);
  if (reached) {
    p.circle(x + 3.6, y - 26, 0.8, PAL.sky);
    p.circle(x + 6, y - 25.6, 0.8, PAL.sky);
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
    p.grad(x, y, 12, 12, PAL.brickLite, PAL.brick, 1.6);
    // Кладка вразбежку: два ряда со смещением читаются как кирпич.
    p.round(x + 0.6, y + 5.2, 10.8, 0.8, 0.4, PAL.brickDark);
    p.round(x + 5.6, y + 1, 0.8, 4, 0.4, PAL.brickDark);
    p.round(x + 2.6, y + 6.4, 0.8, 4.4, 0.4, PAL.brickDark);
    p.round(x + 8.6, y + 6.4, 0.8, 4.4, 0.4, PAL.brickDark);
    p.round(x + 0.6, y + 0.6, 10.8, 1, 0.5, "rgba(255,255,255,.22)");
    return;
  }

  if (used) {
    p.grad(x, y, 12, 12, "#B08A50", PAL.blockUsed, 1.6);
    p.round(x + 1, y + 1, 10, 10, 1.2, PAL.blockUsedDark);
    p.grad(x + 1.4, y + 1.4, 9.2, 9.2, PAL.blockUsed, PAL.blockUsedDark, 1);
    return;
  }

  p.grad(x, y, 12, 12, PAL.blockLite, PAL.block, 1.8);
  p.round(x + 0.6, y + 0.6, 10.8, 1.2, 0.6, "rgba(255,255,255,.35)");
  for (const [dx, dy] of [[1.6, 1.6], [8.6, 1.6], [1.6, 8.6], [8.6, 8.6]] as const) {
    p.circle(x + dx + 0.9, y + dy + 0.9, 0.85, PAL.blockDark);
  }

  // Мигающий знак вопроса. Рисуется дугой и точкой, а не набором клеток.
  const bright = Math.floor(ticks / 18) % 4 !== 0;
  const ink = bright ? PAL.textDark : PAL.blockDark;
  p.circle(x + 6, y + 4.6, 2.1, ink);
  p.circle(x + 6, y + 4.6, 1.1, bright ? PAL.blockLite : PAL.block);
  p.round(x + 5.3, y + 5.4, 1.5, 2.4, 0.7, ink);
  p.circle(x + 6.05, y + 9.2, 0.85, ink);
}

/**
 * Что выпадает из ящиков. Каждый предмет обязан узнаваться мгновенно:
 * колба - тесты, солнце - отпуск, конверт с галочкой - оффер, кружка - кофе.
 * Свечение вокруг отделяет предмет от пёстрого фона.
 */
export function drawItem(p: Painter, kind: BlockDrop, x: number, y: number): void {
  if (kind === "tests") {
    p.glow(x + 5, y + 5, 7, "rgba(122,240,200,.28)");
    p.round(x + 3.4, y - 0.2, 3.2, 2.4, 0.6, PAL.testDark);
    p.poly([[x + 3.6, y + 1.8], [x + 6.4, y + 1.8], [x + 8.8, y + 8.4], [x + 1.2, y + 8.4]], PAL.testLite);
    p.poly([[x + 4.4, y + 4.4], [x + 5.6, y + 4.4], [x + 8.2, y + 8.4], [x + 1.8, y + 8.4]], PAL.test);
    p.oval(x + 3.6, y + 6.4, 0.9, 0.7, "rgba(255,255,255,.55)");
    return;
  }

  if (kind === "vacation") {
    p.glow(x + 5, y + 5, 8, "rgba(255,214,74,.34)");
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.circle(x + 5 + Math.cos(a) * 4.4, y + 5 + Math.sin(a) * 4.4, 0.8, PAL.vacationLite);
    }
    p.circle(x + 5, y + 5, 3.4, PAL.vacation);
    p.circle(x + 4.2, y + 4.2, 1.6, PAL.vacationLite);
    return;
  }

  if (kind === "offer") {
    p.glow(x + 5, y + 5, 7, "rgba(255,255,255,.22)");
    p.grad(x + 0.6, y + 1.2, 8.8, 7.6, PAL.offerLite, PAL.offer, 1.2);
    // Клапан конверта: две линии от углов к середине.
    p.poly([[x + 0.6, y + 1.2], [x + 5, y + 5.2], [x + 9.4, y + 1.2]], PAL.offerDark);
    // Галочка - знак принятого оффера.
    p.poly([
      [x + 2.6, y + 5.6], [x + 3.6, y + 4.8], [x + 4.4, y + 6],
      [x + 6.6, y + 2.8], [x + 7.6, y + 3.6], [x + 4.5, y + 7.6],
    ], PAL.text);
    return;
  }

  p.glow(x + 5, y + 5, 7, "rgba(200,140,80,.28)");
  p.round(x + 6.6, y + 3.4, 2.4, 3, 1.2, PAL.coffeeDark);
  p.grad(x + 0.8, y + 2, 6.2, 6.4, PAL.coffeeLite, PAL.coffee, 1.4);
  p.oval(x + 3.9, y + 2.4, 2.9, 0.9, PAL.coffeeLite);
  p.round(x + 1.6, y + 8, 4.6, 1, 0.5, PAL.coffeeDark);
}

/**
 * Труба. С параметром open - проходная: у неё видно чёрное жерло, иначе
 * игрок не догадается нажать вниз.
 */
export function drawPipe(p: Painter, x: number, y: number, w: number, h: number, open = false): void {
  // Ствол уже раструба: по этому силуэту труба и узнаётся.
  p.grad(x + 2, y + 4, w - 4, h - 4, PAL.pipeLite, PAL.pipe);
  p.round(x + 2, y + 4, 2.6, h - 4, 1, "rgba(255,255,255,.20)");
  p.round(x + w - 5, y + 4, 2.6, h - 4, 1, PAL.pipeDark);

  // Раструб
  p.grad(x, y, w, 5.4, PAL.pipeLite, PAL.pipe, 1.6);
  p.round(x, y + 4.2, w, 1.2, 0.6, PAL.pipeRim);
  if (open) {
    p.round(x + 2.6, y + 0.8, w - 5.2, 3, 1.4, PAL.pipeDark);
    p.oval(x + w / 2, y + 2.2, w / 2 - 3.4, 1.1, PAL.pipeMouth);
  } else {
    p.round(x + 1.6, y + 0.6, w - 3.2, 1.2, 0.6, "rgba(255,255,255,.28)");
  }
}

/** Движущаяся платформа: доска с заклёпками - видно, что механизм. */
export function drawLift(p: Painter, x: number, y: number, w: number): void {
  p.grad(x, y, w, 4, PAL.liftLite, PAL.liftDark, 1.6);
  p.round(x + 0.6, y + 0.4, w - 1.2, 1.2, 0.6, "rgba(255,255,255,.3)");
  for (let i = 2.5; i < w - 2; i += 6) p.circle(x + i, y + 2, 0.7, PAL.liftDark);
}

/** Брошенный тест - колба, летящая по дуге и вращающаяся. */
export function drawShot(p: Painter, x: number, y: number, spin: number): void {
  p.glow(x + 2, y + 2, 4, "rgba(122,240,200,.35)");
  p.circle(x + 2, y + 2, 2.1, PAL.test);
  p.circle(x + (spin % 2 ? 1.3 : 2.7), y + 1.4, 0.9, PAL.testLite);
}

/**
 * Финальный собес: говорящая голова в мониторе поверх костюма с галстуком.
 * Экран вместо лица - потому что последний этап всегда проходит созвоном,
 * и по ту сторону всегда кто-то, кого ты никогда не увидишь вживую.
 *
 * Низ спрайта ровно на h - это нижняя грань бокса. Деления жизни намеренно
 * рисуются выше головы, они к силуэту не относятся.
 */
export function drawBoss(
  p: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { face: 1 | -1; stride: boolean; flash: boolean; hp: number },
): void {
  const lite = opts.flash ? PAL.bossHurt : PAL.bossLite;
  const dark = PAL.bossDark;
  const cx = x + w / 2;

  // Ноги переступают в такт ходьбе.
  const step = opts.stride ? 0 : 1.6;
  p.round(x + 4, h + y - 4.6, 6, 4.6, 1.4, dark);
  p.round(x + w - 10, h + y - 4.6 - step, 6, 4.6 + step, 1.4, dark);

  // Костюм с галстуком.
  p.grad(x + 1.6, y + 19, w - 3.2, h - 22, lite, PAL.boss, 2.2);
  p.poly([[cx - 2.2, y + 19.5], [cx + 2.2, y + 19.5], [cx, y + 22.5]], PAL.bossTie);
  p.poly([[cx - 1.4, y + 22], [cx + 1.4, y + 22], [cx, y + h - 5]], PAL.bossTie);

  // Монитор: корпус и утопленный экран.
  p.grad(x, y, w, 20.5, lite, PAL.boss, 2.6);
  p.round(x + 0.8, y + 0.8, w - 1.6, 1.4, 0.7, "rgba(255,255,255,.22)");
  p.round(x + 2.6, y + 2.6, w - 5.2, 14.4, 2, dark);
  p.grad(x + 3.2, y + 3.2, w - 6.4, 13.2, opts.flash ? PAL.bossHurt : "#12505F", opts.flash ? PAL.bossHurt : PAL.bossScreen, 1.6);

  // Глаза. С каждым потерянным хп прищур злее - видно, что бой к концу.
  const squint = 3 - opts.hp;
  const eyeY = y + 8 + squint * 0.7;
  const eyeR = Math.max(0.9, 2 - squint * 0.35);
  const dx = opts.face > 0 ? 0.5 : -0.5;
  p.oval(x + 8, eyeY, 2, eyeR, PAL.bossGlow);
  p.oval(x + w - 8, eyeY, 2, eyeR, PAL.bossGlow);
  p.circle(x + 8 + dx, eyeY, Math.min(1, eyeR), dark);
  p.circle(x + w - 8 + dx, eyeY, Math.min(1, eyeR), dark);

  // Рот-полоска: чем меньше хп, тем шире оскал.
  p.round(x + 8 - squint, y + 13, w - 16 + squint * 2, 1.1, 0.55, PAL.bossGlow);

  // Оставшиеся этапы собеседования - прямо над головой, где смотрит игрок.
  for (let i = 0; i < 3; i++) {
    p.round(x + 4 + i * 7, y - 5, 5, 3, 1.2, i < opts.hp ? PAL.bossTie : dark);
  }
}

/** Вопрос от босса - реплика созвона, летящая тебе в голову. */
export function drawQuestion(p: Painter, x: number, y: number, blink: boolean): void {
  p.glow(x + 2.5, y + 3, 5, "rgba(99,230,198,.30)");
  p.round(x - 0.2, y, 5.4, 5, 1.8, blink ? PAL.bossGlow : PAL.bossScreen);
  p.poly([[x + 1.2, y + 4.4], [x + 3, y + 4.4], [x + 1.6, y + 6.2]], blink ? PAL.bossGlow : PAL.bossScreen);
  p.circle(x + 2.5, y + 1.8, 1.05, PAL.bossDark);
  p.circle(x + 2.5, y + 1.8, 0.5, blink ? PAL.bossGlow : PAL.bossScreen);
  p.round(x + 2.1, y + 2.2, 0.9, 1.1, 0.45, PAL.bossDark);
  p.circle(x + 2.55, y + 3.9, 0.42, PAL.bossDark);
}
