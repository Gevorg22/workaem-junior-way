import { World } from "../src/game/world";
import type { InputState } from "../src/game/world";

const NONE: InputState = { left:false, right:false, jump:false, jumpPressed:false, throw:false, downPressed:false };
const RIGHT: InputState = { ...NONE, right:true };

const w = new World();
w.loadLevel(11);
w.deadlineX = null;           // изолируем стену дедлайна
let shakeFrames = 0, onsets: number[] = [], prev = 0, jumps = 0, prevY = w.boss!.y;
for (let i = 0; i < 1200; i++) {
  w.update(NONE);
  const b = w.boss!;
  if (b.y < prevY - 0.5) jumps++;
  prevY = b.y;
  if (w.shake > 0) shakeFrames++;
  if (w.shake > prev) onsets.push(i);
  prev = w.shake;
}
console.log("idle player at x=", Math.round(w.player.x), "camera=", Math.round(w.camera));
console.log("boss jump-frames:", jumps, " shake onsets:", onsets.join(","), " total shaking frames:", shakeFrames);
console.log("boss on-screen?", w.boss!.x, "camera range", Math.round(w.camera), "-", Math.round(w.camera)+220);
