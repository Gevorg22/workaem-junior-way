import { rawInitData } from "./telegram";
import { account } from "./workaem";

/**
 * Общая статистика.
 *
 * Живёт в воркере на D1 (см. worker/board.js). Здесь только запросы и
 * бережное отношение к сети: игру открывают из чата на телефоне, и ни один
 * экран не должен ждать ответа сервера. Не ответил за две секунды - играем
 * без статистики, как раньше.
 */

/** Адрес воркера. Один на всё: и результаты, и таблицы. */
export const WORKER = "https://workaem-game-bot.gevorg-kara.workers.dev";

/**
 * Сколько ждать ответа. Два значения, потому что ожидания разные: короткий
 * топ на стартовом экране - украшение, и ждать его незачем, а экран
 * статистики человек открыл сам и смотрит именно на него.
 *
 * Воркер с базой отвечает за секунду-полторы, но на телефоне через мобильную
 * сеть или VPN легко выходит за две: при старом общем таймауте в две секунды
 * экран статистики регулярно обрывал запрос и писал «не загрузилась», хотя
 * данные на сервере были.
 */
const QUICK_MS = 4000;
const PATIENT_MS = 10000;

export interface BoardRow {
  name: string;
  source: string;
  score: number;
  levels: number;
  deaths: number;
  combo: number;
}

export interface Board {
  career: BoardRow[];
  totals: Record<string, number>;
}

/** Строка сводки по уровню: сколько игроков и первая тройка. */
export interface LevelRow {
  level: number;
  players: number;
  top: Array<{ name: string; score: number; frames: number }>;
}

/** Свой результат на уровне. */
export interface MyLevel {
  score: number;
  frames: number;
  place: number;
  players: number;
}

export interface Stats {
  career: BoardRow[];
  levels: LevelRow[];
  totals: Record<string, number>;
  mine: Record<string, MyLevel>;
}

/** Строка списка игроков. */
export interface PlayerRow {
  place: number;
  name: string;
  source: string;
  score: number;
  levels: number;
  deaths: number;
}

export interface PlayersPage {
  rows: PlayerRow[];
  total: number;
  offset: number;
  limit: number;
  /** Своё место, если личность известна. */
  mine: Standing | null;
}

export interface Standing {
  place: number;
  total: number;
  best: number;
}

/**
 * Чем игрок подтверждает, кто он. Подпись Telegram или токен workaem;
 * у гостя нет ни того, ни другого - и его результаты никуда не уходят.
 */
export function identityBody(): Record<string, string> | null {
  const initData = rawInitData();
  if (initData) return { initData };
  const wa = account();
  if (wa) return { wa: wa.token };
  return null;
}

async function ask<T>(path: string, init?: RequestInit, timeout = QUICK_MS): Promise<T | null> {
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), timeout);
  try {
    const res = await fetch(`${WORKER}${path}`, { ...init, signal: stop.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Сеть, таймаут, отключённый воркер - статистики просто не будет.
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchBoard(): Promise<Board | null> {
  const data = await ask<{ ok: boolean } & Board>("/board");
  return data?.ok ? data : null;
}

/**
 * Полная статистика для отдельного экрана. Личность отправляем, если есть:
 * с ней в ответе приходят ещё и свои места на каждом уровне.
 */
export async function fetchStats(): Promise<Stats | null> {
  const who = identityBody();
  const data = await ask<{ ok: boolean } & Stats>("/stats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(who ?? {}),
  }, PATIENT_MS);
  return data?.ok ? data : null;
}

/**
 * Сколько строк на странице списка игроков. Десять, а не двадцать: кадр игры
 * это широкая полоска, и двадцать строк уводят кнопки листания под срез -
 * до них приходится скроллить. Столько же по умолчанию отдаёт воркер.
 */
export const PAGE_SIZE = 10;

/**
 * Страница списка игроков. Постранично, а не одним куском: строк со временем
 * станет тысячи, а открывают список с телефона. Своё место приходит вместе
 * со страницей - по нему игра прыгает прямо на нужную.
 */
export async function fetchPlayers(offset = 0): Promise<PlayersPage | null> {
  const who = identityBody();
  const data = await ask<{ ok: boolean } & PlayersPage>("/players", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(who ?? {}), offset, limit: PAGE_SIZE }),
  }, PATIENT_MS);
  return data?.ok ? data : null;
}

/** Числа для витрины: «столько-то забегов, столько-то растоптанных легаси». */
export function totalsLine(totals: Record<string, number>): string {
  const num = (n: number): string => n.toLocaleString("ru-RU");
  // Двух чисел достаточно: строка под таблицей должна читаться с одного
  // взгляда, а не быть отчётом. Остальное лежит в базе и ждёт своей
  // страницы на сайте.
  const parts: string[] = [];
  if (totals["runs"]) parts.push(`забегов ${num(totals["runs"])}`);
  if (totals["stomps"]) parts.push(`растоптано легаси ${num(totals["stomps"])}`);
  else if (totals["skills"]) parts.push(`скиллов ${num(totals["skills"])}`);
  return parts.join(" · ");
}

/** Время уровня в «мм:сс» - в статистике оно рядом с очками. */
export function clock(frames: number): string {
  const total = Math.round(frames / 75);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
