import { World } from "../src/game/world";
import { heightFor } from "../src/game/world";
import type { Grade } from "../src/game/types";

function mk(level: number, grade: Grade): World {
  const w = new World();
  w.player.grade = grade;
  w.loadLevel(level);
  w.player.h = heightFor(grade);
  w.player.y = w.level.groundY - w.player.h - 1;
  return w;
}

function trial(level: number, grade: Grade, frames: number, seed: number) {
  const w = mk(level, grade);
  let a = seed >>> 0;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  let maxX = w.player.x, minX = w.player.x;
  let right = true, jump = false, down = false, thr = false, hold = 0;
  let died = false, hurtCount = 0, gradeMin: number = grade;
  for (let i = 0; i < frames; i++) {
    if (hold-- <= 0) {
      hold = 5 + Math.floor(rnd() * 60);
      right = rnd() < 0.75;
      jump = rnd() < 0.6;
      thr = rnd() < 0.4;
      down = rnd() < 0.1;
    }
    const jp = jump && rnd() < 0.25;
    const before = w.lives;
    w.update({ left: !right, right, jump, jumpPressed: jp, throw: thr, downPressed: down && rnd() < 0.2 });
    if (w.lives < before) died = true;
    if (w.player.grade < gradeMin) { gradeMin = w.player.grade; hurtCount++; }
    maxX = Math.max(maxX, w.player.x);
    minX = Math.min(minX, w.player.x);
    if (w.phase !== "play") break;
  }
  return { maxX, minX, died, gradeMin, phase: w.phase, lives: w.lives };
}

for (const [lvl, name] of [[6, "L7 Продукт (stack@126)"], [7, "L8 Легаси (stack@632)"]] as Array<[number, string]>) {
  for (const g of [0, 1, 2] as Grade[]) {
    let best = -1, anyDeath = false, anyMinGrade = 9;
    for (let s = 0; s < 60; s++) {
      const r = trial(lvl, g, 4000, s * 7919 + 13);
      best = Math.max(best, r.maxX);
      anyDeath = anyDeath || r.died;
      anyMinGrade = Math.min(anyMinGrade, r.gradeMin);
    }
    console.log(`${name} grade=${g}: maxX=${best.toFixed(1)} tookDamage=${anyMinGrade < g} died=${anyDeath}`);
  }
}
