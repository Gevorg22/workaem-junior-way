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
  cloud: "#FFFFFF",
  cloudShade: "#D8E6F8",

  hill: "#4E9E42",
  hillDark: "#2F7A30",
  bush: "#3E8C38",

  // Дальние офисные башни - айтишная замена горам на горизонте.
  tower: "#7FA8D8",
  towerDark: "#5F86B4",
  towerWindow: "#C8E0F8",

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
