import { LEVELS } from "../src/game/levels";
import { VIEW } from "../src/game/tuning";

LEVELS.forEach((lv, i) => {
  const warps = lv.pipes.filter(p => p.link !== undefined);
  if (warps.length) {
    console.log(`L${i+1} ${lv.name} width=${lv.width} warps:`, warps.map(p=>`x=${p.x} h=${p.h} ->${p.link}`).join(" | "));
  }
});
console.log("--- duplicate pipe x per level ---");
LEVELS.forEach((lv,i)=>{
  const xs = new Map<number,number>();
  for (const p of lv.pipes) xs.set(p.x,(xs.get(p.x)??0)+1);
  for (const [x,c] of xs) if (c>1) console.log(`L${i+1} duplicate pipe x=${x} count=${c}`);
});

console.log("--- level 12 ---");
const lv = LEVELS[11]!;
console.log("width", lv.width, "door", lv.door, "deadlineSpeed", lv.deadlineSpeed);
console.log("boss", lv.boss);
console.log("checkpoints", lv.checkpoints.map(c=>c.x).join(","));
console.log("arena blocks kept:", lv.blocks.filter(b=>b.x>lv.boss!.min-40).map(b=>`${b.kind}@${b.x},${b.y} drop=${b.drop}`).join(" | "));
console.log("boss.min - VIEW.w =", lv.boss!.min - VIEW.w);
console.log("pipes L12:", lv.pipes.map(p=>`${p.x}(${p.h})${p.link!==undefined?"->"+p.link:""}`).join(" "));
console.log("last checkpoint", Math.max(...lv.checkpoints.map(c=>c.x)));
