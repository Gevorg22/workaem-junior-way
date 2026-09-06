/**
 * Автопрохождение уровней настоящей игровой физикой.
 *
 * Проверки геометрии смотрят, нет ли непрыгаемых ям и не перекрыт ли проход.
 * Но геометрия бывает в порядке, а уровень всё равно непроходим - например,
 * враг стоит ровно в единственном узком месте. Этот тест играет по-настоящему.
 *
 * Бот пробует несколько стратегий прыжка, а не одну. Живой игрок дозирует
 * прыжок по обстановке, и подделать это одной эвристикой не выходит: любая
 * настройка чинит одно место и ломает другое. Поэтому уровень считается
 * проходимым, если справилась хотя бы одна стратегия - это и есть вопрос
 * «можно ли тут пройти вообще», а не «умеет ли мой бот».
 */
import { LEVELS } from "../src/game/levels";
import { World } from "../src/game/world";
import type { InputState } from "../src/game/world";
import { PLAYER_H_BIG, TICKS_PER_SECOND, TUNING as T } from "../src/game/tuning";

interface Policy {
  name: string;
  /** Сколько кадров держать прыжок. */
  hold: number;
  /** За сколько пикселей до края земли начинать прыгать. */
  lookahead: number;
  /**
   * Мерить прыжок по следующей опоре вместо фиксированной длины.
   * Нужно там, где яму переходят по балкам: полный прыжок с разбега
   * проносит игрока мимо ступеньки и он бьётся головой в её торец.
   */
  adaptive?: boolean;
}

const POLICIES: Policy[] = [
  { name: "короткий",   hold: 7,  lookahead: 10 },
  { name: "средний",    hold: 11, lookahead: 14 },
  { name: "длинный",    hold: 16, lookahead: 14 },
  { name: "ранний",     hold: 16, lookahead: 22 },
  { name: "поздний",    hold: 16, lookahead: 6 },
  { name: "осторожный", hold: 13, lookahead: 20 },
  { name: "по ступенькам", hold: 16, lookahead: 12, adaptive: true },
];

/**
 * Живой игрок не держит одну длину прыжка на весь уровень: перед широкой
 * ямой прыгает во всю силу, на мостике из балок - короткими шагами. Ни одна
 * стратегия с постоянной длиной такое не воспроизводит, и уровень, который
 * человек проходит спокойно, у бота числился непроходимым.
 *
 * Поэтому если фиксированные стратегии не справились, идёт перебор: длина
 * каждого прыжка берётся случайно, но от зерна - значит результат
 * воспроизводим и упавшую проверку можно повторить.
 */
const SEARCH_SEEDS = 60;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ближайшая опора впереди, на которую вообще можно попасть прыжком.
 * Возвращает её верх - по нему и меряется, насколько сильно прыгать.
 */
function nextSurface(w: World, edge: number, feet: number): number | null {
  let bestX = Infinity;
  let top: number | null = null;
  for (const o of [...w.level.platforms, ...w.level.pipes, ...w.moving]) {
    if (o.x + o.w < edge + 1 || o.x > edge + 58) continue;
    if (o.y > feet + 34 || o.y < feet - 42) continue;
    if (o.x < bestX) { bestX = o.x; top = o.y; }
  }
  return top;
}

function groundUnder(w: World, x: number, feet: number): boolean {
  const lifts = w.moving;
  return [...w.level.platforms, ...w.level.pipes, ...lifts].some(
    (p) => x >= p.x - 1 && x <= p.x + p.w + 1 && p.y >= feet - 2 && p.y <= feet + 26,
  );
}

function attempt(index: number, policy: Policy, seed?: number, big = false) {
  const rnd = seed === undefined ? null : seeded(seed);
  const w = new World();
  w.loadLevel(index);
  w.phase = "play";
  w.lives = 99;
  // Проход большим - отдельная задача, а не тот же самый с запасом прочности.
  // Выросший игрок вдвое выше и не пролезает там, где маленький проходит не
  // заметив. Именно так в прод уехала колонна ящиков с просветом 21 пиксель
  // при росте 22: бот всегда бегал маленьким и ни разу в неё не упёрся.
  if (big) {
    w.player.grade = 1;
    w.player.h = PLAYER_H_BIG;
    w.player.y = w.level.groundY - PLAYER_H_BIG - 1;
  }

  let hold = 0;
  let best = 0;
  let stuck = 0;
  let frames = 0;
  /** Кадры отхода назад после попадания по боссу - пока он неуязвим. */
  let retreat = 0;

  for (; frames < 24000; frames++) {
    const p = w.player;
    const feet = p.y + p.h;
    const edge = p.x + p.w;
    if (hold > 0) hold -= 1;

    if (p.onGround) {
      let gap = false;
      for (let d = 2; d <= policy.lookahead; d += 2) {
        if (!groundUnder(w, edge + d, feet)) { gap = true; break; }
      }
      const danger =
        w.foes.some((f) => !f.squashed && f.x > p.x && f.x - p.x < 26 && Math.abs(f.y - feet) < 30) ||
        w.level.hazards.some((h) => h.x > edge && h.x - edge < 22);
      if (gap || danger || Math.abs(p.vx) < 0.15) {
        if (rnd) {
          hold = 5 + Math.floor(rnd() * 14);
        } else if (policy.adaptive) {
          const top = nextSurface(w, edge, feet);
          // Подъём меряем от ног до цели: чем выше ступенька, тем дольше
          // держим прыжок. Ровная или нижняя ступенька - короткий подскок.
          const rise = top === null ? 99 : feet - top;
          hold = rise <= 8 ? 6 : rise <= 20 ? 9 : rise <= 32 ? 12 : 16;
        } else {
          hold = policy.hold;
        }
      }
    }

    // Бой с боссом. Он сам идёт на игрока, поэтому тактика простая:
    // подпустить, прыгнуть на голову, отойти на время неуязвимости.
    let goLeft = false;
    let goRight = true;
    const boss = w.boss;
    if (boss && boss.dying === 0) {
      const dist = boss.x + boss.w / 2 - (p.x + p.w / 2);
      if (retreat > 0) {
        retreat -= 1;
        goRight = false;
        goLeft = dist > 0;
      } else if (boss.hit > 0) {
        retreat = 40;
      } else if (Math.abs(dist) < 12) {
        // Вплотную прыгать бесполезно: нужен разбег, чтобы попасть по голове.
        retreat = 26;
      } else if (p.onGround && dist > 12 && dist < 40) {
        hold = rnd ? 8 + Math.floor(rnd() * 8) : policy.hold;
      } else if (dist < 0) {
        // Босс остался позади - возвращаемся, дверь всё равно заперта.
        goRight = false;
        goLeft = true;
      }
    }

    const jump = hold > 0;
    const input: InputState = { left: goLeft, right: goRight, jump, jumpPressed: jump };
    w.update(input);

    // Смерть обнуляет грейд, и большой прогон незаметно превращался бы
    // в обычный - ровно в том месте, которое и надо проверить.
    if (big && w.phase === "play" && w.player.grade === 0) {
      const feet = w.player.y + w.player.h;
      w.player.grade = 1;
      w.player.h = PLAYER_H_BIG;
      w.player.y = feet - PLAYER_H_BIG;
    }

    if (w.phase === "clear") return { cleared: true, best: w.player.x, frames };
    if (w.phase === "over") break;

    if (process.env.TRACE && index === Number(process.env.TRACE) && frames % 4 === 0
        && (!process.env.TRACE_BIG || big)) {
      const q = w.player;
      const lo = Number(process.env.TRACE_FROM ?? 0);
      const hi = Number(process.env.TRACE_TO ?? 1e9);
      if (q.x >= lo && q.x <= hi) {
        console.log(`   ${big ? "БОЛЬШОЙ" : "малый  "} f${frames} x=${q.x.toFixed(0)} feet=${(q.y + q.h).toFixed(0)} vy=${q.vy.toFixed(1)} ${q.onGround ? "земля" : "воздух"} hold=${hold} hurt=${q.hurt} | босс ${w.boss ? `x=${w.boss.x.toFixed(0)} y=${w.boss.y.toFixed(0)} hp=${w.boss.hp} inv=${w.boss.hit}` : "повержен"} вопросов=${w.questions.length}`);
      }
    }
    if (w.player.x > best + 0.5) { best = w.player.x; stuck = 0; }
    else if (++stuck > 1200) break;
  }
  return { cleared: false, best, frames };
}

const jumpH = (T.jumpImpulse ** 2) / (2 * T.gravity);
const airTime = (2 * Math.abs(T.jumpImpulse)) / T.gravity;
console.log(`прыжок: высота ${jumpH.toFixed(0)}px, ${airTime.toFixed(0)} кадров в воздухе\n`);

let failed = 0;

for (const [index, spec] of LEVELS.entries()) {
  let bestRun = { cleared: false, best: 0, frames: 0 };
  let winner = "";

  for (const policy of POLICIES) {
    const run = attempt(index, policy);
    if (run.cleared) { bestRun = run; winner = policy.name; break; }
    if (run.best > bestRun.best) bestRun = run;
  }

  // Фиксированные не справились - ищем смешанную игру перебором.
  if (!bestRun.cleared) {
    const search = POLICIES[1]!;
    for (let seed = 1; seed <= SEARCH_SEEDS; seed++) {
      const run = attempt(index, search, seed * 7919 + index);
      if (run.cleared) { bestRun = run; winner = `перебор, зерно ${seed}`; break; }
      if (run.best > bestRun.best) bestRun = run;
    }
  }

  // Тот же уровень большим. Это не «то же самое с запасом» - выросший игрок
  // вдвое выше и упирается там, где маленький проходит не заметив.
  let bigRun = { cleared: false, best: 0, frames: 0 };
  let bigWinner = "";
  if (bestRun.cleared) {
    for (const policy of POLICIES) {
      const run = attempt(index, policy, undefined, true);
      if (run.cleared) { bigRun = run; bigWinner = policy.name; break; }
      if (run.best > bigRun.best) bigRun = run;
    }
    if (!bigRun.cleared) {
      const search = POLICIES[1]!;
      for (let seed = 1; seed <= SEARCH_SEEDS; seed++) {
        const run = attempt(index, search, seed * 7919 + index, true);
        if (run.cleared) { bigRun = run; bigWinner = `перебор, зерно ${seed}`; break; }
        if (run.best > bigRun.best) bigRun = run;
      }
    }
    if (!bigRun.cleared) {
      failed++;
      console.log(
        `      БОЛЬШИМ НЕ ПРОЙДЕН: встал на ${Math.round(bigRun.best)}/${spec.width}` +
          ` - маленький проходит, выросший упирается`,
      );
    }
  }

  if (!bestRun.cleared) {
    failed++;
    // Для непройденного уровня печатаем, где встала каждая стратегия:
    // одна цифра «дальше всех» не говорит, узкое место одно или их много.
    for (const policy of POLICIES) {
      const run = attempt(index, policy);
      console.log(`      ${policy.name.padEnd(13)} встал на ${Math.round(run.best)}`);
    }
  }
  const pct = Math.round((bestRun.best / spec.width) * 100);

  console.log(
    `${index + 1}. ${spec.name.padEnd(11)}` +
      `${bestRun.cleared ? (bigRun.cleared ? "ПРОЙДЕН" : "ТОЛЬКО МАЛЫМ") : "НЕ ПРОЙДЕН"}  ` +
      `${String(Math.round(bestRun.best)).padStart(4)}/${spec.width} (${String(pct).padStart(3)}%)  ` +
      `${String((bestRun.frames / TICKS_PER_SECOND).toFixed(0)).padStart(3)} с  ` +
      `${winner ? `малым: ${winner}` : "не справилась ни одна"}` +
      `${bigWinner ? ` · большим: ${bigWinner}` : ""}`,
  );
}

console.log(
  failed === 0
    ? "\nкаждый уровень проходится и маленьким, и выросшим игроком"
    : `\nНЕПРОХОДИМЫХ УРОВНЕЙ: ${failed}`,
);
process.exit(failed === 0 ? 0 : 1);
