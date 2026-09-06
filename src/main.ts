import "./style.css";
import { LEVELS } from "./game/levels";
import { PAL } from "./game/palette";
import { Renderer } from "./game/render";
import { TUNING as T, VIEW, VIEW_W_MAX, VIEW_W_MIN } from "./game/tuning";
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
  canvas.width = VIEW.w * T.scale;
  canvas.height = VIEW.h * T.scale;
}

fitViewport();

const hud = {
  level: need<HTMLElement>("#hud-level"),
  grade: need<HTMLElement>("#hud-grade"),
  skills: need<HTMLElement>("#hud-skills"),
  score: need<HTMLElement>("#hud-score"),
  lives: need<HTMLElement>("#hud-lives"),
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
const renderer = new Renderer(canvas);
const input = new Input(canvas);

input.bindButton(need<HTMLElement>("#btn-left"), "left");
input.bindButton(need<HTMLElement>("#btn-right"), "right");
input.bindButton(need<HTMLElement>("#btn-jump"), "jump");

/** Вибрация и звук идут парой: оба подтверждают действие, каждый своим каналом. */
const FEEDBACK: Partial<Record<WorldEvent, () => void>> = {
  stomp: () => { haptic("medium"); play("stomp"); },
  pickup: () => { haptic("light"); play("coin"); },
  coffee: () => { haptic("soft"); play("coffee"); },
  checkpoint: () => { haptic("rigid"); play("checkpoint"); },
  hurt: () => { notify("error"); play("hurt"); },
  death: () => { notify("error"); play("over"); },
  clear: () => { notify("success"); play("clear"); },
  final: () => { notify("success"); play("clear"); },
  jump: () => play("jump"),
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

function frame(): void {
  const state = input.sample();

  if (world.phase === "play") {
    world.update(state);
  } else {
    world.update({ left: false, right: false, jump: false, jumpPressed: false });
    // На экранах между уровнями любое нажатие ведёт дальше, кроме финала -
    // там человек должен успеть увидеть ссылку на вакансии.
    if (state.confirm && world.phase !== "final") world.advance();
  }

  if (world.phase !== lastPhase) {
    if (lastPhase === "final" || lastPhase === "over") hideOutro();
    lastPhase = world.phase;
  }

  syncHud();
  renderer.draw(world);
  requestAnimationFrame(frame);
}

syncHud();
canvas.addEventListener("pointerdown", () => canvas.focus());

// Поворот телефона меняет пропорции - пересчитываем кадр.
// orientationchange приходит до того, как размеры обновятся, поэтому resize.
window.addEventListener("resize", () => {
  fitViewport();
  renderer.resized();
});
if (!isTelegram()) document.body.dataset["standalone"] = "true";
console.info(
  `Путь джуна · уровней: ${LEVELS.length} · среда: ${isTelegram() ? "Telegram Mini App" : "браузер"}`,
);
requestAnimationFrame(frame);
