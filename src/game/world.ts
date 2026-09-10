import { bonusRoom, levelAt, LEVELS } from "./levels";
import {
  COIN_HITS, COMBO_SCORE, FLYING_FOES as FLYING, FOE_SIZE, INTRO_FRAMES, MAX_CARRY_LIVES,
  PLAYER_H_BIG, PLAYER_H_SMALL, PLAYER_W, POLE_BONUS_MAX, POLE_H, ROTOR_STEP, SKILLS_PER_LIFE,
  TICKS_PER_SECOND, TUNING as T, VIEW,
} from "./tuning";

// Размеры врагов живут в tuning: они нужны и сборке уровней, а та
// импортируется миром - обратный импорт замкнул бы круг.
export { FOE_SIZE };
import { PAL } from "./palette";
import type {
  Block, Boss, Foe, Grade, Item, LevelSpec, MovingPlatform, Particle, Phase, Pickup, Pipe, Player,
  Popup, Projectile, Rect, Rotor, RunStats,
} from "./types";

/** Сколько раз надо прыгнуть сверху. Техдолг с одного наскока не убирается. */
const FOE_HP: Record<Foe["kind"], number> = {
  legacy: 1, bug: 1, call: 1, debt: 2, hr: 1,
};

/** Джун маленький, с первого оффера становится большим. */
export const heightFor = (grade: Grade): number =>
  grade === 0 ? PLAYER_H_SMALL : PLAYER_H_BIG;

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Твёрдый ли ящик: разбитый и ещё не найденный невидимый - нет. */
const solidBlock = (b: Block): boolean => !b.broken && !(b.hidden && !b.used);

/**
 * Звёзды уровня, битами. Битами, а не числом: в памяти игры звёзды копятся
 * по одной за разные попытки, и важно, какая именно уже взята.
 */
export const STARS = { clear: 1, gems: 2, time: 4 } as const;

export const countStars = (mask: number): number =>
  (mask & STARS.clear ? 1 : 0) + (mask & STARS.gems ? 1 : 0) + (mask & STARS.time ? 1 : 0);

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Бросок теста - доступен только сеньору. */
  throw?: boolean;
  /**
   * Спуск в трубу - только в кадр нажатия. По удержанию игрок вылезал
   * из парной трубы, тут же проваливался обратно и катался бесконечно.
   */
  downPressed?: boolean;
  /** true только в кадр нажатия - из него набивается буфер прыжка. */
  jumpPressed: boolean;
}

/**
 * Итог одного уровня. Очки - только заработанные здесь: бонус за жизни в
 * них не входит, потому что зависит от того, сколько жизней игрок принёс
 * с собой, а не от того, как он сыграл на этом уровне.
 */
export interface LevelResult {
  /** Номер уровня с единицы - как его видит игрок. */
  level: number;
  score: number;
  frames: number;
  deaths: number;
  skills: number;
  /** Звёзды этой попытки, битами STARS. */
  stars: number;
}

export type WorldEvent =
  | "stomp" | "hurt" | "pickup" | "coffee"
  | "checkpoint" | "clear" | "death" | "final" | "jump" | "pipe" | "bossHit" | "bossDown"
  | "bump" | "break" | "gradeUp" | "gradeDown" | "throw" | "vacation" | "life" | "pole"
  | "levelDone" | "mapBack";

/** Кадры на спуск в трубу и на подъём из парной. */
const WARP_DIVE = 22;

/** Сколько кадров живёт бонусная комната. Пятнадцать секунд на всё. */
const ROOM_FRAMES = 15 * TICKS_PER_SECOND;

/**
 * Что подменяется на время бонусной комнаты. Комната - обычный уровень,
 * поэтому прежний просто откладывается целиком и возвращается на выходе:
 * второго состояния мира заводить не пришлось.
 */
interface Stash {
  level: LevelSpec;
  camera: number;
  gems: Pickup[];
  coffee: Pickup[];
  blocks: Block[];
  items: Item[];
  shots: Projectile[];
  moving: MovingPlatform[];
  foes: Foe[];
  rotors: Rotor[];
  deadlineX: number | null;
  /** Труба, из которой пришли: в неё же и выйдем. */
  pipeX: number;
}

/**
 * Финиш по кадрам: спуск по флагштоку, проход до двери, уход внутрь.
 * Разбито на три отрезка, потому что каждый читается отдельно: сначала
 * видно, как высоко зацепился, потом - что дошёл, потом - что забрал оффер.
 */
const SLIDE_FRAMES = 34;
const WALK_FRAMES = 44;
const ENTER_FRAMES = 30;

export class World {
  /**
   * Проезд по трубе. Пока он идёт, физика и враги отключены:
   * игрок просто едет вниз, телепортируется и выезжает вверх.
   */
  warp: { t: number; from: Pipe; to: Pipe } | null = null;
  /**
   * Копия босса на текущий забег. Спека уровня общая на всё приложение -
   * если бить босса прямо в ней, после смерти игрока он останется убитым.
   */
  boss: Boss | null = null;
  /** Вопросы, которыми кидается босс. */
  questions: Projectile[] = [];
  /** С какого кадра идёт текущий уровень - отсюда считается бонус за скорость. */
  private levelStartFrame = 0;
  /** Счёт и скиллы на входе в уровень: разница даёт результат уровня. */
  private levelScoreStart = 0;
  private levelSkillsStart = 0;
  /** Смерти на текущем уровне. */
  private levelDeaths = 0;
  /**
   * Результат последнего пройденного уровня.
   *
   * Уровни - главная таблица игры, и не случайно: карты процедурные, но
   * детерминированные, у каждого уровня фиксированный сид. Значит «Стартап»
   * у всех одинаковый, и сравнивать результаты на нём честно - в отличие
   * от общего счёта за забег, который зависит от того, сколько игрок успел
   * набегать до смерти.
   */
  lastLevel: LevelResult | null = null;
  /** Место в таблице уровня - приходит с сервера и показывается на карточке. */
  levelPlace: string | null = null;
  /** Один уровень с карты мира: пройден - обратно на карту, а не дальше. */
  single = false;
  /** Норма времени текущего уровня, секунды. Заначка её не меняет. */
  par = 0;
  levelIndex = 0;
  level: LevelSpec = levelAt(0);
  phase: Phase = "play";

  player!: Player;
  camera = 0;
  gems: Pickup[] = [];
  coffee: Pickup[] = [];
  blocks: Block[] = [];
  items: Item[] = [];
  shots: Projectile[] = [];
  moving: MovingPlatform[] = [];
  foes: Foe[] = [];
  particles: Particle[] = [];
  /** Всплывающие «+400» и «1UP» над местом события. */
  popups: Popup[] = [];
  rotors: Rotor[] = [];
  /**
   * Сколько врагов растоптано подряд, ни разу не коснувшись земли.
   * Обнуляется приземлением, уроном и смертью.
   */
  combo = 0;
  /** Кадры заставки перед уровнем. */
  introT = 0;
  /** Идущая анимация финиша: кадр, высота захвата, начисленный бонус. */
  finish: { t: number; y: number; bonus: number } | null = null;
  /** Остаток времени в бонусной комнате. Ноль - комнаты нет. */
  roomTimer = 0;
  /** Отложенный на время комнаты уровень. */
  private stash: Stash | null = null;
  /**
   * Трубы, чья комната уже посещена. Одна комната на трубу за забег:
   * иначе в неё ходят по кругу и набивают жизни бесконечно.
   */
  usedRooms = new Set<number>();
  /** Позиция стены дедлайна, null - стены на уровне нет. */
  deadlineX: number | null = null;
  /** X последнего пройденного коммита - сюда возрождаемся. */
  checkpointX = 10;

  lives: number = T.startLives;
  score = 0;
  skills = 0;
  shake = 0;
  ticks = 0;
  /** На каком скилле дадут следующую жизнь. */
  private nextLife = SKILLS_PER_LIFE;

  stats: RunStats = {
    score: 0, skills: 0, levelsCleared: 0, frames: 0,
    jumps: 0, stomps: 0, deaths: 0, blocks: 0, tested: 0, pipes: 0,
    maxCombo: 0, startLevel: 0,
  };

  private listeners = new Set<(e: WorldEvent) => void>();

  constructor() {
    this.newRun();
  }

  on(fn: (e: WorldEvent) => void): void {
    this.listeners.add(fn);
  }

  private emit(e: WorldEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /**
   * Новый забег. Продолжения с места выгорания больше нет: потерял все
   * жизни - начинай с первого уровня. Взамен каждый пройденный уровень
   * восполняет жизни, так что забег обрывает не усталость, накопленная за
   * десять уровней, а один уровень, который не дался. Жёстче и честнее.
   *
   * single - один уровень с карты мира, для звёзд и таблицы уровня.
   * Такой забег в общий зачёт не идёт; startLevel показывает, какой уровень.
   */
  newRun(from = 0, single = false): void {
    this.single = single;
    // Грейд обнуляем явно. loadLevel переносит его из текущего игрока, а
    // respawn при последней жизни выходит по return ДО пересборки игрока -
    // поэтому после «Выгорания» новый забег начинался сеньором, ростом 22
    // и с кнопкой броска, хотя надпись обещала начать заново.
    if (this.player) {
      this.player.grade = 0;
      this.player.h = PLAYER_H_SMALL;
    }
    this.lives = T.startLives;
    this.score = 0;
    this.skills = 0;
    this.ticks = 0;
    this.shake = 0;
    this.stats = {
      score: 0, skills: 0, levelsCleared: 0, frames: 0,
      jumps: 0, stomps: 0, deaths: 0, blocks: 0, tested: 0, pipes: 0,
      maxCombo: 0, startLevel: from,
    };
    this.nextLife = SKILLS_PER_LIFE;
    this.combo = 0;
    this.popups = [];
    this.loadLevel(from);
  }

  loadLevel(index: number): void {
    this.levelIndex = index;
    this.loadSpec(levelAt(index));
  }

  private loadSpec(lv: LevelSpec): void {
    this.level = lv;

    const grade = (this.player?.grade ?? 0) as Grade;
    const height = heightFor(grade);
    this.player = {
      x: 10, y: lv.groundY - height - 1, w: PLAYER_W, h: height,
      vx: 0, vy: 0, onGround: false, face: 1,
      coyote: 0, buffer: 0, hurt: 0, boost: 0, vacation: 0, cooldown: 0,
      // Грейд переносится на следующий уровень: карьера не обнуляется
      // при переходе, только при смерти.
      grade,
    };
    this.camera = 0;
    this.gems = lv.gems.map((g) => ({ x: g.x, y: g.y, taken: false }));
    this.coffee = lv.coffee.map((c) => ({ x: c.x, y: c.y, taken: false }));
    this.foes = lv.foes.map((f) => {
      const size = FOE_SIZE[f.kind];
      const flies = FLYING[f.kind];
      return {
        kind: f.kind,
        x: f.x,
        y: flies ? f.baseY : f.baseY - size.h,
        baseY: flies ? f.baseY : f.baseY - size.h,
        min: f.min, max: f.max, dir: 1, squashed: 0,
        hp: FOE_HP[f.kind],
        speed: size.speed, w: size.w, h: size.h,
      };
    });
    this.blocks = lv.blocks.map((b) => ({
      ...b, bump: 0, used: false, broken: false, coins: b.kind === "coins" ? COIN_HITS : 0,
    }));
    this.par = lv.par;
    this.items = [];
    this.shots = [];
    this.boss = lv.boss ? { ...lv.boss } : null;
    this.questions = [];
    this.levelStartFrame = this.stats.frames;
    this.levelScoreStart = this.score;
    this.levelSkillsStart = this.skills;
    this.levelDeaths = 0;
    this.levelPlace = null;
    this.moving = lv.moving.map((m) => {
      // Размах может быть отрицательным - лифт, который едет вверх.
      // Границы обязаны быть упорядочены: иначе разворот срабатывает
      // в обе стороны каждый кадр, платформа дрожит на месте, а стоящего
      // на ней игрока трясёт вместе с ней - со стороны это выглядит
      // как невесомость.
      const base = m.axis === "x" ? m.x : m.y;
      const from = Math.min(base, base + m.span);
      const to = Math.max(base, base + m.span);
      return {
        x: m.x, y: m.y, w: m.w, h: 4,
        from, to,
        axis: m.axis, speed: m.speed,
        dir: (m.span >= 0 ? 1 : -1) as 1 | -1,
      };
    });
    this.particles = [];
    this.popups = [];
    this.rotors = lv.rotors.map((r) => ({ ...r, angle: r.phase }));
    this.combo = 0;
    this.finish = null;
    this.checkpointX = 10;
    this.stash = null;
    this.roomTimer = 0;
    this.usedRooms = new Set();
    this.deadlineX = lv.deadlineSpeed > 0 ? -46 : null;
    // Заставка перед стартом: имя уровня, грейд, жизни. Пауза на вдох -
    // без неё уровни сливаются в один длинный забег без начала и конца.
    this.introT = INTRO_FRAMES;
    this.phase = "intro";
  }

  /** Переход по экранам между уровнями и после финала. */
  advance(): void {
    if (this.phase === "intro") {
      this.introT = 0;
      this.phase = "play";
      return;
    }
    if (this.phase === "clear") {
      // С карты играют один уровень: пройден - обратно на карту.
      if (this.single) {
        this.emit("mapBack");
        return;
      }
      if (this.levelIndex + 1 < LEVELS.length) {
        // Пройденный уровень восполняет жизни. Лишние, заработанные сверху,
        // переносятся, но не больше MAX_CARRY_LIVES.
        this.lives = Math.max(T.startLives, Math.min(this.lives, MAX_CARRY_LIVES));
        this.loadLevel(this.levelIndex + 1);
      } else {
        this.phase = "final";
        this.emit("final");
      }
    } else if (this.phase === "final" || this.phase === "over") {
      this.newRun();
    }
  }

  /**
   * Кирпич ломает только сеньор - у джуна на это не хватает грейда.
   * Так рост даёт не просто запас прочности, а новые возможности.
   */
  private hitBlock(b: Block): void {
    if (b.bump > 0) return;
    b.bump = 8;

    // Кирпич-заначка: по скиллу за удар, пока не опустеет. Проверяется
    // раньше обычного кирпича - иначе сеньор разбивал бы её с первого удара.
    if (b.kind === "coins" && !b.used) {
      b.coins -= 1;
      if (b.coins <= 0) b.used = true;
      this.gainSkill(b.x + 2, b.y - 8);
      this.popup(b.x + 6, b.y - 4, `+${T.scoreGem}`, PAL.gemLite);
      return;
    }

    // Невидимый ящик устроен как обычный с вопросом: удар снизу делает
    // его used, и с этого кадра он виден и твёрд.
    if (b.kind === "question" && !b.used) {
      b.used = true;
      // Стартуем внутри блока: за 12 кадров предмет выезжает ровно на его крышу.
      const drop = b.drop ?? "coffee";
      // Ходячие выезжают у правого края крышки и уходят влево - навстречу
      // игроку. Так предмет виден сразу и сам идёт в руки; уходя вправо, он
      // убегал бы в ту же сторону, куда бежит игрок, и догнать его можно было
      // только ускорившись, чего на бегу к следующей яме никто не делает.
      const walks = drop === "offer" || drop === "vacation" || drop === "life";
      this.items.push({
        kind: drop, x: b.x + 2, y: b.y,
        vx: walks ? -0.6 : 0, vy: 0,
        rise: 12, taken: false,
      });
      this.emit("bump");
      return;
    }

    if (b.kind === "brick" && this.player.grade === 2) {
      b.broken = true;
      this.stats.blocks += 1;
      this.score += 50;
      this.hud();
      for (const dx of [2, 9]) this.burst(b.x + dx, b.y + 4, PAL.brick, 5);
      this.emit("break");
      return;
    }

    this.emit("bump");
  }

  private hud(): void {}

  /**
   * Смена грейда меняет и рост. Ноги при этом должны остаться на месте,
   * иначе выросший игрок проваливается в пол или подпрыгивает.
   */
  /**
   * Смена грейда меняет рост. Ноги остаются на месте, а голова уходит вверх -
   * и упирается в то, чего раньше не касалась. Чаще всего это тот самый ящик,
   * из которого только что выпал оффер: игрок вырастал прямо в него и кадр
   * висел внутри стены. Поэтому после роста голову надо освободить.
   */
  private setGrade(grade: Grade): void {
    const p = this.player;
    const feet = p.y + p.h;
    const grew = heightFor(grade) > p.h;
    p.grade = grade;
    p.h = heightFor(grade);
    p.y = feet - p.h;
    if (!grew) return;

    const lv = this.level;
    const solids: Rect[] = [
      ...lv.platforms,
      ...lv.pipes,
      ...this.moving,
      ...this.blocks.filter(solidBlock).map((b) => ({ x: b.x, y: b.y, w: 12, h: 12 })),
    ];
    for (let pass = 0; pass < 3; pass++) {
      const hit = solids.find((o) => overlap(p, o));
      if (!hit) break;
      // Опускаемся из-под потолка: место снизу есть - там игрок только что был.
      p.y = hit.y + hit.h;
      if (p.vy < 0) p.vy = 0;
    }
  }

  /** Надпись над местом события: живёт секунду и всплывает вверх. */
  private popup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, color, life: 52 });
  }

  private gainLife(x: number, y: number): void {
    this.lives += 1;
    this.popup(x, y, "1UP", PAL.offer);
    this.emit("life");
  }

  /**
   * Скилл в копилку: очки, искры, а каждая сотня - жизнь. Отсюда берут и
   * скиллы с карты, и выбитые из кирпича-заначки.
   */
  private gainSkill(x: number, y: number): void {
    this.skills += 1;
    this.score += T.scoreGem;
    this.burst(x + 4, y + 4, PAL.gem, 7);
    this.emit("pickup");
    // Каждая сотня скиллов - жизнь: собирать становится выгодно,
    // а не просто красиво.
    if (this.skills >= this.nextLife) {
      this.nextLife += SKILLS_PER_LIFE;
      this.gainLife(x, y - 6);
    }
  }

  /**
   * Награда за растоптанного. Цепочка без касания земли платит по нарастающей,
   * а после шестого подряд - жизнью: за красивую игру платят попыткой, и
   * именно это заставляет прыгать по головам, а не просто идти вправо.
   */
  private stompReward(x: number, y: number): void {
    this.combo += 1;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
    if (this.combo > COMBO_SCORE.length) {
      this.gainLife(x, y);
      return;
    }
    const gain = COMBO_SCORE[this.combo - 1] ?? T.scoreStomp;
    this.score += gain;
    this.popup(x, y, `+${gain}`, this.combo > 1 ? PAL.gemLite : PAL.text);
  }

  private burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -Math.random() * 2.2 - 0.4,
        life: 22 + Math.random() * 10,
        color,
      });
    }
  }

  /**
   * Мини-босс замка. Он не патрулирует отрезок, как рядовые враги, а идёт
   * на игрока: иначе бой решался бы стоянием в углу арены. Скорость растёт
   * с каждым попаданием - конец боя самый злой.
   */
  private updateBoss(): void {
    const b = this.boss;
    if (!b) return;
    const p = this.player;

    if (b.dying > 0) {
      b.dying -= 1;
      b.y += 0.7;
      if (b.dying % 6 === 0) this.burst(b.x + b.w / 2, b.y + b.h / 2, PAL.bug, 6);
      if (b.dying === 0) {
        this.boss = null;
        this.questions = [];
        this.score += T.scoreBoss;
        this.shake = T.shakeFrames;
        // Босс к этому моменту уже уехал вниз за кромку кадра, и салют
        // рождался под экраном - победу было не видно. Держим его в кадре.
        this.burst(b.x + b.w / 2, Math.min(b.y + b.h / 2, VIEW.h - 24), PAL.gemLite, 26);
      }
      return;
    }

    if (b.hit > 0) b.hit -= 1;

    // Шаг в сторону игрока, но не за пределы арены.
    const lost = b.maxHp - b.hp;
    const speed = b.pace + lost * 0.2;
    b.dir = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
    // После своего удара босс отходит. Иначе он вплотную упирается в игрока,
    // и урон идёт по кругу: отбрасывания не хватает, чтобы разорвать контакт.
    const step = b.recoil > 0 ? -speed * 1.4 : speed;
    if (b.recoil > 0) b.recoil -= 1;
    b.x = Math.max(b.min, Math.min(b.max - b.w, b.x + b.dir * step));

    // Прыжок: приземление трясёт экран, чтобы удар читался.
    b.hop -= 1;
    const onFloor = b.y + b.h >= b.baseY - 0.01;
    if (b.hop <= 0 && onFloor) {
      b.vy = -3.9;
      b.hop = b.hopEvery - lost * 30;
    }
    b.vy = Math.min(b.vy + T.gravity, T.maxFall);
    b.y += b.vy;
    if (b.y + b.h >= b.baseY) {
      // Трясти экран, когда босс за три экрана отсюда, - значит пугать
      // игрока невидимкой. Трясём, только если он в кадре.
      const onScreen = b.x + b.w > this.camera && b.x < this.camera + VIEW.w;
      if (b.vy > 1 && onScreen) this.shake = 6;
      b.y = b.baseY - b.h;
      b.vy = 0;
    }

    // Вопрос летит по дуге в сторону игрока - от него можно увернуться
    // прыжком или присесть за блоком. Тестовое задание не кидается
    // вовсе: оно просто есть и мешает.
    b.cool -= 1;
    if (b.throwEvery > 0 && b.cool <= 0) {
      b.cool = b.throwEvery - lost * 22;
      const toward = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
      this.questions.push({
        x: b.x + (toward > 0 ? b.w : -5),
        y: b.y + 10,
        vx: toward * 1.7,
        vy: -1.6,
        life: 220,
      });
    }

    // Брошенный сеньором тест бьёт босса наравне со стомпом.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i]!;
      if (!overlap({ x: shot.x, y: shot.y, w: 4, h: 4 }, b)) continue;
      this.shots.splice(i, 1);
      this.hurtBoss(b);
      if (!this.boss) return;
    }

    if (p.hurt === 0 && overlap(p, b)) {
      const fromAbove = p.vy > T.stompMinFallSpeed && p.y + p.h < b.y + b.h * T.stompTolerance;
      if (fromAbove || p.vacation > 0) {
        p.vy = T.stompBounce;
        p.buffer = 0;
        this.hurtBoss(b);
      } else if (b.hit === 0) {
        this.damage(b.x + b.w / 2);
        b.recoil = 54;
      }
    }
  }

  /** Одно попадание по боссу: минус жизнь, мигание, а на последнем - конец. */
  private hurtBoss(b: Boss): void {
    if (b.hit > 0 || b.dying > 0) return;
    b.hp -= 1;
    b.hit = 44;
    this.shake = T.shakeFrames;
    this.stats.stomps += 1;
    this.burst(b.x + b.w / 2, b.y + 4, PAL.gemLite, 12);
    if (b.hp > 0) {
      this.score += T.scoreStomp;
      this.emit("bossHit");
    } else {
      b.dying = 72;
      this.questions = [];
      this.emit("bossDown");
    }
  }

  /** Вопросы босса. Летят по дуге и гаснут о землю или край экрана. */
  private updateQuestions(): void {
    const p = this.player;
    for (let i = this.questions.length - 1; i >= 0; i--) {
      const q = this.questions[i]!;
      q.x += q.vx;
      q.vy = Math.min(q.vy + 0.1, 3);
      q.y += q.vy;
      q.life -= 1;
      if (p.hurt === 0 && p.vacation === 0 && overlap(p, { x: q.x, y: q.y, w: 5, h: 6 })) {
        this.questions.splice(i, 1);
        this.damage(q.x);
        continue;
      }
      const gone =
        q.life <= 0 ||
        q.y > this.level.groundY ||
        q.x < this.camera - 20 ||
        q.x > this.camera + VIEW.w + 20;
      if (gone) this.questions.splice(i, 1);
    }
  }


  /**
   * Урон сначала откатывает грейд и только на джуне отнимает жизнь.
   * Так собранный оффер - это реальный запас прочности, а не просто очки.
   */
  private damage(fromX: number): void {
    const p = this.player;
    if (p.hurt > 0 || p.vacation > 0) return;

    p.hurt = T.hurtFrames;
    this.combo = 0;
    p.vx = p.x < fromX ? -T.knockbackX : T.knockbackX;
    p.vy = T.knockbackY;
    this.shake = T.shakeFrames;

    if (p.grade > 0) {
      this.setGrade((p.grade - 1) as Grade);
      this.burst(p.x + 4, p.y + 6, PAL.gem, 10);
      this.emit("gradeDown");
      return;
    }

    this.lives -= 1;
    this.burst(p.x + 4, p.y + 6, PAL.shirt, 8);
    this.emit("hurt");
    if (this.lives <= 0) this.phase = "over";
  }

  private respawn(): void {
    // Умереть в комнате нечем - там ни врагов, ни ям, - но если игра
    // когда-нибудь дойдёт сюда, мир обязан вернуться на место: иначе
    // возрождение случится в заначке, из которой уже не выйти.
    if (this.stash) this.leaveRoom();
    this.lives -= 1;
    this.stats.deaths += 1;
    this.levelDeaths += 1;
    this.combo = 0;
    this.emit("death");
    if (this.lives <= 0) {
      this.phase = "over";
      return;
    }
    const lv = this.level;
    // Возрождение на последнем коммите, а не в начале карты:
    // на длинной карте откат в начало обесценивает всё пройденное.
    const x = this.checkpointX;
    // Смерть обнуляет карьеру: начинаем с джуна.
    this.player = {
      ...this.player,
      x, y: lv.groundY - PLAYER_H_SMALL - 1,
      h: PLAYER_H_SMALL, vx: 0, vy: 0, hurt: 40, boost: 0, grade: 0,
      vacation: 0, cooldown: 0,
    };
    this.shots = [];
    this.warp = null;
    // Вопросы босса гаснут вместе с попыткой: иначе возродившийся игрок
    // получает в лицо снаряд, выпущенный ещё до его смерти.
    this.questions = [];
    // Босс отступает к середине арены и добирает половину отнятого:
    // прогресс не сгорает целиком, но и с одного хп добить не выйдет.
    if (this.boss && this.boss.dying === 0) {
      const b = this.boss;
      b.x = (b.min + b.max) / 2 - b.w / 2;
      b.y = b.baseY - b.h;
      b.vy = 0;
      b.hit = 0;
      b.recoil = 0;
      b.hp = Math.min(b.maxHp, b.hp + 1);
    }
    this.camera = Math.max(0, Math.min(lv.width - VIEW.w, x - VIEW.w / 2));
    if (this.deadlineX !== null) this.deadlineX = x - 56;
  }

  /** Игрок сейчас в бонусной комнате. */
  get inRoom(): boolean {
    return this.stash !== null;
  }

  /**
   * Спуск в бонусную комнату. Мир подменяется целиком: прежний уровень
   * откладывается со всем набранным - разбитыми ящиками, собранными
   * скиллами, положением врагов, - и возвращается ровно таким же.
   */
  private enterRoom(pipe: Pipe): void {
    const lv = this.level;
    this.stash = {
      level: lv,
      camera: this.camera,
      gems: this.gems,
      coffee: this.coffee,
      blocks: this.blocks,
      items: this.items,
      shots: this.shots,
      moving: this.moving,
      foes: this.foes,
      rotors: this.rotors,
      deadlineX: this.deadlineX,
      pipeX: pipe.x,
    };

    const room = bonusRoom(Math.round(pipe.x), lv.maxSpeed);
    this.level = room;
    this.gems = room.gems.map((g) => ({ x: g.x, y: g.y, taken: false }));
    this.coffee = room.coffee.map((c) => ({ x: c.x, y: c.y, taken: false }));
    this.blocks = [];
    this.items = [];
    this.shots = [];
    this.moving = [];
    this.foes = [];
    this.rotors = [];
    this.particles = [];
    // Стена дедлайна снаружи и остаётся: в комнате она не идёт, но и
    // не отматывается назад - время в заначке всё равно чего-то стоит.
    this.deadlineX = null;
    this.roomTimer = ROOM_FRAMES;

    const p = this.player;
    p.x = 14;
    p.y = room.groundY - p.h - 1;
    p.vx = 0;
    p.vy = 0;
    p.buffer = 0;
    this.camera = 0;
    this.combo = 0;
    this.stats.pipes += 1;
    this.emit("pipe");
  }

  /**
   * Возврат из комнаты: наружу, на крышку той же трубы. Труба помечается
   * использованной - её жерло гаснет, и второй раз спуститься нельзя.
   */
  private leaveRoom(): void {
    const st = this.stash;
    if (!st) return;

    this.level = st.level;
    this.camera = st.camera;
    this.gems = st.gems;
    this.coffee = st.coffee;
    this.blocks = st.blocks;
    this.items = st.items;
    this.shots = st.shots;
    this.moving = st.moving;
    this.foes = st.foes;
    this.rotors = st.rotors;
    this.deadlineX = st.deadlineX;
    this.stash = null;
    this.roomTimer = 0;
    this.usedRooms.add(st.pipeX);
    this.particles = [];

    const pipe = st.level.pipes.find((o) => o.x === st.pipeX);
    const p = this.player;
    if (pipe) {
      p.x = pipe.x + pipe.w / 2 - p.w / 2;
      p.y = pipe.y - p.h;
    }
    p.vx = 0;
    p.vy = 0;
    p.buffer = 0;
    p.onGround = true;
    p.coyote = T.coyoteFrames;
    this.emit("pipe");
  }

  /**
   * Захват флагштока. Чем выше зацепился, тем больше бонус - за верхушку
   * дают втрое против земли. Ровно ради этой разницы лестницу перед
   * финишем и рисуют: она даёт способ прыгнуть выше, а не просто дойти.
   */
  private grabPole(): void {
    const p = this.player;
    const lv = this.level;
    const feet = Math.min(p.y + p.h, lv.pole.y);
    const height = Math.max(0, Math.min(1, (lv.pole.y - feet) / POLE_H));
    // Округляем до сотен: «+2300» читается с одного взгляда, «+2287» - нет.
    const bonus = Math.max(100, Math.round((height * POLE_BONUS_MAX) / 100) * 100);

    this.score += bonus;
    this.popup(lv.pole.x, feet - 10, `+${bonus}`, PAL.gemLite);
    this.finish = { t: 0, y: feet, bonus };
    this.phase = "signing";
    this.combo = 0;

    p.vx = 0;
    p.vy = 0;
    p.face = 1;
    p.x = lv.pole.x - p.w + 2;
    p.y = feet - p.h;
    this.emit("pole");
  }

  /**
   * Анимация финиша: съехал по флагштоку, дошёл до двери, ушёл внутрь.
   * Управление на это время отбирается - уровень уже пройден, и человеку
   * дают посмотреть на результат, а не дёргать кнопки.
   */
  private updateSigning(): void {
    const f = this.finish;
    const lv = this.level;
    const p = this.player;
    if (!f) {
      this.phase = "play";
      return;
    }
    f.t += 1;

    if (f.t <= SLIDE_FRAMES) {
      // Спуск: и игрок, и флаг едут вниз одним движением.
      const k = f.t / SLIDE_FRAMES;
      p.y = f.y - p.h + (lv.pole.y - f.y) * k;
    } else if (f.t <= SLIDE_FRAMES + WALK_FRAMES) {
      p.y = lv.pole.y - p.h;
      p.x = Math.min(lv.door.x + 4, p.x + 1.2);
    } else if (f.t === SLIDE_FRAMES + WALK_FRAMES + 1) {
      this.burst(lv.door.x + 9, lv.door.y - 20, PAL.door, 14);
    }

    if (f.t >= SLIDE_FRAMES + WALK_FRAMES + ENTER_FRAMES) this.clearLevel();

    const target = p.x - VIEW.w / 2 + p.w / 2;
    this.camera += (target - this.camera) * T.cameraEase;
    this.camera = Math.max(0, Math.min(lv.width - VIEW.w, this.camera));
  }

  /** Уровень засчитан: очки за финиш, за жизни, за оставшееся время и звёзды. */
  private clearLevel(): void {
    const livesBonus = this.lives * T.scoreLifeBonus;
    this.score += T.scoreLevelClear + livesBonus;
    // Бонус за скорость: сколько секунд осталось от нормы уровня.
    // Не уложился - просто ноль, штрафа за медленную игру нет.
    const frames = this.stats.frames - this.levelStartFrame;
    const spent = frames / TICKS_PER_SECOND;
    const left = Math.max(0, this.par - spent);
    this.score += Math.round(left * T.scorePerSecondLeft);
    this.stats.levelsCleared += 1;
    this.stats.score = this.score;
    this.stats.skills = this.skills;

    // Звёзды: пройти, собрать все скиллы карты, уложиться в норму. Скиллы
    // из заначек и кирпичей не в счёт - звезда за карту, а не за секреты.
    const stars =
      STARS.clear |
      (this.gems.every((g) => g.taken) ? STARS.gems : 0) |
      (spent <= this.par ? STARS.time : 0);

    // Результат уровня: всё, что заработано здесь, минус бонус за жизни.
    this.lastLevel = {
      level: this.levelIndex + 1,
      score: Math.max(0, this.score - this.levelScoreStart - livesBonus),
      frames,
      deaths: this.levelDeaths,
      skills: this.skills - this.levelSkillsStart,
      stars,
    };

    this.finish = null;
    this.phase = "clear";
    this.emit("levelDone");
    this.emit("clear");
  }

  /**
   * Где сейчас флаг на шесте. Едет вниз всегда с верхушки, как в классике:
   * высота захвата решает размер бонуса, а не длину спуска.
   */
  get flagY(): number {
    const lv = this.level;
    const top = lv.pole.y - POLE_H + 6;
    const bottom = lv.pole.y - 7;
    if (!this.finish) return this.phase === "play" || this.phase === "intro" ? top : bottom;
    const k = Math.min(1, this.finish.t / SLIDE_FRAMES);
    return top + (bottom - top) * k;
  }

  /** Игрок уже шагнул в дверь - рисовать его больше не надо. */
  get atDoor(): boolean {
    return this.finish !== null && this.finish.t > SLIDE_FRAMES + WALK_FRAMES;
  }

  /**
   * Сколько секунд осталось от нормы на уровень. Показывается в шапке:
   * невидимая механика на поведение не влияет, а видимый отсчёт заставляет
   * бежать, а не обшаривать каждый угол.
   */
  get secondsLeft(): number {
    const spent = (this.stats.frames - this.levelStartFrame) / TICKS_PER_SECOND;
    return Math.max(0, Math.ceil(this.par - spent));
  }

  update(input: InputState): void {
    this.ticks += 1;
    if (this.shake > 0) this.shake -= 1;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]!;
      q.x += q.vx;
      q.y += q.vy;
      q.vy += 0.16;
      q.life -= 1;
      if (q.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const q = this.popups[i]!;
      q.y -= 0.32;
      q.life -= 1;
      if (q.life <= 0) this.popups.splice(i, 1);
    }

    // Заставка уровня. Идёт своим счётчиком, а не по нажатию: игра
    // не должна требовать действия от того, кто ещё читает название.
    if (this.phase === "intro") {
      this.introT -= 1;
      if (this.introT <= 0) this.phase = "play";
      return;
    }

    if (this.phase === "signing") {
      this.updateSigning();
      return;
    }

    if (this.phase !== "play") return;
    this.stats.frames += 1;

    // Время в заначке кончилось - выносит наружу само.
    if (this.stash) {
      this.roomTimer -= 1;
      if (this.roomTimer <= 0) {
        this.leaveRoom();
        return;
      }
    }

    const p = this.player;
    const lv = this.level;

    // Счётчики тикают ДО развилки с трубой. Раньше и кадры проезда, и кадр
    // входа уходили по return мимо них: ныряя в трубу раз в 45 кадров, можно
    // было держать отпуск, кофе и неуязвимость вечно, а стена дедлайна вообще
    // переставала двигаться - мир замирал, пока игрок катался.
    if (p.coyote > 0) p.coyote -= 1;
    if (p.buffer > 0) p.buffer -= 1;
    if (p.hurt > 0) p.hurt -= 1;
    if (p.boost > 0) p.boost -= 1;
    if (p.vacation > 0) p.vacation -= 1;
    if (p.cooldown > 0) p.cooldown -= 1;

    // Стена дедлайна идёт своим ходом и во время проезда: иначе труба
    // превращалась в кнопку «поставить игру на паузу».
    if (this.warp && this.deadlineX !== null) {
      this.deadlineX += lv.deadlineSpeed;
      if (p.x < this.deadlineX + 8) { this.respawn(); return; }
    }

    // Проезд по трубе идёт мимо всей остальной физики.
    if (this.warp) {
      const wp = this.warp;
      wp.t += 1;
      p.vx = 0;
      p.vy = 0;
      if (wp.t <= WARP_DIVE) {
        // Ныряем: сползаем внутрь входной трубы.
        p.x = wp.from.x + wp.from.w / 2 - p.w / 2;
        p.y = wp.from.y - p.h + (p.h + 3) * (wp.t / WARP_DIVE);
      } else {
        // Выезжаем из парной. Первый кадр после ныряния - уже там.
        const k = Math.min(1, (wp.t - WARP_DIVE) / WARP_DIVE);
        p.x = wp.to.x + wp.to.w / 2 - p.w / 2;
        p.y = wp.to.y + 3 - (p.h + 3) * k;
        if (k >= 1) {
          p.y = wp.to.y - p.h;
          p.onGround = true;
          p.coyote = T.coyoteFrames;
          this.warp = null;
        }
      }
      const camTarget = p.x - VIEW.w / 2 + p.w / 2;
      this.camera += (camTarget - this.camera) * T.cameraEase;
      this.camera = Math.max(0, Math.min(lv.width - VIEW.w, this.camera));
      return;
    }

    // Бонусная комната: та же кнопка вниз, но труба помечена входом.
    // Одна комната на трубу за забег - использованная гаснет и молчит.
    if (input.downPressed && p.onGround) {
      const standing = (pipe: Pipe): boolean =>
        Math.abs(p.y + p.h - pipe.y) <= 2 &&
        p.x + p.w / 2 > pipe.x + 2 &&
        p.x + p.w / 2 < pipe.x + pipe.w - 2;

      if (this.stash) {
        const exit = lv.pipes.find((pipe) => pipe.exit && standing(pipe));
        if (exit) {
          this.leaveRoom();
          return;
        }
      } else {
        const into = lv.pipes.find(
          (pipe) => pipe.bonus && !this.usedRooms.has(pipe.x) && standing(pipe),
        );
        if (into) {
          this.enterRoom(into);
          return;
        }
      }
    }

    // Вход в трубу: стоим сверху на парной трубе и жмём вниз.
    if (input.downPressed && p.onGround) {
      const from = lv.pipes.find(
        (pipe) =>
          pipe.link !== undefined &&
          Math.abs(p.y + p.h - pipe.y) <= 2 &&
          p.x + p.w / 2 > pipe.x + 2 &&
          p.x + p.w / 2 < pipe.x + pipe.w - 2,
      );
      const to = from && lv.pipes.find((pipe) => pipe.x === from.link);
      if (from && to) {
        this.warp = { t: 0, from, to };
        // Буфер прыжка обнуляем: иначе набитый перед нырянием прыжок
        // срабатывал сам на выходе из парной трубы.
        p.buffer = 0;
        this.stats.pipes += 1;
        this.emit("pipe");
        return;
      }
    }

    if (input.jumpPressed) p.buffer = T.bufferFrames;

    const inSwamp = lv.swamps.some((s) => overlap(p, { ...s, h: s.h + 8 }));
    const maxSpeed =
      lv.maxSpeed * (p.boost > 0 ? T.coffeeMultiplier : 1) * (inSwamp ? T.swampMultiplier : 1);

    if (input.left) { p.vx -= T.accel; p.face = -1; }
    if (input.right) { p.vx += T.accel; p.face = 1; }
    if (!input.left && !input.right) p.vx *= T.friction;
    p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));

    // Бросок теста доступен только сеньору - в этом и смысл третьей ступени.
    if (input.throw && p.grade === 2 && p.cooldown === 0) {
      p.cooldown = T.throwCooldown;
      this.shots.push({
        x: p.face > 0 ? p.x + p.w : p.x - 4,
        y: p.y + 5,
        vx: p.face * T.throwSpeed,
        vy: T.throwLift,
        life: T.throwLife,
      });
      this.emit("throw");
    }

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = T.jumpImpulse * (inSwamp ? T.swampJumpMultiplier : 1);
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      this.stats.jumps += 1;
      this.emit("jump");
    }
    // Прыжок по длительности нажатия: отпустил - подъём срезается.
    if (!input.jump && p.vy < T.jumpCut) p.vy = T.jumpCut;

    p.vy = Math.min(p.vy + T.gravity, T.maxFall);

    // Платформы двигаем до столкновений: иначе игрок сначала встанет на
    // старое место, а платформа уедет из-под ног в том же кадре.
    for (const m of this.moving) {
      const before = m.axis === "x" ? m.x : m.y;
      const next = before + m.dir * m.speed;
      if (next <= m.from) m.dir = 1;
      else if (next >= m.to) m.dir = -1;
      const delta = m.dir * m.speed;
      if (m.axis === "x") m.x += delta; else m.y += delta;

      // Стоящего сверху везём с собой.
      const onTop =
        p.x + p.w > m.x && p.x < m.x + m.w &&
        Math.abs(p.y + p.h - m.y) < 3 && p.vy >= 0;
      if (onTop) {
        if (m.axis === "x") p.x += delta; else p.y += delta;
      }
    }

    // По горизонтали блок ничем не отличается от платформы: и то и другое
    // просто останавливает. Различать их нужно только по вертикали.
    const solids: Rect[] = [
      ...lv.platforms,
      ...lv.pipes,
      ...this.moving,
      ...this.blocks.filter(solidBlock).map((b) => ({ x: b.x, y: b.y, w: 12, h: 12 })),
    ];

    // Горизонталь
    p.x += p.vx;
    if (p.x < 0) { p.x = 0; p.vx = 0; }
    if (p.x + p.w > lv.width) { p.x = lv.width - p.w; p.vx = 0; }
    for (const pl of solids) {
      if (!overlap(p, pl)) continue;
      // При нулевой скорости знак не подсказывает сторону: игрока могло
      // внести лифтом или выталкиванием из соседнего блока. Тогда выходим
      // в ближайшую сторону, а не вправо наугад.
      const toLeft = p.x + p.w - pl.x;
      const toRight = pl.x + pl.w - p.x;
      const goLeft = p.vx > 0 || (p.vx === 0 && toLeft <= toRight);
      p.x = goLeft ? pl.x - p.w : pl.x + pl.w;
      p.vx = 0;
    }

    // Вертикаль
    const prevTop = p.y;
    const prevBottom = p.y + p.h;
    p.y += p.vy;
    const wasGround = p.onGround;
    p.onGround = false;
    for (const pl of [...lv.platforms, ...lv.pipes, ...this.moving]) {
      if (!overlap(p, pl)) continue;
      if (p.vy > 0) { p.y = pl.y - p.h; p.vy = 0; p.onGround = true; }
      else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0.4; }
    }

    // Блоки разбираем отдельно от платформ, потому что удар снизу нужно
    // поймать ИМЕННО в момент столкновения. Разрешение столкновения тут же
    // выталкивает игрока из блока, и проверка пересечения после цикла
    // не находит уже ничего - блок оставался целым.
    // Ящики стоят рядами вплотную. Выталкивание из одного вносит игрока
    // в соседний, а тот в цикле уже пройден - и игрок остаётся в стене.
    // Поэтому проходов несколько, пока не перестанет пересекаться хоть с чем-то.
    for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of this.blocks) {
      if (b.broken) continue;
      const box = { x: b.x, y: b.y, w: 12, h: 12 };
      if (!overlap(p, box)) continue;
      // Невидимый ящик ловит только удар снизу, в прыжке. Сверху и сбоку
      // его нет: иначе игрок спотыкался бы о пустое место посреди дороги,
      // а секрет находят прыжком, а не лбом на бегу.
      const found = pass === 0 && p.vy < 0 && prevTop >= box.y + box.h - 1;
      if (b.hidden && !b.used && !found) continue;
      moved = true;

      // Сторону определяем по тому, откуда игрок пришёл, а не по знаку
      // скорости. В верхней точке прыжка скорость ровно ноль: обе ветки
      // по знаку промахивались, игрок оставался внутри блока, а следующим
      // кадром гравитация делала скорость положительной - и его выносило
      // НАВЕРХ блока, будто он туда запрыгнул.
      const cameFromAbove = prevBottom <= box.y + 1;
      const cameFromBelow = prevTop >= box.y + box.h - 1;

      if (cameFromAbove) {
        p.y = box.y - p.h;
        p.vy = 0;
        p.onGround = true;
      } else if (cameFromBelow) {
        p.y = box.y + box.h;
        p.vy = 0.4;
        // Удар засчитывается только на первом проходе: следующие лишь
        // расталкивают, иначе один прыжок вскрывал бы весь ряд.
        if (pass === 0) this.hitBlock(b);
      } else {
        // Ни сверху, ни снизу - значит игрока внесло внутрь боком: лифтом
        // или отскоком от соседнего блока. Оставлять его в ящике нельзя,
        // выталкиваем по кратчайшей стороне.
        const outLeft = p.x + p.w - box.x;
        const outRight = box.x + box.w - p.x;
        const outUp = p.y + p.h - box.y;
        const outDown = box.y + box.h - p.y;
        const min = Math.min(outLeft, outRight, outUp, outDown);
        if (min === outUp) { p.y = box.y - p.h; p.vy = 0; p.onGround = true; }
        else if (min === outDown) { p.y = box.y + box.h; p.vy = 0.4; }
        else if (min === outLeft) { p.x = box.x - p.w; p.vx = 0; }
        else { p.x = box.x + box.w; p.vx = 0; }
      }
    }
    if (!moved) break;
    }
    if (p.onGround || (wasGround && p.coyote === 0)) p.coyote = T.coyoteFrames;
    // Цепочка живёт, пока игрок в воздухе. Коснулся земли - счёт с начала.
    if (p.onGround) this.combo = 0;

    if (p.y > VIEW.h + 40) { this.respawn(); return; }

    for (const h of lv.hazards) {
      if (overlap(p, { ...h, y: h.y - 4 })) this.damage(h.x + h.w / 2);
    }

    // Ротация алертов. Её нельзя растоптать и нельзя закидать тестами -
    // только выждать. Единственное препятствие в игре, которое решается
    // терпением, а не действием.
    for (const r of this.rotors) {
      r.angle += r.speed;
      if (p.hurt > 0 || p.vacation > 0) continue;
      for (let i = 1; i <= r.beads; i++) {
        const bx = r.x + Math.cos(r.angle) * i * ROTOR_STEP;
        const by = r.y + Math.sin(r.angle) * i * ROTOR_STEP;
        if (!overlap(p, { x: bx - 2.6, y: by - 2.6, w: 5.2, h: 5.2 })) continue;
        this.damage(bx);
        break;
      }
    }

    if (this.deadlineX !== null) {
      // На арене стена останавливается: бой должен решаться боем,
      // а не тем, успел ли игрок добежать.
      if (!this.boss) this.deadlineX += lv.deadlineSpeed;
      else if (p.x < this.boss.min - VIEW.w) this.deadlineX += lv.deadlineSpeed;
      if (p.x < this.deadlineX + 8) { this.respawn(); return; }
    }

    for (let k = this.items.length - 1; k >= 0; k--) {
      const item = this.items[k]!;

      // Пока выезжает из блока - просто поднимается, физика ещё не его.
      if (item.rise > 0) {
        item.rise -= 1;
        item.y -= 0.9;
        continue;
      }

      if (!item.taken) {
        item.vy = Math.min(item.vy + T.gravity, 4);
        item.x += item.vx;
        item.y += item.vy;

        const box = { x: item.x, y: item.y, w: 10, h: 10 };
        for (const surf of [...lv.platforms, ...lv.pipes, ...this.moving]) {
          if (!overlap(box, surf)) continue;
          const fromAbove = item.y + 10 - item.vy <= surf.y + 1;
          if (fromAbove) {
            item.y = surf.y - 10;
            item.vy = 0;
          } else {
            // Уткнулся в стену - разворачивается и идёт обратно.
            item.x -= item.vx;
            item.vx = -item.vx;
          }
          box.x = item.x;
          box.y = item.y;
        }

        // Ушёл далеко за край экрана или провалился - убираем.
        const gone =
          item.y > VIEW.h + 40 ||
          item.x < this.camera - 60 ||
          item.x > this.camera + VIEW.w + 60;
        if (gone) {
          this.items.splice(k, 1);
          continue;
        }
      }

      if (item.taken || !overlap(p, { x: item.x, y: item.y, w: 10, h: 10 })) continue;
      item.taken = true;
      if (item.kind === "tests") {
        // Тесты сразу дают сеньора: с ними появляется чем отбиваться.
        if (p.grade < 2) this.setGrade(2);
        this.score += 400;
        this.popup(item.x + 5, item.y - 4, "+400", PAL.testLite);
        this.burst(item.x + 5, item.y + 5, PAL.door, 14);
        this.emit("gradeUp");
      } else if (item.kind === "vacation") {
        p.vacation = T.vacationFrames;
        this.score += T.scoreVacation;
        this.popup(item.x + 5, item.y - 4, `+${T.scoreVacation}`, PAL.vacationLite);
        this.burst(item.x + 5, item.y + 5, PAL.gemLite, 16);
        this.emit("vacation");
      } else if (item.kind === "offer" && p.grade < 2) {
        this.setGrade((p.grade + 1) as Grade);
        this.score += 300;
        this.popup(item.x + 5, item.y - 4, "+300", PAL.offerLite);
        this.burst(item.x + 5, item.y + 5, PAL.gem, 12);
        this.emit("gradeUp");
      } else if (item.kind === "life") {
        this.gainLife(item.x + 5, item.y - 4);
        this.burst(item.x + 5, item.y + 5, PAL.shirtLite, 12);
      } else if (item.kind === "coffee") {
        p.boost = T.coffeeFrames;
        this.score += T.scoreCoffee;
        this.burst(item.x + 5, item.y + 5, PAL.coffee, 9);
        this.emit("coffee");
      } else {
        this.score += 100;
        this.emit("pickup");
      }
      this.hud();
    }

    for (const b of this.blocks) if (b.bump > 0) b.bump -= 1;

    // Тесты летят по дуге и отскакивают от земли - так они достают врагов,
    // стоящих в низинах, а не гаснут о первый же бугор.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i]!;
      shot.life -= 1;
      shot.vy = Math.min(shot.vy + T.gravity, 4);
      shot.x += shot.vx;
      shot.y += shot.vy;

      const box = { x: shot.x, y: shot.y, w: 4, h: 4 };
      let dead = shot.life <= 0 || shot.x < this.camera - 20 || shot.x > this.camera + VIEW.w + 20;

      for (const pl of [...lv.platforms, ...lv.pipes, ...this.moving]) {
        if (!overlap(box, pl)) continue;
        if (shot.vy > 0 && shot.y + 4 - shot.vy <= pl.y + 1) {
          shot.y = pl.y - 4;
          shot.vy = T.throwBounce;
        } else {
          dead = true;
        }
        break;
      }

      if (!dead) {
        for (const f of this.foes) {
          if (f.squashed > 0) continue;
          if (!overlap(box, { x: f.x, y: f.y, w: f.w, h: f.h })) continue;
          f.squashed = 1;
          this.stats.tested += 1;
          this.score += T.scoreTested;
          this.popup(f.x + f.w / 2, f.y - 2, `+${T.scoreTested}`, PAL.test);
          this.burst(f.x + f.w / 2, f.y + 2, PAL.door, 10);
          dead = true;
          break;
        }
      }

      if (dead) this.shots.splice(i, 1);
    }

    for (const g of this.gems) {
      if (g.taken || !overlap(p, { x: g.x, y: g.y, w: 8, h: 9 })) continue;
      g.taken = true;
      this.gainSkill(g.x, g.y);
    }

    for (const c of this.coffee) {
      if (c.taken || !overlap(p, { x: c.x, y: c.y, w: 8, h: 9 })) continue;
      c.taken = true;
      p.boost = T.coffeeFrames;
      this.score += T.scoreCoffee;
      this.burst(c.x + 4, c.y + 4, PAL.coffee, 9);
      this.emit("coffee");
    }

    for (const f of this.foes) {
      if (f.squashed > 0) { f.squashed += 1; continue; }

      f.x += f.dir * f.speed;
      if (f.x < f.min) { f.x = f.min; f.dir = 1; }
      if (f.x > f.max) { f.x = f.max; f.dir = -1; }
      if (f.kind === "call") f.y = f.baseY + Math.sin((this.ticks + f.min) / 26) * 5;
      if (f.kind === "hr") {
        // Рекрутёр летит волной и подтягивается к игроку по высоте: от него
        // не спрятаться, просто отойдя в сторону. Но по горизонтали он
        // по-прежнему заперт в своём отрезке - иначе от него не убежать.
        const wave = Math.sin((this.ticks + f.min) / 18) * 7;
        const want = Math.max(28, Math.min(lv.groundY - f.h - 8, p.y + p.h - f.h - 6));
        f.baseY += Math.max(-0.35, Math.min(0.35, want - f.baseY)) * 0.05;
        f.y = f.baseY + wave;
      }

      if (p.hurt > 0) continue;
      if (!overlap(p, { x: f.x, y: f.y, w: f.w, h: f.h })) continue;

      // Созвон не растаптывается принципиально: совещание прыжком не решить.
      const stompable = f.kind !== "call";
      const fromAbove = p.vy > T.stompMinFallSpeed && p.y + p.h < f.y + f.h * T.stompTolerance;

      // В отпуске сносим всё, чего касаемся, - даже созвоны.
      if (p.vacation > 0) {
        f.squashed = 1;
        this.stompReward(f.x + f.w / 2, f.y - 2);
        this.stats.stomps += 1;
        this.burst(f.x + f.w / 2, f.y + 2, PAL.gemLite, 10);
        this.emit("stomp");
        continue;
      }

      if (stompable && fromAbove) {
        f.hp -= 1;
        p.vy = T.stompBounce;
        p.buffer = 0;
        this.shake = 5;
        this.stompReward(f.x + f.w / 2, f.y - 2);
        this.stats.stomps += 1;
        const dust = f.kind === "bug" ? PAL.bug
          : f.kind === "debt" ? PAL.debtCrack
          : f.kind === "hr" ? PAL.hrLite
          : PAL.legacyLite;
        this.burst(f.x + f.w / 2, f.y + 2, dust, 9);
        if (f.hp <= 0) {
          f.squashed = 1;
        } else {
          // Техдолг после первого наскока трескается и ускоряется: убрать
          // его наполовину - значит разозлить оставшуюся половину.
          f.speed *= 1.6;
        }
        this.emit("stomp");
      } else {
        this.damage(f.x);
      }
    }

    for (const cp of lv.checkpoints) {
      if (cp.x <= this.checkpointX || p.x < cp.x) continue;
      this.checkpointX = cp.x;
      this.burst(cp.x + 3, cp.y - 18, PAL.door, 6);
      this.emit("checkpoint");
    }

    this.updateBoss();
    this.updateQuestions();

    // Финиш. Пока собес не пройден, флагшток не считается: иначе босса
    // можно было бы просто обежать.
    //
    // Второе условие - страховка на дверь. Флагшток можно перепрыгнуть
    // с верхней ступени лестницы: его верхушка на 46, а прыжок с неё
    // поднимает выше. Без страховки такой игрок доходил бы до двери,
    // где не происходит уже ничего, - и уровень не кончался бы никогда.
    if (!this.finish && !this.boss) {
      const atPole = p.x + p.w > lv.pole.x && p.x < lv.pole.x + 3;
      if (atPole || p.x + p.w > lv.door.x + 8) this.grabPole();
    }

    const target = p.x - VIEW.w / 2 + p.w / 2;
    this.camera += (target - this.camera) * T.cameraEase;
    this.camera = Math.max(0, Math.min(lv.width - VIEW.w, this.camera));

    this.stats.score = this.score;
    this.stats.skills = this.skills;
  }
}
