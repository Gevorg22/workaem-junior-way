import { PAL } from "./palette";
import type { FoeKind } from "./types";

/**
 * Спрайты рисуются прямоугольниками через Painter, а не через готовые картинки.
 * Так их можно переиспользовать где угодно — в игре, в превью каталога,
 * в картинке для кнопки «поделиться результатом».
 */
export type Painter = (x: number, y: number, w: number, h: number, color: string) => void;

export interface DevPose {
  face: 1 | -1;
  walking: boolean;
  airborne: boolean;
  /** Кадр цикла ходьбы: чередование ног. */
  stride: boolean;
}

export function drawDev(p: Painter, x: number, y: number, pose: DevPose): void {
  const { face, walking, airborne, stride } = pose;

  p(x + 1, y, 7, 2, PAL.hair);
  p(x, y + 1, 9, 3, PAL.hair);
  p(x + 1, y + 3, 7, 4, PAL.skin);
  p(x + (face > 0 ? 5 : 2), y + 4, 1, 2, PAL.eye);
  p(x + 1, y + 3, 2, 1, PAL.hair);

  p(x, y + 7, 9, 5, PAL.shirt);
  p(x, y + 7, 9, 1, PAL.shirtLite);
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
  p(x, y, 16, 24, PAL.doorFrame);
  p(x + 1, y + 1, 14, 23, open ? PAL.door : PAL.doorShut);
  p(x + 1, y + 1, 14, 2, "#4A4270");
  p(x + 11, y + 13, 2, 2, PAL.gem);
}

/** Чекпоинт — коммит. Пройденный загорается мятным, непройденный серый. */
export function drawCheckpoint(p: Painter, x: number, y: number, reached: boolean): void {
  const pole = reached ? PAL.door : PAL.legacyDark;
  const flag = reached ? PAL.door : PAL.doorShut;
  p(x, y - 20, 1, 20, pole);
  p(x - 2, y - 1, 5, 2, pole);
  p(x + 1, y - 20, 9, 6, flag);
  if (reached) {
    p(x + 3, y - 18, 2, 2, PAL.sky);
    p(x + 6, y - 18, 2, 2, PAL.sky);
    p(x + 3, y - 16, 5, 1, PAL.sky);
  }
}
