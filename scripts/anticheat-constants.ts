/**
 * Печатает константы для worker/anticheat.js.
 *
 * Они обязаны совпадать с игрой: если в игре стало двенадцать уровней, а в
 * воркере осталось четыре, то честный игрок, прошедший всё до конца, будет
 * отвергнут как накрутчик. Руками это не уследить, поэтому считаем из данных.
 *
 * Запуск: npm run anticheat
 */
import { LEVELS } from "../src/game/levels";

const totalWidth = LEVELS.reduce((sum, lv) => sum + lv.width, 0);
const totalGems = LEVELS.reduce((sum, lv) => sum + lv.gems.length, 0);
const maxSpeed = Math.max(...LEVELS.map((lv) => lv.maxSpeed));

console.log(`// Сгенерировано: npm run anticheat. Не править руками.`);
console.log(`const TOTAL_LEVEL_WIDTH = ${totalWidth};`);
console.log(`const MAX_SPEED = ${maxSpeed};`);
console.log(`const TOTAL_GEMS = ${totalGems};`);
console.log(`const TOTAL_LEVELS = ${LEVELS.length};`);
console.log();
console.log(`// минимум кадров на полное прохождение: ${Math.floor(totalWidth / maxSpeed)}`);
