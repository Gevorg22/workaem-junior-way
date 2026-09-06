/**
 * Картинка 640×360 для витрины Mini App в BotFather.
 * Рисуется теми же спрайтами, что и игра — отдельного арта не заводим.
 * PNG кодируется вручную, чтобы не тащить зависимость ради одной картинки.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { PAL } from "../src/game/palette";
import { drawCheckpoint, drawCoffee, drawDev, drawFoe, drawGem } from "../src/game/sprites";
import type { Painter } from "../src/game/sprites";

const LW = 160;
const LH = 90;
const SCALE = 4;

const buf = new Uint8Array(LW * LH * 3);

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const paint: Painter = (x, y, w, h, color) => {
  const [r, g, b] = hex(color);
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  for (let yy = y0; yy < y0 + h; yy++) {
    if (yy < 0 || yy >= LH) continue;
    for (let xx = x0; xx < x0 + w; xx++) {
      if (xx < 0 || xx >= LW) continue;
      const i = (yy * LW + xx) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
};

// ── шрифт для надписи: только буквы слова ПУТЬ ДЖУНА ──
const GLYPHS: Record<string, string[]> = {
  П: ["11111", "10001", "10001", "10001", "10001", "10001", "10001"],
  У: ["10001", "10001", "01010", "00100", "00100", "01000", "11000"],
  Т: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Ь: ["10000", "10000", "10000", "11110", "10001", "10001", "11110"],
  Д: ["00110", "00110", "01010", "01010", "10010", "11111", "10001"],
  Ж: ["10101", "10101", "10101", "01110", "10101", "10101", "10101"],
  Н: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  А: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function word(text: string, x: number, y: number, color: string, shadow?: string): void {
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) { cx += 6; continue; }
    g.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== "1") return;
        if (shadow) paint(cx + rx + 1, y + ry + 1, 1, 1, shadow);
        paint(cx + rx, y + ry, 1, 1, color);
      });
    });
    cx += 6;
  }
}

// ── сцена ──
const GY = 70;

paint(0, 0, LW, LH, PAL.sky);

for (let c = 0; c < 5; c++) {
  const cx = 12 + c * 34;
  const cy = 10 + ((c * 13) % 10);
  paint(cx, cy, 14, 3, PAL.cloud);
  paint(cx + 3, cy - 2, 9, 3, PAL.cloud);
  paint(cx - 3, cy + 2, 20, 2, PAL.cloud);
}

for (let i = 0; i < 6; i++) {
  const hx = i * 30 - 6;
  const hh = 18 + ((i * 23) % 14);
  paint(hx, GY - hh, 32, hh, "#1A1728");
  paint(hx + 2, GY - hh, 28, 1, PAL.far);
}
for (let b = 0; b < 8; b++) {
  const bx = b * 22 - 4;
  const bh = 20 + ((b * 31) % 22);
  paint(bx, GY - bh, 18, bh, PAL.far);
  for (let w = 0; w < 2; w++) {
    for (let v = 0; v < Math.floor(bh / 7); v++) {
      if ((b + w + v) % 3 === 0) paint(bx + 4 + w * 7, GY - bh + 5 + v * 7, 3, 3, "#2E2A44");
    }
  }
}

// земля с провалом
paint(0, GY, 96, 20, PAL.brick);
paint(0, GY, 96, 2, PAL.brickTop);
paint(0, GY + 2, 96, 1, PAL.brickEdge);
paint(122, GY, 38, 20, PAL.brick);
paint(122, GY, 38, 2, PAL.brickTop);
paint(122, GY + 2, 38, 1, PAL.brickEdge);
for (let bx = 0; bx < 160; bx += 8) {
  if (bx < 96 || bx >= 122) paint(bx, GY + 3, 1, 17, PAL.brickLine);
}
// прод в провале
paint(98, GY + 9, 22, 4, PAL.prodDark);
for (let i = 0; i < 22; i += 4) paint(98 + i, GY + 7, 2, 3, PAL.prod);

// платформа над провалом
paint(100, 54, 20, 4, PAL.brick);
paint(100, 54, 20, 2, PAL.brickTop);

// герой в прыжке над легаси
drawFoe(paint, "legacy", 62, GY - 9);
drawDev(paint, 44, 40, { face: 1, walking: false, airborne: true, stride: false });

drawGem(paint, 30, 50);
drawGem(paint, 108, 42);
drawCoffee(paint, 78, 48);
drawCheckpoint(paint, 138, GY, true);

// надпись
word("ПУТЬ", 10, 10, PAL.gem, "#3A2A08");
word("ДЖУНА", 10, 20, PAL.gem, "#3A2A08");

// ── масштаб и кодирование PNG ──
const W = LW * SCALE;
const H = LH * SCALE;
const raw = Buffer.alloc(H * (W * 3 + 1));
let o = 0;
for (let y = 0; y < H; y++) {
  raw[o++] = 0; // фильтр строки
  const sy = Math.floor(y / SCALE);
  for (let x = 0; x < W; x++) {
    const i = (sy * LW + Math.floor(x / SCALE)) * 3;
    raw[o++] = buf[i]!;
    raw[o++] = buf[i + 1]!;
    raw[o++] = buf[i + 2]!;
  }
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const byte of b) c = TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // бит на канал
ihdr[9] = 2;  // truecolor RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync("public/promo-640x360.png", png);
console.log(`public/promo-640x360.png — ${W}×${H}, ${(png.length / 1024).toFixed(1)} КБ`);
