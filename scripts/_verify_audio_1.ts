import { World } from "../src/game/world";
import { VIEW } from "../src/game/tuning";

const IDLE = { left: false, right: false, jump: false, jumpPressed: false, downPressed: false };

function trace(label: string, run: (w: World) => void): void {
  const w = new World();
  const log: string[] = [];
  w.on((e) => log.push(e));
  run(w);
  console.log(`\n== ${label} ==`);
  console.log("события:", log.join(", ") || "(нет)");
  console.log("phase:", w.phase, "lives:", w.lives, "grade:", w.player.grade);
}

function glueFoe(w: World, ticks: number): void {
  const f = w.foes[0]!;
  f.min = -1e6; f.max = 1e6; f.speed = 0;
  for (let i = 0; i < ticks; i++) {
    const p = w.player;
    f.x = p.x; f.y = p.y;
    w.update(IDLE);
    if (w.phase !== "play") break;
  }
}

trace("A: падение в яму, lives=3", (w) => { w.player.y = VIEW.h + 100; w.update(IDLE); });
trace("B: падение в яму, lives=1", (w) => { w.lives = 1; w.player.y = VIEW.h + 100; w.update(IDLE); });
trace("C: враг, lives=1, grade=0", (w) => { w.lives = 1; w.player.grade = 0; glueFoe(w, 5); });
trace("D: враг, lives=3, grade=0 (три касания подряд)", (w) => { w.lives = 3; w.player.grade = 0; glueFoe(w, 200); });
