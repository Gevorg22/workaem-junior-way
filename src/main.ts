import "./style.css";
import { LEVELS } from "./game/levels";
import { PAL } from "./game/palette";
import { Renderer } from "./game/render";
import { TUNING as T } from "./game/tuning";
import { World } from "./game/world";
import type { WorldEvent } from "./game/world";
import { Input } from "./platform/input";
import { currentUser, haptic, isTelegram, notify, setupViewport } from "./platform/telegram";

const WORKAEM = "https://www.workaem.com";

function need<E extends Element>(selector: string): E {
  const el = document.querySelector<E>(selector);
  if (!el) throw new Error(`Не найден элемент ${selector}`);
  return el;
}

const canvas = need<HTMLCanvasElement>("#stage");
canvas.width = T.viewW * T.scale;
canvas.height = T.viewH * T.scale;

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

setupViewport(PAL.sky);

const world = new World();
const renderer = new Renderer(canvas);
const input = new Input(canvas);

input.bindButton(need<HTMLElement>("#btn-left"), "left");
input.bindButton(need<HTMLElement>("#btn-right"), "right");
input.bindButton(need<HTMLElement>("#btn-jump"), "jump");

const HAPTICS: Partial<Record<WorldEvent, () => void>> = {
  stomp: () => haptic("medium"),
  pickup: () => haptic("light"),
  coffee: () => haptic("soft"),
  checkpoint: () => haptic("rigid"),
  hurt: () => notify("error"),
  death: () => notify("error"),
  clear: () => notify("success"),
  final: () => notify("success"),
};

world.on((event) => {
  HAPTICS[event]?.();
  if (event === "final") showOutro();
});

function syncHud(): void {
  hud.level.textContent = `Уровень ${world.levelIndex + 1} · ${world.level.name}`;
  hud.grade.textContent = world.level.grade;
  hud.skills.textContent = String(world.skills);
  hud.score.textContent = String(world.score);
  hud.lives.textContent = world.lives > 0 ? "♥".repeat(world.lives) : "—";
}

/** Финальный экран — единственное место, где игра отдаёт человека продукту. */
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
}

function hideOutro(): void {
  outro.hidden = true;
}

replayBtn.addEventListener("click", () => {
  hideOutro();
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
    // На экранах между уровнями любое нажатие ведёт дальше, кроме финала —
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
if (!isTelegram()) document.body.dataset["standalone"] = "true";
console.info(
  `Путь джуна · уровней: ${LEVELS.length} · среда: ${isTelegram() ? "Telegram Mini App" : "браузер"}`,
);
requestAnimationFrame(frame);
