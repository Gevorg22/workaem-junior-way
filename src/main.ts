import "./style.css";
import { LEVELS } from "./game/levels";
import { PAL } from "./game/palette";
import { Renderer } from "./game/render";
import { RENDER, TICKS_PER_SECOND, TUNING as T, VIEW, VIEW_W_MAX, VIEW_W_MIN } from "./game/tuning";
import { GRADE_NAMES } from "./game/types";
import { World } from "./game/world";
import type { WorldEvent } from "./game/world";
import { Input } from "./platform/input";
import { currentUser, haptic, isTelegram, notify, setupViewport } from "./platform/telegram";
import { reportRun, resetReport } from "./platform/report";
import { isMuted, play, toggleMute, unlock } from "./platform/audio";

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
  // половинное разрешение, и все сглаженные края выходят мылом. Потолок
  // в 3 держит число точек в разумных пределах на телефонах.
  const density = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
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
  lives: need<HTMLElement>("#hud-lives"),
  buffs: need<HTMLElement>("#hud-buffs"),
};

const outro = need<HTMLElement>("#outro");
const outroGrade = need<HTMLElement>("#outro-grade");
const outroStats = need<HTMLElement>("#outro-stats");
const jobsLink = need<HTMLAnchorElement>("#jobs-link");
const shareLink = need<HTMLAnchorElement>("#share-link");
const replayBtn = need<HTMLButtonElement>("#replay");
const soundBtn = need<HTMLButtonElement>("#sound");

setupViewport(PAL.sky);

const world = new World();

// Отладочный старт с нужного уровня: ?level=12. Только в режиме разработки -
// в собранной игре параметр игнорируется, иначе им можно было бы пропустить
// половину пути и попасть в таблицу рекордов почти сразу.
if (import.meta.env.DEV) {
  const want = Number(new URLSearchParams(location.search).get("level"));
  if (Number.isFinite(want) && want >= 1) world.loadLevel(Math.min(want, LEVELS.length) - 1);
  (window as unknown as { world: World }).world = world;
}
const renderer = new Renderer(canvas);
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
  throw: () => { haptic("light"); play("coin"); },
  vacation: () => { notify("success"); play("clear"); },
};

world.on((event) => {
  FEEDBACK[event]?.();
  if (event === "final") showOutro();
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
  hud.lives.textContent = world.lives > 0 ? "♥".repeat(world.lives) : "-";
}

/** Финальный экран - единственное место, где игра отдаёт человека продукту. */
function showOutro(): void {
  const user = currentUser();
  const who = user ? `${user.name}, ты` : "Ты";
  outroGrade.textContent = `${who} дошёл до грейда ЛИД`;
  outroStats.textContent =
    `Скиллов ${world.skills} · очков ${world.score} · смертей ${world.stats.deaths}`;

  jobsLink.href = `${WORKAEM}/jobs/l/development?utm_source=game&utm_medium=outro&utm_campaign=junior-way`;

  const text = `Прошёл «Путь джуна» до грейда ЛИД. Очков: ${world.score}. Проверь свой:`;
  const url = `${WORKAEM}?utm_source=game&utm_medium=share&utm_campaign=junior-way`;
  shareLink.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  outro.hidden = false;

  // Бот пришлёт результат в чат - там же, где кнопка на вакансии.
  // Сознательно без await: экран не должен ждать сеть.
  void reportRun(world.stats);
}

function hideOutro(): void {
  outro.hidden = true;
}

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
  resetReport();
  world.newRun();
  syncHud();
  canvas.focus();
});

let lastPhase = world.phase;

/** Один шаг физики. Вызывается строго TICKS_PER_SECOND раз в секунду. */
function step(): void {
  const state = input.sample();

  if (world.phase === "play") {
    world.update(state);
  } else {
    world.update({ left: false, right: false, downPressed: false, jump: false, jumpPressed: false });
    // На экранах между уровнями любое нажатие ведёт дальше, кроме финала -
    // там человек должен успеть увидеть ссылку на вакансии.
    if (state.confirm && world.phase !== "final") world.advance();
  }

  if (world.phase !== lastPhase) {
    if (lastPhase === "final" || lastPhase === "over") hideOutro();
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

  syncHud();
  renderer.draw(world);
  requestAnimationFrame(frame);
}

// Состояние игры доступно из консоли: без этого любую механику приходится
// проверять вслепую, гоняя персонажа стрелками до нужного места.
(window as unknown as { world: World }).world = world;

syncHud();
canvas.addEventListener("pointerdown", () => canvas.focus());

// Поворот телефона меняет пропорции - пересчитываем кадр.
// orientationchange приходит до того, как размеры обновятся, поэтому resize.
window.addEventListener("resize", () => {
  fitViewport();
  renderer.resized();
});
if (!isTelegram()) document.body.dataset["standalone"] = "true";
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
