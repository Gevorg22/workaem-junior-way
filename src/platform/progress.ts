import { countStars } from "../game/world";
import type { RunStats } from "../game/types";
import { isTelegram } from "./telegram";
import { account } from "./workaem";

/**
 * Что игра помнит между запусками: рекорд, звёзды каждого уровня и то,
 * пройдена ли игра целиком.
 *
 * Достигнутый уровень больше не место, откуда продолжают: продолжения
 * нет, выгорел - начинай с первого. Он нужен карте мира, чтобы показать,
 * докуда игрок уже добирался.
 *
 * Ключ со второй версией: карты с мирами - другие карты, и рекорды на
 * старой нарезке к новой не относятся.
 *
 * Хранилище - localStorage. Оно может быть недоступно (приватный режим,
 * заблокированные куки), поэтому каждое обращение обёрнуто: без памяти
 * игра просто работает как раньше, а не падает.
 */
const KEY = "junior-way:progress:2";

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
  /** Лучший счёт за забег. */
  best: number;
  /** Самый дальний уровень, до которого добирался, с нуля. */
  reached: number;
  /**
   * Игра пройдена целиком хотя бы раз. Только после этого карта мира
   * разрешает играть уровни по одному - иначе она стала бы тем самым
   * продолжением с места выгорания, которое убрано нарочно.
   */
  beaten: boolean;
  /**
   * Личный рекорд на каждом уровне: ключ - номер уровня с единицы.
   * Нужен, чтобы экран статистики и карта показывали твои числа даже
   * без сети.
   */
  levels: Record<string, LevelBest>;
}

export interface LevelBest {
  score: number;
  frames: number;
  deaths: number;
  /** Звёзды битами. Копятся за разные попытки: каждая - своя цель. */
  stars: number;
}

const empty = (): Progress => ({ best: 0, reached: 0, beaten: false, levels: {} });

export function loadProgress(): Progress {
  if (!canSave()) {
    session ??= empty();
    return session;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<Progress>;
    return {
      best: Number(data.best) || 0,
      reached: Number(data.reached) || 0,
      beaten: data.beaten === true,
      levels: typeof data.levels === "object" && data.levels ? data.levels : {},
    };
  } catch {
    // Испорченная или недоступная память - начинаем с чистого листа.
    return empty();
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

/** Сколько звёзд собрано на всех уровнях. */
export function totalStars(p: Progress): number {
  return Object.values(p.levels).reduce((sum, lv) => sum + countStars(lv.stars ?? 0), 0);
}

export interface RunOutcome {
  /** Новый личный рекорд. */
  record: boolean;
  progress: Progress;
}

/**
 * Записать итог забега. Уровни с карты сюда не попадают: там играют
 * один уровень, и рекордом забега это быть не может.
 *
 * @param finished - дошёл до оффера. Открывает карту мира.
 */
export function recordRun(stats: RunStats, finished: boolean): RunOutcome {
  const p = loadProgress();
  const record = stats.score > p.best;
  if (record) p.best = stats.score;
  if (finished) p.beaten = true;
  save(p);
  return { record, progress: p };
}

/**
 * Результат уровня. Пишется на каждом финише, а не в конце забега: выйти
 * в меню посреди игры можно в любой момент, и пройденное не должно
 * пропадать вместе с забегом.
 *
 * Звёзды копятся отдельно от очков: попытка, собравшая все скиллы, но
 * медленная, всё равно приносит свою звезду, даже если рекорд не побит.
 *
 * @returns true, если это личный рекорд уровня по очкам.
 */
export function recordLevel(
  level: number,
  result: { score: number; frames: number; deaths: number; stars: number },
): boolean {
  const p = loadProgress();
  const key = String(level);
  const was = p.levels[key];
  // Пройденный уровень открывает на карте следующий.
  if (level > p.reached) p.reached = level;
  const better = !was || result.score > was.score;
  const stars = (was?.stars ?? 0) | result.stars;
  const kept = better
    ? { score: result.score, frames: result.frames, deaths: result.deaths, stars }
    : { ...was!, stars };
  p.levels = { ...p.levels, [key]: kept };
  save(p);
  return better;
}

export function levelBest(level: number): LevelBest | null {
  return loadProgress().levels[String(level)] ?? null;
}
