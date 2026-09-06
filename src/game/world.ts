import { levelAt, LEVELS } from "./levels";
import { TUNING as T } from "./tuning";
import { PAL } from "./palette";
import type { Foe, LevelSpec, Particle, Phase, Pickup, Player, Rect, RunStats } from "./types";

const FOE_SIZE: Record<Foe["kind"], { w: number; h: number; speed: number }> = {
  legacy: { w: 12, h: 9, speed: 0.3 },
  bug: { w: 9, h: 7, speed: 0.72 },
  call: { w: 13, h: 10, speed: 0.42 },
};

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** true только в кадр нажатия — из него набивается буфер прыжка. */
  jumpPressed: boolean;
}

export type WorldEvent =
  | "stomp" | "hurt" | "pickup" | "coffee"
  | "checkpoint" | "clear" | "death" | "final";

export class World {
  levelIndex = 0;
  level: LevelSpec = levelAt(0);
  phase: Phase = "play";

  player!: Player;
  camera = 0;
  gems: Pickup[] = [];
  coffee: Pickup[] = [];
  foes: Foe[] = [];
  particles: Particle[] = [];
  /** Позиция стены дедлайна, null — стены на уровне нет. */
  deadlineX: number | null = null;
  /** X последнего пройденного коммита — сюда возрождаемся. */
  checkpointX = 10;

  lives = T.startLives;
  score = 0;
  skills = 0;
  shake = 0;
  ticks = 0;

  stats: RunStats = { score: 0, skills: 0, levelsCleared: 0, frames: 0, jumps: 0, stomps: 0, deaths: 0 };

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
    this.stats = { score: 0, skills: 0, levelsCleared: 0, frames: 0, jumps: 0, stomps: 0, deaths: 0 };
    this.loadLevel(0);
    this.phase = "play";
  }

  loadLevel(index: number): void {
    this.levelIndex = index;
    const lv = levelAt(index);
    this.level = lv;

    this.player = {
      x: 10, y: lv.groundY - 16, w: 9, h: 15,
      vx: 0, vy: 0, onGround: false, face: 1,
      coyote: 0, buffer: 0, hurt: 0, boost: 0,
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

  private damage(fromX: number): void {
    const p = this.player;
    if (p.hurt > 0) return;
    p.hurt = T.hurtFrames;
    p.vx = p.x < fromX ? -T.knockbackX : T.knockbackX;
    p.vy = T.knockbackY;
    this.lives -= 1;
    this.shake = T.shakeFrames;
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
    this.player = { ...this.player, x, y: lv.groundY - 16, vx: 0, vy: 0, hurt: 40, boost: 0 };
    this.camera = Math.max(0, Math.min(lv.width - T.viewW, x - T.viewW / 2));
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

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = T.jumpImpulse * (inSwamp ? T.swampJumpMultiplier : 1);
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      this.stats.jumps += 1;
    }
    // Прыжок по длительности нажатия: отпустил — подъём срезается.
    if (!input.jump && p.vy < T.jumpCut) p.vy = T.jumpCut;

    p.vy = Math.min(p.vy + T.gravity, T.maxFall);

    // Горизонталь
    p.x += p.vx;
    if (p.x < 0) { p.x = 0; p.vx = 0; }
    if (p.x + p.w > lv.width) { p.x = lv.width - p.w; p.vx = 0; }
    for (const pl of lv.platforms) {
      if (!overlap(p, pl)) continue;
      p.x = p.vx > 0 ? pl.x - p.w : pl.x + pl.w;
      p.vx = 0;
    }

    // Вертикаль
    p.y += p.vy;
    const wasGround = p.onGround;
    p.onGround = false;
    for (const pl of lv.platforms) {
      if (!overlap(p, pl)) continue;
      if (p.vy > 0) { p.y = pl.y - p.h; p.vy = 0; p.onGround = true; }
      else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0.4; }
    }
    if (p.onGround || (wasGround && p.coyote === 0)) p.coyote = T.coyoteFrames;

    if (p.y > T.viewH + 40) { this.respawn(); return; }

    for (const h of lv.hazards) {
      if (overlap(p, { ...h, y: h.y - 4 })) this.damage(h.x + h.w / 2);
    }

    if (this.deadlineX !== null) {
      this.deadlineX += lv.deadlineSpeed;
      if (p.x < this.deadlineX + 8) { this.respawn(); return; }
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

    const door = { x: lv.door.x, y: lv.door.y - 24, w: 16, h: 24 };
    if (p.x + p.w > door.x + 2 && overlap(p, door)) {
      this.score += T.scoreLevelClear + this.lives * T.scoreLifeBonus;
      this.stats.levelsCleared += 1;
      this.phase = "clear";
      this.burst(door.x + 8, door.y + 12, PAL.door, 16);
      this.emit("clear");
    }

    const target = p.x - T.viewW / 2 + p.w / 2;
    this.camera += (target - this.camera) * T.cameraEase;
    this.camera = Math.max(0, Math.min(lv.width - T.viewW, this.camera));

    this.stats.score = this.score;
    this.stats.skills = this.skills;
  }
}
