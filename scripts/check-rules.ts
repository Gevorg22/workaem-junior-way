/**
 * Проверка правил, которые нельзя увидеть глазами.
 *
 * Карты проверяются геометрией, физика - автопрохождением, а вот начисления
 * и переходы фаз до сих пор проверялись только руками: сыграл, посмотрел,
 * вроде работает. Так пропускается ровно то, что ломается тише всего -
 * цепочка, которая молча платит одну и ту же ставку, или комната, из которой
 * забыли вернуть прежний уровень.
 *
 * Каждый пункт здесь - правило, на которое опирается баланс:
 *   цепочка растёт и рвётся приземлением;
 *   сотня скиллов даёт жизнь;
 *   верхушка флагштока дороже основания;
 *   финиш доводит уровень до зачёта, а не подвешивает его;
 *   бонусная комната возвращает мир таким же, каким взяла;
 *   пройденный уровень восполняет жизни, выгорание начинает путь сначала;
 *   звёзды даются за проход, за все скиллы и за норму времени;
 *   невидимый ящик ловит только удар снизу, заначка отдаёт свои скиллы;
 *   в каждом замке мини-босс, механики мира не приходят раньше времени;
 *   уровень с карты возвращает на карту, а не ведёт дальше.
 */
import {
  bonusRoom, levelCode, LEVELS, ROOM_GEMS, STAGES_PER_WORLD, WORLDS,
} from "../src/game/levels";
import { countStars, STARS, World } from "../src/game/world";
import {
  COIN_HITS, COMBO_SCORE, INTRO_FRAMES, MAX_CARRY_LIVES, PLAYER_H_BIG, PLAYER_H_SMALL, POLE_H,
  SKILLS_PER_LIFE, TICKS_PER_SECOND, TUNING as T, VIEW,
} from "../src/game/tuning";
import { GROUND_Y } from "../src/game/segments";
import type { InputState, LevelResult } from "../src/game/world";
import { anonName, cleanName, dayKey, hashId, weekKey } from "../worker/board.js";
import { checkLevel, checkRun } from "../worker/anticheat.js";
import { verifyWorkaem } from "../worker/auth.js";

const idle: InputState = { left: false, right: false, jump: false, jumpPressed: false };
const down: InputState = { ...idle, downPressed: true };

let bad = 0;
function ok(condition: boolean, what: string): void {
  if (condition) {
    console.log(`  ok   ${what}`);
    return;
  }
  bad += 1;
  console.log(`  ПЛОХО ${what}`);
}

/** Враг на заданном месте: цепочку надо строить из чего-то предсказуемого. */
function foeAt(x: number, y: number) {
  return {
    kind: "legacy" as const, x, y, baseY: y, min: x - 2, max: x + 2,
    dir: 1 as const, speed: 0, w: 12, h: 10, squashed: 0, hp: 1,
  };
}

/** Довести уровень до зачёта: встать у флагштока и дождаться конца анимации. */
function finish(w: World): void {
  const p = w.player;
  w.boss = null;
  p.x = w.level.pole.x - 4;
  p.y = w.level.groundY - p.h - 1;
  w.update({ ...idle, right: true });
  for (let n = 0; n < 400 && w.phase === "signing"; n++) w.update(idle);
}

console.log("заставка и фазы");
{
  const w = new World();
  ok(w.phase === "intro", "забег начинается заставкой уровня");
  for (let i = 0; i < INTRO_FRAMES; i++) w.update(idle);
  ok(w.phase === "play", `заставка уходит сама за ${INTRO_FRAMES} кадров`);
}

console.log("\nцепочка растаптываний");
{
  const w = new World();
  w.loadLevel(1);
  w.phase = "play";
  const p = w.player;
  w.foes = [foeAt(60, GROUND_Y - 10), foeAt(300, 60)];
  w.gems = [];
  w.coffee = [];

  p.x = 60; p.y = GROUND_Y - 23; p.vy = 2; p.onGround = false; p.hurt = 0;
  let before = w.score;
  w.update(idle);
  ok(w.combo === 1 && w.score - before === COMBO_SCORE[0], `первый растоптанный: ${w.score - before}`);

  p.x = 300; p.y = 47; p.vy = 2; p.onGround = false; p.hurt = 0;
  before = w.score;
  w.update(idle);
  ok(w.combo === 2 && w.score - before === COMBO_SCORE[1], `второй в том же прыжке: ${w.score - before}`);
  ok(w.stats.maxCombo === 2, "лучшая цепочка забега записана");

  w.foes = [];
  p.x = 300; p.y = GROUND_Y - p.h - 1; p.vy = 1; p.hurt = 0;
  for (let i = 0; i < 4; i++) w.update(idle);
  ok(p.onGround && w.combo === 0, "приземление рвёт цепочку");
}

console.log("\nжизнь за скиллы");
{
  const w = new World();
  w.loadLevel(2);
  w.phase = "play";
  w.skills = SKILLS_PER_LIFE - 1;
  const lives = w.lives;
  const p = w.player;
  w.gems = [{ x: p.x + 1, y: p.y + 1, taken: false }];
  w.update(idle);
  ok(w.lives === lives + 1, `сотый скилл даёт жизнь: было ${lives}, стало ${w.lives}`);
}

console.log("\nфлагшток");
{
  const low = new World();
  low.loadLevel(3);
  low.phase = "play";
  low.player.x = low.level.pole.x - 4;
  low.player.y = low.level.groundY - low.player.h - 1;
  let before = low.score;
  low.update({ ...idle, right: true });
  const ground = low.score - before;
  ok(low.phase === "signing", "касание шеста включает финиш");

  const high = new World();
  high.loadLevel(3);
  high.phase = "play";
  high.player.x = high.level.pole.x - 4;
  high.player.y = high.level.pole.y - POLE_H;
  before = high.score;
  high.update({ ...idle, right: true });
  const top = high.score - before;
  ok(top > ground * 5, `верхушка дороже основания: ${top} против ${ground}`);

  let n = 0;
  while (high.phase === "signing" && n < 400) {
    high.update(idle);
    n += 1;
  }
  ok(high.phase === "clear" && high.stats.levelsCleared === 1, `анимация финиша доходит до зачёта за ${n} кадров`);

  // Шест можно перепрыгнуть с верхней ступени - тогда уровень обязан
  // засчитаться у двери, иначе игрок ходит по тупику до конца времён.
  const past = new World();
  past.loadLevel(3);
  past.phase = "play";
  past.player.x = past.level.door.x + 10;
  past.player.y = past.level.groundY - past.player.h - 1;
  past.update(idle);
  ok(past.phase === "signing", "дверь ловит того, кто перепрыгнул шест");
}

console.log("\nбонусные комнаты");
{
  const bonusLevels = LEVELS.filter((lv) => lv.pipes.some((pipe) => pipe.bonus));
  ok(bonusLevels.length > 0, `бонусные трубы есть на ${bonusLevels.length} уровнях`);

  const room = bonusRoom(1234, 1.5);
  ok(room.gems.length === ROOM_GEMS, `в комнате ${room.gems.length} скиллов`);
  ok(room.hazards.length === 0 && room.foes.length === 0, "в комнате нет ни прода, ни врагов");
  ok(room.pipes.some((pipe) => pipe.exit), "из комнаты есть обратная труба");
  ok(room.pole.x > room.width && room.door.x > room.width, "финиш комнаты унесён за карту");
  // Верхний ряд обязан быть доставаемым: скилл, до которого не допрыгнуть,
  // это не награда, а насмешка. Считаем по макушке в верхней точке прыжка,
  // а не по ногам - скилл берут головой.
  const jumpRise = (T.jumpImpulse * T.jumpImpulse) / (2 * T.gravity);
  const apexHead = GROUND_Y - jumpRise - PLAYER_H_SMALL;
  const highest = Math.min(...room.gems.map((g) => g.y));
  ok(highest + 9 > apexHead, `верхний ряд достаётся прыжком: y=${highest}, макушка ${apexHead.toFixed(0)}`);

  const index = LEVELS.findIndex((lv) => lv.pipes.some((pipe) => pipe.bonus));
  const w = new World();
  w.loadLevel(index);
  w.phase = "play";
  const pipe = w.level.pipes.find((o) => o.bonus)!;
  const outside = w.level;
  const p = w.player;
  const standOn = (o: { x: number; y: number; w: number }): void => {
    p.x = o.x + o.w / 2 - p.w / 2;
    p.y = o.y - p.h;
    p.onGround = true;
    p.vy = 0;
  };

  standOn(pipe);
  w.update(down);
  ok(w.inRoom, "спуск в заначку по кнопке вниз");

  const skillsBefore = w.skills;
  for (const g of w.gems) {
    p.x = g.x;
    p.y = g.y;
    p.hurt = 0;
    w.update(idle);
  }
  ok(w.skills - skillsBefore === ROOM_GEMS, `в комнате собирается ${w.skills - skillsBefore} скиллов`);

  standOn(w.level.pipes.find((o) => o.exit)!);
  w.update(down);
  ok(!w.inRoom && w.level === outside, "обратная труба возвращает прежний уровень");
  ok(Math.abs(p.x + p.w / 2 - (pipe.x + pipe.w / 2)) < 2, "выход - на ту же трубу");

  p.onGround = true;
  p.vy = 0;
  w.update(down);
  ok(!w.inRoom, "второй раз та же труба не пускает");

  // Таймер обязан выносить наружу сам: иначе в комнате можно жить.
  const timed = new World();
  timed.loadLevel(index);
  timed.phase = "play";
  const pipe2 = timed.level.pipes.find((o) => o.bonus)!;
  timed.player.x = pipe2.x + pipe2.w / 2 - timed.player.w / 2;
  timed.player.y = pipe2.y - timed.player.h;
  timed.player.onGround = true;
  timed.update(down);
  let frames = 0;
  while (timed.inRoom && frames < 3000) {
    timed.update(idle);
    frames += 1;
  }
  ok(!timed.inRoom && frames < 1300, `таймер выносит наружу за ${frames} кадров`);
  ok(timed.phase === "play", "после комнаты игра продолжается, а не встаёт");
}

console.log("\nрезультат уровня");
{
  // Уровень считается сам за себя, поэтому его результат обязан появиться
  // на финише - и не тащить в себе бонус за принесённые с собой жизни.
  const g = new World();
  g.loadLevel(1);
  g.phase = "play";
  g.lives = 3;
  const p = g.player;
  p.x = g.level.pole.x - 4;
  p.y = g.level.groundY - p.h - 1;
  g.stats.frames = 2500;
  g.update({ ...idle, right: true });
  let n = 0;
  while (g.phase === "signing" && n < 400) {
    g.update(idle);
    n += 1;
  }
  const done = g.lastLevel;
  ok(done !== null, "результат уровня появился на финише");
  ok(done?.level === 2, `номер уровня с единицы: ${done?.level}`);
  ok(
    done !== null && done.score < g.score,
    `за уровень ${done?.score} меньше общего счёта ${g.score} - бонус за жизни не в счёт уровня`,
  );
  ok(done !== null && done.frames > 0, `время уровня посчитано: ${done?.frames} кадров`);

  // Тот же результат обязан пройти отсечку - её потолки считаются из карты.
  const verdict = done ? checkLevel(done) : { ok: false, reason: "нет результата" };
  ok(verdict.ok, `античит принимает честный уровень${verdict.ok ? "" : `: ${verdict.reason}`}`);
  if (done) {
    ok(!checkLevel({ ...done, score: 10 ** 7 }).ok, "очки сверх карты отвергаются");
    ok(!checkLevel({ ...done, frames: 60 }).ok, "уровень за секунду отвергается");
    ok(!checkLevel({ ...done, level: 99 }).ok, "несуществующий уровень отвергается");
  }
}

console.log("\nжизни и выгорание");
{
  const w = new World();
  w.phase = "clear";
  w.lives = 1;
  w.advance();
  ok(w.levelIndex === 1 && w.lives === T.startLives, `пройденный уровень восполняет жизни: 1 -> ${w.lives}`);

  const spare = new World();
  spare.phase = "clear";
  spare.lives = T.startLives + 1;
  spare.advance();
  ok(spare.lives === T.startLives + 1, "лишняя жизнь при переходе не сгорает");

  const rich = new World();
  rich.phase = "clear";
  rich.lives = 12;
  rich.advance();
  ok(rich.lives === MAX_CARRY_LIVES, `копилка переносится не больше ${MAX_CARRY_LIVES}: ${rich.lives}`);

  const burnt = new World();
  burnt.loadLevel(7);
  burnt.phase = "play";
  burnt.lives = 1;
  burnt.player.y = VIEW.h + 60;
  burnt.update(idle);
  ok(burnt.phase === "over", "последняя жизнь в яме - выгорание");
  burnt.advance();
  ok(
    burnt.levelIndex === 0 && burnt.lives === T.startLives && burnt.stats.startLevel === 0,
    "после выгорания путь с первого уровня, продолжения нет",
  );
}

console.log("\nзвёзды");
{
  const perfect = new World();
  perfect.loadLevel(1);
  perfect.phase = "play";
  for (const g of perfect.gems) g.taken = true;
  finish(perfect);
  const all = perfect.lastLevel?.stars ?? 0;
  ok(countStars(all) === 3, `все скиллы и в норму - три звезды: ${countStars(all)}`);

  const slow = new World();
  slow.loadLevel(1);
  slow.phase = "play";
  slow.stats.frames = (slow.par + 5) * TICKS_PER_SECOND;
  finish(slow);
  const one = slow.lastLevel?.stars ?? 0;
  ok(one === STARS.clear, `без скиллов и не в норму - только звезда за проход: ${countStars(one)}`);
  ok(
    LEVELS.every((lv) => lv.par >= 20 && lv.par % 5 === 0),
    `у каждого уровня своя норма, кратная пяти секундам: ${LEVELS.map((lv) => lv.par).join(", ")}`,
  );
}

console.log("\nсекреты");
{
  const w = new World();
  w.loadLevel(0);
  w.phase = "play";
  w.foes = [];
  w.gems = [];
  const box = w.blocks.find((b) => b.hidden);
  ok(box !== undefined, "на первом уровне спрятан невидимый ящик");
  if (box) {
    // Камеру - к ящику: предметы за краем кадра мир убирает, и сердце
    // исчезло бы раньше, чем его поймают.
    w.camera = box.x - VIEW.w / 2;
    const p = w.player;
    // Сбоку, на бегу, - насквозь.
    p.x = box.x - p.w - 1;
    p.y = box.y + 1;
    p.vx = 1.2;
    p.vy = 0;
    p.hurt = 0;
    w.update({ ...idle, right: true });
    ok(p.x > box.x - p.w && !box.used, "сбоку невидимый ящик не держит и не проявляется");

    // Снизу, в прыжке, - проявляется и отдаёт жизнь.
    p.x = box.x + 2;
    p.y = box.y + 13;
    p.vy = -3;
    w.update({ ...idle, jump: true });
    ok(box.used, "удар снизу проявляет ящик");
    const heart = w.items.find((i) => i.kind === "life");
    ok(heart !== undefined, "из него выходит жизнь");
    if (heart) {
      // Сердце уже выехало на крышу ящика - ловим его там. Внутри самого
      // ящика ловить нельзя: проявившийся ящик твёрд и выталкивает игрока.
      const lives = w.lives;
      heart.rise = 0;
      heart.y = box.y - 12;
      p.x = heart.x;
      p.y = heart.y - 1;
      p.vy = 0;
      p.hurt = 0;
      w.update(idle);
      ok(w.lives === lives + 1, `сердце даёт жизнь: ${lives} -> ${w.lives}`);
    }
  }
  const hiddenLives = LEVELS.map((lv) => lv.blocks.filter((b) => b.hidden && b.drop === "life").length);
  ok(
    WORLDS.every((_, wi) => hiddenLives.slice(wi * STAGES_PER_WORLD, (wi + 1) * STAGES_PER_WORLD).some((n) => n > 0)),
    `в каждом мире спрятана жизнь: ${hiddenLives.join(" ")}`,
  );
}
{
  const index = LEVELS.findIndex((lv) => lv.blocks.some((b) => b.kind === "coins"));
  ok(index >= 0, `кирпич-заначка встречается уже на ${levelCode(index)}`);
  const w = new World();
  w.loadLevel(index);
  w.phase = "play";
  w.foes = [];
  w.gems = [];
  const brick = w.blocks.find((b) => b.kind === "coins")!;
  const p = w.player;
  // Сеньор - чтобы убедиться, что заначку он не разбивает, как обычный кирпич.
  p.grade = 2;
  p.h = PLAYER_H_BIG;
  let got = 0;
  for (let i = 0; i < COIN_HITS + 4; i++) {
    const before = w.skills;
    brick.bump = 0;
    p.x = brick.x + 2;
    p.y = brick.y + 13;
    p.vy = -3;
    p.hurt = 0;
    w.update({ ...idle, jump: true });
    got += w.skills - before;
  }
  ok(got === COIN_HITS, `кирпич-заначка отдаёт ${got} скиллов из ${COIN_HITS}`);
  ok(!brick.broken && brick.used, "сеньор её не разбивает, а пустая гаснет");
}

console.log("\nмиры и замки");
{
  ok(LEVELS.length === WORLDS.length * STAGES_PER_WORLD, `${WORLDS.length} мира по ${STAGES_PER_WORLD} уровня`);
  ok(
    LEVELS.every((lv, i) => (i % STAGES_PER_WORLD === STAGES_PER_WORLD - 1) === (lv.boss !== null)),
    "мини-босс есть в каждом замке и только там",
  );
  ok(
    LEVELS.every((lv, i) => i % STAGES_PER_WORLD !== STAGES_PER_WORLD - 1 || lv.theme === "castle"),
    "третий уровень мира - замок",
  );
  ok(
    LEVELS.every((lv, i) => i % STAGES_PER_WORLD !== 1 || lv.theme === "underground" || lv.theme === "sky"),
    "второй уровень мира - подземелье или небо",
  );
  const test = LEVELS[STAGES_PER_WORLD - 1]?.boss;
  const final = LEVELS[LEVELS.length - 1]?.boss;
  ok(
    !!test && !!final && test.maxHp < final.maxHp && test.throwEvery === 0 && final.throwEvery > 0,
    "тестовое задание мягче финального собеса",
  );

  // Механика мира не приходит раньше своего мира - ни в середине, ни в концовке.
  for (const [i, lv] of LEVELS.entries()) {
    const kinds = new Set(lv.foes.map((f) => f.kind));
    const early: string[] = [];
    if (lv.world < 1 && (lv.pipes.length || lv.moving.length || kinds.has("call"))) early.push("трубы, лифты или созвоны");
    if (lv.world < 2 && (lv.rotors.length || lv.swamps.length || kinds.has("debt"))) early.push("ротации, болото или техдолг");
    if (lv.world < 3 && (kinds.has("hr") || lv.deadlineSpeed > 0)) early.push("рекрутёры или дедлайн");
    if (early.length) ok(false, `${levelCode(i)} ${lv.name}: раньше своего мира - ${early.join(", ")}`);
  }

  // Бой: тестовое задание не кидается, HR уже кидается вопросами.
  const fight = (index: number): number => {
    const w = new World();
    w.loadLevel(index);
    w.phase = "play";
    w.lives = 99;
    const b = w.boss!;
    w.player.x = b.min + 4;
    w.player.y = w.level.groundY - w.player.h - 1;
    let most = 0;
    for (let n = 0; n < 600; n++) {
      w.update(idle);
      most = Math.max(most, w.questions.length);
    }
    return most;
  };
  ok(fight(STAGES_PER_WORLD - 1) === 0, "тестовое задание вопросов не кидает");
  ok(fight(STAGES_PER_WORLD * 2 - 1) > 0, "HR-скрининг кидается вопросами");
}

console.log("\nкарта мира");
{
  const w = new World();
  const seen: string[] = [];
  w.on((e) => seen.push(e));
  w.newRun(4, true);
  ok(w.single && w.levelIndex === 4, "уровень с карты начинается сразу с него");
  w.phase = "play";
  finish(w);
  ok(w.phase === "clear", "уровень с карты доходит до зачёта");
  w.advance();
  ok(seen.includes("mapBack") && w.levelIndex === 4, "после зачёта - обратно на карту, а не на следующий уровень");
}

console.log("\nтаблица рекордов");
{
  // Ключ недели по ISO: неделя принадлежит году своего четверга, иначе
  // конец декабря и начало января попадали бы в разные таблицы посреди
  // одной и той же недели.
  ok(weekKey(new Date("2026-09-09T12:00:00Z")) === "2026-W37", "номер недели считается по ISO");
  ok(
    weekKey(new Date("2026-12-31T12:00:00Z")) === weekKey(new Date("2027-01-01T12:00:00Z")),
    "неделя на стыке года не разрывается",
  );
  ok(dayKey(new Date("2026-09-09T23:59:00Z")) === "2026-09-09", "ключ дня - дата по UTC");

  // Имя показывается всем и попадает в Markdown сообщения бота: разметку
  // и управляющие символы из него надо вычищать, иначе это инъекция.
  ok(cleanName("  *Геворг*  ") === "Геворг", "разметка из имени вырезается");
  ok(cleanName("") === "Джун", "пустое имя заменяется");
  ok(cleanName("a".repeat(50)).length <= 18, "длинное имя обрезается");
  ok(anonName("1a2b3c4d") === "Джун #1a2b", "анонимное имя узнаваемо между забегами");

  // Хеш id: в таблицу пишется он, а не сам идентификатор.
  const h1 = await hashId("tg", "123", "соль");
  const h2 = await hashId("tg", "123", "соль");
  const h3 = await hashId("tg", "124", "соль");
  ok(h1 === h2 && h1 !== h3, "хеш id стабилен и различает игроков");
  ok(!h1.includes("123"), "сырой id в хеш не протекает");
}

console.log("\nвход через workaem");
{
  // Тот же токен, что будет выдавать workaem: JWT с HS256 на общем секрете.
  // Проверка подписи - единственное, что отделяет владельца аккаунта от
  // любого, кто откроет игру и назовётся чужим ником.
  const secret = "секрет-для-проверки";
  const b64 = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  async function sign(payload: unknown, withSecret = secret): Promise<string> {
    const head = b64({ alg: "HS256", typ: "JWT" });
    const body = b64(payload);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(withSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${Buffer.from(mac).toString("base64url")}`;
  }

  const now = Math.floor(Date.now() / 1000);
  const good = await sign({ sub: "u-42", name: "Геворг", iat: now, exp: now + 3600 });
  const fine = await verifyWorkaem(good, secret);
  ok(fine.ok && fine.user.id === "u-42" && fine.user.name === "Геворг", "правильный токен принимается");

  const alien = await sign({ sub: "u-42", name: "Геворг", iat: now, exp: now + 3600 }, "чужой секрет");
  ok(!(await verifyWorkaem(alien, secret)).ok, "токен с чужой подписью отвергается");

  const stale = await sign({ sub: "u-42", name: "Геворг", iat: now - 7200, exp: now - 60 });
  ok(!(await verifyWorkaem(stale, secret)).ok, "просроченный токен отвергается");

  // Классическая дыра JWT: alg none и подпись «не проверяем».
  const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "u-1", exp: now + 60 })}.`;
  ok(!(await verifyWorkaem(none, secret)).ok, "alg none отвергается");

  const noSub = await sign({ name: "Никто", iat: now, exp: now + 3600 });
  ok(!(await verifyWorkaem(noSub, secret)).ok, "токен без sub отвергается");
  ok(!(await verifyWorkaem(good, "")).ok, "без секрета на сервере никто не входит");
}

console.log("\nантичит на честном забеге");
{
  // Проверка не должна отвергать живого игрока: именно так ломается
  // отсечка накрутки - молча, отказом честным.
  const w = new World();
  w.newRun(0);
  w.phase = "play";

  const honestLevels: LevelResult[] = [];
  let frames = 0;
  let stuck = 0;
  let best = 0;
  let hold = 0;
  while (frames < 20000 && w.stats.levelsCleared < 3) {
    frames += 1;
    const p = w.player;
    if (w.phase === "intro") {
      w.phase = "play";
      continue;
    }
    if (w.phase === "clear") {
      // Результат каждого пройденного уровня тоже обязан проходить отсечку:
      // именно эти числа уходят в таблицу уровней.
      if (w.lastLevel) honestLevels.push(w.lastLevel);
      w.advance();
      continue;
    }
    if (w.phase === "over" || w.phase === "final") break;

    // Бот играет плохо и умирает часто, поэтому жизни ему возвращаем -
    // но ровно до трёх, стартовых. Дать ему сотню было нельзя: бонус за
    // финиш уровня считается от числа жизней, и с сотней счёт улетал за
    // любой честный потолок. То есть проверка сначала поймала не античит,
    // а сама себя - на нечестном забеге.
    w.lives = 3;

    // Простейший бот: беги вправо, прыгай, когда впереди нет земли или
    // когда упёрся. Ему не надо играть красиво - надо набрать настоящую
    // статистику настоящей физикой.
    const feet = p.y + p.h;
    const edge = p.x + p.w;
    const support = [...w.level.platforms, ...w.level.pipes, ...w.moving].some(
      (o) => edge + 10 >= o.x && edge + 10 <= o.x + o.w && o.y >= feet - 2 && o.y <= feet + 26,
    );
    if (p.onGround && (!support || Math.abs(p.vx) < 0.15)) hold = 14;
    if (hold > 0) hold -= 1;
    const jump = hold > 0;
    w.update({ left: false, right: true, jump, jumpPressed: jump });

    if (p.x > best + 0.5) {
      best = p.x;
      stuck = 0;
    } else if (++stuck > 2000) break;
  }

  const stats = w.stats;
  ok(stats.levelsCleared >= 1, `бот прошёл ${stats.levelsCleared} уровня и набрал ${stats.score} очков`);
  const verdict = checkRun(stats);
  ok(verdict.ok, `античит принимает честный забег${verdict.ok ? "" : `: ${verdict.reason}`}`);

  // А теперь то же самое, но с подкрученным счётом и временем.
  ok(!checkRun({ ...stats, score: stats.score * 4 + 100000 }).ok, "накрученные очки отвергаются");
  ok(!checkRun({ ...stats, frames: 300 }).ok, "уровни за пять секунд отвергаются");
  ok(!checkRun({ ...stats, maxCombo: stats.stomps + 5 }).ok, "цепочка длиннее числа растоптанных отвергается");
  ok(!checkRun({ ...stats, skills: 100000 }).ok, "скиллов больше, чем на картах, отвергается");

  ok(honestLevels.length > 0, `собрано результатов уровней: ${honestLevels.length}`);
  for (const lv of honestLevels) {
    const v = checkLevel(lv);
    ok(
      v.ok,
      `уровень ${lv.level}: ${lv.score} очков, ${lv.frames} кадров, ${lv.deaths} смертей` +
        `${v.ok ? "" : ` - ${v.reason}`}`,
    );
  }
}

console.log(
  bad === 0
    ? "\nправила начислений и переходов держатся"
    : `\nСЛОМАННЫХ ПРАВИЛ: ${bad}`,
);
process.exit(bad === 0 ? 0 : 1);
