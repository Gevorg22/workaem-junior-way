import { PAL } from "./palette";
import { canvasBrush, drawDev, drawFoe, drawGem, drawItem, drawPole } from "./sprites";
import type { RunStats } from "./types";

/**
 * Картинка результата для шеринга.
 *
 * Расшаренная ссылка - это строчка текста в чужой ленте, а картинка -
 * событие: её открывают, на неё отвечают. Рисуется теми же спрайтами, что
 * и сама игра, поэтому отдельного арта не появилось ни одного файла.
 *
 * Логический размер 320x180, отдаётся вдвое крупнее: 640x360 - формат,
 * который Telegram показывает в чате целиком, не обрезая.
 */
const W = 320;
const H = 180;
const SCALE = 2;
const GY = 138;

export interface CardData {
  /** Имя игрока, если известно. */
  name?: string;
  grade: string;
  stats: RunStats;
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  color: string,
  size: number,
  display = false,
  center = false,
): void {
  ctx.font = display
    ? `${size}px 'Pixelify Sans', monospace`
    : `${size}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = color;
  const w = center ? ctx.measureText(str).width : 0;
  ctx.fillText(str, center ? x - w / 2 : x, y);
}

/**
 * Рисует карточку и отдаёт её PNG-данными. Шрифты ждём явно: без этого
 * первая же картинка выходит системным шрифтом, потому что Pixelify
 * к моменту отрисовки ещё грузится.
 */
export async function renderCard(data: CardData): Promise<string> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    // Шрифты не дождались - нарисуем тем, что есть.
  }

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const p = canvasBrush(ctx);

  // Небо и город - тот же вечерний кадр, что и в игре.
  p.grad(0, 0, W, GY + 2, PAL.skyTop, PAL.skyHorizon);
  for (let c = 0; c < 5; c++) {
    const cx = 18 + c * 68;
    for (const [dx, dy, r] of [[0, 2, 5], [6, 0, 6.6], [13, 1.5, 5.5], [19, 3, 4]] as const) {
      p.oval(cx + dx, 20 + ((c * 7) % 9) + dy, r, r * 0.82, PAL.cloud);
    }
  }
  for (let i = 0; i < 9; i++) {
    const bx = i * 38 - 6;
    const bh = 34 + ((i * 29) % 26);
    p.grad(bx, GY - bh, 24, bh, i % 2 ? PAL.towerDark : PAL.tower, PAL.towerRoof, 1.2);
    for (let row = 0; row < Math.floor((bh - 6) / 8); row++) {
      for (let col = 0; col < 3; col++) {
        const lit = ((i * 7 + row * 13 + col * 29) % 11) < 4;
        p.round(bx + 3 + col * 7, GY - bh + 6 + row * 8, 4, 4, 1, lit ? PAL.towerWindowLit : PAL.towerWindow);
      }
    }
  }
  p(0, 0, W, GY, PAL.haze);

  // Земля.
  p.grad(0, GY, W, H - GY, PAL.groundLite, PAL.ground);
  p.round(0, GY, W, 3, 1.4, PAL.groundLite);
  for (let x = 0; x < W; x += 14) p.round(x, GY + 6, 0.8, H - GY - 6, 0.4, PAL.groundDark);

  // Сцена держится в правой половине: левую займёт текст, и всё, что
  // окажется под ним, будет просто испорчено затемнением.
  drawPole(p, 296, GY, 44, GY - 40);
  drawDev(p, 246, GY - 22, { face: 1, walking: true, airborne: false, stride: true, grade: 2 });
  drawFoe(p, "legacy", 212, GY - 10, true);
  for (let i = 0; i < 3; i++) drawGem(p, 214 + i * 18, GY - 44);
  drawItem(p, "offer", 268, GY - 14);

  // Затемнение под текст. Градиент кладём прямо контекстом: у кисти он
  // только вертикальный, а полосами - видны сами полосы.
  const shade = ctx.createLinearGradient(0, 0, 208, 0);
  shade.addColorStop(0, "rgba(12,10,20,.88)");
  shade.addColorStop(0.68, "rgba(12,10,20,.80)");
  shade.addColorStop(1, "rgba(12,10,20,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 208, H);

  const who = data.name ? `${data.name}` : "Путь джуна";
  text(ctx, who.toUpperCase(), 16, 34, PAL.text, 22, true);
  text(ctx, `ГРЕЙД ${data.grade}`, 16, 52, PAL.gem, 12, true);

  const s = data.stats;
  const rows = [
    `очков ${s.score}`,
    `скиллов ${s.skills}`,
    `уровней ${s.levelsCleared} из 12`,
    `цепочка ${s.maxCombo} · смертей ${s.deaths}`,
  ];
  rows.forEach((row, i) => text(ctx, row, 16, 78 + i * 15, i === 0 ? PAL.text : PAL.dim, 11));

  p.round(16, 148, 168, 18, 4, "rgba(46,204,113,.16)");
  text(ctx, "workaem.com - IT-вакансии", 24, 161, PAL.door, 11);

  return canvas.toDataURL("image/png");
}
