import type { FoeKind, FoeSpec, LevelSpec, Rect, Vec } from "./types";

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const v = (x: number, y: number): Vec => ({ x, y });
const f = (kind: FoeKind, x: number, baseY: number, min: number, max: number): FoeSpec =>
  ({ kind, x, baseY, min, max });

const GY = 62;

/**
 * Уровень = грейд. Темп и набор препятствий растут вместе с карьерой —
 * ускорение получается смысловым, а не искусственным.
 */
export const LEVELS: LevelSpec[] = [
  {
    name: "Галера",
    grade: "ДЖУН",
    width: 640,
    groundY: GY,
    maxSpeed: 1.55,
    tint: "#1A1728",
    platforms: [
      r(0, GY, 190, 15), r(210, GY, 150, 15), r(380, GY, 260, 15),
      r(140, 46, 34, 4), r(236, 42, 34, 4), r(300, 46, 30, 4),
      r(420, 44, 32, 4), r(500, 38, 34, 4),
    ],
    foes: [f("legacy", 250, GY, 222, 340), f("legacy", 470, GY, 400, 560)],
    gems: [v(152, 36), v(248, 32), v(312, 36), v(432, 34), v(512, 28), v(590, 50)],
    coffee: [],
    hazards: [],
    swamps: [],
    deadlineSpeed: 0,
    door: v(606, GY),
  },
  {
    name: "Аутсорс",
    grade: "МИДЛ",
    width: 720,
    groundY: GY,
    maxSpeed: 1.75,
    tint: "#1B2030",
    platforms: [
      r(0, GY, 150, 15), r(176, GY, 110, 15), r(312, GY, 120, 15), r(452, GY, 268, 15),
      r(120, 44, 28, 4), r(196, 38, 30, 4), r(266, 44, 28, 4), r(336, 36, 30, 4),
      r(404, 44, 28, 4), r(500, 40, 32, 4), r(580, 34, 30, 4),
    ],
    foes: [f("legacy", 210, GY, 182, 278), f("bug", 350, GY, 318, 424), f("bug", 560, GY, 462, 700)],
    gems: [v(130, 34), v(206, 28), v(276, 34), v(346, 26), v(414, 34), v(512, 30), v(590, 24), v(664, 50)],
    coffee: [v(300, 30)],
    hazards: [r(286, 71, 26, 6)],
    swamps: [],
    deadlineSpeed: 0,
    door: v(688, GY),
  },
  {
    name: "Продукт",
    grade: "СЕНЬОР",
    width: 780,
    groundY: GY,
    maxSpeed: 1.95,
    tint: "#1E1A2E",
    platforms: [
      r(0, GY, 130, 15), r(158, GY, 96, 15), r(282, GY, 88, 15), r(398, GY, 104, 15), r(530, GY, 250, 15),
      r(104, 44, 26, 4), r(180, 36, 28, 4), r(248, 42, 26, 4), r(318, 34, 28, 4),
      r(382, 42, 26, 4), r(452, 34, 28, 4), r(560, 38, 30, 4), r(644, 30, 30, 4),
    ],
    foes: [
      f("legacy", 190, GY, 164, 246), f("bug", 320, GY, 286, 364),
      f("call", 430, 46, 398, 500), f("bug", 640, GY, 536, 772),
    ],
    gems: [v(112, 34), v(188, 26), v(256, 32), v(326, 24), v(390, 32), v(460, 24), v(570, 28), v(652, 20), v(724, 50)],
    coffee: [v(196, 28), v(600, 28)],
    hazards: [r(130, 71, 28, 6), r(254, 71, 28, 6)],
    swamps: [r(560, 58, 90, 4)],
    deadlineSpeed: 0,
    door: v(748, GY),
  },
  {
    name: "Оффер",
    grade: "ЛИД",
    width: 820,
    groundY: GY,
    maxSpeed: 2.15,
    tint: "#241A2A",
    platforms: [
      r(0, GY, 120, 15), r(146, GY, 84, 15), r(258, GY, 76, 15),
      r(362, GY, 84, 15), r(474, GY, 80, 15), r(582, GY, 238, 15),
      r(96, 42, 24, 4), r(168, 34, 26, 4), r(236, 40, 24, 4), r(302, 32, 26, 4),
      r(366, 40, 24, 4), r(434, 32, 26, 4), r(500, 40, 24, 4), r(604, 34, 28, 4), r(690, 26, 28, 4),
    ],
    foes: [
      f("legacy", 176, GY, 150, 226), f("bug", 290, GY, 262, 330), f("call", 396, 44, 366, 442),
      f("legacy", 500, GY, 478, 550), f("bug", 700, GY, 588, 812), f("call", 660, 36, 600, 760),
    ],
    gems: [v(104, 32), v(176, 24), v(244, 30), v(310, 22), v(374, 30), v(442, 22), v(508, 30), v(614, 24), v(698, 16), v(766, 50)],
    coffee: [v(190, 22), v(520, 28)],
    hazards: [r(120, 71, 26, 6), r(230, 71, 28, 6), r(334, 71, 28, 6)],
    swamps: [r(612, 58, 80, 4)],
    deadlineSpeed: 0.3,
    door: v(790, GY),
  },
];

export function levelAt(index: number): LevelSpec {
  const level = LEVELS[index];
  if (!level) throw new Error(`Нет уровня с индексом ${index}`);
  return level;
}
