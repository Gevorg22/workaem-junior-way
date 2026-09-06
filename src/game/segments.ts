import type { FoeKind } from "./types";

/**
 * Кусок карты. Уровень собирается из сегментов, а не пишется целиком:
 * длина становится дешёвой, а каждый кусок остаётся авторским и проходимым.
 *
 * Все координаты - относительно левого края сегмента.
 * Вход и выход каждого сегмента всегда на земле, поэтому их можно
 * ставить в любом порядке и стык гарантированно проходим.
 */
export interface SegmentFoe {
  kind: FoeKind;
  x: number;
  /** Для парящих (call) - высота. Для наземных не указывается. */
  y?: number;
  /** Диапазон патрулирования вокруг x. */
  span: number;
}

export interface Segment {
  id: string;
  width: number;
  /** С какого уровня сегмент может появляться: 0 - Джун, 3 - Лид. */
  minLevel: number;
  /** Куски пола: [x, ширина]. Разрывы между ними - ямы. */
  ground: Array<[number, number]>;
  /** Висящие платформы: [x, y, ширина]. */
  platforms?: Array<[number, number, number]>;
  foes?: SegmentFoe[];
  gems?: Array<[number, number]>;
  coffee?: Array<[number, number]>;
  /** Прод на дне ямы: [x, ширина]. */
  hazards?: Array<[number, number]>;
  /** Болото легаси: [x, ширина]. */
  swamps?: Array<[number, number]>;
  /**
   * Блоки: [x, y, вид, что внутри].
   * Ставим на высоте, куда достаёт прыжок снизу, но которую можно и обойти.
   */
  blocks?: Array<[number, number, "question" | "brick", ("offer" | "coffee")?]>;
}

export const GROUND_Y = 62;
export const HAZARD_Y = 71;
export const SWAMP_Y = 58;

/**
 * Максимальный прыжок джуна - около 50px по горизонтали.
 * Ямы держим до 30px, чтобы даже с плохого разбега перелетало.
 */
export const SEGMENTS: Segment[] = [
  {
    id: "breather",
    width: 84,
    minLevel: 0,
    ground: [[0, 84]],
    gems: [[38, 44]],
  },
  {
    id: "step-up",
    width: 96,
    minLevel: 0,
    ground: [[0, 96]],
    platforms: [[26, 46, 26], [62, 34, 24]],
    gems: [[36, 36], [72, 24]],
    blocks: [[8, 44, "question", "offer"]],
  },
  {
    id: "patrol",
    width: 104,
    minLevel: 0,
    ground: [[0, 104]],
    foes: [{ kind: "legacy", x: 52, span: 34 }],
    gems: [[30, 44], [76, 44]],
  },
  {
    id: "gap-single",
    width: 100,
    minLevel: 0,
    ground: [[0, 38], [64, 36]],
    platforms: [[42, 44, 20]],
    gems: [[50, 32]],
  },
  {
    id: "arch",
    width: 112,
    minLevel: 0,
    ground: [[0, 112]],
    platforms: [[22, 44, 22], [50, 34, 22], [80, 44, 22]],
    gems: [[30, 34], [58, 24], [88, 34]],
    blocks: [[8, 42, "brick"], [100, 42, "question", "coffee"]],
  },

  {
    id: "pit-prod",
    width: 116,
    minLevel: 1,
    ground: [[0, 42], [72, 44]],
    hazards: [[44, 26]],
    platforms: [[46, 42, 22]],
    gems: [[54, 30]],
  },
  {
    id: "bug-run",
    width: 120,
    minLevel: 1,
    ground: [[0, 120]],
    foes: [{ kind: "bug", x: 60, span: 46 }],
    gems: [[26, 44], [94, 44]],
    blocks: [[40, 42, "brick"], [52, 42, "question", "offer"], [64, 42, "brick"]],
  },
  {
    id: "coffee-straight",
    width: 108,
    minLevel: 1,
    ground: [[0, 108]],
    coffee: [[30, 44]],
    gems: [[64, 44], [88, 44]],
    blocks: [[62, 40, "question", "offer"]],
  },
  {
    id: "tower",
    width: 104,
    minLevel: 1,
    ground: [[0, 104]],
    platforms: [[20, 46, 22], [48, 36, 22], [74, 26, 24]],
    gems: [[28, 36], [56, 26], [82, 16]],
  },
  {
    id: "double-gap",
    width: 134,
    minLevel: 1,
    ground: [[0, 34], [58, 30], [104, 30]],
    hazards: [[36, 20], [90, 12]],
    platforms: [[36, 44, 20], [88, 42, 16]],
    gems: [[44, 32], [94, 30]],
  },

  {
    id: "swamp-walk",
    width: 118,
    minLevel: 2,
    ground: [[0, 118]],
    swamps: [[34, 56]],
    gems: [[46, 46], [76, 46]],
    foes: [{ kind: "legacy", x: 96, span: 16 }],
  },
  {
    id: "call-guard",
    width: 122,
    minLevel: 2,
    ground: [[0, 122]],
    foes: [{ kind: "call", x: 60, y: 44, span: 36 }],
    platforms: [[34, 40, 24], [70, 40, 24]],
    gems: [[42, 30], [78, 30]],
    blocks: [[14, 42, "brick"], [104, 42, "question", "coffee"]],
  },
  {
    id: "gauntlet",
    width: 140,
    minLevel: 2,
    ground: [[0, 140]],
    foes: [
      { kind: "legacy", x: 44, span: 26 },
      { kind: "bug", x: 100, span: 30 },
    ],
    platforms: [[62, 40, 24]],
    gems: [[70, 30], [124, 44]],
    blocks: [[24, 42, "question", "offer"], [36, 42, "brick"]],
  },
  {
    id: "leap-chain",
    width: 146,
    minLevel: 2,
    ground: [[0, 30], [116, 30]],
    hazards: [[32, 82]],
    platforms: [[34, 46, 18], [66, 38, 18], [96, 46, 18]],
    gems: [[40, 34], [72, 26], [102, 34]],
  },

  {
    id: "call-swarm",
    width: 152,
    minLevel: 3,
    ground: [[0, 152]],
    foes: [
      { kind: "call", x: 46, y: 42, span: 28 },
      { kind: "call", x: 110, y: 34, span: 30 },
    ],
    platforms: [[30, 46, 22], [78, 36, 24], [126, 46, 22]],
    gems: [[38, 36], [86, 26], [134, 36]],
  },
  {
    id: "meat-grinder",
    width: 158,
    minLevel: 3,
    ground: [[0, 46], [78, 34], [130, 28]],
    hazards: [[48, 28], [114, 14]],
    platforms: [[48, 44, 22], [110, 42, 18]],
    foes: [
      { kind: "bug", x: 96, span: 18 },
      { kind: "legacy", x: 20, span: 14 },
    ],
    gems: [[56, 32], [116, 30], [142, 44]],
  },
];

export const INTRO: Segment = {
  id: "intro",
  width: 74,
  minLevel: 0,
  ground: [[0, 74]],
  gems: [[52, 44]],
};

/**
 * Финишный отрезок с лестницей - деталь, по которой жанр узнают сразу.
 * Ступени ведут вверх, дверь стоит на земле сразу за ними.
 */
export const OUTRO: Segment = {
  id: "outro",
  width: 104,
  minLevel: 0,
  ground: [[0, 104]],
  platforms: [[20, 54, 8], [28, 46, 8], [36, 38, 8], [44, 30, 8]],
  gems: [[48, 20], [12, 44]],
};
