import { PAL, UNDERGROUND } from "./palette";
import { LEVELS } from "./levels";
import { TUNING as T, VIEW } from "./tuning";
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

    // Земля толщиной 15, а кадр 112: под ней оставался просвет неба,
    // и низ экрана выглядел так, будто мир висит в воздухе.
    if (lv.theme !== "underground") {
      p(0, lv.groundY + 15, VIEW.w, VIEW.h - lv.groundY - 15, PAL.groundEdge);
    }

    // Под землёй небо и пейзаж не рисуем: вместо них потолок, и он же
    // создаёт то самое ощущение тесноты, ради которого всё затевалось.
    if (lv.theme === "underground") {
      const c = UNDERGROUND;
      p(0, 0, VIEW.w, 10, c.ground);
      p(0, 8, VIEW.w, 2, c.groundDark);
      for (let x = 0; x < VIEW.w; x += 10) p(x, 0, 1, 8, c.groundEdge);
      for (let i = 0; i < 10; i++) {
        const gx = i * 46 - ((w.camera * 0.5) % 46);
        p(gx, 10, 8, 3, c.groundDark);
      }
      return;
    }

    for (let c = 0; c < 6; c++) {
      let cx = (c * 86 - w.camera * 0.14) % (VIEW.w + 100);
      if (cx < -70) cx += VIEW.w + 100;
      const cy = 6 + ((c * 19) % 12);
      // Три размера облаков вместо одного - небо перестаёт быть штампованным.
      const size = c % 3;
      const cw = 16 + size * 5;
      p(cx + 4, cy, cw, 4, PAL.cloud);
      p(cx, cy + 3, cw + 8, 5, PAL.cloud);
      p(cx + 7, cy - 3, cw - 6, 4, PAL.cloud);
      if (size === 2) p(cx + cw, cy - 1, 6, 4, PAL.cloud);
      p(cx, cy + 7, cw + 8, 1, PAL.cloudShade);
    }

    // Дальняя гряда: выцветшая расстоянием и почти неподвижная. Она не
    // читается сама по себе, но без неё горизонт упирается в плоскую заливку.
    for (let i = 0; i < 8; i++) {
      const fx = i * 118 - ((w.camera * 0.16) % 118);
      const fh = 26 + ((i * 37) % 12);
      const fw = 70 + ((i * 53) % 30);
      for (let step = 0; step < fh; step += 2) {
        const inset = Math.round((1 - step / fh) * (fw / 2 - 4));
        p(fx + inset, lv.groundY - fh + step, fw - inset * 2, 2, PAL.hillFar);
      }
      p(fx + fw / 2 - 2, lv.groundY - fh + 2, 4, 3, PAL.hillFarDark);
    }

    // Офисные башни. Ширина, высота и горящие окна пляшут от индекса:
    // одинаковые дома читаются как обои, а не как город.
    for (let i = 0; i < 10; i++) {
      const bx = i * 52 - ((w.camera * 0.3) % 52);
      const bh = 22 + ((i * 29) % 20);
      const bw = 16 + ((i * 13) % 12);
      const dark = i % 2 === 1;
      p(bx, lv.groundY - bh, bw, bh, dark ? PAL.towerDark : PAL.tower);
      // Кромка крыши: без неё башня сливается с небом.
      p(bx, lv.groundY - bh, bw, 2, PAL.towerRoof);
      // Тень по правой грани даёт объём одной полосой.
      p(bx + bw - 2, lv.groundY - bh + 2, 2, bh - 2, PAL.towerRoof);

      const cols = Math.max(2, Math.floor((bw - 6) / 6));
      for (let row = 0; row < Math.floor((bh - 6) / 6); row++) {
        for (let col = 0; col < cols; col++) {
          // Псевдослучайно, но от координат: при прокрутке окна не мигают.
          const lit = ((i * 7 + row * 13 + col * 29) % 11) < 3;
          p(
            bx + 3 + col * 6, lv.groundY - bh + 5 + row * 6, 3, 3,
            lit ? PAL.towerWindowLit : PAL.towerWindow,
          );
        }
      }
    }

    // Воздушная перспектива. Всё, что нарисовано выше - небо, дальняя гряда,
    // город - уходит в дымку, и передний план сам собой выступает вперёд.
    // Без неё башни спорили по контрасту с игроком и тянули взгляд на себя.
    p(0, 0, VIEW.w, lv.groundY, PAL.haze);

    // Холмы: ступенчатая пирамида читается как округлый холм.
    for (let i = 0; i < 10; i++) {
      const hx = i * 96 - ((w.camera * 0.42) % 96);
      const tall = i % 2 === 0;
      const hh = tall ? 22 : 14;
      const hw = tall ? 46 : 30;
      for (let step = 0; step < hh; step += 2) {
        // step идёт сверху вниз, поэтому сужение считаем от обратного:
        // иначе холм получается перевёрнутым.
        const inset = Math.round((1 - step / hh) * (hw / 2 - 3));
        const y = lv.groundY - hh + step;
        const width = hw - inset * 2;
        p(hx + inset, y, width, 2, PAL.hill);
        // Солнце слева: светлая грань по левому склону, тень по правому.
        p(hx + inset, y, Math.max(2, Math.round(width / 3)), 2, PAL.hillLite);
        p(hx + inset + width - 3, y, 3, 2, PAL.hillDark);
      }
      p(hx + hw / 2 - 4, lv.groundY - hh + 6, 3, 2, PAL.hillDark);
      p(hx + hw / 2 + 2, lv.groundY - hh + 9, 3, 2, PAL.hillDark);
    }

    // Кусты вдоль земли - тот же силуэт, что у облаков, только зелёный.
    // Размер и шаг пляшут от индекса: ровный ряд одинаковых кустов выдаёт
    // повтор сильнее, чем любая другая деталь фона.
    for (let b = 0; b < 14; b++) {
      const bx = b * 61 + ((b * 23) % 17) - ((w.camera * 0.7) % 61);
      const big = b % 3 === 0;
      const bw = big ? 20 : 13;
      p(bx + 3, lv.groundY - (big ? 5 : 4), bw - 6, big ? 5 : 4, PAL.bush);
      p(bx, lv.groundY - 3, bw, 3, PAL.bush);
      if (big) p(bx + 7, lv.groundY - 8, 7, 4, PAL.bush);
      p(bx, lv.groundY - 1, bw, 1, PAL.hillDark);
    }
  }

  private world(w: World): void {
    const p = this.paint;
    const lv = w.level;

    for (const h of lv.hazards) drawProd(p, h.x, h.y - 4, h.w);

    for (const pl of lv.platforms) {
      const solid = pl.h > 6;
      p(pl.x, pl.y, pl.w, pl.h, solid ? this.tone(w, "ground") : this.tone(w, "brick"));
      p(pl.x, pl.y, pl.w, 2, solid ? this.tone(w, "groundLite") : this.tone(w, "brickLite"));
      p(pl.x, pl.y + 2, pl.w, 1, solid ? this.tone(w, "groundDark") : this.tone(w, "brickDark"));

      if (!solid) {
        // Балка была плоской плашкой. Торцы и заклёпки дают ей толщину, а
        // тень по низу отрывает её от фона - иначе она читается наклейкой.
        const bd = this.tone(w, "brickDark");
        p(pl.x, pl.y, 1, pl.h, bd);
        p(pl.x + pl.w - 1, pl.y, 1, pl.h, bd);
        p(pl.x, pl.y + pl.h - 1, pl.w, 1, this.tone(w, "brickEdge"));
        for (let bx = pl.x + 3; bx < pl.x + pl.w - 3; bx += 8) {
          p(bx, pl.y + 1, 1, 1, this.tone(w, "brickTop"));
          p(bx, pl.y + pl.h - 2, 1, 1, bd);
        }
      }
      if (solid) {
        // Кладка вразбежку. Раньше швы были сплошными линиями во всю ширину,
        // и земля читалась дощатым забором. Кирпич кладётся объёмным: светлая
        // фаска сверху и слева, тёмная снизу и справа - тогда виден рельеф,
        // а не сетка.
        const dark = this.tone(w, "groundDark");
        const lite = this.tone(w, "groundLite");
        const edge = this.tone(w, "groundEdge");
        const BRICK_W = 12;
        const BRICK_H = 6;

        for (let row = 0; pl.y + 3 + row * BRICK_H < pl.y + pl.h; row++) {
          const by = pl.y + 3 + row * BRICK_H;
          const h = Math.min(BRICK_H, pl.y + pl.h - by);
          if (h < 2) break;
          // Смещение считаем от абсолютного x, а не от края куска: иначе
          // два соседних куска пола стыкуются со сбитым рисунком.
          const shift = row % 2 === 0 ? 0 : BRICK_W / 2;
          const first = Math.floor((pl.x - shift) / BRICK_W) * BRICK_W + shift;
          for (let bx = first; bx < pl.x + pl.w; bx += BRICK_W) {
            const x0 = Math.max(bx, pl.x);
            const x1 = Math.min(bx + BRICK_W - 1, pl.x + pl.w);
            if (x1 <= x0) continue;
            p(x0, by, x1 - x0, h - 1, this.tone(w, "ground"));
            p(x0, by, x1 - x0, 1, lite);
            if (bx >= pl.x) p(x0, by, 1, h - 1, lite);
            p(x0, by + h - 1, x1 - x0, 1, dark);
            if (x1 < pl.x + pl.w) p(x1 - 1, by, 1, h, dark);
          }
        }

        // Крапины: без них большая заливка выглядит пластиковой. Считаются
        // от абсолютного x, поэтому при прокрутке узор стоит на месте.
        for (let bx = pl.x + 2; bx < pl.x + pl.w - 2; bx += 5) {
          const n = (bx * 7919) % 29;
          if (n < 4) p(bx, pl.y + 5 + (n % 3) * 4, 1, 1, edge);
        }
        p(pl.x, pl.y + pl.h - 1, pl.w, 1, edge);
      }
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
