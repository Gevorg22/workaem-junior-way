import { World } from "../src/game/world";
import { LEVELS } from "../src/game/levels";
import type { InputState } from "../src/game/world";
const NONE: InputState = { left:false, right:false, jump:false, jumpPressed:false, throw:false, downPressed:false };

console.log("spec boss:", JSON.stringify(LEVELS[11]!.boss));
const w = new World();
w.loadLevel(11);
console.log("copy boss:", JSON.stringify(w.boss));
w.deadlineX = null;
for (let i = 0; i < 400; i++) {
  w.update(NONE);
  if (i % 50 === 0) console.log(i, "x=", w.boss!.x.toFixed(2), "min=", w.boss!.min, "max=", w.boss!.max, "dir=", w.boss!.dir, "recoil=", w.boss!.recoil);
}
console.log("spec boss after:", JSON.stringify(LEVELS[11]!.boss));
