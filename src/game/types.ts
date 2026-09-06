export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Растаптываются все, кроме "call" - некоторые вещи прыжком не решаются. */
export type FoeKind = "legacy" | "bug" | "call";

export interface FoeSpec {
  kind: FoeKind;
  /** Стартовая позиция по X. */
  x: number;
  /** Уровень пола, на котором стоит враг (для "call" - высота парения). */
  baseY: number;
  /** Границы патрулирования. */
  min: number;
  max: number;
}

export interface LevelSpec {
  name: string;
  /** Грейд определяет темп: уровень = ступень карьеры. */
  grade: string;
  width: number;
  groundY: number;
  /** Предельная скорость игрока. Растёт с грейдом. */
  maxSpeed: number;
  /** Цвет дальних холмов - задаёт настроение уровня. */
  tint: string;
  platforms: Rect[];
  foes: FoeSpec[];
  gems: Vec[];
  coffee: Vec[];
  /** Прод: коснулся - минус жизнь. */
  hazards: Rect[];
  /** Болото легаси: скорость и прыжок вдвое хуже. */
  swamps: Rect[];
  blocks: BlockSpec[];
  /** Скорость стены дедлайна в px/кадр. 0 - стены нет. */
  deadlineSpeed: number;
  /** Коммиты: пройденный чекпоинт становится точкой возрождения. */
  checkpoints: Vec[];
  door: Vec;
}

export type Phase = "play" | "clear" | "over" | "final";

/**
 * Грейд игрока - это запас прочности, как размер в платформерах.
 * Урон откатывает на ступень вниз, а не убивает сразу.
 *
 * Хитбокс при этом НЕ меняется: крупный персонаж не пролез бы под
 * платформами на y=46 при земле на y=62 - там 16 пикселей, и игра
 * встала бы намертво. Растёт только вид.
 */
export type Grade = 0 | 1 | 2;

export const GRADE_NAMES = ["ДЖУН", "МИДЛ", "СЕНЬОР"] as const;

/** Что лежит в блоке с вопросом. */
export type BlockDrop = "offer" | "coffee";

export type BlockKind = "question" | "brick";

export interface BlockSpec {
  kind: BlockKind;
  x: number;
  y: number;
  drop?: BlockDrop;
}

export interface Block extends BlockSpec {
  /** Кадры анимации подскока после удара снизу. */
  bump: number;
  used: boolean;
  broken: boolean;
}

/** Предмет, выскочивший из блока. */
export interface Item {
  kind: BlockDrop;
  x: number;
  y: number;
  /** Кадры выезда наверх; после - лежит и ждёт. */
  rise: number;
  taken: boolean;
}

export interface Foe {
  kind: FoeKind;
  x: number;
  y: number;
  baseY: number;
  min: number;
  max: number;
  dir: 1 | -1;
  speed: number;
  w: number;
  h: number;
  /** 0 - жив, дальше счётчик кадров анимации сплющивания. */
  squashed: number;
}

export interface Pickup extends Vec {
  taken: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  face: 1 | -1;
  /** Кадры, в которые ещё засчитается прыжок после схода с платформы. */
  coyote: number;
  /** Кадры, в которые ещё сработает заранее нажатый прыжок. */
  buffer: number;
  /** Неуязвимость и мигание после урона. */
  hurt: number;
  /** Остаток ускорения от кофе. */
  boost: number;
  /** Текущая ступень: 0 джун, 1 мидл, 2 сеньор. */
  grade: Grade;
}

/** Пишется на сервер вместе со счётом - по нему отсекается накрутка. */
export interface RunStats {
  score: number;
  skills: number;
  levelsCleared: number;
  frames: number;
  jumps: number;
  stomps: number;
  deaths: number;
  /** Сколько блоков разбито - идёт в счёт и в отсечку накрутки. */
  blocks: number;
}
