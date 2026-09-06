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
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
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
  for (const note of PATTERNS[sound]) tone(note);
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
  if (!muted) ensure();
  return muted;
}
