// 瓦罐破坏回归：帧布局（底行 frameY=0 / 顶行 18——与家具相反）+ 整罐清除语义。
// 背景：breakTile 的 object 锚点公式假设 frameY=0 在顶行，瓦罐相反 → 曾清错位置，
// 罐体留在原地可无限刷战利品。修复：smashPot 洪水填充后逐格直接清除。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { T, TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

describe('瓦罐破坏', () => {
  const POT = TILE_BY_KEY['pot']!;

  function placePot(st: World['store'], x: number, y: number) {
    // 与 potPass 相同的帧布局：底行 fy=0、顶行 fy=18
    st.setTileSilent(x, y - 1, POT, 0, 0);
    st.setTileSilent(x + 1, y - 1, POT, 18, 0);
    st.setTileSilent(x, y - 2, POT, 0, 18);
    st.setTileSilent(x + 1, y - 2, POT, 18, 18);
  }

  it('瓦罐 def 为 2×2 framed', () => {
    const def = TILE_DEFS[POT];
    expect(def?.w).toBe(2);
    expect(def?.h).toBe(2);
  });

  it('洪水填充清除：从任一格都能清掉整罐 2×2（smashPot 修复后语义）', () => {
    for (const [hx, hy] of [[0, 1], [1, 1], [0, 2], [1, 2]]) {
      const w = new World(32, 32, 1, 't');
      const st = w.store;
      placePot(st, 10, 20);
      // smashPot 的洪水填充（与实现同构）
      const cells: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[10 + hx, 20 - hy]];
      const seen = new Set<number>([(10 + hx) * 100000 + (20 - hy)]);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy, k = nx * 100000 + ny;
          if (!seen.has(k) && st.inBounds(nx, ny) && st.get(nx, ny) === POT) {
            seen.add(k);
            stack.push([nx, ny]);
          }
        }
      }
      expect(cells.length).toBe(4);
      for (const [cx, cy] of cells) st.setTile(cx, cy, 0);
      // 整罐清空、且没误伤地面（y=20 行地面保持实心）
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 1; dy <= 2; dy++) expect(st.get(10 + dx, 20 - dy)).toBe(0);
      }
    }
  });

  it('旧锚点公式对瓦罐失效（回归注释：frameY=0 在底行 → gy 语义反转）', () => {
    // 命中顶行格 (x, y-2) 时 fyv=18 → gy=1 → 锚点上移到 y-3，
    // 清除区域 (x, y-3)..(x+1, y-2) —— 误清罐上方空气且罐底残留在 y-1 行
    const w = new World(32, 32, 1, 't');
    const st = w.store;
    for (let x = 0; x < 32; x++) st.setTileSilent(x, 20, T.DIRT);
    placePot(st, 10, 20);
    const fi = st.idx(10, 18); // 顶行
    const gy = Math.floor(st.frameY[fi] / 18);
    expect(gy).toBe(1);
    const anchorY = 18 - gy; // 旧公式
    // 旧清除区域：16..17 行——不含罐底 19 行 → 罐体残留可重复破坏
    expect(anchorY + 1).toBeLessThan(19);
  });

  it('generic object 锚点（breakTile 新算法）：styled 家具从任一格命中都清对整框', () => {
    // 新算法（与 Game.breakTile 同构）：候选 = 邻域内同类型、相位 (0,0) 且框包含命中格，
    // 取帧最小；用 style>0 的 2×2 家具帧（fv = style*36 + dx*18，旧公式 gx 超出 ow）
    const w = new World(32, 32, 1, 't');
    const st = w.store;
    const CHEST = TILE_BY_KEY['chest']!;
    const style = 2, ox = 10; // 顶行 y=18(fy=0)、底行 y=19(fy=18)——家具顶行锚约定
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        st.setTileSilent(ox + dx, 18 + dy, CHEST, style * 36 + dx * 18, dy * 18);
      }
    }
    const findAnchor = (hx: number, hy: number) => {
      let ax = hx, ay = hy, best = Infinity, has = false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = hx + dx, ny = hy + dy;
          if (!st.inBounds(nx, ny) || st.type[st.idx(nx, ny)] !== CHEST) continue;
          const ni = st.idx(nx, ny);
          const key = st.frameY[ni] * 4096 + st.frameX[ni];
          const phaseAnchor = st.frameX[ni] % 36 === 0 && st.frameY[ni] % 36 === 0;
          const boxContains = nx <= hx && nx + 2 > hx && ny <= hy && ny + 2 > hy;
          if (phaseAnchor && boxContains) {
            if (!has || key < best) { has = true; best = key; ax = nx; ay = ny; }
          } else if (!has && key < best) { best = key; ax = nx; ay = ny; }
        }
      }
      return { ax, ay };
    };
    // 四格任一命中 → 锚点应为左上 (10, 18)
    for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const { ax, ay } = findAnchor(ox + hx, 18 + hy);
      expect([ax, ay]).toEqual([10, 18]);
    }
  });

  it('紧邻同款物体判别：命中右边那件 → 清右件不误伤左件（防全局最小帧误选）', () => {
    const w = new World(32, 32, 1, 't');
    const st = w.store;
    const CHEST = TILE_BY_KEY['chest']!;
    // 两件同 style 宝箱紧邻：左 [8,9]、右 [10,11]，均在行 18-19
    for (const bx of [8, 10]) {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          st.setTileSilent(bx + dx, 18 + dy, CHEST, dx * 18, dy * 18);
        }
      }
    }
    // 命中右件的任一格：相位(0,0) 候选有 (8,18) 和 (10,18)；框包含命中格的只有 (10,18)
    const findAnchor = (hx: number, hy: number) => {
      let ax = hx, ay = hy, best = Infinity, has = false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = hx + dx, ny = hy + dy;
          if (!st.inBounds(nx, ny) || st.type[st.idx(nx, ny)] !== CHEST) continue;
          const ni = st.idx(nx, ny);
          const key = st.frameY[ni] * 4096 + st.frameX[ni];
          const phaseAnchor = st.frameX[ni] % 36 === 0 && st.frameY[ni] % 36 === 0;
          const boxContains = nx <= hx && nx + 2 > hx && ny <= hy && ny + 2 > hy;
          if (phaseAnchor && boxContains) {
            if (!has || key < best) { has = true; best = key; ax = nx; ay = ny; }
          } else if (!has && key < best) { best = key; ax = nx; ay = ny; }
        }
      }
      return { ax, ay };
    };
    for (const [hx, hy] of [[10, 18], [11, 18], [10, 19], [11, 19]]) {
      const { ax, ay } = findAnchor(hx, hy);
      expect([ax, ay]).toEqual([10, 18]);
    }
  });
});
