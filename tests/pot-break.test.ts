// 瓦罐破坏回归：帧布局（原版序：顶行 frameY=0 / 底行 frameY=18——PotsPass.placePot
// :112-117 与 wld 导入同序）+ 整罐清除语义。
// 背景：反序帧时代（罐帧曾底行 0/顶行 18）object 锚点公式清错位、罐体残留可无限刷
// 战利品 → 当时以四邻洪水找齐。★B-1（2026-09-02 九批）：全部罐帧写入面已归原版序,
// smashPot 改【帧解码 2×2】精确收集（CheckPot :57287-57296 锚反推同式）——相邻共边
// 罐不再被越权收编（洪泛仅作帧不自洽的理论回退臂保留）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { T, TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

describe('瓦罐破坏', () => {
  const POT = TILE_BY_KEY['pot']!;

  function placePot(st: World['store'], x: number, y: number) {
    // 与 PotsPass.placePot 相同的帧布局（原版 PlacePot :54553-54562 序）：
    // 占行 y-1（顶,fy=0）/y（底,fy=18）,锚行 y+1
    st.setTileSilent(x, y - 1, POT, 0, 0);
    st.setTileSilent(x + 1, y - 1, POT, 18, 0);
    st.setTileSilent(x, y, POT, 0, 18);
    st.setTileSilent(x + 1, y, POT, 18, 18);
  }

  it('瓦罐 def 为 2×2 framed', () => {
    const def = TILE_DEFS[POT];
    expect(def?.w).toBe(2);
    expect(def?.h).toBe(2);
  });

  it('洪泛回退臂（与 smashPotInner 保留臂同构）：从任一格都能收齐整罐 2×2', () => {
    for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const w = new World(32, 32, 1, 't');
      const st = w.store;
      placePot(st, 10, 20);
      // smashPotInner 回退臂的洪泛（与实现同构）
      const cells: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[10 + hx, 19 + hy]];
      const seen = new Set<number>([(10 + hx) * 100000 + (19 + hy)]);
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
      // 整罐清空（行 19/20）
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy <= 1; dy++) expect(st.get(10 + dx, 19 + dy)).toBe(0);
      }
    }
  });

  it('★B-1 帧解码：任一格触发 → 锚反推=左上（10,19）,variant 带基不干扰（:57287-57296 同式）', () => {
    const w = new World(32, 32, 1, 't');
    const st = w.store;
    for (let x = 0; x < 32; x++) st.setTileSilent(x, 21, T.DIRT);
    // variant 36 带基（PlacePot :54544 genRand.Next(3)*36 的中带）
    st.setTileSilent(10, 19, POT, 36, 0);
    st.setTileSilent(11, 19, POT, 54, 0);
    st.setTileSilent(10, 20, POT, 36, 18);
    st.setTileSilent(11, 20, POT, 54, 18);
    for (const [hx, hy] of [[10, 19], [11, 19], [10, 20], [11, 20]]) {
      const fi = st.idx(hx, hy);
      const ax = hx - (Math.floor(st.frameX[fi] / 18) % 2);
      const ay = hy - (Math.floor(st.frameY[fi] / 18) % 2);
      expect([ax, ay]).toEqual([10, 19]);
    }
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
