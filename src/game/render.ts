import { PAL, UNDERGROUND } from "./palette";
import { LEVELS } from "./levels";
import { RENDER, TUNING as T, VIEW } from "./tuning";
import {
  drawBlock, drawCheckpoint, drawCoffee, drawDev, drawDoor, drawFoe, drawGem,
  drawBoss, drawItem, drawLift, drawPipe, drawProd, drawQuestion, drawShot, drawSquashed, drawSwamp,
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
    // Сглаживание включено: картинка больше не складывается из кубиков,
    // а формы рисуются кривыми с мягким краем.
    this.ctx.imageSmoothingEnabled = true;
    this.paint = Renderer.makeBrush(ctx);
  }

  /**
   * Кисть поверх контекста. Координаты НЕ округляются - именно округление
   * раньше загоняло всё в крупную сетку и делало пиксели видимыми.
   */
  private static makeBrush(ctx: CanvasRenderingContext2D): Painter {
    const brush = ((x: number, y: number, w: number, h: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }) as Painter;

    const path = (color: string, build: () => void): void => {
      ctx.beginPath();
      build();
      ctx.fillStyle = color;
      ctx.fill();
    };

    brush.round = (x, y, w, h, r, color) => {
      const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      path(color, () => ctx.roundRect(x, y, w, h, rr));
    };

    brush.circle = (cx, cy, r, color) => {
      path(color, () => ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2));
    };

    brush.oval = (cx, cy, rx, ry, color) => {
      path(color, () => ctx.ellipse(cx, cy, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2));
    };

    brush.grad = (x, y, w, h, top, bottom, r = 0) => {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      if (r > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    };

    brush.glow = (cx, cy, r, color) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(0.01, r));
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
      ctx.fill();
    };

    brush.poly = (pts, color) => {
      if (pts.length < 3) return;
      path(color, () => {
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
        ctx.closePath();
      });
    };

    return brush;
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
    const k = T.scale * RENDER.density;
    ctx.setTransform(k, 0, 0, k, 0, 0);

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
  /** Цвет с учётом темы: под землёй часть палитры подменяется. */
  private tone<K extends keyof typeof UNDERGROUND>(w: World, key: K): string {
    return w.level.theme === "underground" ? UNDERGROUND[key] : PAL[key];
  }

  /**
   * Смешивает два цвета. Нужен для неба: держать в палитре полтора десятка
   * оттенков одного градиента бессмысленно, их проще посчитать.
   */
  private static mix(a: string, b: string, t: number): string {
    const hex = (c: string, i: number): number => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
    const ch = (i: number): number => Math.round(hex(a, i) + (hex(b, i) - hex(a, i)) * t);
    return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
  }

  private background(w: World): void {
    const p = this.paint;
    const lv = w.level;

    p(0, 0, VIEW.w, VIEW.h, this.tone(w, "sky"));
    if (lv.theme === "underground") {
      p(0, 0, VIEW.w, 18, this.tone(w, "skyHigh"));
    } else {
      // Небо полосами от глубокого верха к светлому горизонту. Раньше полос
      // было две, и стык между ними резал кадр пополам заметной линией.
      const bands = 14;
      const bandH = Math.ceil(lv.groundY / bands);
      for (let i = 0; i < bands; i++) {
        p(0, i * bandH, VIEW.w, bandH, Renderer.mix(PAL.skyTop, PAL.skyHorizon, i / (bands - 1)));
      }
    }

    // Под землёй небо и пейзаж не рисуем: вместо них потолок, и он же
    // создаёт то самое ощущение тесноты, ради которого всё затевалось.
    if (lv.theme === "underground") {
      const c = UNDERGROUND;
      // Потолок: градиент вниз, мягкие швы кладки и капли-сталактиты.
      p.grad(0, 0, VIEW.w, 11, c.groundLite, c.ground);
      p.round(0, 9, VIEW.w, 2, 0.8, c.groundDark);
      for (let x = 0; x < VIEW.w; x += 12) {
        p.round(x - ((w.camera * 0.5) % 12), 0, 0.8, 9, 0.4, c.groundEdge);
      }
      for (let i = 0; i < 10; i++) {
        const gx = i * 46 - ((w.camera * 0.5) % 46);
        p.oval(gx + 4, 11, 4.4, 3.2, c.groundDark);
      }
      // Своды в глубине: намёк на объём, иначе за потолком пустая плашка.
      for (let i = 0; i < 8; i++) {
        const ax = i * 84 - ((w.camera * 0.22) % 84);
        p.oval(ax + 30, lv.groundY, 34, 26, "rgba(255,255,255,.035)");
      }
      return;
    }

    // Облака: несколько кругов внахлёст. Сложенные из прямоугольников,
    // они читались как лесенка - у облака не бывает прямых углов.
    for (let c = 0; c < 6; c++) {
      let cx = (c * 86 - w.camera * 0.14) % (VIEW.w + 100);
      if (cx < -70) cx += VIEW.w + 100;
      const cy = 8 + ((c * 19) % 12);
      const size = 0.8 + ((c * 7) % 5) * 0.14;
      const puffs: Array<readonly [number, number, number]> = [
        [0, 2, 4.6], [5.5, 0, 6], [12, 1.4, 5], [17.5, 3, 3.8], [8, 3.4, 5.4],
      ];
      for (const [dx, dy, r] of puffs) {
        p.oval(cx + dx * size, cy + dy * size + 1, r * size * 1.05, r * size * 0.86, PAL.cloudShade);
      }
      for (const [dx, dy, r] of puffs) {
        p.oval(cx + dx * size, cy + dy * size, r * size, r * size * 0.82, PAL.cloud);
      }
    }

    // Дальняя гряда: выцветшая расстоянием и почти неподвижная. Она не
    // читается сама по себе, но без неё горизонт упирается в плоскую заливку.
    // Купол рисуется овалом: нижняя половина уходит под землю и не видна.
    for (let i = 0; i < 8; i++) {
      const fx = i * 118 - ((w.camera * 0.16) % 118);
      const fh = 26 + ((i * 37) % 12);
      const fw = 70 + ((i * 53) % 30);
      p.oval(fx + fw / 2, lv.groundY, fw / 2, fh, PAL.hillFar);
      p.oval(fx + fw / 2 - fw * 0.14, lv.groundY, fw / 3.4, fh * 0.82, PAL.hillFarDark);
    }

    // Офисные башни. Ширина, высота и горящие окна пляшут от индекса:
    // одинаковые дома читаются как обои, а не как город.
    for (let i = 0; i < 10; i++) {
      const bx = i * 52 - ((w.camera * 0.3) % 52);
      const bh = 22 + ((i * 29) % 20);
      const bw = 16 + ((i * 13) % 12);
      const dark = i % 2 === 1;
      p.grad(bx, lv.groundY - bh, bw, bh, dark ? PAL.towerDark : PAL.tower, PAL.towerRoof, 1.2);
      // Кромка крыши: без неё башня сливается с небом.
      p.round(bx - 0.6, lv.groundY - bh, bw + 1.2, 2, 0.8, PAL.towerRoof);
      // Мягкая тень по правой грани даёт объём.
      p.grad(bx + bw - 3, lv.groundY - bh + 2, 3, bh - 2, "rgba(0,0,0,0)", "rgba(30,60,100,.28)");

      const cols = Math.max(2, Math.floor((bw - 6) / 6));
      for (let row = 0; row < Math.floor((bh - 6) / 6); row++) {
        for (let col = 0; col < cols; col++) {
          // Псевдослучайно, но от координат: при прокрутке окна не мигают.
          const lit = ((i * 7 + row * 13 + col * 29) % 11) < 3;
          p.round(
            bx + 3 + col * 6, lv.groundY - bh + 5 + row * 6, 3, 3, 0.7,
            lit ? PAL.towerWindowLit : PAL.towerWindow,
          );
          if (lit) p.glow(bx + 4.5 + col * 6, lv.groundY - bh + 6.5 + row * 6, 4, "rgba(245,217,160,.35)");
        }
      }
    }

    // Воздушная перспектива. Всё, что нарисовано выше - небо, дальняя гряда,
    // город - уходит в дымку, и передний план сам собой выступает вперёд.
    // Без неё башни спорили по контрасту с игроком и тянули взгляд на себя.
    p(0, 0, VIEW.w, lv.groundY, PAL.haze);

    // Холмы куполами. Солнце слева, поэтому светлая половина слева,
    // тень справа - объём получается без единой ступеньки.
    for (let i = 0; i < 10; i++) {
      const hx = i * 96 - ((w.camera * 0.42) % 96);
      const tall = i % 2 === 0;
      const hh = tall ? 24 : 15;
      const hw = tall ? 48 : 32;
      const cxh = hx + hw / 2;
      p.oval(cxh, lv.groundY, hw / 2, hh, PAL.hillDark);
      p.oval(cxh - hw * 0.09, lv.groundY, hw / 2.3, hh * 0.94, PAL.hill);
      p.oval(cxh - hw * 0.19, lv.groundY, hw / 3.6, hh * 0.78, PAL.hillLite);
    }

    // Кусты вдоль земли - те же круги внахлёст, что и облака, только
    // зелёные. Размер и шаг пляшут от индекса: ровный ряд одинаковых кустов
    // выдаёт повтор сильнее, чем любая другая деталь фона.
    for (let b = 0; b < 14; b++) {
      const bx = b * 61 + ((b * 23) % 17) - ((w.camera * 0.7) % 61);
      const big = b % 3 === 0;
      const k = big ? 1 : 0.7;
      p.oval(bx + 4 * k, lv.groundY - 1, 4.4 * k, 3.4 * k, PAL.bush);
      p.oval(bx + 10 * k, lv.groundY - 1, 5.2 * k, 4.4 * k, PAL.bush);
      p.oval(bx + 16 * k, lv.groundY - 1, 4 * k, 3 * k, PAL.bush);
      p.oval(bx + 9 * k, lv.groundY - 3 * k, 3.4 * k, 2.4 * k, PAL.hillLite);
    }

    // Заливка ниже земли идёт ПОСЛЕДНЕЙ. Холмы и кусты рисуются овалами,
    // и их нижние половины уходят под линию земли: если закрасить низ
    // раньше, зелёные купола проступают сквозь пол.
    p(0, lv.groundY, VIEW.w, VIEW.h - lv.groundY, PAL.groundEdge);
  }

  private world(w: World): void {
    const p = this.paint;
    const lv = w.level;

    for (const h of lv.hazards) drawProd(p, h.x, h.y - 4, h.w);

    for (const pl of lv.platforms) {
      const solid = pl.h > 6;

      if (!solid) {
        // Балка: градиент по высоте, скруглённые торцы и мягкая тень снизу.
        // Раньше это была плоская плашка из трёх полосок.
        p.grad(pl.x, pl.y, pl.w, pl.h, this.tone(w, "brickLite"), this.tone(w, "brick"), 1.4);
        p.round(pl.x + 0.5, pl.y + 0.4, pl.w - 1, 1, 0.5, "rgba(255,255,255,.34)");
        p.round(pl.x, pl.y + pl.h - 1.2, pl.w, 1.2, 0.6, this.tone(w, "brickEdge"));
        for (let bx = pl.x + 3; bx < pl.x + pl.w - 2; bx += 8) {
          p.circle(bx, pl.y + pl.h / 2, 0.5, this.tone(w, "brickDark"));
        }
        continue;
      }

      // Земля: сплошной градиент сверху вниз плюс намёк на кладку мягкими
      // швами. Раньше швы были жёсткими линиями во всю ширину, и земля
      // читалась дощатым забором.
      p.grad(pl.x, pl.y, pl.w, pl.h, this.tone(w, "groundLite"), this.tone(w, "ground"));
      // Дёрн по верхней кромке - самая заметная линия кадра, её и смягчаем.
      p.round(pl.x, pl.y, pl.w, 2.6, 1.2, this.tone(w, "groundLite"));
      p.grad(pl.x, pl.y + 2, pl.w, 2.4, this.tone(w, "groundLite"), this.tone(w, "ground"));

      const seam = this.tone(w, "groundDark");
      const BRICK_W = 14;
      const BRICK_H = 6.5;
      for (let row = 0; pl.y + 4 + row * BRICK_H < pl.y + pl.h; row++) {
        const by = pl.y + 4 + row * BRICK_H;
        p.round(pl.x, by, pl.w, 0.7, 0.35, seam);
        // Смещение от абсолютного x: иначе соседние куски пола стыкуются
        // со сбитым рисунком.
        const shift = row % 2 === 0 ? 0 : BRICK_W / 2;
        const first = Math.floor((pl.x - shift) / BRICK_W) * BRICK_W + shift;
        for (let bx = first; bx < pl.x + pl.w; bx += BRICK_W) {
          if (bx < pl.x) continue;
          const h = Math.min(BRICK_H - 0.8, pl.y + pl.h - by - 1);
          if (h > 0.5) p.round(bx, by + 0.5, 0.7, h, 0.35, seam);
        }
      }
      // Низ уходит в тень: земля перестаёт быть плоской плашкой.
      p.grad(pl.x, pl.y + pl.h - 4, pl.w, 4, "rgba(0,0,0,0)", this.tone(w, "groundEdge"));
    }

    for (const s of lv.swamps) drawSwamp(p, s.x, s.y, s.w, Math.floor(w.ticks / 12) % 3);
    for (const pipe of lv.pipes) drawPipe(p, pipe.x, pipe.y, pipe.w, pipe.h, pipe.link !== undefined);
    for (const m of w.moving) drawLift(p, m.x, m.y, m.w);

    for (const cp of lv.checkpoints) drawCheckpoint(p, cp.x, cp.y, cp.x <= w.checkpointX);

    drawDoor(p, lv.door.x, lv.door.y - 33, w.phase === "clear");
    this.text("СОБЕС", lv.door.x - 4, lv.door.y - 37, PAL.door);

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
      // Мерцающая рамка цветом предмета: на пёстром фоне из кирпича, холмов
      // и облаков маленькая фигурка теряется, а понять, что именно выпало,
      // нужно за долю секунды - предмет ещё и убегает.
      const halo =
        item.kind === "offer" ? PAL.offerLite
        : item.kind === "tests" ? PAL.testLite
        : item.kind === "vacation" ? PAL.vacationLite
        : PAL.coffeeLite;
      if (Math.floor(w.ticks / 5) % 2 === 0) {
        p(item.x - 1, item.y - 1, 12, 1, halo);
        p(item.x - 1, item.y + 10, 12, 1, halo);
        p(item.x - 1, item.y, 1, 10, halo);
        p(item.x + 10, item.y, 1, 10, halo);
      }
      drawItem(p, item.kind, item.x, item.y);
    }

    for (const f of w.foes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (f.squashed > 0) drawSquashed(p, f.kind, x, y, f.w, f.h, f.squashed);
      else drawFoe(p, f.kind, x, y, Math.floor(w.ticks / 4) % 2 === 0);
    }

    for (const shot of w.shots) drawShot(p, shot.x, shot.y, Math.floor(w.ticks / 4));

    if (w.boss) {
      const b = w.boss;
      drawBoss(p, Math.round(b.x), Math.round(b.y), b.w, b.h, {
        face: b.dir,
        stride: Math.floor(w.ticks / 7) % 2 === 0,
        flash: (b.hit > 0 || b.dying > 0) && Math.floor(w.ticks / 3) % 2 === 0,
        hp: b.hp,
      });
    }
    for (const q of w.questions) drawQuestion(p, Math.round(q.x), Math.round(q.y), Math.floor(w.ticks / 6) % 2 === 0);

    for (const q of w.particles) p(q.x, q.y, 2, 2, q.color);

    if (w.phase === "play" || w.phase === "clear") this.player(w);
    // Пока едем по трубе, она рисуется поверх - игрок скрывается в жерле.
    if (w.warp) {
      for (const pipe of lv.pipes) {
        if (pipe.link !== undefined) drawPipe(p, pipe.x, pipe.y, pipe.w, pipe.h, true);
      }
    }

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

    // Отпуск виден по мерцающему ореолу - иначе неуязвимость незаметна.
    if (pl.vacation > 0 && (pl.vacation > 120 || Math.floor(w.ticks / 4) % 2 === 0)) {
      const glow = Math.floor(w.ticks / 3) % 2 ? PAL.vacationLite : PAL.gemLite;
      this.paint(x - 1, y - 1, pl.w + 2, 1, glow);
      this.paint(x - 1, y + pl.h, pl.w + 2, 1, glow);
      this.paint(x - 1, y, 1, pl.h, glow);
      this.paint(x + pl.w, y, 1, pl.h, glow);
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
