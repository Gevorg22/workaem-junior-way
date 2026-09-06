/**
 * Дневная палитра классического платформера: синее небо, зелёные холмы,
 * земля кирпичом. Это жанровая условность, а не чей-то конкретный стиль -
 * так выглядят десятки игр, и именно она даёт мгновенное узнавание.
 *
 * Предметный слой при этом свой: легаси, созвоны, прод, скиллы, офферы.
 */
export const PAL = {
  sky: "#6BA8F5",
  skyHigh: "#8FC0FA",
  /** Верх неба глубже, у горизонта светлее - так небо перестаёт быть плашкой. */
  skyTop: "#3D7FD4",
  skyHorizon: "#A9D2FB",
  cloud: "#FFFFFF",
  cloudShade: "#D8E6F8",

  hill: "#4E9E42",
  hillDark: "#2F7A30",
  /** Освещённая сторона холма и дальняя гряда, выцветшая расстоянием. */
  hillLite: "#6FBA57",
  hillFar: "#6E9E7A",
  hillFarDark: "#5A8768",
  bush: "#3E8C38",

  // Дальние офисные башни - айтишная замена горам на горизонте.
  tower: "#8FB6DE",
  towerDark: "#7CA4CE",
  towerWindow: "#B4D2EE",
  /** Горящее окно: в офисной башне всегда кто-то сидит допоздна. */
  towerWindowLit: "#EFD9A0",
  towerRoof: "#6E96C0",
  /** Воздушная перспектива: всё дальше башен уводится в лёгкую дымку. */
  haze: "rgba(158,200,242,.22)",

  ground: "#C4762E",
  groundLite: "#E09A48",
  groundDark: "#8A4A18",
  groundEdge: "#5E3010",

  brick: "#C86428",
  brickLite: "#E08A46",
  brickDark: "#8A3E12",
  brickTop: "#E09A48",
  brickEdge: "#8A4A18",
  brickLine: "#8A3E12",

  block: "#E8A81C",
  blockLite: "#FFD24A",
  blockDark: "#A87008",
  blockUsed: "#9A7038",
  blockUsedDark: "#6E4E24",

  skin: "#FFC8A0",
  hair: "#3A2A22",
  shirt: "#E03C2C",
  shirtLite: "#FF6A52",
  shirtDark: "#9E2418",
  pants: "#2C4A9E",
  pantsDark: "#1C2E66",
  shoe: "#5A3418",
  laptop: "#D8D8E8",
  eye: "#2B2438",
  headphones: "#2C2C3A",
  /** Блик на наушниках: без него они сливались с волосами в тёмное пятно. */
  headphonesLite: "#6E7A96",

  legacy: "#8A6A4A",
  legacyLite: "#A88A66",
  legacyDark: "#5E4428",

  bug: "#C82828",
  bugLite: "#F05A4A",
  bugDark: "#8A1414",

  call: "#8A5AD8",
  callLite: "#B48AF0",
  callDark: "#5E3A9E",

  gem: "#FFD24A",
  gemLite: "#FFF0A8",
  gemDark: "#C89A10",

  prod: "#E03C2C",
  prodDark: "#8A1414",

  swamp: "#4E7A3A",
  swampLite: "#6E9E52",

  coffee: "#8A5A2E",
  coffeeLite: "#B88450",
  coffeeDark: "#5A3418",

  offer: "#2ECC71",
  offerLite: "#7FE8A8",
  offerDark: "#1A8A4A",

  pipe: "#2E9E6A",
  pipeLite: "#5ED89E",
  pipeDark: "#186E46",
  pipeMouth: "#0A2C1E",

  // Финальный собес: строгий костюм и холодный экран созвона.
  boss: "#2B3350",
  bossLite: "#414C74",
  bossDark: "#171C2E",
  bossScreen: "#0E3A46",
  bossGlow: "#63E6C6",
  bossTie: "#D0304A",
  bossHurt: "#FFE9A8",
  pipeRim: "#14563A",

  lift: "#B8862E",
  liftLite: "#E0B45A",
  liftDark: "#7A5416",

  test: "#4FD8E8",
  testLite: "#A8F0F8",
  testDark: "#1E8A9A",

  vacation: "#FF9E3C",
  vacationLite: "#FFD08A",
  vacationDark: "#C46A10",

  deadline: "#D0304A",
  door: "#2ECC71",
  doorFrame: "#5E3010",
  doorShut: "#8A6A4A",

  text: "#FFFFFF",
  textDark: "#1C2E66",
  dim: "#5F86B4",
} as const;

/**
 * Что меняется под землёй. Остальное - враги, предметы, блоки - остаётся
 * прежним: узнаваемость важнее полной перекраски, игрок должен понимать
 * встреченное с первого взгляда и там, и там.
 */
export const UNDERGROUND = {
  sky: "#0E1430",
  skyHigh: "#161E42",
  ground: "#3A6E8C",
  groundLite: "#5A9EBE",
  groundDark: "#22485E",
  groundEdge: "#16303E",
  brick: "#3A6E8C",
  brickLite: "#5A9EBE",
  brickDark: "#22485E",
  brickTop: "#5A9EBE",
  brickEdge: "#22485E",
} as const;
