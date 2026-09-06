import { levelAt, LEVELS } from "./levels";
import { PLAYER_H_BIG, PLAYER_H_SMALL, PLAYER_W, TUNING as T, VIEW } from "./tuning";
import { PAL } from "./palette";
import type {
  Block, Foe, Grade, Item, LevelSpec, MovingPlatform, Particle, Phase, Pickup, Player,
  Projectile, Rect, RunStats,
} from "./types";

const FOE_SIZE: Record<Foe["kind"], { w: number; h: number; speed: number }> = {
  legacy: { w: 12, h: 9, speed: 0.3 },
  bug: { w: 9, h: 7, speed: 0.72 },
  call: { w: 13, h: 10, speed: 0.42 },
};

/** Джун маленький, с первого оффера становится большим. */
export const heightFor = (grade: Grade): number =>
  grade === 0 ? PLAYER_H_SMALL : PLAYER_H_BIG;

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Бросок теста - доступен только сеньору. */
  throw?: boolean;
  /** true только в кадр нажатия - из него набивается буфер прыжка. */
  jumpPressed: boolean;
}

export type WorldEvent =
  | "stomp" | "hurt" | "pickup" | "coffee"
  | "checkpoint" | "clear" | "death" | "final" | "jump"
  | "bump" | "break" | "gradeUp" | "gradeDown" | "throw" | "vacation";

export class World {
  levelIndex = 0;
  level: LevelSpec = levelAt(0);
  phase: Phase = "play";

  player!: Player;
  camera = 0;
  gems: Pickup[] = [];
  coffee: Pickup[] = [];
  blocks: Block[] = [];
  items: Item[] = [];
  shots: Projectile[] = [];
  moving: MovingPlatform[] = [];
  foes: Foe[] = [];
  particles: Particle[] = [];
  /** Позиция стены дедлайна, null - стены на уровне нет. */
  deadlineX: number | null = null;
  /** X последнего пройденного коммита - сюда возрождаемся. */
  checkpointX = 10;

  lives = T.startLives;
  score = 0;
  skills = 0;
  shake = 0;
  ticks = 0;

  stats: RunStats = {
    score: 0, skills: 0, levelsCleared: 0, frames: 0,
    jumps: 0, stomps: 0, deaths: 0, blocks: 0, tested: 0,
  };

  private listeners = new Set<(e: WorldEvent) => void>();

  constructor() {
    this.newRun();
  }

  on(fn: (e: WorldEvent) => void): void {
    this.listeners.add(fn);
  }

  private emit(e: WorldEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  newRun(): void {
    this.lives = T.startLives;
    this.score = 0;
    this.skills = 0;
    this.ticks = 0;
    this.shake = 0;
    this.stats = {
      score: 0, skills: 0, levelsCleared: 0, frames: 0,
      jumps: 0, stomps: 0, deaths: 0, blocks: 0, tested: 0,
    };
    this.loadLevel(0);
    this.phase = "play";
  }

  loadLevel(index: number): void {
    this.levelIndex = index;
    const lv = levelAt(index);
    this.level = lv;

    const grade = (this.player?.grade ?? 0) as Grade;
    const height = heightFor(grade);
    this.player = {
      x: 10, y: lv.groundY - height - 1, w: PLAYER_W, h: height,
      vx: 0, vy: 0, onGround: false, face: 1,
      coyote: 0, buffer: 0, hurt: 0, boost: 0, vacation: 0, cooldown: 0,
      // Грейд переносится на следующий уровень: карьера не обнуляется
      // при переходе, только при смерти.
      grade,
    };
    this.camera = 0;
    this.gems = lv.gems.map((g) => ({ x: g.x, y: g.y, taken: false }));
    this.coffee = lv.coffee.map((c) => ({ x: c.x, y: c.y, taken: false }));
    this.foes = lv.foes.map((f) => {
      const size = FOE_SIZE[f.kind];
      return {
        kind: f.kind,
        x: f.x,
        y: f.kind === "call" ? f.baseY : f.baseY - size.h,
        baseY: f.kind === "call" ? f.baseY : f.baseY - size.h,
        min: f.min, max: f.max, dir: 1, squashed: 0,
        speed: size.speed, w: size.w, h: size.h,
      };
    });
    this.blocks = lv.blocks.map((b) => ({ ...b, bump: 0, used: false, broken: false }));
    this.items = [];
    this.shots = [];
    this.moving = lv.moving.map((m) => {
      // Размах может быть отрицательным - лифт, который едет вверх.
      // Границы обязаны быть упорядочены: иначе разворот срабатывает
      // в обе стороны каждый кадр, платформа дрожит на месте, а стоящего
      // на ней игрока трясёт вместе с ней - со стороны это выглядит
      // как невесомость.
      const base = m.axis === "x" ? m.x : m.y;
      const from = Math.min(base, base + m.span);
      const to = Math.max(base, base + m.span);
      return {
        x: m.x, y: m.y, w: m.w, h: 4,
        from, to,
        axis: m.axis, speed: m.speed,
        dir: (m.span >= 0 ? 1 : -1) as 1 | -1,
      };
    });
    this.particles = [];
    this.checkpointX = 10;
    this.deadlineX = lv.deadlineSpeed > 0 ? -46 : null;
  }

  /** Переход по экранам между уровнями и после финала. */
  advance(): void {
    if (this.phase === "clear") {
      if (this.levelIndex + 1 < LEVELS.length) {
        this.loadLevel(this.levelIndex + 1);
        this.phase = "play";
      } else {
        this.phase = "final";
        this.emit("final");
      }
    } else if (this.phase === "final" || this.phase === "over") {
      this.newRun();
    }
  }

  /**
   * Кирпич ломает только сеньор - у джуна на это не хватает грейда.
   * Так рост даёт не просто запас прочности, а новые возможности.
   */
  private hitBlock(b: Block): void {
    if (b.bump > 0) return;
    b.bump = 8;

    if (b.kind === "question" && !b.used) {
      b.used = true;
      // Стартуем внутри блока: за 12 кадров предмет выезжает ровно на его крышу.
      this.items.push({ kind: b.drop ?? "coffee", x: b.x + 1, y: b.y, rise: 12, taken: false });
      this.emit("bump");
      return;
    }

    if (b.kind === "brick" && this.player.grade === 2) {
      b.broken = true;
      this.stats.blocks += 1;
      this.score += 50;
      this.hud();
      for (const dx of [2, 9]) this.burst(b.x + dx, b.y + 4, PAL.brick, 5);
      this.emit("break");
      return;
    }

    this.emit("bump");
  }

  private hud(): void {}

  /**
   * Смена грейда меняет и рост. Ноги при этом должны остаться на месте,
   * иначе выросший игрок проваливается в пол или подпрыгивает.
   */
  private setGrade(grade: Grade): void {
    const p = this.player;
    const feet = p.y + p.h;
    p.grade = grade;
    p.h = heightFor(grade);
    p.y = feet - p.h;
  }

  private burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -Math.random() * 2.2 - 0.4,
        life: 22 + Math.random() * 10,
        color,
      });
    }
  }

  /**
   * Урон сначала откатывает грейд и только на джуне отнимает жизнь.
   * Так собранный оффер - это реальный запас прочности, а не просто очки.
   */
  private damage(fromX: number): void {
    const p = this.player;
    if (p.hurt > 0 || p.vacation > 0) return;

    p.hurt = T.hurtFrames;
    p.vx = p.x < fromX ? -T.knockbackX : T.knockbackX;
    p.vy = T.knockbackY;
    this.shake = T.shakeFrames;

    if (p.grade > 0) {
      this.setGrade((p.grade - 1) as Grade);
      this.burst(p.x + 4, p.y + 6, PAL.gem, 10);
      this.emit("gradeDown");
      return;
    }

    this.lives -= 1;
    this.burst(p.x + 4, p.y + 6, PAL.shirt, 8);
    this.emit("hurt");
    if (this.lives <= 0) this.phase = "over";
  }

  private respawn(): void {
    this.lives -= 1;
    this.stats.deaths += 1;
    this.emit("death");
    if (this.lives <= 0) {
      this.phase = "over";
      return;
    }
    const lv = this.level;
    // Возрождение на последнем коммите, а не в начале карты:
    // на длинной карте откат в начало обесценивает всё пройденное.
    const x = this.checkpointX;
    // Смерть обнуляет карьеру: начинаем с джуна.
    this.player = {
      ...this.player,
      x, y: lv.groundY - PLAYER_H_SMALL - 1,
      h: PLAYER_H_SMALL, vx: 0, vy: 0, hurt: 40, boost: 0, grade: 0,
      vacation: 0, cooldown: 0,
    };
    this.shots = [];
    this.camera = Math.max(0, Math.min(lv.width - VIEW.w, x - VIEW.w / 2));
    if (this.deadlineX !== null) this.deadlineX = x - 56;
  }

  update(input: InputState): void {
    this.ticks += 1;
    if (this.shake > 0) this.shake -= 1;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]!;
      q.x += q.vx;
      q.y += q.vy;
      q.vy += 0.16;
      q.life -= 1;
      if (q.life <= 0) this.particles.splice(i, 1);
    }

    if (this.phase !== "play") return;
    this.stats.frames += 1;

    const p = this.player;
    const lv = this.level;

    if (input.jumpPressed) p.buffer = T.bufferFrames;

    const inSwamp = lv.swamps.some((s) => overlap(p, { ...s, h: s.h + 8 }));
    const maxSpeed =
      lv.maxSpeed * (p.boost > 0 ? T.coffeeMultiplier : 1) * (inSwamp ? T.swampMultiplier : 1);

    if (input.left) { p.vx -= T.accel; p.face = -1; }
    if (input.right) { p.vx += T.accel; p.face = 1; }
    if (!input.left && !input.right) p.vx *= T.friction;
    p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));

    if (p.coyote > 0) p.coyote -= 1;
    if (p.buffer > 0) p.buffer -= 1;
    if (p.hurt > 0) p.hurt -= 1;
    if (p.boost > 0) p.boost -= 1;
    if (p.vacation > 0) p.vacation -= 1;
    if (p.cooldown > 0) p.cooldown -= 1;

    // Бросок теста доступен только сеньору - в этом и смысл третьей ступени.
    if (input.throw && p.grade === 2 && p.cooldown === 0) {
      p.cooldown = T.throwCooldown;
      this.shots.push({
        x: p.face > 0 ? p.x + p.w : p.x - 4,
        y: p.y + 5,
        vx: p.face * T.throwSpeed,
        vy: T.throwLift,
        life: T.throwLife,
      });
      this.emit("throw");
    }

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = T.jumpImpulse * (inSwamp ? T.swampJumpMultiplier : 1);
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      this.stats.jumps += 1;
      this.emit("jump");
    }
    // Прыжок по длительности нажатия: отпустил - подъём срезается.
    if (!input.jump && p.vy < T.jumpCut) p.vy = T.jumpCut;

    p.vy = Math.min(p.vy + T.gravity, T.maxFall);

    // Платформы двигаем до столкновений: иначе игрок сначала встанет на
    // старое место, а платформа уедет из-под ног в том же кадре.
    for (const m of this.moving) {
      const before = m.axis === "x" ? m.x : m.y;
      const next = before + m.dir * m.speed;
      if (next <= m.from) m.dir = 1;
      else if (next >= m.to) m.dir = -1;
      const delta = m.dir * m.speed;
      if (m.axis === "x") m.x += delta; else m.y += delta;

      // Стоящего сверху везём с собой.
      const onTop =
        p.x + p.w > m.x && p.x < m.x + m.w &&
        Math.abs(p.y + p.h - m.y) < 3 && p.vy >= 0;
      if (onTop) {
        if (m.axis === "x") p.x += delta; else p.y += delta;
      }
    }

    // По горизонтали блок ничем не отличается от платформы: и то и другое
    // просто останавливает. Различать их нужно только по вертикали.
    const solids: Rect[] = [
      ...lv.platforms,
      ...lv.pipes,
      ...this.moving,
      ...this.blocks.filter((b) => !b.broken).map((b) => ({ x: b.x, y: b.y, w: 12, h: 12 })),
    ];

    // Горизонталь
    p.x += p.vx;
    if (p.x < 0) { p.x = 0; p.vx = 0; }
    if (p.x + p.w > lv.width) { p.x = lv.width - p.w; p.vx = 0; }
    for (const pl of solids) {
      if (!overlap(p, pl)) continue;
      p.x = p.vx > 0 ? pl.x - p.w : pl.x + pl.w;
      p.vx = 0;
    }

    // Вертикаль
    p.y += p.vy;
    const wasGround = p.onGround;
    p.onGround = false;
    for (const pl of [...lv.platforms, ...lv.pipes, ...this.moving]) {
      if (!overlap(p, pl)) continue;
      if (p.vy > 0) { p.y = pl.y - p.h; p.vy = 0; p.onGround = true; }
      else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0.4; }
    }

    // Блоки разбираем отдельно от платформ, потому что удар снизу нужно
    // поймать ИМЕННО в момент столкновения. Разрешение столкновения тут же
    // выталкивает игрока из блока, и проверка пересечения после цикла
    // не находит уже ничего - блок оставался целым.
    for (const b of this.blocks) {
      if (b.broken) continue;
      const box = { x: b.x, y: b.y, w: 12, h: 12 };
      if (!overlap(p, box)) continue;
      if (p.vy > 0) {
        p.y = box.y - p.h;
        p.vy = 0;
        p.onGround = true;
      } else if (p.vy < 0) {
        p.y = box.y + box.h;
        p.vy = 0.4;
        this.hitBlock(b);
      }
    }
    if (p.onGround || (wasGround && p.coyote === 0)) p.coyote = T.coyoteFrames;

    if (p.y > VIEW.h + 40) { this.respawn(); return; }

    for (const h of lv.hazards) {
      if (overlap(p, { ...h, y: h.y - 4 })) this.damage(h.x + h.w / 2);
    }

    if (this.deadlineX !== null) {
      this.deadlineX += lv.deadlineSpeed;
      if (p.x < this.deadlineX + 8) { this.respawn(); return; }
    }

    for (const item of this.items) {
      // Сначала предмет выскакивает из блока, потом падает на ближайшую
      // опору и лежит там. Висящий в воздухе предмет пришлось бы ловить
      // прыжком в конкретной точке - это не подарок, а испытание.
      if (item.rise > 0) {
        item.rise -= 1;
        item.y -= 0.9;
        continue;
      }
      if (!item.taken) {
        const under = lv.platforms
          .filter((pl) => item.x + 10 > pl.x && item.x < pl.x + pl.w && pl.y >= item.y + 10 - 2)
          .sort((a, b) => a.y - b.y)[0];
        const rest = under ? under.y - 10 : lv.groundY - 10;
        if (item.y < rest) item.y = Math.min(rest, item.y + 1.3);
      }
      if (item.taken || !overlap(p, { x: item.x, y: item.y, w: 10, h: 10 })) continue;
      item.taken = true;
      if (item.kind === "tests") {
        // Тесты сразу дают сеньора: с ними появляется чем отбиваться.
        if (p.grade < 2) this.setGrade(2);
        this.score += 400;
        this.burst(item.x + 5, item.y + 5, PAL.door, 14);
        this.emit("gradeUp");
      } else if (item.kind === "vacation") {
        p.vacation = T.vacationFrames;
        this.score += T.scoreVacation;
        this.burst(item.x + 5, item.y + 5, PAL.gemLite, 16);
        this.emit("vacation");
      } else if (item.kind === "offer" && p.grade < 2) {
        this.setGrade((p.grade + 1) as Grade);
        this.score += 300;
        this.burst(item.x + 5, item.y + 5, PAL.gem, 12);
        this.emit("gradeUp");
      } else if (item.kind === "coffee") {
        p.boost = T.coffeeFrames;
        this.score += T.scoreCoffee;
        this.burst(item.x + 5, item.y + 5, PAL.coffee, 9);
        this.emit("coffee");
      } else {
        this.score += 100;
        this.emit("pickup");
      }
      this.hud();
    }

    for (const b of this.blocks) if (b.bump > 0) b.bump -= 1;

    // Тесты летят по дуге и отскакивают от земли - так они достают врагов,
    // стоящих в низинах, а не гаснут о первый же бугор.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i]!;
      shot.life -= 1;
      shot.vy = Math.min(shot.vy + T.gravity, 4);
      shot.x += shot.vx;
      shot.y += shot.vy;

      const box = { x: shot.x, y: shot.y, w: 4, h: 4 };
      let dead = shot.life <= 0 || shot.x < this.camera - 20 || shot.x > this.camera + VIEW.w + 20;

      for (const pl of [...lv.platforms, ...lv.pipes, ...this.moving]) {
        if (!overlap(box, pl)) continue;
        if (shot.vy > 0 && shot.y + 4 - shot.vy <= pl.y + 1) {
          shot.y = pl.y - 4;
          shot.vy = T.throwBounce;
        } else {
          dead = true;
        }
        break;
      }

      if (!dead) {
        for (const f of this.foes) {
          if (f.squashed > 0) continue;
          if (!overlap(box, { x: f.x, y: f.y, w: f.w, h: f.h })) continue;
          f.squashed = 1;
          this.stats.tested += 1;
          this.score += T.scoreTested;
          this.burst(f.x + f.w / 2, f.y + 2, PAL.door, 10);
          dead = true;
          break;
        }
      }

      if (dead) this.shots.splice(i, 1);
    }

    for (const g of this.gems) {
      if (g.taken || !overlap(p, { x: g.x, y: g.y, w: 8, h: 9 })) continue;
      g.taken = true;
      this.skills += 1;
      this.score += T.scoreGem;
      this.burst(g.x + 4, g.y + 4, PAL.gem, 7);
      this.emit("pickup");
    }

    for (const c of this.coffee) {
      if (c.taken || !overlap(p, { x: c.x, y: c.y, w: 8, h: 9 })) continue;
      c.taken = true;
      p.boost = T.coffeeFrames;
      this.score += T.scoreCoffee;
      this.burst(c.x + 4, c.y + 4, PAL.coffee, 9);
      this.emit("coffee");
    }

    for (const f of this.foes) {
      if (f.squashed > 0) { f.squashed += 1; continue; }

      f.x += f.dir * f.speed;
      if (f.x < f.min) { f.x = f.min; f.dir = 1; }
      if (f.x > f.max) { f.x = f.max; f.dir = -1; }
      if (f.kind === "call") f.y = f.baseY + Math.sin((this.ticks + f.min) / 26) * 5;

      if (p.hurt > 0) continue;
      if (!overlap(p, { x: f.x, y: f.y, w: f.w, h: f.h })) continue;

      const stompable = f.kind !== "call";
      const fromAbove = p.vy > T.stompMinFallSpeed && p.y + p.h < f.y + f.h * T.stompTolerance;

      // В отпуске сносим всё, чего касаемся, - даже созвоны.
      if (p.vacation > 0) {
        f.squashed = 1;
        this.score += T.scoreStomp;
        this.stats.stomps += 1;
        this.burst(f.x + f.w / 2, f.y + 2, PAL.gemLite, 10);
        this.emit("stomp");
        continue;
      }

      if (stompable && fromAbove) {
        f.squashed = 1;
        this.score += T.scoreStomp;
        this.stats.stomps += 1;
        p.vy = T.stompBounce;
        p.buffer = 0;
        this.shake = 5;
        this.burst(f.x + f.w / 2, f.y + 2, f.kind === "bug" ? PAL.bug : PAL.legacyLite, 9);
        this.emit("stomp");
      } else {
        this.damage(f.x);
      }
    }

    for (const cp of lv.checkpoints) {
      if (cp.x <= this.checkpointX || p.x < cp.x) continue;
      this.checkpointX = cp.x;
      this.burst(cp.x + 3, cp.y - 18, PAL.door, 6);
      this.emit("checkpoint");
    }

    // Финиш - вертикальная линия, а не коробка. Дверь высотой 24 пикселя
    // от земли, и прилетевший в прыжке игрок оказывался выше неё: уровень
    // не засчитывался, а за дверью оставалось всего 5 пикселей хода до
    // стены, где он и застревал навсегда.
    if (p.x + p.w > lv.door.x + 8) {
      const door = { x: lv.door.x, y: lv.door.y - 33, w: 18, h: 33 };
      this.score += T.scoreLevelClear + this.lives * T.scoreLifeBonus;
      this.stats.levelsCleared += 1;
      this.phase = "clear";
      this.burst(door.x + 8, door.y + 12, PAL.door, 16);
      this.emit("clear");
    }

    const target = p.x - VIEW.w / 2 + p.w / 2;
    this.camera += (target - this.camera) * T.cameraEase;
    this.camera = Math.max(0, Math.min(lv.width - VIEW.w, this.camera));

    this.stats.score = this.score;
    this.stats.skills = this.skills;
  }
}
