// PvP 关系判定 + 队伍色（1.4.5.6 1:1）。
// 权威：Player.InOpposingTeam（Player.cs:4287-4299，全服唯一 PvP 关系判定）：
//   双方都 hostile 且（对方 team==0 或 team 不同）。注意原版不检查"自己 team==0"——
//   自己无队、对方有队也算敌对。
// 队伍色：Main.teamColor（Main.cs:1230 数组 + 6610-6615 初始化）。
import type { Player } from '../entities/Player';

/** Main.teamColor[0..5]（Main.cs:6610-6615）：0 白 / 1 红(218,59,59) / 2 绿 / 3 蓝 / 4 黄 / 5 粉紫 */
export const TEAM_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 255, 255],
  [218, 59, 59],
  [88, 219, 84],
  [59, 137, 255],
  [255, 199, 0],
  [216, 127, 255],
];

export function teamColorCss(team: number): string {
  const c = TEAM_COLORS[Math.max(0, Math.min(5, Math.trunc(team)))];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Player.InOpposingTeam（cs:4287-4299）：双方 hostile 且（对方无队 或 异队） */
export function inOpposingTeam(a: { hostile: boolean; team: number }, b: { hostile: boolean; team: number }): boolean {
  if (!a.hostile || !b.hostile) return false;
  return b.team === 0 || b.team !== a.team;
}
