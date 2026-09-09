import type { RunStats } from "../game/types";
import { isTelegram } from "./telegram";
import { account } from "./workaem";

/**
 * Что игра помнит между запусками.
 *
 * Двенадцать уровней подряд без права на ошибку - слишком для игры,
 * которую открывают из чата на пять минут: умер на десятом - и снова
 * стажёром. Поэтому достигнутый уровень запоминается, и с него можно
 * продолжить. Такой забег помечается и в общий зачёт не идёт: рекорд
 * должен означать пройденный путь целиком, а не последний его кусок.
 *
 * Хранилище - localStorage. Оно может быть недоступно (приватный режим,
 * заблокированные куки), поэтому каждое обращение обёрнуто: без памяти
 * игра просто работает как раньше, а не падает.
 */
const KEY = "junior-way:progress";

/**
 * Прогресс хранится только у тех, чью личность можно проверить: игроков из
 * Telegram и владельцев аккаунта workaem. У гостя он живёт в памяти
 * страницы и исчезает при перезагрузке.
 *
 * Это не про наказание, а про смысл: рекорд - это утверждение
 * «я это сделал», и утверждать его должен кто-то, а не безымянный браузер.
 * Играть при этом можно всё и целиком - гость теряет не доступ, а память
 * о себе, и починить это одним нажатием.
 */
function canSave(): boolean {
  return isTelegram() || account() !== null;
}

/** Прогресс гостя: живёт до перезагрузки страницы, никуда не пишется. */
let session: Progress | null = null;

export interface Progress {
  /** Лучший счёт за забег с первого уровня. */
  best: number;
  /** Самый дальний достигнутый уровень, с нуля. */
  reached: number;
  /**
   * Личный рекорд на каждом уровне: ключ - номер уровня с единицы.
   * Нужен, чтобы экран статистики показывал твои числа даже без сети.
   */
  levels: Record<string, LevelBest>;
}

export interface LevelBest {
  score: number;
  frames: number;
  deaths: number;
}

const EMPTY: Progress = { best: 0, reached: 0, levels: {} };

export function loadProgress(): Progress {
  if (!canSave()) {
    session ??= { ...EMPTY, levels: {} };
    return session;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const data = JSON.parse(raw) as Partial<Progress>;
    return {
      best: Number(data.best) || 0,
      reached: Number(data.reached) || 0,
      levels: typeof data.levels === "object" && data.levels ? data.levels : {},
    };
  } catch {
    // Испорченная или недоступная память - начинаем с чистого листа.
    return { ...EMPTY };
  }
}

function save(p: Progress): void {
  if (!canSave()) {
    session = p;
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Не сохранилось - в этой сессии всё равно работает.
  }
}

/** Сохраняется ли прогресс - от этого зависит, что показывать на экранах. */
export function progressSaved(): boolean {
  return canSave();
}

export interface RunOutcome {
  /** Новый личный рекорд. */
  record: boolean;
  progress: Progress;
}

/**
 * Записать итог забега. Забег с продолжения общий рекорд не обновляет:
 * иначе он означал бы «стартовал с одиннадцатого уровня», а не пройденный
 * путь. На таблицы уровней это не влияет - там каждый уровень сам себе
 * соревнование, и продолживший с пятого честно в них попадает.
 */
export function recordRun(stats: RunStats, levelIndex: number): RunOutcome {
  const p = loadProgress();
  const honest = stats.startLevel === 0;

  if (levelIndex > p.reached) p.reached = levelIndex;
  const record = honest && stats.score > p.best;
  if (record) p.best = stats.score;

  save(p);
  return { record, progress: p };
}

/**
 * Результат уровня. Пишется на каждом финише, а не в конце забега: выйти
 * в меню посреди игры можно в любой момент, и пройденное не должно
 * пропадать вместе с забегом.
 *
 * @returns true, если это личный рекорд уровня.
 */
export function recordLevel(
  level: number,
  result: { score: number; frames: number; deaths: number },
): boolean {
  const p = loadProgress();
  const key = String(level);
  const was = p.levels[key];
  // Достигнутый уровень запоминаем здесь же: до этого он записывался только
  // в конце забега, и выход в меню посреди пути его терял.
  if (level > p.reached) p.reached = level - 1;
  const better = !was || result.score > was.score;
  if (better) {
    p.levels = { ...p.levels, [key]: { score: result.score, frames: result.frames, deaths: result.deaths } };
  }
  save(p);
  return better;
}

export function levelBest(level: number): LevelBest | null {
  return loadProgress().levels[String(level)] ?? null;
}
