// 地牢裂砖族破坏链（WorldGen.cs:63837-63883 KillTile 段 1:1）。
// 被杀的裂砖（481-483）→ 8 邻域掷签连锁：正上 1/3（num17/2=3）、其余 1/6（num17=6）
// → 命中者 KillTile(noItem)——连锁格【不掉落】，但每块仍走本段（链式传播）+
// 喷 Debris 弹片（由调用方按返回列表逐格补特效，保持"连锁先 :63838、弹片后 :63887"原序）。
// 递归深度 = 概率衰减的自然链长（走廊量级），被杀格 type=0 天然防重入。
import type { World } from './World';
import { TILE_DEFS } from '../data/tiles';

export const CRACKED_SHEET_MIN = 481;
export const CRACKED_SHEET_MAX = 483;

/** sheet 是否裂砖族（TileID.Sets.CrackedBricks） */
export function isCrackedSheet(sheet: number | undefined | null): boolean {
  return sheet != null && sheet >= CRACKED_SHEET_MIN && sheet <= CRACKED_SHEET_MAX;
}

/** (x,y) 处 tile 是否裂砖族 */
export function isCrackedAt(st: World['store'], x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const t = st.get(x, y);
  if (t === 0) return false;
  // ★幽灵格门（2026-09-03）：原版 Kill_ExplodeTiles 族（:80505-25）首门 active()
  //  ——幽灵残型裂砖不连锁崩塌（本仓 41 号裂砖幽灵 7 万格,爆炸扫面裸读会把
  //  隐形残型炸出弹片;放置域同款洞清扫）
  if (!st.hasTile(x, y)) return false;
  return isCrackedSheet(TILE_DEFS[t]?.vanilla?.sheet);
}

// 8 邻域与掷签分母（cs:63840-63865：case 2 上邻 num17 /= 2）
const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 6], [1, 0, 6], [0, -1, 3], [0, 1, 6],
  [-1, -1, 6], [1, -1, 6], [-1, 1, 6], [1, 1, 6],
];

/**
 * 从 (x,y)（已被调用方清格的首格）展开连锁崩塌。
 * 返回链上被杀的 [格x, 格y, sheet] 列表（不含首格——首格特效由调用方先做）。
 * genRand 等价：rng 默认 Math.random（运行时惯例）。
 */
export function crackedChainKill(
  st: World['store'],
  x: number,
  y: number,
  rng: () => number = Math.random,
  killed: Array<[number, number, number]> = [],
): Array<[number, number, number]> {
  for (const [dx, dy, den] of NEIGHBORS) {
    const nx = x + dx, ny = y + dy;
    if (!st.inBounds(nx, ny)) continue;
    const t = st.get(nx, ny);
    if (t === 0) continue;
    // 掷签先于裂砖判定（WorldGen.cs:64326-64344 `tile3.active() && genRand.Next(num16)==0
    // && type∈{481..483}`——非裂砖活跃邻格也消耗一次掷签，红队 J-1：曾先查 sheet 再掷
    // =非裂砖邻格零掷，改变同拍后续随机消费序）
    if ((rng() * den | 0) !== 0) continue;        // genRand.Next(den) == 0
    const sh = TILE_DEFS[t]?.vanilla?.sheet;
    if (!isCrackedSheet(sh)) continue;
    st.setTile(nx, ny, 0);                         // KillTile(noItem)——清格在此，掉落门在调用方
    killed.push([nx, ny, sh!]);
    crackedChainKill(st, nx, ny, rng, killed);     // 链式（原版 KillTile 递归同构）
  }
  return killed;
}
