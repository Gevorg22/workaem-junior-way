/**
 * Схемы уровней одной картинкой: видно структуру карты целиком -
 * где ямы, где блоки, где враги. По ней сразу понятно, есть ли у уровня
 * ритм или это ровный поток одинаковых кусков.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { LEVELS } from "../src/game/levels";

const ROW_H = 118;
const GAP = 10;
const W = Math.max(...LEVELS.map((l) => l.width)) + 8;
const H = LEVELS.length * (ROW_H + GAP) + GAP;

const buf = new Uint8Array(W * H * 3);
const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function box(x: number, y: number, w: number, h: number, color: string): void {
  const [r, g, b] = hex(color);
  for (let yy = Math.round(y); yy < Math.round(y) + h; yy++) {
    if (yy < 0 || yy >= H) continue;
    for (let xx = Math.round(x); xx < Math.round(x) + w; xx++) {
      if (xx < 0 || xx >= W) continue;
      const i = (yy * W + xx) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
}

box(0, 0, W, H, "#0F1420");

LEVELS.forEach((lv, i) => {
  const top = GAP + i * (ROW_H + GAP);
  box(4, top, lv.width, ROW_H - 6, "#16223A");

  for (const h of lv.hazards) box(4 + h.x, top + h.y, h.w, 6, "#E03C2C");
  for (const s of lv.swamps) box(4 + s.x, top + s.y, s.w, 4, "#4E7A3A");

  for (const p of lv.platforms) {
    const ground = p.h > 6;
    box(4 + p.x, top + p.y, p.w, ground ? 8 : 4, ground ? "#C4762E" : "#E09A48");
  }
  for (const p of lv.pipes) box(4 + p.x, top + p.y, p.w, p.h, "#2E9E6A");
  for (const m of lv.moving) {
    const span = Math.abs(m.span);
    if (m.axis === "x") box(4 + Math.min(m.x, m.x + m.span), top + m.y, m.w + span, 4, "#B8862E");
    else box(4 + m.x, top + Math.min(m.y, m.y + m.span), m.w, span + 4, "#B8862E");
  }
  for (const b of lv.blocks) {
    box(4 + b.x, top + b.y, 12, 12, b.kind === "question" ? "#E8A81C" : "#C86428");
  }
  for (const g of lv.gems) box(4 + g.x + 2, top + g.y + 2, 5, 5, "#FFD24A");
  for (const c of lv.coffee) box(4 + c.x + 1, top + c.y + 1, 7, 7, "#8A5A2E");
  for (const f of lv.foes) {
    const color = f.kind === "bug" ? "#C82828" : f.kind === "call" ? "#8A5AD8" : "#8A6A4A";
    box(4 + f.min, top + f.baseY - 10, f.max - f.min, 3, color);
    box(4 + f.x, top + f.baseY - 12, 8, 10, color);
  }
  for (const c of lv.checkpoints) box(4 + c.x, top + c.y - 28, 3, 28, "#2ECC71");
  box(4 + lv.door.x, top + lv.door.y - 33, 18, 33, "#2ECC71");
});

const raw = Buffer.alloc(H * (W * 3 + 1));
let o = 0;
for (let y = 0; y < H; y++) {
  raw[o++] = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    raw[o++] = buf[i]!; raw[o++] = buf[i + 1]!; raw[o++] = buf[i + 2]!;
  }
}
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of b) c = TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync("maps.png", Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]));
console.log(`maps.png - ${W}x${H}`);
LEVELS.forEach((l, i) => console.log(`  ${i + 1}. ${l.name.padEnd(11)} ${l.width}px`));
