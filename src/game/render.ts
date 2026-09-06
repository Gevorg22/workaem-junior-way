import { PAL } from "./palette";
import { LEVELS } from "./levels";
import { TUNING as T, VIEW } from "./tuning";
import {
  drawCheckpoint, drawCoffee, drawDev, drawDoor,
  drawFoe, drawGem, drawProd, drawSquashed, drawSwamp,
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

  private background(w: World): void {
    const p = this.paint;
    const lv = w.level;
    p(0, 0, VIEW.w, VIEW.h, PAL.sky);

    for (let c = 0; c < 7; c++) {
      let cx = (c * 74 - w.camera * 0.12) % (VIEW.w + 80);
      if (cx < -60) cx += VIEW.w + 80;
      const cy = 8 + ((c * 17) % 14);
      p(cx, cy, 14, 3, PAL.cloud);
      p(cx + 3, cy - 2, 9, 3, PAL.cloud);
      p(cx - 3, cy + 2, 20, 2, PAL.cloud);
    }
    for (let i = 0; i < 14; i++) {
      const hx = i * 58 - ((w.camera * 0.22) % 58);
      const hh = 14 + ((i * 23) % 12);
      p(hx, lv.groundY - hh, 30, hh, lv.tint);
      p(hx + 2, lv.groundY - hh, 26, 1, PAL.far);
    }
    for (let b = 0; b < 22; b++) {
      const bx = b * 46 - ((w.camera * 0.42) % 46);
      const bh = 16 + ((b * 31) % 20);
      p(bx, lv.groundY - bh, 30, bh, PAL.far);
      for (let win = 0; win < 3; win++) {
        for (let v = 0; v < Math.floor(bh / 7); v++) {
          if ((b + win + v) % 3 === 0) p(bx + 5 + win * 8, lv.groundY - bh + 5 + v * 7, 3, 3, "#2E2A44");
        }
      }
    }
  }

  private world(w: World): void {
    const p = this.paint;
    const lv = w.level;

    for (const h of lv.hazards) drawProd(p, h.x, h.y - 4, h.w);

    for (const pl of lv.platforms) {
      p(pl.x, pl.y, pl.w, pl.h, PAL.brick);
      p(pl.x, pl.y, pl.w, 2, PAL.brickTop);
      p(pl.x, pl.y + 2, pl.w, 1, PAL.brickEdge);
      if (pl.h > 6) {
        for (let bx = pl.x; bx < pl.x + pl.w; bx += 8) p(bx, pl.y + 3, 1, pl.h - 3, PAL.brickLine);
        for (let by = pl.y + 7; by < pl.y + pl.h; by += 5) p(pl.x, by, pl.w, 1, PAL.brickLine);
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
