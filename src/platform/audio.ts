/**
 * Звук синтезируется на лету через Web Audio, без единого файла.
 *
 * Так и надо для Mini App: игру открывают из чата и ждать загрузку
 * никто не будет, а мегабайт сэмплов утроил бы вес сборки. Осцилляторы
 * дают ровно ту восьмибитную эстетику, которая тут уместна.
 */

type Sound = "jump" | "stomp" | "coin" | "coffee" | "hurt" | "checkpoint" | "clear" | "over" | "pipe" | "bossHit" | "bossDown";

const STORAGE_KEY = "junior-way:muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem(STORAGE_KEY) === "1";
} catch {
  // Приватный режим и заблокированные куки - звук просто останется включён.
}

/**
 * Браузеры запрещают звук до первого касания, поэтому контекст создаётся
 * лениво: при первом же нажатии кнопки или клавиши.
 */
function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch {
    // Экзотический браузер, запрет политикой, исчерпание контекстов - игра
    // обязана работать молча, а не падать.
    ctx = null;
    master = null;
    return null;
  }
  return ctx;
}

interface Note {
  freq: number;
  /** Секунды от начала звука. */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Съезд частоты к этому значению за длительность ноты. */
  slideTo?: number;
}

function tone(note: Note): void {
  const audioCtx = ctx;
  if (!audioCtx || !master) return;

  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  const start = audioCtx.currentTime + note.at;

  osc.type = note.type ?? "square";
  osc.frequency.setValueAtTime(note.freq, start);
  if (note.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(note.slideTo, 1), start + note.dur);
  }

  // Мгновенная атака и спад до нуля: без спада каждый звук щёлкает на конце.
  const peak = note.gain ?? 1;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + note.dur + 0.02);
}

const PATTERNS: Record<Sound, Note[]> = {
  jump: [{ freq: 320, at: 0, dur: 0.14, slideTo: 620 }],
  // Растаптывание - короткий низкий удар со съездом вниз.
  stomp: [{ freq: 180, at: 0, dur: 0.1, slideTo: 60, type: "sawtooth" }],
  // Две ноты вверх - та самая интонация подобранной монетки.
  coin: [
    { freq: 988, at: 0, dur: 0.07 },
    { freq: 1319, at: 0.06, dur: 0.13 },
  ],
  coffee: [
    { freq: 660, at: 0, dur: 0.06 },
    { freq: 880, at: 0.05, dur: 0.06 },
    { freq: 1100, at: 0.1, dur: 0.12 },
  ],
  hurt: [{ freq: 400, at: 0, dur: 0.28, slideTo: 90, type: "sawtooth" }],
  checkpoint: [
    { freq: 523, at: 0, dur: 0.09 },
    { freq: 784, at: 0.08, dur: 0.16 },
  ],
  // Попадание по боссу: короткий резкий скол.
  bossHit: [
    { freq: 196, at: 0, dur: 0.07, type: "square" },
    { freq: 147, at: 0.06, dur: 0.12, type: "square" },
  ],
  // Собес пройден: фанфара выше и длиннее обычной победы.
  bossDown: [
    { freq: 392, at: 0, dur: 0.1 },
    { freq: 523, at: 0.1, dur: 0.1 },
    { freq: 659, at: 0.2, dur: 0.1 },
    { freq: 784, at: 0.3, dur: 0.1 },
    { freq: 1047, at: 0.4, dur: 0.3, type: "triangle" },
  ],
  // Спуск в трубу: тон падает - на слух понятно, что уезжаешь вниз.
  pipe: [
    { freq: 659, at: 0, dur: 0.08 },
    { freq: 440, at: 0.07, dur: 0.08 },
    { freq: 294, at: 0.14, dur: 0.16, type: "triangle" },
  ],
  clear: [
    { freq: 523, at: 0, dur: 0.1 },
    { freq: 659, at: 0.1, dur: 0.1 },
    { freq: 784, at: 0.2, dur: 0.1 },
    { freq: 1047, at: 0.3, dur: 0.26 },
  ],
  over: [
    { freq: 392, at: 0, dur: 0.14 },
    { freq: 311, at: 0.14, dur: 0.14 },
    { freq: 262, at: 0.28, dur: 0.34, type: "triangle" },
  ],
};

export function play(sound: Sound): void {
  if (muted) return;
  if (!ensure()) return;
  try {
    for (const note of PATTERNS[sound]) tone(note);
  } catch {
    // Звук - не повод ронять игру.
  }
}

/* ------------------------------------------------------------------ *
 * Музыка
 *
 * Тоже без единого файла: мелодия лежит номерами нот и играется теми же
 * осцилляторами. Планировщик смотрит вперёд на 120 мс и раскладывает ноты
 * по расписанию контекста, а не по таймеру браузера: таймер плавает на
 * десятки миллисекунд, и на слух это сразу разъезжающийся ритм.
 * ------------------------------------------------------------------ */

/** Частота по номеру ноты MIDI. */
const freq = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

const REST = 0;

/**
 * Наверху бодрая мажорная тема, под землёй та же ритмическая основа,
 * но в миноре и ниже: перемена настроения должна слышаться сразу,
 * а не только видеться по палитре.
 */
const TUNES = {
  surface: {
    lead: [
      76, 0, 79, 0, 83, 0, 79, 0, 81, 0, 0, 79, 76, 0, 0, 0,
      74, 0, 77, 0, 81, 0, 77, 0, 79, 0, 76, 0, 72, 0, 0, 0,
      76, 0, 79, 0, 83, 0, 86, 0, 84, 0, 83, 0, 81, 0, 79, 0,
      77, 0, 79, 0, 81, 0, 83, 0, 79, 0, 0, 0, 0, 0, 0, 0,
    ],
    bass: [
      40, 0, 52, 0, 40, 0, 52, 0, 45, 0, 57, 0, 45, 0, 57, 0,
      38, 0, 50, 0, 38, 0, 50, 0, 43, 0, 55, 0, 43, 0, 55, 0,
      40, 0, 52, 0, 40, 0, 52, 0, 45, 0, 57, 0, 45, 0, 57, 0,
      41, 0, 53, 0, 43, 0, 55, 0, 40, 0, 52, 0, 40, 0, 0, 0,
    ],
  },
  underground: {
    lead: [
      64, 0, 0, 67, 0, 0, 71, 0, 69, 0, 0, 67, 0, 0, 0, 0,
      62, 0, 0, 65, 0, 0, 69, 0, 67, 0, 0, 64, 0, 0, 0, 0,
      64, 0, 0, 67, 0, 0, 71, 0, 74, 0, 0, 72, 0, 71, 0, 69,
      67, 0, 0, 64, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
    bass: [
      28, 0, 0, 0, 40, 0, 0, 0, 33, 0, 0, 0, 45, 0, 0, 0,
      26, 0, 0, 0, 38, 0, 0, 0, 31, 0, 0, 0, 43, 0, 0, 0,
      28, 0, 0, 0, 40, 0, 0, 0, 33, 0, 0, 0, 45, 0, 0, 0,
      29, 0, 0, 0, 41, 0, 0, 0, 28, 0, 0, 0, 40, 0, 0, 0,
    ],
  },
} as const;

export type Tune = keyof typeof TUNES;

/** Длительность шага. 0.135 с - примерно 111 ударов в минуту. */
const STEP = 0.135;
const LOOKAHEAD = 0.12;

let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicTune: Tune = "surface";
let step = 0;
let nextAt = 0;

function voice(
  audio: AudioContext,
  note: number,
  at: number,
  dur: number,
  type: OscillatorType,
  level: number,
): void {
  if (!musicGain) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq(note);
  // Резкая атака и мягкий спад: без огибающей осциллятор щёлкает на старте.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(musicGain);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function schedule(): void {
  const audio = ctx;
  if (!audio || !musicGain) return;
  // Пока браузер не разрешил звук, контекст спит и его часы стоят. Планировать
  // в этот момент нечего: ноты легли бы в прошлое и высыпались очередью.
  if (audio.state !== "running") return;
  // Отстали далеко - вкладку сворачивали или телефон засыпал. Не догоняем
  // накопленное, а начинаем с текущего момента: иначе на возврате в игру
  // разом сыплется пулемётная очередь пропущенных нот.
  if (nextAt < audio.currentTime - 0.25) nextAt = audio.currentTime + 0.05;

  const tune = TUNES[musicTune];
  // Ограничитель на всякий случай: часы контекста могут прыгнуть вперёд,
  // и цикл без потолка подвесил бы вкладку.
  let guard = 0;
  try {
    while (nextAt < audio.currentTime + LOOKAHEAD && guard++ < 32) {
      const i = step % tune.lead.length;
      const lead = tune.lead[i] ?? REST;
      const bass = tune.bass[i] ?? REST;
      if (lead !== REST) voice(audio, lead, nextAt, STEP * 1.6, "square", 0.16);
      if (bass !== REST) voice(audio, bass, nextAt, STEP * 1.9, "triangle", 0.3);
      // Тихий щелчок на каждую четвёртую долю - без него мелодия плывёт.
      if (i % 4 === 0) voice(audio, 84, nextAt, 0.03, "square", 0.03);
      nextAt += STEP;
      step += 1;
    }
  } catch {
    // Контекст закрыли из-под нас - молчим, но игру не роняем.
    stopMusic();
  }
}

/**
 * Включает тему. Повторный вызов с той же темой ничего не делает, поэтому
 * звать можно каждый кадр - мелодия не начнётся заново.
 */
export function playMusic(tune: Tune): void {
  if (muted) return;
  const audio = ensure();
  if (!audio || !master) return;
  if (musicTimer !== null && musicTune === tune) return;

  // Всё тело под защитой: playMusic зовётся КАЖДЫЙ кадр из цикла отрисовки,
  // и любое исключение отсюда оборвало бы кадр до requestAnimationFrame -
  // игра встала бы намертво, а не просто замолчала.
  try {
    stopMusic();
    musicTune = tune;
    musicGain = audio.createGain();
    musicGain.gain.value = 0.34;
    musicGain.connect(master);
    step = 0;
    nextAt = audio.currentTime + 0.08;
    schedule();
    musicTimer = window.setInterval(schedule, 25);
  } catch {
    stopMusic();
  }
}

export function stopMusic(): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicGain && ctx) {
    // Гасим за 80 мс: обрыв на полуноте слышен как щелчок.
    musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    const dying = musicGain;
    window.setTimeout(() => dying.disconnect(), 300);
  }
  musicGain = null;
}

/**
 * Полное молчание: игру свернули.
 *
 * Планировщик живёт на setInterval и от кадрового цикла не зависит, а
 * playMusic и stopMusic зовутся только из кадра. В свёрнутой вкладке кадров
 * нет - остановить музыку было некому, и она продолжала играть человеку
 * в другом чате. Браузер таймер лишь притормаживает до секунды, а не
 * останавливает, поэтому «само замолчит» не работает: схема догоняющая и
 * за каждый редкий вызов успевает положить очередную ноту.
 *
 * Контекст ещё и усыпляем: на iOS живой AudioContext держит аудиосессию
 * и глушит музыку, которую человек слушал до игры.
 *
 * Обратно ничего включать не нужно - на первом же кадре после возврата
 * playMusic сам разбудит контекст через ensure() и заведёт тему заново.
 */
export function suspendAudio(): void {
  stopMusic();
  if (ctx && ctx.state === "running") void ctx.suspend();
}

/** Вызывается на первом касании: до него браузер звук не разрешает. */
export function unlock(): void {
  if (!muted) ensure();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Не сохранилось - переживём, в этой сессии всё равно работает.
  }
  // Тема перезапускается снаружи: playMusic зовётся каждый кадр и сам
  // увидит, что таймера нет.
  if (muted) stopMusic();
  else ensure();
  return muted;
}
