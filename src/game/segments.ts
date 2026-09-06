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
   *
   * Высота считается от физики, а не на глаз. Земля на y=62, игрок 15
   * высотой, значит макушка стоящего на y=47 - низ блока обязан быть выше,
   * иначе игрок упирается в блок вместо того, чтобы пройти под ним.
   * Прыжок поднимает на 43px, так что достать можно всё вплоть до y=4.
   * Рабочий диапазон y блока: от 4 до 35. Ставим 30-32.
   */
  blocks?: Array<[number, number, "question" | "brick", ("offer" | "tests" | "coffee" | "vacation")?]>;
  /** Движущиеся платформы: [x, y, ширина, ось, размах, скорость]. */
  moving?: Array<[number, number, number, "x" | "y", number, number]>;
  /** Трубы: [x, высота]. Стоят на земле, на них запрыгивают. */
  pipes?: Array<[number, number]>;
}

export const GROUND_Y = 90;
export const HAZARD_Y = 99;
export const SWAMP_Y = 86;

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
    gems: [[38, 67]],
  },
  {
    id: "step-up",
    width: 96,
    minLevel: 0,
    ground: [[0, 96]],
    platforms: [[26, 64, 26], [62, 54, 24]],
    gems: [[36, 58], [72, 45]],
    blocks: [[8, 45, "question", "offer"]],
  },
  {
    id: "patrol",
    width: 104,
    minLevel: 0,
    ground: [[0, 104]],
    foes: [{ kind: "legacy", x: 52, span: 34 }],
    gems: [[30, 67], [76, 67]],
  },
  {
    id: "gap-single",
    width: 100,
    minLevel: 0,
    ground: [[0, 38], [64, 36]],
    platforms: [[42, 64, 20]],
    gems: [[50, 54]],
  },
  {
    id: "arch",
    width: 112,
    minLevel: 0,
    ground: [[0, 112]],
    platforms: [[22, 64, 22], [50, 54, 22], [80, 64, 22]],
    gems: [[30, 56], [58, 45], [88, 56]],
    // Второй блок висит над платформой, поэтому поднят выше обычного:
    // между ним и платформой должен помещаться большой игрок, иначе
    // встать под блок и ударить его снизу физически негде.
    blocks: [[8, 45, "brick"], [96, 30, "question", "coffee"]],
  },

  {
    id: "pit-prod",
    width: 116,
    minLevel: 1,
    ground: [[0, 42], [72, 44]],
    hazards: [[44, 26]],
    platforms: [[46, 64, 22]],
    gems: [[54, 52]],
  },
  {
    id: "bug-run",
    width: 120,
    minLevel: 1,
    ground: [[0, 120]],
    foes: [{ kind: "bug", x: 60, span: 46 }],
    gems: [[26, 67], [94, 67]],
    blocks: [[40, 45, "brick"], [52, 45, "question", "offer"], [64, 45, "brick"]],
  },
  {
    id: "coffee-straight",
    width: 108,
    minLevel: 1,
    ground: [[0, 108]],
    coffee: [[30, 67]],
    gems: [[64, 67], [88, 67]],
    blocks: [[62, 45, "question", "offer"]],
  },
  {
    id: "tower",
    width: 104,
    minLevel: 1,
    ground: [[0, 104]],
    platforms: [[20, 64, 22], [48, 57, 22], [74, 46, 24]],
    gems: [[28, 58], [56, 48], [82, 36]],
  },
  {
    id: "double-gap",
    width: 134,
    minLevel: 1,
    ground: [[0, 34], [58, 30], [104, 30]],
    hazards: [[36, 20], [90, 12]],
    platforms: [[36, 64, 20], [88, 64, 16]],
    gems: [[44, 54], [94, 52]],
  },

  {
    id: "swamp-walk",
    width: 118,
    minLevel: 2,
    ground: [[0, 118]],
    swamps: [[34, 56]],
    gems: [[46, 69], [76, 69]],
    foes: [{ kind: "legacy", x: 96, span: 16 }],
  },
  {
    id: "call-guard",
    width: 122,
    minLevel: 2,
    ground: [[0, 122]],
    foes: [{ kind: "call", x: 60, y: 64, span: 36 }],
    platforms: [[34, 62, 24], [70, 62, 24]],
    gems: [[42, 52], [78, 52]],
    blocks: [[14, 45, "brick"], [104, 45, "question", "coffee"]],
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
    platforms: [[62, 62, 24]],
    gems: [[70, 52], [124, 67]],
    blocks: [[24, 45, "question", "offer"], [36, 45, "brick"]],
  },
  {
    id: "leap-chain",
    width: 146,
    minLevel: 2,
    ground: [[0, 30], [116, 30]],
    hazards: [[32, 82]],
    platforms: [[34, 64, 18], [66, 59, 18], [96, 64, 18]],
    gems: [[40, 56], [72, 48], [102, 56]],
  },

  {
    id: "call-swarm",
    width: 152,
    minLevel: 3,
    ground: [[0, 152]],
    foes: [
      { kind: "call", x: 46, y: 61, span: 28 },
      { kind: "call", x: 110, y: 49, span: 30 },
    ],
    platforms: [[30, 64, 22], [78, 57, 24], [126, 64, 22]],
    gems: [[38, 58], [86, 48], [134, 58]],
  },
  {
    id: "meat-grinder",
    width: 158,
    minLevel: 3,
    ground: [[0, 46], [78, 34], [130, 28]],
    hazards: [[48, 28], [114, 14]],
    platforms: [[48, 64, 22], [110, 64, 18]],
    foes: [
      { kind: "bug", x: 96, span: 18 },
      { kind: "legacy", x: 20, span: 14 },
    ],
    gems: [[56, 54], [116, 52], [142, 67]],
  },

  {
    id: "pipes",
    width: 126,
    minLevel: 1,
    ground: [[0, 126]],
    pipes: [[26, 14], [78, 20]],
    gems: [[36, 62], [88, 56]],
    foes: [{ kind: "legacy", x: 56, span: 14 }],
  },
  {
    id: "lift",
    width: 130,
    minLevel: 2,
    ground: [[0, 36], [96, 34]],
    hazards: [[38, 56]],
    moving: [[42, 67, 22, "x", 44, 0.55]],
    gems: [[52, 56], [78, 56]],
  },
  {
    id: "elevator",
    width: 118,
    minLevel: 2,
    ground: [[0, 118]],
    moving: [[40, 67, 20, "y", -22, 0.42]],
    platforms: [[80, 46, 24]],
    gems: [[46, 52], [88, 36]],
    pipes: [[100, 16]],
  },
  {
    id: "vacation-stash",
    width: 112,
    minLevel: 1,
    ground: [[0, 112]],
    blocks: [[50, 45, "question", "vacation"]],
    platforms: [[24, 62, 20], [76, 62, 20]],
    gems: [[30, 52], [82, 52]],
  },
  {
    id: "test-lab",
    width: 124,
    minLevel: 2,
    ground: [[0, 124]],
    blocks: [[34, 45, "brick"], [46, 45, "question", "tests"], [58, 45, "brick"]],
    foes: [{ kind: "bug", x: 92, span: 24 }],
    gems: [[24, 67], [110, 67]],
  },
];

export const INTRO: Segment = {
  id: "intro",
  width: 74,
  minLevel: 0,
  ground: [[0, 74]],
  gems: [[52, 67]],
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
  platforms: [[20, 78, 8], [28, 67, 8], [36, 59, 8], [44, 50, 8]],
  gems: [[48, 41], [12, 67]],
};
