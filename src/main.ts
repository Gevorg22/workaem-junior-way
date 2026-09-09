import "./style.css";
import { LEVELS } from "./game/levels";
import { renderCard } from "./game/card";
import { PAL } from "./game/palette";
import { Renderer } from "./game/render";
import { RENDER, TICKS_PER_SECOND, TUNING as T, VIEW, VIEW_W_MAX, VIEW_W_MIN } from "./game/tuning";
import { GRADE_NAMES } from "./game/types";
import { World } from "./game/world";
import type { WorldEvent } from "./game/world";
import { Input } from "./platform/input";
import { currentUser, haptic, isTelegram, notify, setupViewport } from "./platform/telegram";
import { reportLevel, reportRun, resetReport } from "./platform/report";
import type { RunReport } from "./platform/report";
import { clock, fetchBoard, fetchPlayers, fetchStats, PAGE_SIZE, totalsLine } from "./platform/board";
import type { Board, BoardRow, PlayersPage, Stats } from "./platform/board";
import {
  account, AUTH_READY, login, loginUrl, logout, pickUpToken, signupUrl,
} from "./platform/workaem";
import {
  BADGES, loadProgress, progressSaved, recordLevel, recordRun,
} from "./platform/progress";
import {
  isMuted, play, playMusic, setHurry, stopMusic, suspendAudio, toggleMute, unlock,
} from "./platform/audio";

const WORKAEM = "https://www.workaem.com";

function need<E extends Element>(selector: string): E {
  const el = document.querySelector<E>(selector);
  if (!el) throw new Error(`Не найден элемент ${selector}`);
  return el;
}

const canvas = need<HTMLCanvasElement>("#stage");

/** Меньшую долю экрана игра занимать не должна - иначе не разглядеть. */
const MIN_SCREEN_SHARE = 0.25;

/**
 * Подгоняем ширину кадра под экран.
 *
 * Игру открывают из чата одной рукой, в портретной ориентации - требовать
 * повернуть телефон значит терять людей на входе. Вместо этого сужаем кадр:
 * полоска становится выше, спрайты крупнее, играть можно как есть.
 *
 * Нижняя граница не даёт увлечься: при слишком узком кадре игрок перестаёт
 * успевать реагировать на врага, выехавшего из-за края.
 */
function fitViewport(): void {
  // Холст растягивается на ширину рамки, а она ограничена 880px в стилях.
  const frameWidth = Math.min(window.innerWidth - 20, 880);
  const screenHeight = Math.max(window.innerHeight, 1);

  // Высота холста жёстко следует из ширины: höhe = ширина / (w/h).
  // Отсюда обратная задача - какой ширины кадр даст нужную долю экрана.
  const widest = (frameWidth * VIEW.h) / (MIN_SCREEN_SHARE * screenHeight);

  VIEW.w = Math.round(Math.max(VIEW_W_MIN, Math.min(VIEW_W_MAX, widest)));
  // Плотность экрана. На ретине холст 880 точек при CSS-ширине 880 - это
  // половинное разрешение, и все сглаженные края выходят мылом.
  //
  // Потолок 2, а не 3: при 3 холст выходит 2640x1344, то есть 3.5 мегапикселя
  // на кадр. На маке это ровные 16.7 мс без просадок, но игру открывают
  // с телефона, где GPU слабее в разы. Разницы между 2 и 3 на ретине не видно,
  // а закрашивать приходится вдвое меньше.
  const density = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  RENDER.density = density;
  canvas.width = Math.round(VIEW.w * T.scale * density);
  canvas.height = Math.round(VIEW.h * T.scale * density);
}

fitViewport();

const hud = {
  level: need<HTMLElement>("#hud-level"),
  grade: need<HTMLElement>("#hud-grade"),
  skills: need<HTMLElement>("#hud-skills"),
  score: need<HTMLElement>("#hud-score"),
  time: need<HTMLElement>("#hud-time"),
  lives: need<HTMLElement>("#hud-lives"),
  buffs: need<HTMLElement>("#hud-buffs"),
};

const outro = need<HTMLElement>("#outro");
const outroGrade = need<HTMLElement>("#outro-grade");
const outroStats = need<HTMLElement>("#outro-stats");
const outroBadges = need<HTMLElement>("#outro-badges");
const jobsLink = need<HTMLAnchorElement>("#jobs-link");
const shareLink = need<HTMLAnchorElement>("#share-link");
const imageBtn = need<HTMLButtonElement>("#outro-image");
const replayBtn = need<HTMLButtonElement>("#replay");
const soundBtn = need<HTMLButtonElement>("#sound");

const startScreen = need<HTMLElement>("#start");
const startPlay = need<HTMLButtonElement>("#start-play");
const startContinue = need<HTMLButtonElement>("#start-continue");
const startStatsBtn = need<HTMLButtonElement>("#start-stats");
const startStats = need<HTMLElement>("#start-stats");
const startBadges = need<HTMLElement>("#start-badges");

const boardBox = need<HTMLElement>("#board");
const boardRows = need<HTMLElement>("#board-rows");
const boardNote = need<HTMLElement>("#board-note");
const statsScreen = need<HTMLElement>("#stats");
const statsLevels = need<HTMLElement>("#stats-levels");
const statsNote = need<HTMLElement>("#stats-note");
const statsBack = need<HTMLButtonElement>("#stats-back");
const tabLevels = need<HTMLButtonElement>("#tab-levels");
const tabPlayers = need<HTMLButtonElement>("#tab-players");
const playersBox = need<HTMLElement>("#stats-players");
const playersRows = need<HTMLElement>("#players-rows");
const playersPos = need<HTMLElement>("#players-pos");
const playersPrev = need<HTMLButtonElement>("#players-prev");
const playersNext = need<HTMLButtonElement>("#players-next");
const playersMe = need<HTMLButtonElement>("#players-me");
const hudMenu = need<HTMLButtonElement>("#hud-menu");
const whoLine = need<HTMLElement>("#who-line");
const outroPlace = need<HTMLElement>("#outro-place");
const overPlace = need<HTMLElement>("#over-place");

const gameover = need<HTMLElement>("#gameover");
const overStats = need<HTMLElement>("#over-stats");
const overBadges = need<HTMLElement>("#over-badges");
const overContinue = need<HTMLButtonElement>("#over-continue");
const overRestart = need<HTMLButtonElement>("#over-restart");
const overMenu = need<HTMLButtonElement>("#over-menu");

/**
 * Пока открыт стартовый экран или экран конца забега, шаг физики не идёт:
 * иначе игрок читает меню, а персонаж в это время падает в прод.
 */
let paused = true;

/** Загруженная таблица рекордов. null - воркер не ответил или не подключён. */
let board: Board | null = null;
/** Загруженная статистика по уровням. */
let stats: Stats | null = null;
/** Открытый раздел статистики. */
let statsTab: "levels" | "players" = "levels";
/** Загруженная страница списка игроков и её смещение. */
let players: PlayersPage | null = null;
let playersOffset = 0;
/** Показываться в таблице безымянно. Решение игрока, живёт между запусками. */
let anon = false;
try {
  anon = localStorage.getItem("junior-way:anon") === "1";
} catch {
  // Приватный режим - настройка живёт только в этой сессии.
}

// Возврат с workaem: во фрагменте лежит токен. Разбираем до первого кадра,
// чтобы имя в строке личности появилось сразу.
pickUpToken();

const TG_BOT = "https://t.me/workaem_game_bot";

setupViewport(PAL.sky);

const world = new World();

/**
 * Отладочный старт с нужного уровня: ?level=12. Только в режиме разработки -
 * в собранной игре параметр игнорируется, иначе им можно было бы пропустить
 * половину пути и попасть в таблицу рекордов почти сразу.
 *
 * Стартовый экран при этом не показывается: он начинает забег с первого
 * уровня и тем самым отменял бы весь смысл параметра.
 */
let devLevel = 0;
if (import.meta.env.DEV) {
  const want = Number(new URLSearchParams(location.search).get("level"));
  if (Number.isFinite(want) && want >= 1) {
    devLevel = Math.min(want, LEVELS.length);
    world.loadLevel(devLevel - 1);
  }
  (window as unknown as { world: World }).world = world;
}
const renderer = new Renderer(canvas);
// Отладка производительности: без доступа к рендереру стоимость кадра
// приходится мерить косвенно, по дрожанию requestAnimationFrame.
if (import.meta.env.DEV) {
  (window as unknown as { renderer: Renderer; render: typeof RENDER }).renderer = renderer;
  (window as unknown as { render: typeof RENDER }).render = RENDER;
}
const input = new Input(canvas);

input.bindButton(need<HTMLElement>("#btn-left"), "left");
input.bindButton(need<HTMLElement>("#btn-right"), "right");
input.bindButton(need<HTMLElement>("#btn-down"), "down");
input.bindButton(need<HTMLElement>("#btn-jump"), "jump");
const throwBtn = need<HTMLButtonElement>("#btn-throw");
input.bindButton(throwBtn, "throw");

/** Вибрация и звук идут парой: оба подтверждают действие, каждый своим каналом. */
const FEEDBACK: Partial<Record<WorldEvent, () => void>> = {
  stomp: () => { haptic("medium"); play("stomp"); },
  pickup: () => { haptic("light"); play("coin"); },
  coffee: () => { haptic("soft"); play("coffee"); },
  checkpoint: () => { haptic("rigid"); play("checkpoint"); },
  pipe: () => { haptic("rigid"); play("pipe"); },
  bossHit: () => { haptic("heavy"); play("bossHit"); },
  bossDown: () => { notify("success"); play("bossDown"); },
  hurt: () => { notify("error"); play("hurt"); },
  death: () => { notify("error"); play("over"); },
  clear: () => { notify("success"); play("clear"); },
  final: () => { notify("success"); play("clear"); },
  jump: () => play("jump"),
  life: () => { notify("success"); play("life"); },
  pole: () => { haptic("rigid"); play("pole"); },
  throw: () => { haptic("light"); play("coin"); },
  vacation: () => { notify("success"); play("clear"); },
};

world.on((event) => {
  FEEDBACK[event]?.();
  if (event === "final") showOutro();
  // Уровень пройден - отправляем его результат сразу, не дожидаясь конца
  // забега: уровень считается сам за себя.
  if (event === "levelDone") void submitLevel();
});

function syncHud(): void {
  hud.level.textContent = `Уровень ${world.levelIndex + 1} · ${world.level.name}`;
  // В HUD - грейд игрока, а не уровня: он меняется по ходу забега
  // и показывает запас прочности, как размер в платформерах.
  hud.grade.textContent = GRADE_NAMES[world.player.grade] ?? "ДЖУН";
  // Кнопка броска показывается только когда есть чем бросать.
  throwBtn.hidden = world.player.grade < 2;

  // Активные эффекты с обратным отсчётом: иначе неуязвимость и ускорение
  // существуют только в ощущениях, и непонятно, когда они кончатся.
  const p = world.player;
  const parts: string[] = [];
  if (p.vacation > 0) parts.push(`<b class="buff-vacation">☀ ${Math.ceil(p.vacation / 60)}</b>`);
  if (p.boost > 0) parts.push(`<b class="buff-coffee">☕ ${Math.ceil(p.boost / 60)}</b>`);
  if (p.grade === 2) parts.push('<b class="buff-tests">⚗</b>');
  hud.buffs.innerHTML = parts.join("");
  hud.skills.textContent = String(world.skills);
  hud.score.textContent = String(world.score);

  // Время на уровень. Раньше норма существовала только в формуле бонуса:
  // игрок о ней не знал и потому на неё не играл. Теперь она на виду,
  // а последние секунды подсвечены - и тогда бонус начинает работать.
  const left = world.secondsLeft;
  hud.time.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  document.body.classList.toggle("hurry", left <= T.hurrySeconds && world.phase === "play");

  // Больше пяти сердец в строку не влезает - дальше пишем числом.
  hud.lives.textContent =
    world.lives <= 0 ? "-" : world.lives <= 5 ? "♥".repeat(world.lives) : `♥×${world.lives}`;
}

/**
 * Значки строкой. Заслуженные горят, только что полученные - заливкой:
 * новое должно быть видно сразу, иначе список читается как обои.
 */
function paintBadges(box: HTMLElement, owned: string[], fresh: string[] = []): void {
  box.innerHTML = BADGES.map((b) => {
    const cls = fresh.includes(b.id) ? "fresh" : owned.includes(b.id) ? "on" : "";
    const title = owned.includes(b.id) ? b.label : b.hint;
    return `<span class="${cls}" title="${title}">${b.label}</span>`;
  }).join("");
}

/** Картинка результата: поделиться, а если браузер не умеет - сохранить. */
async function shareImage(): Promise<void> {
  const user = currentUser();
  const png = await renderCard({
    ...(user ? { name: user.name } : {}),
    grade: gradeName(world.stats.levelsCleared),
    stats: world.stats,
  });
  if (!png) return;

  const res = await fetch(png);
  const blob = await res.blob();
  const file = new File([blob], "put-djuna.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: "Путь джуна", text: `Очков: ${world.score}` });
      return;
    } catch {
      // Человек передумал делиться - это не ошибка.
      return;
    }
  }
  // Сохранение файлом: единственный способ, который работает везде.
  const a = document.createElement("a");
  a.href = png;
  a.download = "put-djuna.png";
  a.click();
}

/** Грейд по числу пройденных уровней - та же шкала, что и у бота. */
function gradeName(cleared: number): string {
  return ["ДЖУН", "МИДЛ", "СЕНЬОР", "ЛИД", "ЛИД"][Math.min(cleared, 4)] ?? "ДЖУН";
}

/** Финальный экран - единственное место, где игра отдаёт человека продукту. */
function showOutro(): void {
  const user = currentUser();
  const who = user ? `${user.name}, ты` : "Ты";
  const s = world.stats;

  const outcome = recordRun(s, world.levelIndex, { bossDown: world.bossDown });
  outroGrade.textContent = `${who} дошёл до грейда ${gradeName(s.levelsCleared)}`;
  outroStats.textContent =
    `Скиллов ${s.skills} · очков ${s.score} · смертей ${s.deaths}` +
    `${s.maxCombo > 1 ? ` · цепочка ${s.maxCombo}` : ""}` +
    `${outcome.record ? " · личный рекорд" : ""}`;
  paintBadges(outroBadges, outcome.progress.badges, outcome.fresh.map((b) => b.id));

  jobsLink.href = `${WORKAEM}/jobs/l/development?utm_source=game&utm_medium=outro&utm_campaign=junior-way`;

  const text = `Прошёл «Путь джуна» до грейда ${gradeName(s.levelsCleared)}. Очков: ${world.score}. Проверь свой:`;
  const url = `${WORKAEM}?utm_source=game&utm_medium=share&utm_campaign=junior-way`;
  shareLink.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  outro.hidden = false;

  // Результат уходит на сервер: там он попадает в общую таблицу, а бот
  // присылает поздравление в чат - вместе с картинкой и кнопкой на
  // вакансии. Сознательно без await: экран не должен ждать сеть.
  void renderCard({
    ...(user ? { name: user.name } : {}),
    grade: gradeName(s.levelsCleared),
    stats: s,
  }).then((png) => submitRun(outroPlace, png));
}

function hideOutro(): void {
  outro.hidden = true;
}

/**
 * Конец забега. Раньше здесь было только «начать заново», и это главная
 * причина, по которой длинную игру бросают: умер на десятом - и снова
 * стажёром. Теперь можно продолжить с достигнутого уровня; такой забег
 * помечен и рекорд не обновляет.
 */
function showGameOver(): void {
  const s = world.stats;
  const outcome = recordRun(s, world.levelIndex, { bossDown: world.bossDown });
  overStats.textContent =
    `Уровней ${s.levelsCleared} из ${LEVELS.length} · очков ${s.score} · скиллов ${s.skills}` +
    `${outcome.record ? " · личный рекорд" : ""}`;
  paintBadges(overBadges, outcome.progress.badges, outcome.fresh.map((b) => b.id));

  // Продолжить можно с уровня, на котором забег и оборвался.
  const from = world.levelIndex;
  overContinue.hidden = from === 0;
  overContinue.textContent = `Продолжить с уровня ${from + 1}`;
  gameover.hidden = false;
  paused = true;

  // Оборвавшийся забег - тоже результат: очки набраны, и место в таблице
  // они занимают. Не отправлять их значило бы засчитывать только тех, кто
  // дошёл до конца, а таких единицы.
  void submitRun(overPlace);
}

function hideGameOver(): void {
  gameover.hidden = true;
}

/**
 * Таблица рекордов. Грузится один раз при открытии и после каждого
 * записанного забега. Не ответила - экран просто остаётся без неё:
 * соревнование это дополнение к игре, а не условие её работы.
 */
async function loadBoard(): Promise<void> {
  board = await fetchBoard();
  paintBoard();
}

function boardLine(row: BoardRow, index: number, mine: boolean): string {
  const mark = row.source === "tg" ? "◈" : "▣";
  return (
    `<li class="${mine ? "me" : ""}">` +
    `<span>${index + 1}.</span>` +
    `<span class="name">${mark} ${row.name}</span>` +
    `<span class="score">${row.score.toLocaleString("ru-RU")}</span>` +
    "</li>"
  );
}

function paintBoard(): void {
  if (!board) {
    boardBox.hidden = true;
    return;
  }
  boardBox.hidden = false;

  const rows = board.career.slice(0, 5);
  const mine = myName();
  boardRows.innerHTML = rows.length
    ? rows.map((row, i) => boardLine(row, i, row.name === mine)).join("")
    : '<li class="empty">Пока пусто - можно стать первым</li>';

  const totals = totalsLine(board.totals);
  boardNote.textContent = totals
    ? `${totals} · подробная статистика по уровням - в «Статистике»`
    : "Подробная статистика по уровням - в «Статистике»";
}

/** Под каким именем игрок стоит в таблице - чтобы подсветить свою строку. */
function myName(): string | null {
  const user = currentUser();
  if (user) return user.name;
  return account()?.name ?? null;
}

/**
 * Строка личности. Она отвечает на единственный вопрос, который возникает
 * у человека при виде таблицы: попаду я туда или нет.
 */
function paintWho(): void {
  const user = currentUser();
  const wa = account();
  const anonBox = `<label><input type="checkbox" id="anon"${anon ? " checked" : ""}> показываться безымянно</label>`;

  if (user) {
    whoLine.innerHTML =
      `Привет, <b>${user.name}</b>. Играешь из Telegram - результаты и статистика ` +
      `сохраняются. ${anonBox}`;
    return;
  }
  if (wa) {
    whoLine.innerHTML =
      `Привет, <b>${wa.name}</b>. Аккаунт workaem подключён - результаты и статистика ` +
      `сохраняются. ${anonBox} · <a href="#" id="wa-out">выйти</a>`;
    return;
  }

  // Гость. Играть можно всё и целиком, но ничего не сохраняется - ни
  // рекорд, ни значки, ни достигнутый уровень, ни статистика. Так честнее:
  // утверждение «я это сделал» должен делать кто-то, а не безымянный
  // браузер, - и починить это одним нажатием.
  whoLine.innerHTML =
    "Ты играешь как <b>гость</b>: ничего не сохраняется - ни рекорды, ни статистика. " +
    (AUTH_READY
      ? '<a href="#" id="wa-in">Войти через workaem</a> или играть '
      : `Статистика ведётся у игроков из `) +
    `<a href="${TG_BOT}" target="_blank" rel="noopener">Telegram</a>` +
    (AUTH_READY
      ? "."
      : `; вход через <a href="${signupUrl()}" target="_blank" rel="noopener">аккаунт workaem</a> появится позже.`);
}

whoLine.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.id === "wa-in") {
    e.preventDefault();
    login();
  } else if (target.id === "wa-out") {
    e.preventDefault();
    logout();
    paintWho();
  }
});

whoLine.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.id !== "anon") return;
  anon = target.checked;
  try {
    localStorage.setItem("junior-way:anon", anon ? "1" : "0");
  } catch {
    // Не сохранилось - работает в этой сессии.
  }
});

// Таблицу удобно смотреть с данными, которых на локальной машине нет:
// воркер и база живут в облаке. Крючок только для разработки - в собранной
// игре его нет.
if (import.meta.env.DEV) {
  const hooks = window as unknown as {
    setBoard: (data: Board) => void;
    setStats: (data: Stats) => void;
    setPlayers: (data: PlayersPage) => void;
  };
  hooks.setBoard = (data) => {
    board = data;
    paintBoard();
  };
  hooks.setStats = (data) => {
    stats = data;
    paintStats();
  };
  hooks.setPlayers = (data) => {
    players = data;
    statsTab = "players";
    paintStats();
    paintPlayers();
  };
}



/**
 * Отправка результата и место в таблице.
 *
 * Гостю показываем не ошибку, а состояние: результат остался в браузере,
 * и вот два способа сохранить его навсегда. Забег с продолжения в таблицу
 * не идёт - об этом тоже честно говорим, иначе человек будет ждать место,
 * которого не будет.
 */
async function submitRun(box: HTMLElement, photo?: string): Promise<void> {
  if (world.stats.startLevel > 0) {
    box.textContent =
      "Забег с продолжения в общий зачёт не идёт - только полный путь. " +
      "Уровни при этом засчитаны: они считаются каждый сам за себя.";
    return;
  }

  box.textContent = "Отправляю результат...";
  const report: RunReport = await reportRun({
    stats: world.stats,
    ...(photo ? { photo } : {}),
    ...(anon ? { anon: true } : {}),
  });

  if (report.standing?.place) {
    box.innerHTML =
      `Место в общем зачёте: <b>${report.standing.place}</b> из ${report.standing.total}` +
      (report.standing.best > world.stats.score
        ? ` · твой лучший ${report.standing.best.toLocaleString("ru-RU")}`
        : "");
    void loadBoard();
    return;
  }

  if (report.reason === "guest") {
    box.innerHTML =
      "Ты играешь как гость - результат нигде не сохранён. Статистика ведётся " +
      `у игроков из <a href="${TG_BOT}" target="_blank" rel="noopener">Telegram</a>` +
      (AUTH_READY
        ? ` и с <a href="${loginUrl()}" target="_blank" rel="noopener">аккаунтом workaem</a>.`
        : `; вход через <a href="${signupUrl()}" target="_blank" rel="noopener">аккаунт workaem</a> скоро.`);
    return;
  }

  box.textContent = report.reason === "rejected"
    ? "Результат не принят сервером."
    : "Статистика сейчас недоступна - результат не записан.";
}

/**
 * Результат уровня - на сервер и в память.
 *
 * Отправляется на каждом финише, а не в конце забега: уровень считается
 * сам за себя, и выход в меню посреди пути не должен обнулять пройденное.
 * Место с сервера кладём на карточку уровня - это самый уместный момент,
 * чтобы его показать.
 */
async function submitLevel(): Promise<void> {
  const done = world.lastLevel;
  if (!done) return;

  const better = recordLevel(done.level, done);
  if (better && !progressSaved()) {
    world.levelPlace = "гость - результат не сохранён";
  }

  const sentTo = await reportLevel(done, anon);
  if (sentTo.standing?.place) {
    world.levelPlace = `место на уровне ${sentTo.standing.place} из ${sentTo.standing.total}`;
    stats = null;
  } else if (better && progressSaved()) {
    world.levelPlace = "личный рекорд уровня";
  }
}

/** Стартовый экран: рекорд, значки и выбор, с чего начать. */
function showStart(): void {
  const p = loadProgress();
  startContinue.hidden = p.reached === 0;
  startContinue.textContent = `Продолжить с уровня ${p.reached + 1}`;
  startStats.textContent = p.best
    ? `Личный рекорд ${p.best.toLocaleString("ru-RU")}`
    : "Двенадцать уровней от стажёра до оффера";
  paintBadges(startBadges, p.badges);
  paintWho();
  paintBoard();
  statsScreen.hidden = true;
  startScreen.hidden = false;
  paused = true;
}

function beginRun(from: number): void {
  resetReport();
  outroPlace.textContent = "";
  overPlace.textContent = "";
  world.newRun(from);
  startScreen.hidden = true;
  hideGameOver();
  hideOutro();
  paused = false;
  syncHud();
  canvas.focus();
}

startPlay.addEventListener("click", () => beginRun(0));
startContinue.addEventListener("click", () => beginRun(loadProgress().reached));
/**
 * Экран статистики. Открывается со стартового экрана и из меню; во время
 * игры туда ведёт кнопка «Меню» в шапке - раньше выйти из забега было
 * нельзя вовсе, кроме перезагрузки страницы.
 */
async function showStats(): Promise<void> {
  startScreen.hidden = true;
  hideGameOver();
  hideOutro();
  statsScreen.hidden = false;
  paused = true;
  // Открываем всегда с уровней: это главная таблица, а список игроков -
  // второй вопрос, который возникает уже после «а как у меня по уровням».
  statsTab = "levels";
  paintStats();
  if (!stats) {
    stats = await fetchStats();
    paintStats();
  }
}

function paintStats(): void {
  const mine = loadProgress().levels;
  const server = stats;

  tabLevels.classList.toggle("on", statsTab === "levels");
  tabPlayers.classList.toggle("on", statsTab === "players");
  statsLevels.hidden = statsTab !== "levels";
  playersBox.hidden = statsTab !== "players";

  statsLevels.innerHTML = LEVELS.map((lv, i) => {
    const level = i + 1;
    const row = server?.levels.find((r) => r.level === level);
    const my = server?.mine[String(level)];
    const local = mine[String(level)];

    // Своё показываем с сервера, если он ответил, иначе из памяти игры:
    // без сети экран всё равно должен что-то показывать.
    const meText = my
      ? `${my.score.toLocaleString("ru-RU")} · ${my.place} место`
      : local
        ? `${local.score.toLocaleString("ru-RU")} · ${clock(local.frames)}`
        : "-";
    const players = row ? `${row.players}` : "-";
    const top = (row?.top ?? [])
      .map(
        (t, k) =>
          `<li><span>${k + 1}.</span><span class="n">${t.name}</span>` +
          `<span>${t.score.toLocaleString("ru-RU")}</span><span>${clock(t.frames)}</span></li>`,
      )
      .join("");

    return (
      `<li><button type="button" class="row" data-level="${level}">` +
      `<span class="lv">${level}</span>` +
      `<span class="nm">${lv.name}</span>` +
      `<span class="me">${meText}</span>` +
      `<span class="pl">${players}</span>` +
      "</button>" +
      `<ol class="top" hidden>${top || "<li>Этот уровень пока никто не сдал</li>"}</ol></li>`
    );
  }).join("");

  const totals = server ? totalsLine(server.totals) : "";
  if (statsTab === "players") {
    statsNote.innerHTML =
      "Лучший забег целиком, по одной строке на игрока. Справа - сколько уровней пройдено." +
      (totals ? `<br>${totals}` : "");
    return;
  }
  statsNote.innerHTML = server
    ? "Слева - твой результат и место, справа - сколько игроков сдали уровень. " +
      "Нажми на строку, чтобы увидеть первую тройку. Карта уровня у всех одна " +
      "и та же, поэтому сравнение честное." +
      (totals ? `<br>${totals}` : "")
    : "Статистика не загрузилась - показаны только твои результаты из этого браузера.";
}

/**
 * Список игроков. Одна страница за раз: строк со временем станет тысячи,
 * а экран открывают с телефона внутри вебвью, где бесконечная прокрутка
 * воюет с прокруткой самой страницы. Постранично ещё и можно прыгнуть
 * прямо на своё место, а не доскроллить до него.
 */
async function loadPlayers(offset: number): Promise<void> {
  playersOffset = Math.max(0, offset);
  players = await fetchPlayers(playersOffset);
  paintPlayers();
}

function paintPlayers(): void {
  const page = players;
  if (!page) {
    playersRows.innerHTML = '<li class="empty">Список не загрузился</li>';
    playersPos.textContent = "";
    playersPrev.disabled = true;
    playersNext.disabled = true;
    playersMe.hidden = true;
    return;
  }

  const mine = myName();
  playersRows.innerHTML = page.rows.length
    ? page.rows
        .map((row) => {
          const mark = row.source === "tg" ? "◈" : "▣";
          return (
            `<li class="${row.name === mine ? "me" : ""}">` +
            `<span class="pl">${row.place}.</span>` +
            `<span class="nm">${mark} ${row.name}</span>` +
            `<span class="sc">${row.score.toLocaleString("ru-RU")}</span>` +
            `<span class="lv">${row.levels}/12</span>` +
            "</li>"
          );
        })
        .join("")
    : '<li class="empty">Пока никого - можно стать первым</li>';

  const from = page.offset + 1;
  const to = Math.min(page.offset + page.limit, page.total);
  // На пустой таблице «0-0 из 0» ничего не сообщает, кроме того, что тут
  // считали. Пусто - значит пусто, и это уже сказано строкой в списке.
  playersPos.textContent = page.total === 0 ? "" : `${from}-${to} из ${page.total}`;
  playersPrev.disabled = page.offset === 0;
  playersNext.disabled = to >= page.total;

  // Кнопка «к моему месту» появляется, только если место есть и оно не
  // на открытой странице: иначе она обещает переход, которого не будет.
  const place = page.mine?.place ?? 0;
  const onPage = place > page.offset && place <= page.offset + page.limit;
  playersMe.hidden = place === 0 || onPage;
}

tabLevels.addEventListener("click", () => {
  statsTab = "levels";
  paintStats();
});

tabPlayers.addEventListener("click", () => {
  statsTab = "players";
  paintStats();
  if (!players) void loadPlayers(0);
});

playersPrev.addEventListener("click", () => void loadPlayers(playersOffset - PAGE_SIZE));
playersNext.addEventListener("click", () => void loadPlayers(playersOffset + PAGE_SIZE));
playersMe.addEventListener("click", () => {
  const place = players?.mine?.place ?? 1;
  void loadPlayers(Math.floor((place - 1) / PAGE_SIZE) * PAGE_SIZE);
});

statsLevels.addEventListener("click", (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>(".row");
  if (!row) return;
  const list = row.nextElementSibling as HTMLElement | null;
  if (list) list.hidden = !list.hidden;
});

startStatsBtn.addEventListener("click", () => void showStats());
statsBack.addEventListener("click", () => showStart());

/**
 * Выход в меню посреди забега. Пройденные уровни уже записаны - каждый
 * отправляется на своём финише, - поэтому терять нечего, кроме текущей
 * попытки на текущем уровне.
 */
hudMenu.addEventListener("click", () => {
  showStart();
  canvas.blur();
});

// С клавиатуры стартовый экран тоже должен открываться нажатием: игру
// открывают и с ноутбука, и требовать там мышь ради одной кнопки незачем.
// На экране выгорания так нельзя - там ждут выбора, а не «любой клавиши».
window.addEventListener("keydown", (e) => {
  if (startScreen.hidden) return;
  if (e.code !== "Space" && e.code !== "Enter") return;
  e.preventDefault();
  beginRun(0);
});

overContinue.addEventListener("click", () => beginRun(world.levelIndex));
overRestart.addEventListener("click", () => beginRun(0));
overMenu.addEventListener("click", () => {
  hideGameOver();
  showStart();
});
imageBtn.addEventListener("click", () => void shareImage());

function syncSoundButton(): void {
  const off = isMuted();
  soundBtn.textContent = off ? "🔇" : "🔊";
  soundBtn.setAttribute("aria-label", off ? "Включить звук" : "Выключить звук");
  soundBtn.setAttribute("aria-pressed", String(off));
}

soundBtn.addEventListener("click", () => {
  toggleMute();
  syncSoundButton();
  canvas.focus();
});
syncSoundButton();

// Браузер запрещает звук до первого касания - разблокируем на нём.
for (const ev of ["pointerdown", "keydown"]) {
  window.addEventListener(ev, () => unlock(), { once: true });
}

replayBtn.addEventListener("click", () => {
  hideOutro();
  showStart();
});

let lastPhase = world.phase;

/** Один шаг физики. Вызывается строго TICKS_PER_SECOND раз в секунду. */
function step(): void {
  // На стартовом экране и после выгорания игра стоит: за спиной у меню
  // персонажу делать нечего.
  if (paused) {
    input.sample();
    return;
  }

  const state = input.sample();

  if (world.phase === "play") {
    world.update(state);
  } else {
    world.update({ left: false, right: false, downPressed: false, jump: false, jumpPressed: false });
    // На экранах между уровнями любое нажатие ведёт дальше. Финал и
    // выгорание - исключение: там ждут выбора кнопкой, а не «любой клавишей».
    if (state.confirm && world.phase !== "final" && world.phase !== "over") world.advance();
  }

  if (world.phase !== lastPhase) {
    if (lastPhase === "final" || lastPhase === "over") {
      hideOutro();
      hideGameOver();
    }
    if (world.phase === "over") showGameOver();
    lastPhase = world.phase;
  }
}

const STEP_MS = 1000 / TICKS_PER_SECOND;
/**
 * Сколько шагов подряд разрешено догонять за один кадр. Без потолка слабая
 * машина копит долг, каждый кадр считает всё больше шагов и проваливается
 * в спираль, из которой уже не выбирается.
 */
const MAX_CATCHUP = 5;

let accumulator = 0;
let prevTime = 0;

/**
 * Кадр экрана. Физика идёт своим ровным шагом, отрисовка - своим: на 60 Гц
 * и на 144 Гц игра одинаковая, разница только в плавности картинки.
 */
function frame(now: number): void {
  if (prevTime === 0) prevTime = now;
  let elapsed = now - prevTime;
  prevTime = now;

  // Вкладку свернули или телефон уснул: время шло, а игра стояла. Без обрезки
  // накопятся сотни шагов, и персонаж рванёт через полкарты за один кадр.
  if (elapsed > 250) elapsed = STEP_MS;
  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= STEP_MS && steps < MAX_CATCHUP) {
    accumulator -= STEP_MS;
    steps += 1;
    step();
  }
  // Упёрлись в потолок - значит машина не тянет. Лучше идти чуть медленнее,
  // чем накапливать долг, который всё равно никогда не отдать.
  if (steps === MAX_CATCHUP) accumulator = 0;

  // Тема включается по состоянию игры и молчит на экранах между уровнями:
  // там читают счёт, а не слушают. playMusic сам ничего не делает, если та
  // же тема уже играет, поэтому звать каждый кадр безопасно.
  if (world.phase === "play" || world.phase === "signing") {
    // В отпуске играет своя тема: половина ценности неуязвимости в том,
    // что слышно, как правила поменялись, а не только видно ореол.
    const tune = world.player.vacation > 0
      ? "vacation"
      : world.level.theme === "underground" ? "underground" : "surface";
    playMusic(tune);
    setHurry(world.secondsLeft <= T.hurrySeconds && world.phase === "play");
  } else {
    stopMusic();
    setHurry(false);
  }

  syncHud();
  renderer.draw(world);
  requestAnimationFrame(frame);
}

// Состояние игры доступно из консоли: без этого любую механику приходится
// проверять вслепую, гоняя персонажа стрелками до нужного места.
(window as unknown as { world: World }).world = world;

syncHud();
if (devLevel > 0) {
  startScreen.hidden = true;
  paused = false;
} else {
  showStart();
}
// Таблицу тянем после первого кадра: она приятное дополнение, и ждать
// её на старте незачем.
void loadBoard();
canvas.addEventListener("pointerdown", () => canvas.focus());

// Свернули игру - замолкаем. Иначе музыка играет человеку в другом чате.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspendAudio();
});
window.addEventListener("pagehide", () => suspendAudio());

// Поворот телефона меняет пропорции - пересчитываем кадр.
// orientationchange приходит до того, как размеры обновятся, поэтому resize.
window.addEventListener("resize", () => {
  fitViewport();
  renderer.resized();
});
// Внутри Telegram звать в Telegram незачем - там уже играют оттуда.
if (isTelegram()) {
  const tgLink = document.querySelector<HTMLElement>("#tg-link");
  if (tgLink) {
    tgLink.hidden = true;
    tgLink.previousElementSibling?.setAttribute("hidden", "");
  }
}
console.info(
  `Путь джуна · уровней: ${LEVELS.length} · темп: ${TICKS_PER_SECOND} шагов/с · среда: ${isTelegram() ? "Telegram Mini App" : "браузер"}`,
);
requestAnimationFrame(frame);
