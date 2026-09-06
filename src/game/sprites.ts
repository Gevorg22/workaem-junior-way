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

/**
 * Выросший разработчик. Ровно PLAYER_H_BIG (22) пикселя от y до y + 22:
 * рост спрайта обязан совпадать с хитбоксом. Раньше он был 15 пикселей при
 * хитбоксе 22 - ноги хитбокса стояли на земле, а нарисованный человек
 * заканчивался на семь пикселей выше и выглядел парящим над полом.
 *
 * Раскладка по строкам: 2 макушка, 3 волосы, 5 лицо, 8 корпус, 4 ноги.
 */
export function drawDev(p: Painter, x: number, y: number, pose: DevPose): void {
  const { face, walking, airborne, stride, grade } = pose;

  if (grade === 0) {
    drawSmallDev(p, x, y, pose);
    return;
  }

  if (grade === 2) {
    // Наушники - самый быстрый способ показать сеньора одним силуэтом.
    // Корпус светлый, обводка тёмная: тёмные наушники на тёмных волосах
    // сливались в чёрный квадрат, и сеньор был неотличим от мидла.
    p(x + 1, y - 3, 7, 2, PAL.headphonesLite);
    p(x + 1, y - 3, 7, 1, PAL.headphones);
    p(x - 1, y - 2, 3, 8, PAL.headphonesLite);
    p(x + 7, y - 2, 3, 8, PAL.headphonesLite);
    p(x - 1, y - 2, 1, 8, PAL.headphones);
    p(x + 9, y - 2, 1, 8, PAL.headphones);
    p(x - 1, y + 5, 3, 1, PAL.headphones);
    p(x + 7, y + 5, 3, 1, PAL.headphones);
  }

  // Голова
  p(x + 1, y, 7, 2, PAL.hair);
  p(x, y + 2, 9, 3, PAL.hair);
  p(x + 1, y + 5, 7, 5, PAL.skin);
  p(x + 1, y + 5, 2, 2, PAL.hair);
  p(x + (face > 0 ? 5 : 2), y + 6, 1, 2, PAL.eye);

  // Корпус
  p(x, y + 10, 9, 8, grade === 2 ? PAL.pants : PAL.shirt);
  p(x, y + 10, 9, 1, grade === 2 ? "#4A6ACC" : PAL.shirtLite);
  p(x + (face > 0 ? 0 : 6), y + 12, 3, 4, PAL.shirtDark);

  // Ноги. Нижняя строка обуви всегда y + 21, то есть ровно подошва хитбокса.
  if (airborne) {
    p(x + 1, y + 18, 3, 4, PAL.pants);
    p(x + 5, y + 18, 3, 3, PAL.pants);
    p(x + 1, y + 21, 3, 1, PAL.shoe);
    p(x + 5, y + 20, 3, 1, PAL.shoe);
  } else if (walking && stride) {
    p(x, y + 18, 3, 4, PAL.pants);
    p(x + 6, y + 18, 3, 3, PAL.pants);
    p(x, y + 21, 4, 1, PAL.shoe);
    p(x + 6, y + 20, 3, 1, PAL.shoe);
  } else {
    p(x + 1, y + 18, 3, 4, PAL.pants);
    p(x + 5, y + 18, 3, 4, PAL.pants);
    p(x, y + 21, 4, 1, PAL.shoe);
    p(x + 5, y + 21, 4, 1, PAL.shoe);
  }

  const laptopX = face > 0 ? x + 8 : x - 3;
  p(laptopX, y + 12, 3, 3, PAL.laptop);
  p(laptopX, y + 12, 3, 1, PAL.door);
}

/**
 * Враги. У каждого своя история, и она должна читаться силуэтом за долю
 * секунды: коробка легаси, жук и окно созвона. Раньше все трое были плоскими
 * заливками с парой точек - теперь у каждого фаска, лицо и своя походка.
 *
 * Низ спрайта обязан совпасть с нижней гранью хитбокса из FOE_SIZE, это
 * сторожит check:sprites.
 */
export function drawFoe(p: Painter, kind: FoeKind, x: number, y: number, legFrame = false): void {
  if (kind === "legacy") {
    // Заклеенная скотчем коробка: то самое наследство, которое никто не
    // хочет открывать. Косой скотч крест-накрест и делает её узнаваемой.
    p(x, y, 12, 9, PAL.legacy);
    p(x, y, 12, 1, PAL.legacyLite);
    p(x, y, 1, 9, PAL.legacyLite);
    p(x + 11, y, 1, 9, PAL.legacyDark);
    p(x, y + 8, 12, 1, PAL.legacyDark);
    p(x + 5, y + 1, 1, 7, PAL.legacyLite);

    p(x + 2, y + 3, 3, 2, PAL.headphones);
    p(x + 7, y + 3, 3, 2, PAL.headphones);
    p(x + 3, y + 3, 1, 1, PAL.shirt);
    p(x + 8, y + 3, 1, 1, PAL.shirt);
    p(x + 3, y + 6, 6, 1, PAL.legacyDark);

    // Ножки переступают: раньше коробка ехала по земле не шевелясь.
    p(x + (legFrame ? 1 : 2), y + 9, 3, 1, PAL.legacyDark);
    p(x + (legFrame ? 8 : 7), y + 9, 3, 1, PAL.legacyDark);
    return;
  }

  if (kind === "bug") {
    // Жук: панцирь со швом, усики и лапы вразнобой.
    p(x + 1, y, 1, 1, PAL.bugDark);
    p(x + 7, y, 1, 1, PAL.bugDark);
    p(x + 1, y + 1, 7, 5, PAL.bug);
    p(x + 2, y + 1, 5, 1, PAL.bugLite);
    p(x, y + 3, 1, 2, PAL.bugDark);
    p(x + 8, y + 3, 1, 2, PAL.bugDark);
    p(x + 4, y + 2, 1, 4, PAL.bugDark);
    p(x + 2, y + 2, 1, 1, PAL.eye);
    p(x + 6, y + 2, 1, 1, PAL.eye);
    p(x, y + 6, 2, legFrame ? 2 : 1, PAL.bugDark);
    p(x + 7, y + 6, 2, legFrame ? 1 : 2, PAL.bugDark);
    return;
  }

  // Созвон - окно видеозвонка: полоса заголовка с кнопками и лицо внутри.
  // Растоптать нельзя, поэтому силуэт нарочно не похож на остальных.
  p(x, y + 1, 13, 8, PAL.call);
  p(x, y + 1, 13, 2, PAL.callLite);
  p(x + 1, y + 1, 1, 1, PAL.text);
  p(x + 3, y + 1, 1, 1, PAL.text);
  p(x, y + 1, 1, 8, PAL.callLite);
  p(x + 12, y + 1, 1, 8, PAL.callDark);
  p(x + 1, y + 9, 11, 1, PAL.callDark);
  p(x + 2, y + 4, 3, 3, PAL.eye);
  p(x + 8, y + 4, 3, 3, PAL.eye);
  p(x + 3, y + 5, 1, 1, PAL.text);
  p(x + 9, y + 5, 1, 1, PAL.text);
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
export function drawPipe(p: Painter, x: number, y: number, w: number, h: number, open = false): void {
  // Раструб сверху шире ствола: по этому силуэту труба и узнаётся.
  p(x, y, w, 5, PAL.pipe);
  p(x, y, w, 1, PAL.pipeLite);
  p(x, y + 4, w, 1, PAL.pipeRim);
  // У проходной трубы видно жерло - иначе игрок не догадается нажать вниз.
  if (open) {
    p(x + 3, y + 1, w - 6, 3, PAL.pipeDark);
    p(x + 4, y + 1, w - 8, 1, PAL.pipeMouth);
  }
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

/**
 * Финальный собес: говорящая голова в мониторе поверх костюма с галстуком.
 * Экран вместо лица - потому что последний этап всегда проходит созвоном,
 * и по ту сторону всегда кто-то, кого ты никогда не увидишь вживую.
 */
export function drawBoss(
  p: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { face: 1 | -1; stride: boolean; flash: boolean; hp: number },
): void {
  const body = PAL.boss;
  const lite = opts.flash ? PAL.bossHurt : PAL.bossLite;
  const dark = PAL.bossDark;

  // Ноги: переступают в такт ходьбе.
  const step = opts.stride ? 0 : 2;
  p(x + 4, y + h - 4, 6, 4, dark);
  p(x + w - 10, y + h - 4 - step, 6, 4 + step, dark);

  // Костюм.
  p(x + 2, y + 20, w - 4, h - 24, body);
  p(x + 2, y + 20, w - 4, 1, lite);
  p(x + w / 2 - 1, y + 21, 2, h - 26, PAL.bossTie);

  // Монитор: корпус, рамка, экран.
  p(x, y, w, 20, body);
  p(x, y, w, 1, lite);
  p(x, y, 1, 20, lite);
  p(x + w - 1, y, 1, 20, dark);
  p(x + 3, y + 3, w - 6, 13, opts.flash ? PAL.bossHurt : PAL.bossScreen);

  // Глаза. С каждым потерянным хп прищур злее - видно, что бой идёт к концу.
  const squint = 3 - opts.hp;
  const eyeY = y + 6 + squint;
  const eyeH = Math.max(1, 4 - squint);
  const dx = opts.face > 0 ? 1 : -1;
  p(x + 6, eyeY, 4, eyeH, PAL.bossGlow);
  p(x + w - 10, eyeY, 4, eyeH, PAL.bossGlow);
  p(x + 7 + dx, eyeY, 2, eyeH, dark);
  p(x + w - 9 + dx, eyeY, 2, eyeH, dark);

  // Рот-полоска: чем меньше хп, тем шире оскал.
  p(x + 8, y + 13, w - 16 + squint * 2, 1, PAL.bossGlow);

  // Оставшиеся этапы собеседования - прямо над головой, где смотрит игрок.
  for (let i = 0; i < 3; i++) {
    p(x + 4 + i * 7, y - 5, 5, 3, i < opts.hp ? PAL.bossTie : PAL.bossDark);
  }
}

/** Вопрос от босса - реплика созвона, летящая тебе в голову. */
export function drawQuestion(p: Painter, x: number, y: number, blink: boolean): void {
  p(x, y, 5, 6, blink ? PAL.bossGlow : PAL.bossScreen);
  p(x + 1, y + 1, 3, 1, PAL.bossDark);
  p(x + 3, y + 2, 1, 1, PAL.bossDark);
  p(x + 2, y + 3, 1, 1, PAL.bossDark);
  p(x + 2, y + 5, 1, 1, PAL.bossDark);
}
