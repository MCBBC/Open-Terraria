// 海燕麦锚点盒清格护栏回归（2026-08-20 用户实报"打掉沙上花草连沙块一起消失"）：
// 529 海燕麦 def 1×2（渲染两格高贴图）但原版【单格写入】（cs:58333，
// MultitileFragmentSweep KEEP 白名单同注）——breakTile object 锚点分支按 def 尺寸
// 张 1×2 清除盒、锚点=本格（frameY=0 恰为相位锚点）→ 盒 [y,y+1] 无差别清格把
// 下方沙块扫掉。修=清格循环加同类型门（只清本物格；多格物全格同型不受影响）。
// 2026-08-23 复核：旧用例的 anchorClearFixed 是生产清格循环的【同构复刻镜像】，
// 非真调用——生产代码同型门回归不受保护。改走真 Game.breakTile（World+Game 壳
// 直调，palm-chop.test.ts shell 同款；vitest 环境无 DOM 不走构造器）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Game } from '../src/core/Game';

const W = 32, H = 32;
const SAND = TILE_BY_KEY['sand']!;
const SEAOAT = TILE_BY_KEY['v_529_sea_oats']!;
const CHEST = TILE_BY_KEY['chest']!;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(): World {
  return new World(W, H, 1, 'sea-oats');
}

interface BreakShell {
  world: World;
  spawnDrop: (x: number, y: number, key: string, n: number) => void;
  spawnParticles: () => void;
  breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  sfx: { play: () => void }; playSfxFile: () => void;
}

/** Game 壳直调（private 仅编译期；vitest 环境无 DOM 不走构造器）。
 *  player 不挂：killTileDropBait 头部 !this.player 早退（海燕麦非饵表族本就不掷） */
function shell(w: World, drops: Array<[string, number]>): BreakShell {
  const g = Object.create(Game.prototype) as unknown as BreakShell;
  g.world = w;
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.playSfxFile = () => {};
  g.spawnDrop = (_x, _y, key, n) => { drops.push([key, n]); };
  return g;
}

describe('海燕麦 529 锚点盒护栏（真 Game.breakTile）', () => {
  it('def 是 1×2（渲染语义）但原版单格写入', () => {
    const d = TILE_DEFS[SEAOAT]!;
    expect(d.w).toBe(1);
    expect(d.h).toBe(2);
  });

  it('打掉沙上的海燕麦：燕麦清除、盒内下方沙块保留（同类型门防清外国格）', () => {
    const drops: Array<[string, number]> = [];
    const w = makeWorld();
    const st = w.store;
    // 沙面 + 海燕麦单格（frameY=0 相位锚点）
    st.setTile(10, 20, SAND);
    st.setTileSilent(10, 19, SEAOAT, 0, 0);
    // 修复前：盒 [19,20] 无差别清 → (10,20) 沙被扫
    shell(w, drops).breakTile(10, 19);
    expect(st.get(10, 19), '燕麦格清除').toBe(0);
    expect(st.get(10, 20), '下方沙保留').toBe(SAND);
    expect(st.get(10, 18), '盒上格空气不动').toBe(0);
    // 529 def.drop=null（原版海燕麦无返还）→ 无掉落属正常；本门只护清格范围
  });

  it('多格物（2×2 箱）全格同型：整件清除不受同类型门影响', () => {
    const drops: Array<[string, number]> = [];
    const w = makeWorld();
    const st = w.store;
    // 2×2 箱四格同型
    st.setTileSilent(12, 18, CHEST, 0, 0);
    st.setTileSilent(13, 18, CHEST, 18, 0);
    st.setTileSilent(12, 19, CHEST, 0, 18);
    st.setTileSilent(13, 19, CHEST, 18, 18);
    shell(w, drops).breakTile(12, 18);
    for (const [x, y] of [[12, 18], [13, 18], [12, 19], [13, 19]]) {
      expect(st.get(x, y), `(${x},${y}) 应清除`).toBe(0);
    }
    expect(drops.length).toBe(1);   // 锚点返还放置物品一次
  });

  it('盒内外国格：多格物盒内混入异型格 → 只清本物格、外国格存活', () => {
    const drops: Array<[string, number]> = [];
    const w = makeWorld();
    const st = w.store;
    // 2×2 箱右下格被泥土覆盖（同盒外国格形态）
    st.setTileSilent(12, 18, CHEST, 0, 0);
    st.setTileSilent(13, 18, CHEST, 18, 0);
    st.setTileSilent(12, 19, CHEST, 0, 18);
    st.setTileSilent(13, 19, DIRT, 0, 0);
    shell(w, drops).breakTile(12, 18);
    expect(st.get(12, 18)).toBe(0);
    expect(st.get(13, 18)).toBe(0);
    expect(st.get(12, 19)).toBe(0);
    expect(st.get(13, 19), '盒内异型格不被清格循环扫掉').toBe(DIRT);
  });

  it('盒内空气格：无可清（不误清外国格的同一保险）', () => {
    const drops: Array<[string, number]> = [];
    const w = makeWorld();
    const st = w.store;
    st.setTile(16, 20, SAND);
    st.setTileSilent(16, 19, SEAOAT, 0, 0);
    // 上格是空气：盒 [19,20] 只命中 (16,19)
    shell(w, drops).breakTile(16, 19);
    expect(st.get(16, 19)).toBe(0);
    expect(st.get(16, 18)).toBe(0);
    expect(st.get(16, 20)).toBe(SAND);
  });
});
