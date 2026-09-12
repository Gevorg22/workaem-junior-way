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
  /** Полутона для градиентов: объём делается переходом, а не ступенькой. */
  skinLite: "#FFE0BC",
  skinShade: "#D9A578",
  hairLite: "#4A3A56",
  pantsLite: "#4E63A8",
  shoeLite: "#7A4A22",
  headphones: "#2C2C3A",
  /** Блик на наушниках: без него они сливались с волосами в тёмное пятно. */
  headphonesLite: "#6E7A96",

  legacy: "#8A6A4A",
  legacyLite: "#A88A66",
  legacyDark: "#5E4428",

  bug: "#C82828",
  bugLite: "#F05A4A",
  bugDark: "#8A1414",

  /** Техдолг - серый бетон с трещинами: его видно издалека и он тяжёлый. */
  debt: "#6E6A7E",
  debtLite: "#95909F",
  debtDark: "#413E50",
  debtCrack: "#2A2833",
  /** Рекрутёр - бирюзовый, чтобы отличался от всех наземных. */
  hr: "#2FA8A0",
  hrLite: "#5FD6CC",
  hrDark: "#1B6B66",

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
  // Кружка светлая почти до белого: на тёмных уровнях она обязана читаться
  // с одного взгляда, а кофейный цвет на ней - только полоска сверху.
  cupBody: "#F6EBD6",
  cupShade: "#D8C4A2",

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

  /**
   * Ротация алертов: раскалённый оранжевый. Он не спорит ни с одним врагом
   * по цвету - у легаси коричневый, у бага красный, у созвона фиолетовый, -
   * поэтому крутящуюся цепочку видно с первого кадра и ни с чем не спутать.
   */
  alert: "#FF6A2C",
  alertLite: "#FFC46A",
  alertCore: "#FFF2D0",
  rack: "#332E46",
  rackLite: "#4E4768",

  deadline: "#D0304A",
  door: "#2ECC71",
  doorFrame: "#5E3010",
  doorShut: "#8A6A4A",

  text: "#FFFFFF",
  textDark: "#1C2E66",
  dim: "#5F86B4",
} as const;

/**
 * Ночная смена. Небо уходит в глубокий синий, зелень гаснет, а вот окон
 * в башнях горит заметно больше, чем днём: ночью в офисе всегда кто-то
 * сидит, и это единственное светлое пятно кадра.
 */
export const NIGHT = {
  sky: "#131A34",
  skyHigh: "#1A2244",
  skyTop: "#0A0E22",
  skyHorizon: "#2E3260",
  cloud: "#2C3560",
  cloudShade: "#1E2648",

  hill: "#204A3E",
  hillDark: "#14302A",
  hillLite: "#2A6250",
  hillFar: "#242F52",
  hillFarDark: "#1A2342",
  bush: "#1A4034",

  tower: "#2C3766",
  towerDark: "#232C56",
  towerWindow: "#39406E",
  towerWindowLit: "#FFDC96",
  towerRoof: "#1A2248",
  haze: "rgba(30,44,96,.30)",

  ground: "#8A5424",
  groundLite: "#A87038",
  groundDark: "#5A3212",
  groundEdge: "#3A200A",
  brick: "#8A5424",
  brickLite: "#A87038",
  brickDark: "#5A3212",
  brickTop: "#A87038",
  brickEdge: "#5A3212",
} as const;

/**
 * Прод горит. Аварийное освещение заливает всё красным, зелень выцветает
 * до бурого, окна в башнях светятся тревожным оранжевым. Поверх кадра
 * идёт пульс мигалки - он же единственная анимация фона.
 */
export const PROD = {
  sky: "#3A1524",
  skyHigh: "#4A1C28",
  skyTop: "#220810",
  skyHorizon: "#7E2E22",
  cloud: "#6E2C2C",
  cloudShade: "#4E2020",

  hill: "#4A3220",
  hillDark: "#2E1E12",
  hillLite: "#66422A",
  hillFar: "#5C2C26",
  hillFarDark: "#42201C",
  bush: "#42281A",

  tower: "#5C2E36",
  towerDark: "#4A242C",
  towerWindow: "#703C42",
  towerWindowLit: "#FFA060",
  towerRoof: "#3A1C22",
  haze: "rgba(190,60,40,.20)",

  ground: "#A05A2A",
  groundLite: "#C07A3A",
  groundDark: "#6A3614",
  groundEdge: "#44200A",
  brick: "#A05A2A",
  brickLite: "#C07A3A",
  brickDark: "#6A3614",
  brickTop: "#C07A3A",
  brickEdge: "#6A3614",
} as const;

/**
 * Что меняется под землёй. Остальное - враги, предметы, блоки - остаётся
 * прежним: узнаваемость важнее полной перекраски, игрок должен понимать
 * встреченное с первого взгляда и там, и там.
 */
export const UNDERGROUND: Record<string, string> = {
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

/**
 * Замок мира: серый камень вместо кирпича и тёмный свод. Красное зарево
 * снизу дорисовывает рендер - здесь только цвета. Серый выбран потому,
 * что больше его нет нигде: увидел серые стены - значит, впереди собес.
 */
export const CASTLE: Record<string, string> = {
  sky: "#16121E",
  skyHigh: "#1E1828",
  ground: "#6A6478",
  groundLite: "#8C86A0",
  groundDark: "#433E52",
  groundEdge: "#2A2636",
  brick: "#6A6478",
  brickLite: "#8C86A0",
  brickDark: "#433E52",
  brickTop: "#8C86A0",
  brickEdge: "#433E52",
} as const;

/**
 * Небо: земля становится облачной, пейзаж внизу пропадает. Опоры светлые,
 * и тёмные враги на них видны лучше, чем на кирпиче.
 */
export const SKY: Record<string, string> = {
  skyTop: "#5AA0EC",
  skyHorizon: "#CFE6FD",
  cloud: "#FFFFFF",
  cloudShade: "#DCE9F9",
  ground: "#B9C9E4",
  groundLite: "#EEF4FC",
  groundDark: "#93A6C8",
  groundEdge: "#71829F",
  brick: "#B9C9E4",
  brickLite: "#EEF4FC",
  brickDark: "#93A6C8",
  brickTop: "#EEF4FC",
  brickEdge: "#71829F",
} as const;

/**
 * Подмены по темам в одном месте. Рендер спрашивает цвет через них и не
 * знает, сколько всего тем: добавить новую - значит дописать сюда словарь,
 * а не искать по файлу условия «если подземелье».
 */
export const THEME_COLORS: Record<string, Record<string, string>> = {
  underground: UNDERGROUND,
  night: NIGHT,
  prod: PROD,
  castle: CASTLE,
  sky: SKY,
};
