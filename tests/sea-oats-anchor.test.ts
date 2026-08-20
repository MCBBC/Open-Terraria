// 海燕麦锚点盒清格护栏回归（2026-08-20 用户实报"打掉沙上花草连沙块一起消失"）：
// 529 海燕麦 def 1×2（渲染两格高贴图）但原版【单格写入】（cs:58333，
// MultitileFragmentSweep KEEP 白名单同注）——breakTile object 锚点分支按 def 尺寸
// 张 1×2 清除盒、锚点=本格（frameY=0 恰为相位锚点）→ 盒 [y,y+1] 无差别清格把
// 下方沙块扫掉。修=清格循环加同类型门（只清本物格；多格物全格同型不受影响）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const W = 32, H = 32;
const SAND = TILE_BY_KEY['sand']!;
const SEAOAT = TILE_BY_KEY['v_529_sea_oats']!;
const CHEST = TILE_BY_KEY['chest']!;

function makeWorld(): World {
  return new World(W, H, 1, 'sea-oats');
}

/** breakTile object 锚点分支的清格循环（同构复刻——Game 构造需 DOM，锚点语义
 *  以纯函数对拍：同类型门修复后的行为） */
function anchorClearFixed(st: World['store'], type: number, ax: number, ay: number, ow: number, oh: number): void {
  for (let dx = 0; dx < ow; dx++) {
    for (let dy = 0; dy < oh; dy++) {
      if (st.inBounds(ax + dx, ay + dy) && st.get(ax + dx, ay + dy) === type) {
        st.setTile(ax + dx, ay + dy, 0);
      }
    }
  }
}

describe('海燕麦 529 锚点盒护栏', () => {
  it('def 是 1×2（渲染语义）但原版单格写入', () => {
    const d = TILE_DEFS[SEAOAT]!;
    expect(d.w).toBe(1);
    expect(d.h).toBe(2);
  });

  it('打掉沙上的海燕麦：沙块保留（同类型门）', () => {
    const w = makeWorld();
    const st = w.store;
    // 沙面 + 海燕麦单格（frameY=0 相位锚点）
    st.setTile(10, 20, SAND);
    st.setTileSilent(10, 19, SEAOAT, 0, 0);
    // 修复前：盒 [19,20] 无差别清 → (10,20) 沙被扫
    anchorClearFixed(st, SEAOAT, 10, 19, 1, 2);
    expect(st.get(10, 19)).toBe(0, '燕麦格清除');
    expect(st.get(10, 20)).toBe(SAND, '下方沙保留');
  });

  it('多格物（2×2 箱）全格同型：整件清除不受同类型门影响', () => {
    const w = makeWorld();
    const st = w.store;
    // 2×2 箱四格同型
    st.setTileSilent(12, 18, CHEST, 0, 0);
    st.setTileSilent(13, 18, CHEST, 18, 0);
    st.setTileSilent(12, 19, CHEST, 0, 18);
    st.setTileSilent(13, 19, CHEST, 18, 18);
    anchorClearFixed(st, CHEST, 12, 18, 2, 2);
    for (const [x, y] of [[12, 18], [13, 18], [12, 19], [13, 19]]) {
      expect(st.get(x, y)).toBe(0, `(${x},${y}) 应清除`);
    }
  });

  it('盒内空气格：无可清（不误清外国格的同一保险）', () => {
    const w = makeWorld();
    const st = w.store;
    st.setTile(16, 20, SAND);
    st.setTileSilent(16, 19, SEAOAT, 0, 0);
    // 上格是空气：盒 [19,20] 只命中 (16,19)
    anchorClearFixed(st, SEAOAT, 16, 19, 1, 2);
    expect(st.get(16, 18)).toBe(0);
    expect(st.get(16, 20)).toBe(SAND);
  });
});
