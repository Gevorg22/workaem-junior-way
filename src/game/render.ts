import { PAL } from "./palette";
import { LEVELS } from "./levels";
import { TUNING as T, VIEW } from "./tuning";
import {
  drawBlock, drawCheckpoint, drawCoffee, drawDev, drawDoor,
  drawFoe, drawGem, drawItem, drawProd, drawSquashed, drawSwamp,
} from "./sprites";
import type { Painter } from "./sprites";
import type { World } from "./world";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private paint: Painter;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D недоступен");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.paint = (x, y, w, h, color) => {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
  }

  private text(str: string, x: number, y: number, color: string, size = 7, display = false): void {
    this.ctx.fillStyle = color;
    this.ctx.font = display
      ? `${size}px 'Pixelify Sans', monospace`
      : `${size}px 'JetBrains Mono', monospace`;
    this.ctx.fillText(str, x, y);
  }

  private centered(str: string, y: number, color: string, size: number, display = false): void {
    this.ctx.font = display
      ? `${size}px 'Pixelify Sans', monospace`
      : `${size}px 'JetBrains Mono', monospace`;
    const w = this.ctx.measureText(str).width;
    this.text(str, (VIEW.w - w) / 2, y, color, size, display);
  }

  draw(w: World): void {
    const ctx = this.ctx;
    const p = this.paint;
    ctx.setTransform(T.scale, 0, 0, T.scale, 0, 0);

    ctx.save();
    ctx.translate(w.shake > 0 ? Math.round((Math.random() - 0.5) * 2) : 0, 0);
    this.background(w);
    ctx.save();
    ctx.translate(-Math.round(w.camera), 0);
    this.world(w);
    ctx.restore();
    ctx.restore();

    if (w.phase === "clear") {
      this.banner(
        `ГРЕЙД ПОЛУЧЕН · ${w.level.grade}`,
        w.levelIndex + 1 < LEVELS.length ? "дальше" : "финал",
        PAL.door,
      );
    } else if (w.phase === "over") {
      this.banner("ВЫГОРАНИЕ", "начать заново", PAL.shirt);
    } else if (w.phase === "final") {
      p(0, 0, VIEW.w, VIEW.h, "rgba(15,13,24,.92)");
      this.centered("ОФФЕР ПОЛУЧЕН", 26, PAL.gem, 15, true);
      this.centered(`Лид Frontend · скиллов ${w.skills} · очков ${w.score}`, 42, PAL.door, 8);
      this.centered("340 вакансий на твой уровень - workaem.com", 56, PAL.text, 7);
      this.centered("сыграть ещё раз", 68, PAL.dim, 7);
    }
  }

  private banner(title: string, sub: string, color: string): void {
    this.paint(0, 0, VIEW.w, VIEW.h, "rgba(15,13,24,.86)");
    this.centered(title, VIEW.h / 2 - 4, color, 14, true);
    this.centered(sub, VIEW.h / 2 + 10, PAL.text, 7);
  }

  /**
   * Дневная сцена: небо, облака, холмы, кусты - жанровая условность,
   * которая читается мгновенно. Айтишное здесь дальний план: офисные
   * башни вместо гор.
   */
  private background(w: World): void {
    const p = this.paint;
    const lv = w.level;

    p(0, 0, VIEW.w, VIEW.h, PAL.sky);
    p(0, 0, VIEW.w, 18, PAL.skyHigh);

    for (let i = 0; i < 8; i++) {
      const bx = i * 64 - ((w.camera * 0.3) % 64);
      const bh = 22 + ((i * 29) % 16);
      p(bx, lv.groundY - bh, 20, bh, i % 2 ? PAL.tower : PAL.towerDark);
      for (let row = 0; row < Math.floor(bh / 6); row++) {
        p(bx + 3, lv.groundY - bh + 4 + row * 6, 3, 3, PAL.towerWindow);
        p(bx + 12, lv.groundY - bh + 4 + row * 6, 3, 3, PAL.towerWindow);
      }
    }

    for (let c = 0; c < 6; c++) {
      let cx = (c * 86 - w.camera * 0.14) % (VIEW.w + 100);
      if (cx < -70) cx += VIEW.w + 100;
      const cy = 6 + ((c * 19) % 12);
      p(cx + 4, cy, 16, 4, PAL.cloud);
      p(cx, cy + 3, 24, 5, PAL.cloud);
      p(cx + 7, cy - 3, 10, 4, PAL.cloud);
      p(cx, cy + 7, 24, 1, PAL.cloudShade);
    }

    // Холмы: ступенчатая пирамида читается как округлый холм.
    for (let i = 0; i < 10; i++) {
      const hx = i * 96 - ((w.camera * 0.42) % 96);
      const tall = i % 2 === 0;
      const hh = tall ? 22 : 14;
      const hw = tall ? 46 : 30;
      for (let step = 0; step < hh; step += 2) {
        const inset = Math.round((step / hh) * (hw / 2 - 3));
        p(hx + inset, lv.groundY - hh + step, hw - inset * 2, 2, PAL.hill);
      }
      p(hx + hw / 2 - 4, lv.groundY - hh + 4, 3, 2, PAL.hillDark);
      p(hx + hw / 2 + 2, lv.groundY - hh + 7, 3, 2, PAL.hillDark);
    }

    // Кусты вдоль земли - тот же силуэт, что у облаков, только зелёный.
    for (let b = 0; b < 12; b++) {
      const bx = b * 78 - ((w.camera * 0.7) % 78);
      p(bx + 3, lv.groundY - 5, 14, 5, PAL.bush);
      p(bx, lv.groundY - 3, 20, 3, PAL.bush);
      p(bx + 7, lv.groundY - 8, 7, 4, PAL.bush);
    }
  }

  private world(w: World): void {
    const p = this.paint;
    const lv = w.level;

    for (const h of lv.hazards) drawProd(p, h.x, h.y - 4, h.w);

    for (const pl of lv.platforms) {
      const solid = pl.h > 6;
      p(pl.x, pl.y, pl.w, pl.h, solid ? PAL.ground : PAL.brick);
      p(pl.x, pl.y, pl.w, 2, solid ? PAL.groundLite : PAL.brickLite);
      p(pl.x, pl.y + 2, pl.w, 1, solid ? PAL.groundDark : PAL.brickDark);
      if (solid) {
        // Кладка вразбежку: ряды со смещением на полкирпича.
        for (let by = pl.y + 3; by < pl.y + pl.h; by += 5) {
          p(pl.x, by + 4, pl.w, 1, PAL.groundDark);
          const shift = ((by - pl.y) / 5) % 2 === 0 ? 0 : 5;
          for (let bx = pl.x + shift; bx < pl.x + pl.w; bx += 10) p(bx, by, 1, 4, PAL.groundDark);
        }
        p(pl.x, pl.y + pl.h - 1, pl.w, 1, PAL.groundEdge);
      }
    }

    for (const s of lv.swamps) drawSwamp(p, s.x, s.y, s.w, Math.floor(w.ticks / 12) % 3);

    for (const cp of lv.checkpoints) drawCheckpoint(p, cp.x, cp.y, cp.x <= w.checkpointX);

    drawDoor(p, lv.door.x, lv.door.y - 24, w.phase === "clear");
    this.text("СОБЕС", lv.door.x - 4, lv.door.y - 28, PAL.door);

    for (const g of w.gems) {
      if (g.taken) continue;
      drawGem(p, g.x, g.y + Math.sin((w.ticks + g.x) / 15) * 1.5);
    }
    for (const c of w.coffee) {
      if (c.taken) continue;
      drawCoffee(p, c.x, c.y + Math.sin((w.ticks + c.x) / 18) * 1.2);
    }

    for (const b of w.blocks) {
      if (b.broken) continue;
      // Подскок после удара снизу - без него удар не читается.
      const lift = b.bump > 0 ? -Math.round(Math.sin((b.bump / 8) * Math.PI) * 3) : 0;
      drawBlock(p, b.kind, b.x, b.y + lift, b.used, w.ticks);
    }

    for (const item of w.items) {
      if (item.taken) continue;
      drawItem(p, item.kind, item.x, item.y);
    }

    for (const f of w.foes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (f.squashed > 0) drawSquashed(p, f.kind, x, y, f.w, f.h, f.squashed);
      else drawFoe(p, f.kind, x, y, Math.floor(w.ticks / 4) % 2 === 0);
    }

    for (const q of w.particles) p(q.x, q.y, 2, 2, q.color);

    if (w.phase === "play" || w.phase === "clear") this.player(w);

    if (w.deadlineX !== null) this.deadline(w);
  }

  private player(w: World): void {
    const pl = w.player;
    if (pl.hurt > 0 && Math.floor(w.ticks / 4) % 2 === 0) return;

    const walking = Math.abs(pl.vx) > 0.25;
    const airborne = !pl.onGround;
    const x = Math.round(pl.x);
    let y = Math.round(pl.y);
    if (!airborne && walking) y += Math.floor(w.ticks / 6) % 2;

    if (pl.boost > 0 && (pl.boost > 90 || Math.floor(w.ticks / 4) % 2 === 0)) {
      this.paint(x - (pl.face > 0 ? 4 : -9), y + 9, 4, 2, PAL.coffee);
    }
    drawDev(this.paint, x, y, {
      face: pl.face,
      walking,
      airborne,
      stride: Math.floor(w.ticks / 5) % 2 === 0,
      grade: pl.grade,
    });
  }

  private deadline(w: World): void {
    const ctx = this.ctx;
    const p = this.paint;
    const wx = Math.round(w.deadlineX ?? 0);
    p(wx - 60, 0, 60, VIEW.h, "rgba(208,48,74,.16)");
    p(wx - 3, 0, 3, VIEW.h, PAL.deadline);
    for (let s = 0; s < VIEW.h; s += 6) p(wx, s + (Math.floor(w.ticks / 3) % 6), 4, 3, PAL.deadline);

    ctx.save();
    ctx.translate(wx - 8, VIEW.h / 2);
    ctx.rotate(-Math.PI / 2);
    this.text("ДЕДЛАЙН", -22, 0, PAL.deadline);
    ctx.restore();
  }

  /**
   * Смена размера холста сбрасывает imageSmoothingEnabled - без повторной
   * установки после поворота телефона картинка становится мыльной.
   */
  resized(): void {
    this.ctx.imageSmoothingEnabled = false;
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }
}
