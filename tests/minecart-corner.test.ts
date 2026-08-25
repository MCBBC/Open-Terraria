// 矿车转角帧链审计:铺轨定型后,检查相邻轨格连接值是否衔接
// (rightConn(前格)==leftConn(后格),行高对齐)——frameTrack 对特定邻域掩码选错
// 角帧 = 断头帧 = 矿车到角即停(用户实报"特殊转角卡住不动弹")。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  placeTrack, frameTrackArea, TRACK_TILE,
  frontTrack, backTrack, isTrackCell,
} from '../src/world/MinecartTrack';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const W = 80, H = 60;

// 连接值(Minecart.cs:59-65)与 SW LEFT_CONN/RIGHT_CONN 对齐的本地读法
const connOf = (frame: number, side: 'L' | 'R'): number => {
  // 从 SW 表读:直接借 MinecartTrack 内部表不可行(未导出),改由行为推导:
  // 用 frameTrack 的定型结果反推不可靠——这里直接 import 表
  return side === 'L' ? LCONN[frame] : RCONN[frame];
};
let LCONN: number[] = [], RCONN: number[] = [];

function makeWorld(): World {
  return new World(W, H, 7, 'cartchain');
}

function lay(st: TileStore, cells: Array<[number, number]>, style = 0): void {
  for (const [x, y] of cells) placeTrack(st, x, y, style);
  for (const [x, y] of cells) frameTrackArea(st, x, y);
}

/** 帧链审计:沿 cells 顺序,相邻两格必须连接值衔接且行差与连接层级一致 */
function auditChain(st: TileStore, cells: Array<[number, number]>): string[] {
  const problems: string[] = [];
  for (let k = 0; k < cells.length; k++) {
    const [x, y] = cells[k];
    const i = st.idx(x, y);
    if (!isTrackCell(st, i)) { problems.push(`(${x},${y}) 非有效轨道格`); continue; }
    if (k + 1 < cells.length) {
      const [nx, ny] = cells[k + 1];
      const ni = st.idx(nx, ny);
      if (!isTrackCell(st, ni)) { problems.push(`(${nx},${ny}) 非有效轨道格`); continue; }
      const f = frontTrack(st, i), nf = frontTrack(st, ni);
      const rowDiff = ny - y;
      // 同行:右连接必须等于下一格左连接;跨行:BOTTOM/TOP 层级衔接
      if (rowDiff === 0) {
        if (RCONN[f] !== LCONN[nf]) problems.push(`(${x},${y})帧${f} 右连${RCONN[f]} ≠ (${nx},${ny})帧${nf} 左连${LCONN[nf]}`);
      } else if (rowDiff === -1) {
        // 上一格:本格右连应为 TOP(0) 且上格左连为 BOTTOM(2) 或等价
        if (RCONN[f] !== 0 || LCONN[nf] === 0) problems.push(`(${x},${y})→上(${nx},${ny}) 层级不衔接 R=${RCONN[f]} L=${LCONN[nf]}`);
      } else if (rowDiff === 1) {
        if (RCONN[f] !== 2 || LCONN[nf] === 2) problems.push(`(${x},${y})→下(${nx},${ny}) 层级不衔接 R=${RCONN[f]} L=${LCONN[nf]}`);
      }
    }
  }
  return problems;
}

// 桥:借一次模块内表(通过测试世界逐帧探针不现实——直接从 MinecartTrack 导出表)
// MinecartTrack 未导出 LEFT_CONN/RIGHT_CONN → 在此用等价表(Minecart.cs:103-547 逐帧)
// ★此表必须与 src/world/MinecartTrack.ts defFrame 严格一致(审计器自身基准)
import { initializeConnTablesForAudit } from '../src/world/MinecartTrack';

describe('矿车转角帧链(铺轨定型产物连通性)', () => {
  it('桥表自检:审计器连接表与游戏表一致', () => {
    const t = initializeConnTablesForAudit();
    LCONN = t.left; RCONN = t.right;
    expect(LCONN.length).toBe(36);
    expect(LCONN[1]).toBe(1);      // 平轨 MIDDLE/MIDDLE
    expect(LCONN[8]).toBe(0);      // 对角 TOP/BOTTOM
    expect(RCONN[8]).toBe(2);
  });

  const shapes: Array<[string, Array<[number, number]>]> = [
    ['平直', [...Array.from({ length: 10 }, (_, i) => [20 + i, 30] as [number, number])]],
    // ★原版无竖直轨道(连接表无竖直连接)——L 形竖列布局非法,不入矩阵
    ['山丘对角', [...Array.from({ length: 6 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [26 + i, 29 - i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [30 + i, 26 + i] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [34 + i, 30] as [number, number])]],
    ['谷', [...Array.from({ length: 5 }, (_, i) => [20 + i, 26 - i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [25 + i, 22] as [number, number]),
      ...Array.from({ length: 5 }, (_, i) => [29 + i, 23 + i] as [number, number])]],
    ['单阶升', [...Array.from({ length: 6 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [26 + i, 29] as [number, number])]],
    ['半坡丘', [...Array.from({ length: 6 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 2 }, (_, i) => [26 + i, 29] as [number, number]),
      ...Array.from({ length: 6 }, (_, i) => [28 + i, 30] as [number, number])]],
    ['S弯', [...Array.from({ length: 4 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 3 }, (_, i) => [24 + i, 29 - i] as [number, number]),
      ...Array.from({ length: 3 }, (_, i) => [27 + i, 27] as [number, number]),
      ...Array.from({ length: 3 }, (_, i) => [30 + i, 28 + i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [33 + i, 31] as [number, number])]],
    ['之字双折', [...Array.from({ length: 5 }, (_, i) => [20 + i, 30] as [number, number]),
      ...Array.from({ length: 3 }, (_, i) => [25 + i, 29 - i] as [number, number]),
      ...Array.from({ length: 3 }, (_, i) => [28 + i, 27] as [number, number]),
      ...Array.from({ length: 3 }, (_, i) => [31 + i, 26 - i] as [number, number]),
      ...Array.from({ length: 4 }, (_, i) => [34 + i, 24] as [number, number])]],
  ];

  for (const [name, cells] of shapes) {
    it(`${name}:定型帧链衔接`, () => {
      const w = makeWorld();
      const st = w.store;
      lay(st, cells);
      const problems = auditChain(st, cells);
      expect(problems, `${name} 帧链断点:\n${problems.join('\n')}`).toEqual([]);
    });
  }
});

void TILE_DEFS;
void backTrack;
