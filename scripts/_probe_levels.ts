import { LEVELS } from "../src/game/levels";

LEVELS.forEach((lv, i) => {
  const pipeXs = lv.pipes.map((p) => p.x);
  const dup = pipeXs.filter((x, k) => pipeXs.indexOf(x) !== k);
  console.log(`#${i + 1} ${lv.name} w=${lv.width} door=${lv.door.x} boss=${lv.boss ? `${lv.boss.min}..${lv.boss.max}` : "-"} cps=${JSON.stringify(lv.checkpoints.map(c=>c.x))} pipes=${JSON.stringify(lv.pipes)} dupPipeX=${JSON.stringify(dup)} moving=${lv.moving.length} theme=${lv.theme}`);
});

const last = LEVELS[LEVELS.length - 1]!;
const b = last.boss!;
console.log("\n=== ARENA REGION of last level ===");
console.log("arenaStart =", b.min - 12, "arenaEnd =", b.max + 12, "door =", last.door.x, "width =", last.width);
const a0 = b.min - 12;
console.log("platforms in [arenaStart, width]:");
for (const p of last.platforms) if (p.x + p.w > a0) console.log("  ", JSON.stringify(p));
console.log("blocks in region:");
for (const bl of last.blocks) if (bl.x > a0 - 20) console.log("  ", JSON.stringify(bl));
console.log("pipes in region:", JSON.stringify(last.pipes.filter(p=>p.x > a0-20)));
console.log("moving in region:", JSON.stringify(last.moving.filter(m=>m.x > a0-20)));
console.log("foes in region:", JSON.stringify(last.foes.filter(f=>f.max > a0)));
console.log("hazards in region:", JSON.stringify(last.hazards.filter(h=>h.x+h.w > a0)));
console.log("checkpoints:", JSON.stringify(last.checkpoints));

console.log("\n=== boss levels count ===", LEVELS.filter(l=>l.boss).length);
console.log("=== levels missing door on ground / arena block survival ===");
const arenaBlocks = last.blocks.filter(bl => bl.x >= a0 && bl.x <= b.max + 12);
console.log("arena blocks kept:", JSON.stringify(arenaBlocks));
