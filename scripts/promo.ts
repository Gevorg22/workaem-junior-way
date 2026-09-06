/**
 * Картинка 640×360 для витрины Mini App в BotFather.
 * Рисуется теми же спрайтами, что и игра - отдельного арта не заводим.
 * PNG кодируется вручную, чтобы не тащить зависимость ради одной картинки.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { PAL } from "../src/game/palette";
import { drawBlock, drawCheckpoint, drawDev, drawFoe, drawGem, drawItem } from "../src/game/sprites";
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
paint(0, 0, LW, 22, PAL.skyHigh);

for (let i = 0; i < 4; i++) {
  const bx = 10 + i * 44;
  const bh = 26 + ((i * 29) % 16);
  paint(bx, GY - bh, 20, bh, i % 2 ? PAL.tower : PAL.towerDark);
  for (let row = 0; row < Math.floor(bh / 6); row++) {
    paint(bx + 3, GY - bh + 4 + row * 6, 3, 3, PAL.towerWindow);
    paint(bx + 12, GY - bh + 4 + row * 6, 3, 3, PAL.towerWindow);
  }
}

for (let c = 0; c < 3; c++) {
  const cx = 16 + c * 56;
  const cy = 8 + ((c * 17) % 10);
  paint(cx + 4, cy, 16, 4, PAL.cloud);
  paint(cx, cy + 3, 24, 5, PAL.cloud);
  paint(cx + 7, cy - 3, 10, 4, PAL.cloud);
  paint(cx, cy + 7, 24, 1, PAL.cloudShade);
}

for (let i = 0; i < 3; i++) {
  const hx = i * 62 - 10;
  const hh = i % 2 ? 16 : 24;
  const hw = i % 2 ? 32 : 48;
  for (let step = 0; step < hh; step += 2) {
    // step идёт сверху вниз, поэтому сужение считаем от обратного:
        // иначе холм получается перевёрнутым.
        const inset = Math.round((1 - step / hh) * (hw / 2 - 3));
    paint(hx + inset, GY - hh + step, hw - inset * 2, 2, PAL.hill);
  }
}

for (let b = 0; b < 4; b++) {
  const bx = b * 46 + 6;
  paint(bx + 3, GY - 5, 14, 5, PAL.bush);
  paint(bx, GY - 3, 20, 3, PAL.bush);
  paint(bx + 7, GY - 8, 7, 4, PAL.bush);
}

function groundRun(x: number, w: number): void {
  paint(x, GY, w, 20, PAL.ground);
  paint(x, GY, w, 2, PAL.groundLite);
  paint(x, GY + 2, w, 1, PAL.groundDark);
  for (let by = GY + 3; by < GY + 20; by += 5) {
    paint(x, by + 4, w, 1, PAL.groundDark);
    const shift = ((by - GY - 3) / 5) % 2 === 0 ? 0 : 5;
    for (let bx = x + shift; bx < x + w; bx += 10) paint(bx, by, 1, 4, PAL.groundDark);
  }
}

groundRun(0, 96);
groundRun(122, 38);
paint(98, GY + 9, 22, 4, PAL.prodDark);
for (let i = 0; i < 22; i += 4) paint(98 + i, GY + 7, 2, 3, PAL.prod);

drawBlock(paint, "brick", 42, 44, false, 0);
drawBlock(paint, "question", 54, 44, false, 0);
drawBlock(paint, "brick", 66, 44, false, 0);
drawItem(paint, "offer", 55, 33);

drawFoe(paint, "legacy", 84, GY - 9);
drawDev(paint, 30, 40, { face: 1, walking: false, airborne: true, stride: false, grade: 2 });

drawGem(paint, 16, 50);
drawGem(paint, 108, 42);
drawCheckpoint(paint, 138, GY, true);

word("ПУТЬ", 10, 10, PAL.gem, "#5A3418");
word("ДЖУНА", 10, 20, PAL.gem, "#5A3418");

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
console.log(`public/promo-640x360.png - ${W}×${H}, ${(png.length / 1024).toFixed(1)} КБ`);
