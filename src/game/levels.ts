import {
  ARENA, FINALES, GROUND_Y, HAZARD_Y, INTRO, OUTRO, SEGMENTS, segmentDifficulty, SWAMP_Y, TEACHING,
} from "./segments";
import { FLYING_FOES, FOE_SIZE, PLAYER_H_BIG, PLAYER_W } from "./tuning";
import type { Segment } from "./segments";
import type {
  BlockSpec, Boss, FoeSpec, LevelSpec, MovingSpec, Pipe, Rect, RotorSpec, Theme, Vec,
} from "./types";

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
  theme?: Theme;
  /** Подпись на заставке: одной строкой, чем этот уровень отличается. */
  mood?: string;
  /**
   * Заданная вручную цепочка кусков вместо случайной сборки.
   * Нужна там, где важен порядок - например, в обучающем уровне.
   */
  handmade?: Segment[];
  grade: string;
  maxSpeed: number;
  tint: string;
  /** Целевая длина. Реальная получится чуть больше - сегменты не режутся. */
  targetWidth: number;
  seed: number;
  deadlineSpeed: number;
  /** Через сколько сегментов ставить коммит. */
  checkpointEvery: number;
  /** Финальный собес перед дверью. */
  boss?: boolean;
}

const GROUND_H = 15;
const PLATFORM_H = 4;

/** Босс на голову выше выросшего игрока - разница видна с первого кадра. */
const BOSS_W = 26;
const BOSS_H = 30;
const BOSS_HP = 3;

/** Запас над врагом, чтобы в прыжке успеть набрать скорость вниз и растоптать. */
const STOMP_ROOM = 4;
/** Короче этого тропа - не тропа: враг дёргается на месте. */
const MIN_PATROL = 8;

/**
 * Тропа наземного врага - только свободный пол.
 *
 * Куски карт рисуются по отдельности, и враг с размахом «сорок пикселей
 * в обе стороны» в собранном уровне то уходил под низкий ряд ящиков, то
 * проходил сквозь трубу, то шагал над ямой по воздуху. Под ящиками хуже
 * всего: между их низом и макушкой врага не помещается выросший игрок,
 * и растоптать его там нельзя физически - только пережидать.
 *
 * Поэтому тропа режется уже на собранной карте: из пола под врагом
 * вычитаются трубы и ящики на высоте его тела и всё, под чем над ним не
 * встанет большой игрок. Враг остаётся на свободном отрезке, где стоит,
 * а если стоит в запретном месте - переезжает на ближайший свободный.
 * Места нет вовсе - врага нет: лучше пустой кусок, чем нечестный.
 */
function clampPatrols(
  foes: FoeSpec[],
  platforms: Rect[],
  pipes: Pipe[],
  blocks: BlockSpec[],
): FoeSpec[] {
  const ground = platforms.filter((pl) => pl.h > 6);
  const beams = platforms.filter((pl) => pl.h <= 6);
  const boxes: Rect[] = blocks.map((b) => ({ x: b.x, y: b.y, w: 12, h: 12 }));
  const out: FoeSpec[] = [];

  for (const f of foes) {
    if (FLYING_FOES[f.kind]) {
      out.push(f);
      continue;
    }
    const size = FOE_SIZE[f.kind];
    const top = f.baseY - size.h;
    const middle = f.x + size.w / 2;
    const floor = ground.find((g) => middle >= g.x && middle <= g.x + g.w);
    if (!floor) continue;

    const walls = [...pipes, ...boxes].filter((z) => z.y < f.baseY && z.y + z.h > top);
    const roofs = [...boxes, ...beams].filter(
      (z) => z.y + z.h <= top && z.y + z.h > top - PLAYER_H_BIG - STOMP_ROOM,
    );

    // Отрезки, где может стоять левый край врага, не задевая запретного.
    let free: Array<[number, number]> = [[floor.x, floor.x + floor.w - size.w]];
    for (const z of [...walls, ...roofs]) {
      const banFrom = z.x - size.w;
      const banTo = z.x + z.w;
      free = free.flatMap(([lo, hi]): Array<[number, number]> => {
        if (banTo <= lo || banFrom >= hi) return [[lo, hi]];
        const parts: Array<[number, number]> = [];
        if (banFrom > lo) parts.push([lo, banFrom]);
        if (banTo < hi) parts.push([banTo, hi]);
        return parts;
      });
    }
    free = free.filter(([lo, hi]) => hi - lo >= MIN_PATROL);
    if (!free.length) continue;

    const away = ([lo, hi]: [number, number]): number =>
      f.x < lo ? lo - f.x : f.x > hi ? f.x - hi : 0;
    const [lo, hi] = free.reduce((best, cur) => (away(cur) < away(best) ? cur : best));
    const x = Math.max(lo, Math.min(hi, f.x));
    const span = (f.max - f.min) / 2;
    out.push({ ...f, x, min: Math.max(lo, x - span), max: Math.min(hi, x + span) });
  }
  return out;
}

function composeLevel(bp: Blueprint, levelIndex: number): LevelSpec {
  const pick = rng(bp.seed);
  // Новые виды кусков открываются каждые два уровня: игрок успевает
  // привыкнуть к одной новинке прежде, чем появится следующая.
  const tier = Math.floor(levelIndex / 2);
  const pool = SEGMENTS.filter((s) => s.minLevel <= tier);

  const chain: Segment[] = [INTRO];
  let width = INTRO.width;
  let lastId = INTRO.id;

  // Ручная сборка: порядок задан автором и не зависит от сида.
  if (bp.handmade) {
    for (const seg of bp.handmade) {
      chain.push(seg);
      width += seg.width;
    }
  }

  // Сложность внутри уровня растёт от начала к концу: первые куски дают
  // разбежаться, последние перед дверью - самые злые. Без этого уровень
  // ощущается ровным, и к середине становится скучно.
  const ranked = pool.map((s) => ({ seg: s, hard: segmentDifficulty(s) }));
  const easiest = Math.min(...ranked.map((r) => r.hard));
  const hardest = Math.max(...ranked.map((r) => r.hard));

  while (!bp.handmade && width < bp.targetWidth) {
    // Два подряд одинаковых куска читаются как копипаста - избегаем.
    const options = ranked.filter((r) => r.seg.id !== lastId);
    const progress = Math.min(1, width / bp.targetWidth);
    // Каждый четвёртый кусок - передышка. Монотонный подъём выматывает:
    // после трёх злых кусков нужен ровный, где можно просто пробежать
    // и подобрать кофе. Заодно это единственный способ для лёгких кусков
    // вроде кофейного попасть во вторую половину уровня.
    const breather = chain.length % 4 === 3;
    // К концу целимся не в самый тяжёлый кусок, а в 85% диапазона: иначе
    // финал упирается в одни и те же два-три самых злых куска.
    const want = breather
      ? easiest + (hardest - easiest) * 0.1
      : easiest + (hardest - easiest) * (0.1 + progress * 0.75);

    // Берём не строго ближайший, а случайный из трети ближайших: уровень
    // должен усложняться, но не превращаться в предсказуемую лестницу.
    const near = [...options].sort(
      (a, b) => Math.abs(a.hard - want) - Math.abs(b.hard - want),
    );
    const bandSize = Math.max(3, Math.ceil(near.length / 3));
    const band = near.slice(0, bandSize);
    const next = (band[Math.floor(pick() * band.length)] ?? near[0])?.seg ?? pool[0]!;

    chain.push(next);
    width += next.width;
    lastId = next.id;
  }
  // Концовка уровня нарисована руками. Ставится последней перед ареной
  // и выходом: это единственный кусок, который игрок увидит гарантированно,
  // и единственный, который он потом вспомнит.
  const finale = FINALES[levelIndex];
  if (finale) {
    chain.push(finale);
    width += finale.width;
  }

  // Арена встаёт перед выходом: босс закрывает дорогу к двери.
  let arenaStart = 0;
  if (bp.boss) {
    arenaStart = width;
    chain.push(ARENA);
    width += ARENA.width;
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
  const rotors: RotorSpec[] = [];
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
    for (const [x, y, beads, speed, phase] of seg.rotors ?? []) {
      rotors.push({ x: offset + x, y, beads, speed, phase: phase ?? 0 });
    }
    // Помеченные входом соединяются попарно внутри своего сегмента.
    const segPipes = seg.pipes ?? [];
    const warps: number[] = [];
    for (const spec of segPipes) {
      const [x, h] = spec;
      const mark = spec.length > 2 ? spec[2] : undefined;
      const pipe: Pipe = { x: offset + x, y: GROUND_Y - h, w: 18, h };
      if (mark === "bonus") pipe.bonus = true;
      pipes.push(pipe);
      if (mark === "warp") warps.push(pipes.length - 1);
    }
    for (let k = 0; k + 1 < warps.length; k += 2) {
      const a = pipes[warps[k]!]!;
      const b = pipes[warps[k + 1]!]!;
      a.link = b.x;
      b.link = a.x;
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

  // Арена приклеивается последней, уже после набора сегментов: босс должен
  // стоять между игроком и дверью, а не где-то в середине уровня.
  const boss: Boss | null = !bp.boss ? null : {
    // Координаты считаем от начала арены, а не от конца уровня: после арены
    // идёт ещё выходной кусок, и отсчёт от края уносил босса за неё.
    x: arenaStart + ARENA.width / 2,
    y: GROUND_Y - BOSS_H,
    w: BOSS_W,
    h: BOSS_H,
    baseY: GROUND_Y,
    min: arenaStart + 12,
    max: arenaStart + ARENA.width - 12,
    dir: -1,
    vy: 0,
    hp: BOSS_HP,
    hit: 0,
    recoil: 0,
    cool: 90,
    hop: 150,
    dying: 0,
  };

  return {
    name: bp.name,
    theme: bp.theme ?? "surface",
    ...(bp.mood ? { mood: bp.mood } : {}),
    grade: bp.grade,
    width,
    groundY: GROUND_Y,
    maxSpeed: bp.maxSpeed,
    tint: bp.tint,
    platforms,
    foes: clampPatrols(foes, platforms, pipes, keptBlocks),
    gems,
    coffee,
    hazards,
    swamps,
    blocks: keptBlocks,
    moving,
    pipes,
    rotors,
    deadlineSpeed: bp.deadlineSpeed,
    checkpoints,
    // Флагшток стоит за лестницей выходного куска: с верхней ступени до него
    // допрыгивают, а бегущий по земле цепляет у самого основания. Разница
    // между этими двумя способами и есть весь смысл финиша.
    pole: { x: width - 46, y: GROUND_Y },
    door: { x: width - 30, y: GROUND_Y },
    boss,
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
  // Первый уровень собран вручную: он учит, а случайная нарезка учить
  // не умеет - в ней механика может встретиться впервые сразу над пропастью.
  { name: "Стажировка", grade: "СТАЖЁР",  maxSpeed: 1.30, tint: "#1A1728", targetWidth: 0,    seed: 1104, deadlineSpeed: 0,    checkpointEvery: 4, handmade: TEACHING, mood: "первый день" },
  { name: "Галера",     grade: "ДЖУН",    maxSpeed: 1.35, tint: "#1A1728", targetWidth: 2560, seed: 1207, deadlineSpeed: 0,    checkpointEvery: 7 },
  { name: "Аутсорс",    grade: "ДЖУН+",   maxSpeed: 1.42, tint: "#1B2030", targetWidth: 2760, seed: 2207, deadlineSpeed: 0,    checkpointEvery: 7, mood: "чужие часовые пояса" },
  { name: "Серверная",  grade: "МИДЛ",    maxSpeed: 1.46, tint: "#0E1430", targetWidth: 2600, seed: 7712, deadlineSpeed: 0,    checkpointEvery: 6, theme: "underground", mood: "под землёй теснее" },
  { name: "Студия",     grade: "МИДЛ",    maxSpeed: 1.48, tint: "#1B2438", targetWidth: 2900, seed: 2416, deadlineSpeed: 0,    checkpointEvery: 6 },
  { name: "Стартап",    grade: "МИДЛ+",   maxSpeed: 1.55, tint: "#1E2438", targetWidth: 3000, seed: 3115, deadlineSpeed: 0,    checkpointEvery: 6, theme: "night", mood: "ночь перед релизом" },
  { name: "Продукт",    grade: "СЕНЬОР",  maxSpeed: 1.62, tint: "#1E1A2E", targetWidth: 3120, seed: 3310, deadlineSpeed: 0,    checkpointEvery: 6, theme: "prod", mood: "прод горит" },
  { name: "Легаси",     grade: "СЕНЬОР",  maxSpeed: 1.65, tint: "#0E1430", targetWidth: 2900, seed: 8821, deadlineSpeed: 0,    checkpointEvery: 5, theme: "underground", mood: "чужой код по колено" },
  { name: "Платформа",  grade: "СЕНЬОР+", maxSpeed: 1.68, tint: "#201C34", targetWidth: 3200, seed: 4021, deadlineSpeed: 0,    checkpointEvery: 5 },
  { name: "Корпорация", grade: "ЛИД",     maxSpeed: 1.72, tint: "#221E38", targetWidth: 3280, seed: 5218, deadlineSpeed: 0.45, checkpointEvery: 5, theme: "night", mood: "ночная смена · дедлайн идёт следом" },
  { name: "Своя фирма", grade: "ФАУНДЕР", maxSpeed: 1.76, tint: "#26203A", targetWidth: 3360, seed: 6133, deadlineSpeed: 0.52, checkpointEvery: 5, theme: "prod", mood: "всё держится на тебе" },
  { name: "Оффер",      grade: "ФИНАЛ",   maxSpeed: 1.80, tint: "#241A2A", targetWidth: 3140, seed: 4413, deadlineSpeed: 0.58, checkpointEvery: 5, boss: true, mood: "в конце - собес" },
];

export const LEVELS: LevelSpec[] = BLUEPRINTS.map(composeLevel);

/**
 * Бонусная комната за трубой.
 *
 * Отдельного состояния мира ради неё не заводится: комната - такой же
 * LevelSpec, просто маленький. Мир подменяется целиком, а прежний уровень
 * лежит в стопке и возвращается на выходе.
 *
 * Внутри нарочно нет ни врагов, ни ям: это награда за внимательность,
 * а не ещё одно испытание. Единственное давление - таймер.
 */
export const ROOM_GEMS = 24;
const ROOM_W = 264;

export function bonusRoom(seed: number, maxSpeed: number): LevelSpec {
  const pick = rng(seed);
  const gems: Vec[] = [];
  for (let i = 0; i < ROOM_GEMS; i++) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    // Ряды слегка пляшут от сида: комнаты не должны быть под копирку.
    const drift = Math.round(pick() * 4) - 2;
    gems.push({ x: 34 + col * 26, y: 40 + row * 16 + drift });
  }
  return {
    name: "Заначка",
    theme: "underground",
    grade: "БОНУС",
    width: ROOM_W,
    groundY: GROUND_Y,
    maxSpeed,
    tint: "#0E1430",
    platforms: [{ x: 0, y: GROUND_Y, w: ROOM_W, h: GROUND_H }],
    foes: [],
    gems,
    coffee: [{ x: 150, y: 74 }],
    hazards: [],
    swamps: [],
    blocks: [],
    moving: [],
    pipes: [{ x: ROOM_W - 34, y: GROUND_Y - 20, w: 18, h: 20, exit: true }],
    rotors: [],
    deadlineSpeed: 0,
    checkpoints: [],
    // Финиш комнате не нужен: выход только трубой или по таймеру. Уносим
    // и дверь, и шест за пределы карты, чтобы их нельзя было задеть.
    pole: { x: ROOM_W + 400, y: GROUND_Y },
    door: { x: ROOM_W + 420, y: GROUND_Y },
    boss: null,
  };
}

export function levelAt(index: number): LevelSpec {
  const level = LEVELS[index];
  if (!level) throw new Error(`Нет уровня с индексом ${index}`);
  return level;
}
