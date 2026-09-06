import { GROUND_Y, HAZARD_Y, INTRO, OUTRO, SEGMENTS, SWAMP_Y } from "./segments";
import type { Segment } from "./segments";
import type { BlockSpec, FoeSpec, LevelSpec, Rect, Vec } from "./types";

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
  const pool = SEGMENTS.filter((s) => s.minLevel <= levelIndex);

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

    // Коммит ставим на стыке - там всегда земля, значит возрождение безопасно.
    const isInner = index > 0 && index < chain.length - 1;
    if (isInner && index % bp.checkpointEvery === 0) {
      checkpoints.push({ x: offset + 6, y: GROUND_Y });
    }

    offset += seg.width;
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
    blocks,
    deadlineSpeed: bp.deadlineSpeed,
    checkpoints,
    door: { x: width - 30, y: GROUND_Y },
  };
}

/** Уровень = грейд. Темп и набор препятствий растут вместе с карьерой. */
const BLUEPRINTS: Blueprint[] = [
  { name: "Галера",  grade: "ДЖУН",   maxSpeed: 1.35, tint: "#1A1728", targetWidth: 2560, seed: 1104, deadlineSpeed: 0,    checkpointEvery: 7 },
  { name: "Аутсорс", grade: "МИДЛ",   maxSpeed: 1.50, tint: "#1B2030", targetWidth: 2880, seed: 2207, deadlineSpeed: 0,    checkpointEvery: 6 },
  { name: "Продукт", grade: "СЕНЬОР", maxSpeed: 1.65, tint: "#1E1A2E", targetWidth: 3120, seed: 3310, deadlineSpeed: 0,    checkpointEvery: 6 },
  { name: "Оффер",   grade: "ЛИД",    maxSpeed: 1.80, tint: "#241A2A", targetWidth: 3280, seed: 4413, deadlineSpeed: 0.58, checkpointEvery: 5 },
];

export const LEVELS: LevelSpec[] = BLUEPRINTS.map(composeLevel);

export function levelAt(index: number): LevelSpec {
  const level = LEVELS[index];
  if (!level) throw new Error(`Нет уровня с индексом ${index}`);
  return level;
}
