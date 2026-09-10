import { CASTLE, PAL, THEME_COLORS, UNDERGROUND } from "./palette";
import { levelCode, LEVELS, STAGES_PER_WORLD, WORLDS } from "./levels";
import { STARS } from "./world";
import { POLE_H, RENDER, ROTOR_STEP, TICKS_PER_SECOND, TUNING as T, VIEW } from "./tuning";
import {
  drawBlock, drawCheckpoint, drawCoffee, drawDev, drawDoor, drawFoe, drawGem,
  drawBoss, drawItem, drawLift, drawPipe, drawPole, drawProd, drawQuestion, drawRotor, drawShot,
  drawSquashed, drawSwamp, canvasBrush,
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
    this.paint = canvasBrush(ctx);
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

  /** Надпись по центру точки в мировых координатах - для всплывающих очков. */
  private centeredAt(str: string, x: number, y: number, color: string, size: number): void {
    this.ctx.font = `${size}px 'Pixelify Sans', monospace`;
    const w = this.ctx.measureText(str).width;
    this.ctx.fillStyle = color;
    this.ctx.fillText(str, x - w / 2, y);
  }

  /** Разброс от номера: одно и то же число всегда даёт одно и то же место. */
  private static spread(n: number): number {
    return ((Math.imul(n + 1, 2654435761) >>> 8) % 10000) / 10000;
  }

  /** Кадры в «мм:сс». Кадр здесь - тик физики, их ровно TICKS_PER_SECOND в секунду. */
  private static clock(frames: number): string {
    const total = Math.floor(frames / TICKS_PER_SECOND);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  }

  draw(w: World): void {
    const ctx = this.ctx;
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

    // В замке то же зарево, что и в горящем проде, только вполсилы:
    // тревога, но не авария.
    if (w.level.theme === "prod") this.alarm(w);
    else if (w.level.theme === "castle") this.alarm(w, 0.5);

    // Табло заначки: сколько осталось. Без него комната - просто комната,
    // и непонятно, почему из неё вдруг выбросило.
    if (w.inRoom) {
      const left = Math.max(0, Math.ceil(w.roomTimer / TICKS_PER_SECOND));
      const p = this.paint;
      p.round(VIEW.w / 2 - 34, 3, 68, 13, 3, "rgba(12,10,20,.72)");
      p.round(VIEW.w / 2 - 34, 3, 68, 1.4, 0.7, PAL.gem);
      this.centered(`ЗАНАЧКА ${left} С`, 12.5, left <= 4 ? PAL.deadline : PAL.gem, 8, true);
    }

    if (w.phase === "intro") {
      // Заставка перед стартом. Та же карточка, что и между уровнями:
      // ритм у игры должен быть один, а не свой экран на каждый случай.
      // Вторая строка говорит главное про этот уровень: кто ждёт в замке
      // или что нового принёс мир.
      const lv = w.level;
      const info = WORLDS[lv.world];
      const castle = lv.boss !== null;
      const about = castle
        ? `в замке: ${info?.boss ?? "собес"}`
        : lv.stage === 0 && lv.world > 0
          ? `новое: ${info?.news ?? ""}`
          : `мир ${info?.name ?? ""}`;
      this.card(w, {
        title: `МИР ${levelCode(w.levelIndex)}`,
        accent: castle ? PAL.shirt : PAL.gem,
        big: lv.name.toUpperCase(),
        rows: [
          about,
          ...(lv.mood ? [lv.mood] : []),
          `жизней ${w.lives} · норма ${Renderer.clock(lv.par * TICKS_PER_SECOND)}`,
        ],
        hint: "погнали",
      });
    } else if (w.phase === "clear") {
      const last = w.levelIndex + 1 >= LEVELS.length;
      const done = w.lastLevel;
      const castle = w.level.stage === STAGES_PER_WORLD - 1;
      const taken = w.gems.filter((g) => g.taken).length;
      // На карточке - результат именно этого уровня, а не всего забега:
      // уровни и есть то, что игра сравнивает между игроками, а общий счёт
      // за забег зависит от того, сколько успел набегать до смерти.
      const rows = [
        done
          ? `за уровень ${done.score} · ${Renderer.clock(done.frames)} из ${Renderer.clock(w.par * TICKS_PER_SECOND)}`
          : `очков ${w.score}`,
        `скиллов ${taken}/${w.gems.length} · всего ${w.score}`,
      ];
      if (w.levelPlace) rows.push(w.levelPlace);
      this.card(w, {
        // Замок мира даёт грейд, остальные уровни - просто пройдены.
        title: castle ? "ГРЕЙД ПОЛУЧЕН" : "УРОВЕНЬ ПРОЙДЕН",
        accent: PAL.door,
        big: castle ? w.level.grade : w.level.name.toUpperCase(),
        stars: done?.stars ?? STARS.clear,
        rows,
        hint: w.single ? "на карту" : last ? "за оффером" : "дальше",
      });
    } else if (w.phase === "over") {
      this.card(w, {
        title: "ВЫГОРАНИЕ",
        accent: PAL.shirt,
        big: `${w.stats.levelsCleared} из ${LEVELS.length}`,
        rows: [
          `очков ${w.score} · скиллов ${w.skills}`,
          `время ${Renderer.clock(w.stats.frames)} · смертей ${w.stats.deaths}`,
        ],
        hint: "начать заново",
      });
    } else if (w.phase === "final") {
      this.card(w, {
        title: "ОФФЕР ПОЛУЧЕН",
        accent: PAL.gem,
        big: "ЛИД",
        rows: [
          `очков ${w.score} · скиллов ${w.skills}`,
          `время ${Renderer.clock(w.stats.frames)} · смертей ${w.stats.deaths}`,
          `растоптано ${w.stats.stomps} · труб ${w.stats.pipes}`,
        ],
        hint: "вакансии на твой грейд - workaem.com",
        celebrate: true,
      });
    }
  }

  /**
   * Экран между уровнями. Раньше это была надпись поверх затемнения, и
   * пройденный уровень выглядел так же, как проигрыш. Теперь карточка со
   * счётом и полосой пройденного: видно, сколько позади и сколько осталось.
   */
  private card(
    w: World,
    o: {
      title: string;
      accent: string;
      big: string;
      rows: string[];
      hint: string;
      celebrate?: boolean;
      /** Звёзды уровня битами - рисуются рядом под заголовком. */
      stars?: number;
    },
  ): void {
    const p = this.paint;
    p(0, 0, VIEW.w, VIEW.h, "rgba(12,10,20,.82)");

    const withStars = o.stars !== undefined;
    const cw = Math.min(VIEW.w - 12, 194);
    const ch = withStars ? 102 : 94;
    const cx = (VIEW.w - cw) / 2;
    const cy = (VIEW.h - ch) / 2;

    // Свечение под карточкой отделяет её от сцены даже на светлом фоне.
    p.glow(VIEW.w / 2, VIEW.h / 2, cw * 0.62, "rgba(0,0,0,.5)");
    p.round(cx - 1, cy - 1, cw + 2, ch + 2, 5, o.accent);
    p.grad(cx, cy, cw, ch, "#241E38", "#15111F", 4.5);
    p.round(cx, cy, cw, 1.6, 0.8, "rgba(255,255,255,.10)");

    this.centered(o.title, cy + 15, o.accent, 9, true);
    this.centered(o.big, cy + 33, PAL.text, 15, true);

    // Три звезды: за проход, за все скиллы карты, за норму времени.
    // Пустые видны тоже - они и есть причина сыграть уровень ещё раз.
    let ry = cy + 46;
    if (withStars) {
      const mask = o.stars ?? 0;
      [STARS.clear, STARS.gems, STARS.time].forEach((bit, i) => {
        this.star(VIEW.w / 2 + (i - 1) * 12, cy + 42, 4.4, mask & bit ? PAL.blockLite : "rgba(255,255,255,.16)");
      });
      ry = cy + 56;
    }
    // Кегль строки подбирается под ширину, как у подписи: на узком телефоне
    // карточка сужается, а длинная строка иначе вылезала бы за рамку.
    for (const row of o.rows) {
      this.ctx.font = "6.5px 'JetBrains Mono', monospace";
      const rowW = this.ctx.measureText(row).width;
      this.centered(row, ry, PAL.dim, rowW > cw - 10 ? 6.5 * ((cw - 10) / rowW) : 6.5);
      ry += 9;
    }

    // Полоса пройденного: по точке на уровень, пройденные горят. Миры
    // разделены промежутком - видно, сколько осталось до замка.
    const dots = LEVELS.length;
    const worldGap = 4;
    const gaps = WORLDS.length - 1;
    const step = Math.min(9, (cw - 24 - worldGap * gaps) / dots);
    const bw = step * dots + worldGap * gaps;
    const by = cy + ch - 17;
    const passed = w.phase === "final" ? dots : w.levelIndex + (w.phase === "clear" ? 1 : 0);
    for (let i = 0; i < dots; i++) {
      const dx = (VIEW.w - bw) / 2 + i * step + Math.floor(i / STAGES_PER_WORLD) * worldGap + step / 2;
      p.circle(dx, by, i < passed ? 2 : 1.4, i < passed ? o.accent : "rgba(255,255,255,.18)");
    }

    this.drawHint(o, cx, cy, cw, ch);

    if (o.celebrate) {
      // Салют по краям карточки - победа должна выглядеть победой.
      const t = w.ticks;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t / 90;
        const r = cw * 0.62 + Math.sin(t / 12 + i) * 5;
        p.circle(
          VIEW.w / 2 + Math.cos(a) * r,
          VIEW.h / 2 + Math.sin(a) * r * 0.52,
          1 + (i % 3) * 0.5,
          i % 3 === 0 ? PAL.gem : i % 3 === 1 ? PAL.door : PAL.gemLite,
        );
      }
    }
  }

  /** Пятиконечная звезда: чередуем внешний и внутренний радиус. */
  private star(x: number, y: number, r: number, color: string): void {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.46;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    this.paint.poly(pts, color);
  }

  /**
   * Подпись под карточкой. Кегль подбирается под ширину: подпись финала
   * длиннее прочих, и адрес сайта упирался в рамку.
   */
  private drawHint(
    o: { hint: string; celebrate?: boolean },
    _cx: number,
    cy: number,
    cw: number,
    ch: number,
  ): void {
    this.ctx.font = "6.5px 'JetBrains Mono', monospace";
    const hintW = this.ctx.measureText(o.hint).width;
    const hintSize = hintW > cw - 12 ? 6.5 * ((cw - 12) / hintW) : 6.5;
    this.centered(o.hint, cy + ch - 5, o.celebrate ? PAL.door : PAL.dim, hintSize);
  }

  /**
   * Дневная сцена: небо, облака, холмы, кусты - жанровая условность,
   * которая читается мгновенно. Айтишное здесь дальний план: офисные
   * башни вместо гор.
   */
  /**
   * Цвет с учётом темы. Тема подменяет часть палитры и ничего не знает
   * о том, где именно этот цвет применяется: рисование остаётся одним
   * и тем же кодом, а ночь, авария и подземелье отличаются словарём.
   */
  private tone<K extends keyof typeof PAL>(w: World, key: K): string {
    return THEME_COLORS[w.level.theme]?.[key] ?? PAL[key];
  }


  private background(w: World): void {
    const p = this.paint;
    const lv = w.level;

    // Подземелье и замок - закрытые помещения: свод вместо неба.
    const enclosed = lv.theme === "underground" || lv.theme === "castle";
    p(0, 0, VIEW.w, VIEW.h, this.tone(w, "sky"));
    if (enclosed) {
      p(0, 0, VIEW.w, 18, this.tone(w, "skyHigh"));
    } else {
      // Небо одним градиентом от глубокого верха к светлому горизонту.
      // Сначала оно было двумя плашками со стыком посреди кадра, потом
      // четырнадцатью полосами - на светлом небе полосы всё равно видны.
      p.grad(0, 0, VIEW.w, lv.groundY + 2, this.tone(w, "skyTop"), this.tone(w, "skyHorizon"));
    }

    // Ночью небо не пустое: звёзды и луна. Их почти не двигает камерой -
    // небо на то и небо, что до него бесконечно далеко.
    if (lv.theme === "night") {
      p.glow(VIEW.w - 34, 16, 16, "rgba(242,233,200,.22)");
      p.circle(VIEW.w - 34, 16, 6.5, "#F2E9C8");
      p.circle(VIEW.w - 31, 14, 5.2, this.tone(w, "skyTop"));
      for (let i = 0; i < 30; i++) {
        // Разброс через хеш, а не через остаток от произведения: остаток
        // выстраивает звёзды диагональными строчками, и небо читается
        // штриховкой, а не звёздами.
        let sx = (Renderer.spread(i) * (VIEW.w + 24) - w.camera * 0.05) % (VIEW.w + 24);
        if (sx < 0) sx += VIEW.w + 24;
        const sy = 3 + Renderer.spread(i + 77) * 44;
        // Мерцание от номера звезды и времени: одинаково моргающее небо
        // читается как гирлянда, а не как звёзды.
        const dim = (i * 3 + Math.floor(w.ticks / 22)) % 6 === 0;
        p.circle(sx, sy, i % 5 === 0 ? 0.9 : 0.55, dim ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.8)");
      }
    }

    // Под землёй небо и пейзаж не рисуем: вместо них потолок, и он же
    // создаёт то самое ощущение тесноты, ради которого всё затевалось.
    if (enclosed) {
      // Потолок: градиент вниз, мягкие швы кладки и капли-сталактиты.
      this.ceiling(w);
      // Своды в глубине: намёк на объём, иначе за потолком пустая плашка.
      for (let i = 0; i < 8; i++) {
        const ax = i * 84 - ((w.camera * 0.22) % 84);
        p.oval(ax + 30, lv.groundY, 34, 26, "rgba(255,255,255,.035)");
      }
      // В замке снизу поднимается красное зарево: там, за стеной, прод.
      if (lv.theme === "castle") {
        p.grad(0, lv.groundY - 26, VIEW.w, 26, "rgba(224,60,44,0)", "rgba(224,60,44,.22)");
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
        p.oval(cx + dx * size, cy + dy * size + 1, r * size * 1.05, r * size * 0.86, this.tone(w, "cloudShade"));
      }
      for (const [dx, dy, r] of puffs) {
        p.oval(cx + dx * size, cy + dy * size, r * size, r * size * 0.82, this.tone(w, "cloud"));
      }
    }

    // В небе нет ни города, ни холмов: внизу только облачная гряда, и по
    // ней видно, как высоко забрались. В ямах между опорами - она же.
    if (lv.theme === "sky") {
      for (let c = 0; c < 9; c++) {
        const cx = c * 44 - ((w.camera * 0.25) % 44);
        const cy = lv.groundY + 4 + ((c * 13) % 9);
        p.oval(cx + 22, cy, 30, 12, this.tone(w, "cloudShade"));
        p.oval(cx + 18, cy - 3, 22, 9, this.tone(w, "cloud"));
      }
      return;
    }

    // Весь пейзаж обрезается по линии земли. Холмы и гряда рисуются овалами,
    // и нижние половины уходят под пол: раньше их прикрывала полоса во всю
    // ширину кадра, но над ямой она читалась мостиком через пропасть.
    // Обрезка вместо закраски - и в яме видно небо, то есть пустоту.
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, VIEW.w, lv.groundY);
    this.ctx.clip();

    // Дальняя гряда: выцветшая расстоянием и почти неподвижная. Она не
    // читается сама по себе, но без неё горизонт упирается в плоскую заливку.
    // Купол рисуется овалом: нижняя половина уходит под землю и не видна.
    for (let i = 0; i < 8; i++) {
      const fx = i * 118 - ((w.camera * 0.16) % 118);
      const fh = 26 + ((i * 37) % 12);
      const fw = 70 + ((i * 53) % 30);
      p.oval(fx + fw / 2, lv.groundY, fw / 2, fh, this.tone(w, "hillFar"));
      p.oval(fx + fw / 2 - fw * 0.14, lv.groundY, fw / 3.4, fh * 0.82, this.tone(w, "hillFarDark"));
    }

    // Офисные башни. Ширина, высота и горящие окна пляшут от индекса:
    // одинаковые дома читаются как обои, а не как город.
    for (let i = 0; i < 10; i++) {
      const bx = i * 52 - ((w.camera * 0.3) % 52);
      const bh = 22 + ((i * 29) % 20);
      const bw = 16 + ((i * 13) % 12);
      const dark = i % 2 === 1;
      p.grad(bx, lv.groundY - bh, bw, bh, dark ? this.tone(w, "towerDark") : this.tone(w, "tower"), this.tone(w, "towerRoof"), 1.2);
      // Кромка крыши: без неё башня сливается с небом.
      p.round(bx - 0.6, lv.groundY - bh, bw + 1.2, 2, 0.8, this.tone(w, "towerRoof"));
      // Мягкая тень по правой грани даёт объём.
      p.grad(bx + bw - 3, lv.groundY - bh + 2, 3, bh - 2, "rgba(0,0,0,0)", "rgba(30,60,100,.28)");

      const cols = Math.max(2, Math.floor((bw - 6) / 6));
      for (let row = 0; row < Math.floor((bh - 6) / 6); row++) {
        for (let col = 0; col < cols; col++) {
          // Псевдослучайно, но от координат: при прокрутке окна не мигают.
          // Ночью и в аварию горящих окон больше: днём это единичные
          // трудоголики, ночью - вся команда на созвоне.
          const litEvery = lv.theme === "surface" ? 3 : 6;
          const lit = ((i * 7 + row * 13 + col * 29) % 11) < litEvery;
          p.round(
            bx + 3 + col * 6, lv.groundY - bh + 5 + row * 6, 3, 3, 0.7,
            lit ? this.tone(w, "towerWindowLit") : this.tone(w, "towerWindow"),
          );
          if (lit) p.glow(bx + 4.5 + col * 6, lv.groundY - bh + 6.5 + row * 6, 4, "rgba(245,217,160,.35)");
        }
      }
    }

    // Воздушная перспектива. Всё, что нарисовано выше - небо, дальняя гряда,
    // город - уходит в дымку, и передний план сам собой выступает вперёд.
    // Без неё башни спорили по контрасту с игроком и тянули взгляд на себя.
    p(0, 0, VIEW.w, lv.groundY, this.tone(w, "haze"));

    // Холмы куполами. Солнце слева, поэтому светлая половина слева,
    // тень справа - объём получается без единой ступеньки.
    for (let i = 0; i < 10; i++) {
      const hx = i * 96 - ((w.camera * 0.42) % 96);
      const tall = i % 2 === 0;
      const hh = tall ? 24 : 15;
      const hw = tall ? 48 : 32;
      const cxh = hx + hw / 2;
      p.oval(cxh, lv.groundY, hw / 2, hh, this.tone(w, "hillDark"));
      p.oval(cxh - hw * 0.09, lv.groundY, hw / 2.3, hh * 0.94, this.tone(w, "hill"));
      p.oval(cxh - hw * 0.19, lv.groundY, hw / 3.6, hh * 0.78, this.tone(w, "hillLite"));
    }

    // Кусты вдоль земли - те же круги внахлёст, что и облака, только
    // зелёные. Размер и шаг пляшут от индекса: ровный ряд одинаковых кустов
    // выдаёт повтор сильнее, чем любая другая деталь фона.
    for (let b = 0; b < 14; b++) {
      const bx = b * 61 + ((b * 23) % 17) - ((w.camera * 0.7) % 61);
      const big = b % 3 === 0;
      const k = big ? 1 : 0.7;
      p.oval(bx + 4 * k, lv.groundY - 1, 4.4 * k, 3.4 * k, this.tone(w, "bush"));
      p.oval(bx + 10 * k, lv.groundY - 1, 5.2 * k, 4.4 * k, this.tone(w, "bush"));
      p.oval(bx + 16 * k, lv.groundY - 1, 4 * k, 3 * k, this.tone(w, "bush"));
      p.oval(bx + 9 * k, lv.groundY - 3 * k, 3.4 * k, 2.4 * k, this.tone(w, "hillLite"));
    }

    this.ctx.restore();

  }

  private world(w: World): void {
    const p = this.paint;
    const lv = w.level;

    /**
     * Видно ли объект. Раньше отсечения не было вовсе: на девятом уровне
     * рисовалось 466 кирпичей кладки при 32 нужных и 58 платформ при трёх
     * видимых - 93 процента работы уходило за край экрана. На маке это
     * незаметно, а игру открывают с телефона.
     *
     * Запас в 24 пикселя с каждой стороны - чтобы объекты не выскакивали
     * на кромке при плавном движении камеры.
     */
    const left = w.camera - 24;
    const right = w.camera + VIEW.w + 24;
    const seen = (x: number, width = 12): boolean => x < right && x + width > left;

    for (const h of lv.hazards) {
      if (seen(h.x, h.w)) drawProd(p, h.x, h.y - 4, h.w);
    }

    for (const pl of lv.platforms) {
      if (!seen(pl.x, pl.w)) continue;
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

      // Толща под куском пола до самого низа кадра. Раньше низ заливался
      // целиком, и яма выглядела коричневой плашкой; теперь между кусками
      // видно фон, и обрыв читается обрывом.
      // В небе опоры висят в воздухе, толщи под ними нет.
      const below = VIEW.h - (pl.y + pl.h);
      if (below > 0 && lv.theme !== "sky") {
        p.grad(pl.x, pl.y + pl.h, pl.w, below, this.tone(w, "groundEdge"), "#2A1608");
      }
    }

    for (const s of lv.swamps) {
      if (seen(s.x, s.w)) drawSwamp(p, s.x, s.y, s.w, Math.floor(w.ticks / 12) % 3);
    }
    for (const pipe of lv.pipes) {
      if (!seen(pipe.x, pipe.w)) continue;
      // Жерло чёрное - значит труба живая: парная, вход в заначку или
      // выход из неё. Использованная бонусная гаснет, и это единственный
      // способ сказать «здесь уже были» без единого слова текста.
      const open =
        pipe.link !== undefined ||
        pipe.exit === true ||
        (pipe.bonus === true && !w.usedRooms.has(pipe.x));
      drawPipe(p, pipe.x, pipe.y, pipe.w, pipe.h, open);
    }
    for (const m of w.moving) {
      if (seen(m.x, m.w)) drawLift(p, m.x, m.y, m.w);
    }

    for (const cp of lv.checkpoints) {
      if (seen(cp.x, 12)) drawCheckpoint(p, cp.x, cp.y, cp.x <= w.checkpointX);
    }

    drawDoor(p, lv.door.x, lv.door.y - 33, w.phase === "clear" || w.atDoor);
    this.text("СОБЕС", lv.door.x - 4, lv.door.y - 37, PAL.door);
    drawPole(p, lv.pole.x, lv.pole.y, POLE_H, w.flagY);

    for (const g of w.gems) {
      if (!seen(g.x, 8)) continue;
      if (g.taken) continue;
      drawGem(p, g.x, g.y + Math.sin((w.ticks + g.x) / 15) * 1.5);
    }
    for (const c of w.coffee) {
      if (!seen(c.x, 9)) continue;
      if (c.taken) continue;
      drawCoffee(p, c.x, c.y + Math.sin((w.ticks + c.x) / 18) * 1.2);
    }

    for (const b of w.blocks) {
      if (!seen(b.x, 12)) continue;
      if (b.broken) continue;
      // Невидимый ящик не рисуется, пока его не нашли.
      if (b.hidden && !b.used) continue;
      // Подскок после удара снизу - без него удар не читается.
      const lift = b.bump > 0 ? -Math.round(Math.sin((b.bump / 8) * Math.PI) * 3) : 0;
      // Кирпич-заначка выглядит кирпичом, пока не опустеет, а пустая - как
      // выбитый ящик: иначе её били бы до бесконечности.
      const look = b.kind === "coins" ? (b.used ? "question" : "brick") : b.kind;
      drawBlock(p, look, b.x, b.y + lift, b.used, w.ticks);
    }

    for (const item of w.items) {
      if (!seen(item.x, 10)) continue;
      if (item.taken) continue;
      // Мерцающая рамка цветом предмета: на пёстром фоне из кирпича, холмов
      // и облаков маленькая фигурка теряется, а понять, что именно выпало,
      // нужно за долю секунды - предмет ещё и убегает.
      const halo =
        item.kind === "life" ? PAL.shirtLite
        : item.kind === "offer" ? PAL.offerLite
        : item.kind === "tests" ? PAL.testLite
        : item.kind === "vacation" ? PAL.vacationLite
        : PAL.coffeeLite;
      if (Math.floor(w.ticks / 5) % 2 === 0) {
        p.glow(item.x + 5, item.y + 5, 9, halo);
      }
      drawItem(p, item.kind, item.x, item.y);
    }

    for (const f of w.foes) {
      if (!seen(f.x, 14)) continue;
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (f.squashed > 0) drawSquashed(p, f.kind, x, y, f.w, f.h, f.squashed);
      else drawFoe(p, f.kind, x, y, Math.floor(w.ticks / 4) % 2 === 0);
    }

    for (const r of w.rotors) {
      const reach = r.beads * ROTOR_STEP + 4;
      if (seen(r.x - reach, reach * 2)) drawRotor(p, r.x, r.y, r.beads, r.angle, ROTOR_STEP);
    }

    for (const shot of w.shots) {
      if (seen(shot.x, 5)) drawShot(p, shot.x, shot.y, Math.floor(w.ticks / 4));
    }

    if (w.boss) {
      const b = w.boss;
      drawBoss(p, Math.round(b.x), Math.round(b.y), b.w, b.h, {
        face: b.dir,
        stride: Math.floor(w.ticks / 7) % 2 === 0,
        flash: (b.hit > 0 || b.dying > 0) && Math.floor(w.ticks / 3) % 2 === 0,
        hp: b.hp,
        maxHp: b.maxHp,
      });
      // Кто перед нами - подписью над делениями жизни.
      if (b.dying === 0) this.centeredAt(b.name, b.x + b.w / 2, b.y - 8, PAL.text, 6);
    }
    for (const q of w.questions) drawQuestion(p, Math.round(q.x), Math.round(q.y), Math.floor(w.ticks / 6) % 2 === 0);

    // Частицы кругами и с угасанием: квадратики 2x2 читались как мусор
    // на экране, а не как искры.
    for (const q of w.particles) {
      const k = Math.min(1, q.life / 22);
      p.circle(q.x + 1, q.y + 1, 0.5 + k * 1.1, q.color);
    }

    // Всплывающие очки. Рисуются последними из мирового слоя: цифра над
    // растоптанным врагом важнее самого врага - именно она объясняет,
    // за что дали, и без неё цепочка растаптываний не читается вовсе.
    for (const q of w.popups) {
      this.ctx.globalAlpha = Math.min(1, q.life / 16);
      this.centeredAt(q.text, q.x, q.y, q.color, 7.5);
      this.ctx.globalAlpha = 1;
    }

    if ((w.phase === "play" || w.phase === "clear" || w.phase === "signing") && !w.atDoor) {
      if (w.warp) {
        // Во время ныряния игрок уходит НИЖЕ кромки земли, а земля нарисована
        // раньше него - штанины и ботинки торчали из-под трубы поверх пола.
        // Обрезаем его по низу трубы: ниже он просто не рисуется.
        const floor = Math.max(w.warp.from.y + w.warp.from.h, w.warp.to.y + w.warp.to.h);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, -40, lv.width, floor + 40);
        this.ctx.clip();
        this.player(w);
        this.ctx.restore();
      } else {
        this.player(w);
      }
    }
    // Пока едем по трубе, она рисуется поверх - игрок скрывается в жерле.
    if (w.warp) {
      for (const pipe of lv.pipes) {
        if (pipe.link !== undefined) drawPipe(p, pipe.x, pipe.y, pipe.w, pipe.h, true);
      }
    }

    // Каменный потолок дорисовывается ПОВЕРХ всего. Он нарисован в экранных
    // координатах и столкновения не имеет: игрок, прыгнув с верхней ступени
    // перед дверью, оказывался нарисован поверх камня и будто пролетал
    // сквозь свод. Теперь он уходит ЗА камень - так это и читается.
    if (lv.theme === "underground" || lv.theme === "castle") this.ceiling(w);

    if (w.deadlineX !== null) this.deadline(w);
  }

  /** Свод подземелья или замка. Рисуется дважды: в фоне и поверх всего. */
  private ceiling(w: World): void {
    const p = this.paint;
    const stone = w.level.theme === "castle" ? CASTLE : UNDERGROUND;
    const lite = stone["groundLite"] ?? PAL.groundLite;
    const base = stone["ground"] ?? PAL.ground;
    const dark = stone["groundDark"] ?? PAL.groundDark;
    const edge = stone["groundEdge"] ?? PAL.groundEdge;
    p.grad(0, 0, VIEW.w, 11, lite, base);
    p.round(0, 9, VIEW.w, 2, 0.8, dark);
    for (let x = 0; x < VIEW.w; x += 12) {
      p.round(x - ((w.camera * 0.5) % 12), 0, 0.8, 9, 0.4, edge);
    }
    for (let i = 0; i < 10; i++) {
      const gx = i * 46 - ((w.camera * 0.5) % 46);
      p.oval(gx + 4, 11, 4.4, 3.2, dark);
    }
  }

  /**
   * Мигалка аварии. Поверх всей сцены, а не в фоне: когда прод горит,
   * красным залито всё, включая игрока. Пульс медленный - быстрый на
   * таком размере кадра читался бы стробоскопом и мешал играть.
   */
  private alarm(w: World, strength = 1): void {
    const pulse = (0.05 + 0.055 * (0.5 + 0.5 * Math.sin(w.ticks / 16))) * strength;
    this.paint(0, 0, VIEW.w, VIEW.h, `rgba(224,60,44,${pulse.toFixed(3)})`);
    // Зарево по краям: центр кадра остаётся читаемым.
    this.paint.glow(VIEW.w / 2, VIEW.h / 2, VIEW.w * 0.8, "rgba(0,0,0,0)");
    const edge = (0.10 + 0.08 * (0.5 + 0.5 * Math.sin(w.ticks / 16 + 1))) * strength;
    this.paint.grad(0, 0, VIEW.w, 14, `rgba(208,48,74,${edge.toFixed(3)})`, "rgba(208,48,74,0)");
    this.paint.grad(0, VIEW.h - 14, VIEW.w, 14, "rgba(208,48,74,0)", `rgba(208,48,74,${edge.toFixed(3)})`);
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
      this.paint.oval(x - (pl.face > 0 ? 2 : -11), y + 12, 2.6, 1.1, PAL.coffee);
    }

    // Отпуск виден по мерцающему ореолу - иначе неуязвимость незаметна.
    if (pl.vacation > 0 && (pl.vacation > 120 || Math.floor(w.ticks / 4) % 2 === 0)) {
      const glow = Math.floor(w.ticks / 3) % 2 ? PAL.vacationLite : PAL.gemLite;
      this.paint.glow(x + pl.w / 2, y + pl.h / 2, pl.h * 0.9, glow);
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
    // Зарево перед стеной нарастает к самой стене, а не лежит ровной плашкой.
    const glow = this.ctx.createLinearGradient(wx - 70, 0, wx, 0);
    glow.addColorStop(0, "rgba(208,48,74,0)");
    glow.addColorStop(1, "rgba(208,48,74,.30)");
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(wx - 70, 0, 70, VIEW.h);
    p.round(wx - 3, 0, 3.2, VIEW.h, 1.2, PAL.deadline);
    const drift = Math.floor(w.ticks / 3) % 7;
    for (let s = -7; s < VIEW.h; s += 7) {
      p.oval(wx + 1.6, s + drift, 1.8, 2.2, PAL.deadline);
    }

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
