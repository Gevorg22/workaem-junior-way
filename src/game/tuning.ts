/** Все числа баланса в одном месте — крутить их придётся часто. */
export const TUNING = {
  /** Логическое разрешение. Реальный canvas = это × SCALE. */
  viewW: 220,
  viewH: 77,
  scale: 4,

  accel: 0.55,
  friction: 0.8,
  gravity: 0.3,
  maxFall: 6.5,
  jumpImpulse: -5.1,
  /** Отпустил прыжок — скорость подъёма срезается до этого. Даёт прыжок по длительности. */
  jumpCut: -1.6,
  /** Кадры прощения после схода с платформы. Без этого игра ощущается нечестной. */
  coyoteFrames: 7,
  /** Кадры, в которые засчитается прыжок, нажатый до приземления. */
  bufferFrames: 7,

  stompBounce: -3.6,
  /** Насколько глубоко надо быть выше врага, чтобы это считалось растаптыванием. */
  stompTolerance: 0.75,
  stompMinFallSpeed: 0.9,

  hurtFrames: 64,
  knockbackX: 2.6,
  knockbackY: -2.4,

  coffeeFrames: 480,
  coffeeMultiplier: 1.55,
  swampMultiplier: 0.5,
  swampJumpMultiplier: 0.82,

  cameraEase: 0.11,
  shakeFrames: 8,

  startLives: 3,
  scoreGem: 100,
  scoreCoffee: 50,
  scoreStomp: 200,
  scoreLevelClear: 500,
  scoreLifeBonus: 250,
} as const;
