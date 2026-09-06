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

/** Растаптываются все, кроме "call" — некоторые вещи прыжком не решаются. */
export type FoeKind = "legacy" | "bug" | "call";

export interface FoeSpec {
  kind: FoeKind;
  /** Стартовая позиция по X. */
  x: number;
  /** Уровень пола, на котором стоит враг (для "call" — высота парения). */
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
  /** Цвет дальних холмов — задаёт настроение уровня. */
  tint: string;
  platforms: Rect[];
  foes: FoeSpec[];
  gems: Vec[];
  coffee: Vec[];
  /** Прод: коснулся — минус жизнь. */
  hazards: Rect[];
  /** Болото легаси: скорость и прыжок вдвое хуже. */
  swamps: Rect[];
  /** Скорость стены дедлайна в px/кадр. 0 — стены нет. */
  deadlineSpeed: number;
  door: Vec;
}

export type Phase = "play" | "clear" | "over" | "final";

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
  /** 0 — жив, дальше счётчик кадров анимации сплющивания. */
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
}

/** Пишется на сервер вместе со счётом — по нему отсекается накрутка. */
export interface RunStats {
  score: number;
  skills: number;
  levelsCleared: number;
  frames: number;
  jumps: number;
  stomps: number;
  deaths: number;
}
