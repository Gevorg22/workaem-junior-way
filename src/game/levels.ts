import {
  ARENA, FINALES, FOE_DANGER, GROUND_Y, HAZARD_Y, INTRO, OUTRO, SEGMENTS, segmentDifficulty,
  segmentWorld, SWAMP_Y, TEACHING,
} from "./segments";
import { FLYING_FOES, FOE_SIZE, PLAYER_H_BIG, PLAYER_W, TICKS_PER_SECOND } from "./tuning";
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

/**
 * Четыре мира по три уровня, как в Марио: открытый уровень, потом
 * подземелье или небо на лифтах, потом замок с мини-боссом.
 *
 * Раньше было двенадцать уровней подряд, и сложность в них скакала: на
 * шестом стояло 23 наземных врага - больше, чем на любом из следующих.
 * Теперь у сложности есть форма. Каждый мир приносит свою механику,
 * внутри мира сложность растёт к замку, а в начале следующего проседает:
 * игрок получает передышку и чувствует, что вырос, а не что устал.
 * Форму сторожит проверка сборки (scripts/check-curve.ts).
 *
 * Замок мира даёт грейд: сдал тестовое - джун, прошёл финальный собес -
 * лид и оффер.
 */
export interface WorldInfo {
  name: string;
  /** Грейд, который даёт замок мира. */
  grade: string;
  /** Что мир приносит нового - строка на заставке его первого уровня. */
  news: string;
  /** Кто ждёт в замке. */
  boss: string;
}

export const WORLDS: WorldInfo[] = [
  { name: "Джун", grade: "ДЖУН", news: "враги, ящики и ямы", boss: "Тестовое задание" },
  { name: "Мидл", grade: "МИДЛ", news: "трубы, лифты и созвоны", boss: "HR-скрининг" },
  { name: "Сеньор", grade: "СЕНЬОР", news: "ротации, болото и техдолг", boss: "Техсобес" },
  { name: "Лид", grade: "ЛИД", news: "стена дедлайна и рекрутёры", boss: "Финальный собес" },
];

export const STAGES_PER_WORLD = 3;

/** Номер уровня так, как его видит игрок: «2-3». */
export const levelCode = (index: number): string =>
  `${Math.floor(index / STAGES_PER_WORLD) + 1}-${(index % STAGES_PER_WORLD) + 1}`;

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
  maxSpeed: number;
  tint: string;
  /** Целевая длина. Реальная получится чуть больше - сегменты не режутся. */
  targetWidth: number;
  seed: number;
  deadlineSpeed: number;
  /** Через сколько сегментов ставить коммит. */
  checkpointEvery: number;
  /**
   * Сложность кусков в начале и в конце уровня - в тех же единицах, что
   * segmentDifficulty. Абсолютная, а не доля от набора: с долей уровень,
   * которому открыто больше кусков, сам собой выходил тяжелее, и кривая
   * сложности скакала вслед за тем, сколько кусков открыто.
   */
  from: number;
  to: number;
  /** Отбор кусков под характер уровня: небо собирается из ям и лифтов. */
  only?: (seg: Segment) => boolean;
}

const GROUND_H = 15;
const PLATFORM_H = 4;

/** Босс на голову выше выросшего игрока - разница видна с первого кадра. */
const BOSS_W = 26;
const BOSS_H = 30;

/**
 * Мини-боссы, по одному на мир. Отличаются числами, а не кодом: тестовое
 * задание держит два удара и не кидается вовсе, финальный собес держит
 * три, и вопросы от него летят чаще всех.
 */
const BOSSES: Array<Pick<Boss, "name" | "maxHp" | "pace" | "throwEvery" | "hopEvery">> = [
  { name: "ТЕСТОВОЕ", maxHp: 2, pace: 0.36, throwEvery: 0, hopEvery: 190 },
  { name: "HR", maxHp: 2, pace: 0.44, throwEvery: 150, hopEvery: 170 },
  { name: "ТЕХСОБЕС", maxHp: 3, pace: 0.46, throwEvery: 125, hopEvery: 160 },
  { name: "ФИНАЛ", maxHp: 3, pace: 0.5, throwEvery: 110, hopEvery: 150 },
];

/**
 * Норма времени: пробег карты на полной скорости с запасом на прыжки,
 * лифты и возвраты, плюс время на бой в замке. Округляется до пяти секунд:
 * «норма 1:05» читается с одного взгляда, «норма 1:03» - нет.
 */
const PAR_SLACK = 2.1;
const BOSS_SECONDS = 20;

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
  const world = Math.floor(levelIndex / STAGES_PER_WORLD);
  const stage = levelIndex % STAGES_PER_WORLD;
  const castle = stage === STAGES_PER_WORLD - 1;
  // В набор идут куски своего мира и прежних: механика, которой положено
  // появиться позже, раньше времени не встретится.
  const pool = SEGMENTS.filter((s) => segmentWorld(s) <= world && (!bp.only || bp.only(s)));
  const ranked = pool.map((s) => ({
    seg: s,
    hard: segmentDifficulty(s),
    fresh: segmentWorld(s) === world,
  }));

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
  while (!bp.handmade && width < bp.targetWidth) {
    // Два подряд одинаковых куска читаются как копипаста - избегаем.
    const options = ranked.filter((r) => r.seg.id !== lastId);
    const progress = Math.min(1, width / bp.targetWidth);
    // Каждый четвёртый кусок - передышка. Монотонный подъём выматывает:
    // после трёх злых кусков нужен ровный, где можно просто пробежать
    // и подобрать кофе.
    const breather = chain.length % 4 === 3;
    const want = breather ? bp.from * 0.5 : bp.from + (bp.to - bp.from) * progress;
    // Каждый третий - из того, что мир принёс нового. Без этого новинка
    // тонет в общем наборе: во втором мире кусков с трубами четыре из
    // тридцати, и сид мог пронести уровень вовсе без труб.
    const fresh = options.filter((r) => r.fresh);
    const showcase = !breather && !bp.only && world > 0 && chain.length % 3 === 1 && fresh.length > 0;
    const source = showcase ? fresh : options;

    // Берём не строго ближайший, а случайный из четверти ближайших:
    // уровень должен усложняться, но не превращаться в предсказуемую лестницу.
    const near = [...source].sort(
      (a, b) => Math.abs(a.hard - want) - Math.abs(b.hard - want),
    );
    const bandSize = Math.max(2, Math.ceil(near.length / 4));
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
  if (castle) {
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
      // Невидимый ящик - это ящик с вопросом, которого просто не видно.
      // Внутри по умолчанию жизнь: ради неё секреты и ищут.
      if (kind === "hidden") {
        blocks.push({ kind: "question", x: offset + x, y, drop: drop ?? "life", hidden: true });
      } else {
        blocks.push(drop ? { kind, x: offset + x, y, drop } : { kind, x: offset + x, y });
      }
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
  const kind = castle ? BOSSES[world] : undefined;
  const boss: Boss | null = !kind ? null : {
    ...kind,
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
    hp: kind.maxHp,
    hit: 0,
    recoil: 0,
    cool: 90,
    hop: kind.hopEvery,
    dying: 0,
  };

  const run = (width - 56) / bp.maxSpeed / TICKS_PER_SECOND;
  const par = Math.ceil((run * PAR_SLACK + (castle ? BOSS_SECONDS : 0)) / 5) * 5;

  return {
    name: bp.name,
    world,
    stage,
    par,
    theme: bp.theme ?? "surface",
    ...(bp.mood ? { mood: bp.mood } : {}),
    grade: WORLDS[world]?.grade ?? "ДЖУН",
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

/**
 * Небо: куски с ямами и лифтами, а передышками - ровные облака без единой
 * опасности. Без них небо выходило тяжелее собственного замка: одни ямы
 * подряд, и отдышаться негде.
 */
const aloft = (seg: Segment): boolean =>
  seg.ground.length > 1 || (seg.moving?.length ?? 0) > 0 || segmentDifficulty(seg) === 0;

/**
 * Скорость растёт ровно от уровня к уровню, а сложность - волной: from и to
 * внутри мира поднимаются к замку, а на первом уровне следующего мира
 * опускаются. Новая механика встречает игрока на спокойной карте.
 */
const BLUEPRINTS: Blueprint[] = [
  // Мир 1 · Джун: враги, ящики, ямы.
  // Первый уровень собран вручную: он учит, а случайная нарезка учить
  // не умеет - в ней механика может встретиться впервые сразу над пропастью.
  { name: "Стажировка", maxSpeed: 1.30, tint: "#1A1728", targetWidth: 0, seed: 1104, deadlineSpeed: 0, checkpointEvery: 4, from: 0, to: 0, handmade: TEACHING, mood: "первый день" },
  { name: "Галера", theme: "underground", maxSpeed: 1.34, tint: "#0E1430", targetWidth: 2300, seed: 1207, deadlineSpeed: 0, checkpointEvery: 7, from: 0, to: 5, mood: "в трюме гребут все" },
  { name: "Тестовое", theme: "castle", maxSpeed: 1.38, tint: "#1A1624", targetWidth: 2200, seed: 2207, deadlineSpeed: 0, checkpointEvery: 6, from: 1, to: 7, mood: "сделать за выходные" },

  // Мир 2 · Мидл: трубы, лифты, созвоны.
  { name: "Аутсорс", maxSpeed: 1.42, tint: "#1B2030", targetWidth: 2400, seed: 7712, deadlineSpeed: 0, checkpointEvery: 7, from: 1, to: 7, mood: "чужие часовые пояса" },
  { name: "Облако", theme: "sky", maxSpeed: 1.46, tint: "#1B2438", targetWidth: 2300, seed: 2416, deadlineSpeed: 0, checkpointEvery: 6, from: 1, to: 7, only: aloft, mood: "лифты над пропастью" },
  { name: "HR-скрининг", theme: "castle", maxSpeed: 1.50, tint: "#1A1624", targetWidth: 2500, seed: 3115, deadlineSpeed: 0, checkpointEvery: 6, from: 4, to: 12, mood: "расскажите о себе" },

  // Мир 3 · Сеньор: ротации, болото, техдолг.
  { name: "Стартап", theme: "night", maxSpeed: 1.54, tint: "#1E2438", targetWidth: 2600, seed: 3310, deadlineSpeed: 0, checkpointEvery: 6, from: 2, to: 10, mood: "ночь перед релизом" },
  { name: "Легаси", theme: "underground", maxSpeed: 1.58, tint: "#0E1430", targetWidth: 2700, seed: 8821, deadlineSpeed: 0, checkpointEvery: 5, from: 4, to: 13, mood: "чужой код по колено" },
  { name: "Техсобес", theme: "castle", maxSpeed: 1.62, tint: "#1A1624", targetWidth: 2800, seed: 4021, deadlineSpeed: 0, checkpointEvery: 5, from: 5, to: 14, mood: "а теперь на доске" },

  // Мир 4 · Лид: стена дедлайна и рекрутёры.
  { name: "Корпорация", theme: "prod", maxSpeed: 1.68, tint: "#221E38", targetWidth: 2800, seed: 5218, deadlineSpeed: 0.45, checkpointEvery: 5, from: 3, to: 12, mood: "прод горит · дедлайн идёт следом" },
  { name: "Хайлоад", theme: "sky", maxSpeed: 1.74, tint: "#26203A", targetWidth: 2700, seed: 6133, deadlineSpeed: 0.5, checkpointEvery: 5, from: 3, to: 11, only: aloft, mood: "нагрузка растёт, опоры качаются" },
  { name: "Оффер", theme: "castle", maxSpeed: 1.80, tint: "#241A2A", targetWidth: 2900, seed: 4413, deadlineSpeed: 0.55, checkpointEvery: 5, from: 6, to: 16, mood: "последний рубеж" },
];

export const LEVELS: LevelSpec[] = BLUEPRINTS.map(composeLevel);

/**
 * Сколько опасного на собранной карте. Те же веса, что и у сложности
 * кусков, но считается по готовому уровню - вместе с концовкой, боссом
 * и стеной дедлайна. На этом числе держится проверка кривой сложности:
 * внутри мира оно растёт, в начале следующего проседает.
 */
export function levelDanger(lv: LevelSpec): number {
  let d = 0;
  const floor = lv.platforms.filter((p) => p.h > 6).sort((a, b) => a.x - b.x);
  for (let i = 1; i < floor.length; i++) {
    const prev = floor[i - 1]!;
    const gap = floor[i]!.x - (prev.x + prev.w);
    if (gap > 0) d += gap / 8;
  }
  for (const f of lv.foes) d += FOE_DANGER[f.kind];
  for (const h of lv.hazards) d += 1.5 + h.w / 40;
  for (const s of lv.swamps) d += 2 + s.w / 50;
  d += lv.moving.length * 2 + lv.rotors.length * 2.8;
  if (lv.boss) d += lv.boss.maxHp * 4 + (lv.boss.throwEvery > 0 ? 6 : 0);
  // Стена дедлайна давит весь уровень: чем быстрее и длиннее, тем больше.
  d += (lv.deadlineSpeed * lv.width) / 60;
  return d;
}

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
    // Норма и место в мире комнате не нужны: время идёт по уровню снаружи.
    world: 0,
    stage: 0,
    par: 0,
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
