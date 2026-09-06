import { GROUND_Y, HAZARD_Y, INTRO, OUTRO, SEGMENTS, SWAMP_Y } from "./segments";
import { PLAYER_W } from "./tuning";
import type { Segment } from "./segments";
import type { BlockSpec, FoeSpec, LevelSpec, MovingSpec, Pipe, Rect, Vec } from "./types";

/**
 * Детерминированный генератор: один и тот же сид даёт одну и ту же карту.
 * Для таблицы рекордов это обязательно - иначе игроки соревнуются
 * на разных уровнях сложности и рейтинг ничего не значит.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Blueprint {
  name: string;
  grade: string;
  maxSpeed: number;
  tint: string;
  /** Целевая длина. Реальная получится чуть больше - сегменты не режутся. */
  targetWidth: number;
  seed: number;
  deadlineSpeed: number;
  /** Через сколько сегментов ставить коммит. */
  checkpointEvery: number;
}

const GROUND_H = 15;
const PLATFORM_H = 4;

function composeLevel(bp: Blueprint, levelIndex: number): LevelSpec {
  const pick = rng(bp.seed);
  // Новые виды кусков открываются каждые два уровня: игрок успевает
  // привыкнуть к одной новинке прежде, чем появится следующая.
  const tier = Math.floor(levelIndex / 2);
  const pool = SEGMENTS.filter((s) => s.minLevel <= tier);

  const chain: Segment[] = [INTRO];
  let width = INTRO.width;
  let lastId = INTRO.id;

  while (width < bp.targetWidth) {
    // Два подряд одинаковых куска читаются как копипаста - избегаем.
    const options = pool.filter((s) => s.id !== lastId);
    const next = options[Math.floor(pick() * options.length)] ?? pool[0]!;
    chain.push(next);
    width += next.width;
    lastId = next.id;
  }
  chain.push(OUTRO);
  width += OUTRO.width;

  const platforms: Rect[] = [];
  const foes: FoeSpec[] = [];
  const gems: Vec[] = [];
  const coffee: Vec[] = [];
  const hazards: Rect[] = [];
  const swamps: Rect[] = [];
  const blocks: BlockSpec[] = [];
  const moving: MovingSpec[] = [];
  const pipes: Pipe[] = [];
  const checkpoints: Vec[] = [];

  let offset = 0;
  chain.forEach((seg, index) => {
    for (const [x, w] of seg.ground) {
      platforms.push({ x: offset + x, y: GROUND_Y, w, h: GROUND_H });
    }
    for (const [x, y, w] of seg.platforms ?? []) {
      platforms.push({ x: offset + x, y, w, h: PLATFORM_H });
    }
    for (const f of seg.foes ?? []) {
      const x = offset + f.x;
      foes.push({
        kind: f.kind,
        x,
        baseY: f.y ?? GROUND_Y,
        min: x - f.span,
        max: x + f.span,
      });
    }
    for (const [x, y] of seg.gems ?? []) gems.push({ x: offset + x, y });
    for (const [x, y] of seg.coffee ?? []) coffee.push({ x: offset + x, y });
    for (const [x, w] of seg.hazards ?? []) hazards.push({ x: offset + x, y: HAZARD_Y, w, h: 6 });
    for (const [x, w] of seg.swamps ?? []) swamps.push({ x: offset + x, y: SWAMP_Y, w, h: 4 });
    for (const [x, y, kind, drop] of seg.blocks ?? []) {
      blocks.push(drop ? { kind, x: offset + x, y, drop } : { kind, x: offset + x, y });
    }
    for (const [x, y, w, axis, span, speed] of seg.moving ?? []) {
      moving.push({ x: offset + x, y, w, axis, span, speed });
    }
    for (const [x, h] of seg.pipes ?? []) {
      pipes.push({ x: offset + x, y: GROUND_Y - h, w: 18, h });
    }

    // Коммит ставим на стыке - там всегда земля, значит возрождение безопасно.
    const isInner = index > 0 && index < chain.length - 1;
    if (isInner && index % bp.checkpointEvery === 0) {
      checkpoints.push({ x: offset + 6, y: GROUND_Y });
    }

    offset += seg.width;
  });

  // Сегменты рисуются по отдельности, а стыкуются вплотную - и на границе
  // блок из одного куска может оказаться впритык к балке из следующего.
  // Внутри сегмента такое не видно, поэтому чистим уже собранный уровень:
  // в щель уже игрока не пролезть, и оба объекта становятся бесполезны.
  const MIN_GAP = PLAYER_W + 4;
  const keptBlocks = blocks.filter((b) => {
    return !platforms.some((pl) => {
      if (pl.h > 6) return false;
      if (Math.abs(pl.y - (b.y + 12)) > 34) return false;
      const right = pl.x - (b.x + 12);
      const left = b.x - (pl.x + pl.w);
      const gap = right >= 0 ? right : left >= 0 ? left : -1;
      return gap >= 0 && gap < MIN_GAP;
    });
  });

  return {
    name: bp.name,
    grade: bp.grade,
    width,
    groundY: GROUND_Y,
    maxSpeed: bp.maxSpeed,
    tint: bp.tint,
    platforms,
    foes,
    gems,
    coffee,
    hazards,
    swamps,
    blocks: keptBlocks,
    moving,
    pipes,
    deadlineSpeed: bp.deadlineSpeed,
    checkpoints,
    door: { x: width - 30, y: GROUND_Y },
  };
}

/** Уровень = грейд. Темп и набор препятствий растут вместе с карьерой. */
/**
 * Десять уровней вместо шести, с плавным усложнением.
 *
 * Сложность растёт тремя рычагами сразу, а не одним: скоростью, набором
 * доступных сегментов (minLevel) и плотностью опасного. Резких ступеней
 * нет намеренно - человек должен успевать привыкнуть к каждой новинке
 * прежде, чем добавится следующая.
 */
const BLUEPRINTS: Blueprint[] = [
  { name: "Стажировка", grade: "СТАЖЁР",  maxSpeed: 1.30, tint: "#1A1728", targetWidth: 2200, seed: 1104, deadlineSpeed: 0,    checkpointEvery: 8 },
  { name: "Галера",     grade: "ДЖУН",    maxSpeed: 1.35, tint: "#1A1728", targetWidth: 2560, seed: 1207, deadlineSpeed: 0,    checkpointEvery: 7 },
  { name: "Аутсорс",    grade: "ДЖУН+",   maxSpeed: 1.42, tint: "#1B2030", targetWidth: 2760, seed: 2207, deadlineSpeed: 0,    checkpointEvery: 7 },
  { name: "Студия",     grade: "МИДЛ",    maxSpeed: 1.48, tint: "#1B2438", targetWidth: 2900, seed: 2416, deadlineSpeed: 0,    checkpointEvery: 6 },
  { name: "Стартап",    grade: "МИДЛ+",   maxSpeed: 1.55, tint: "#1E2438", targetWidth: 3000, seed: 3115, deadlineSpeed: 0,    checkpointEvery: 6 },
  { name: "Продукт",    grade: "СЕНЬОР",  maxSpeed: 1.62, tint: "#1E1A2E", targetWidth: 3120, seed: 3310, deadlineSpeed: 0,    checkpointEvery: 6 },
  { name: "Платформа",  grade: "СЕНЬОР+", maxSpeed: 1.68, tint: "#201C34", targetWidth: 3200, seed: 4021, deadlineSpeed: 0,    checkpointEvery: 5 },
  { name: "Корпорация", grade: "ЛИД",     maxSpeed: 1.72, tint: "#221E38", targetWidth: 3280, seed: 5218, deadlineSpeed: 0.45, checkpointEvery: 5 },
  { name: "Своя фирма", grade: "ФАУНДЕР", maxSpeed: 1.76, tint: "#26203A", targetWidth: 3360, seed: 6133, deadlineSpeed: 0.52, checkpointEvery: 5 },
  { name: "Оффер",      grade: "ФИНАЛ",   maxSpeed: 1.80, tint: "#241A2A", targetWidth: 3440, seed: 4413, deadlineSpeed: 0.58, checkpointEvery: 5 },
];

export const LEVELS: LevelSpec[] = BLUEPRINTS.map(composeLevel);

export function levelAt(index: number): LevelSpec {
  const level = LEVELS[index];
  if (!level) throw new Error(`Нет уровня с индексом ${index}`);
  return level;
}
