// 锤击优先级回归闸门(2026-09-01 用户实报「锤方块/平台总变整形、拆不了背后墙」):
//  原版节拍(Player.cs:45990-46470)=按住拆准星格背景墙/松开闩整形一步 + 开口邻接门
//  (CanPlayerSmashWall :46322) + 墙伤=锤力×1.5(PickWall :46343)。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { HitTile } from '../src/core/HitTile';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { WALL_HOUSE } from '../src/world/Housing';

function makeGame(w: World): { g: Record<string, unknown>; st: World['store'] } {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.netCanEditTile = () => true;
  g.inTileRange = () => true;
  g.world = w;
  g.hitTiles = new HitTile();
  g.tickCount = 0;
  (g as { lastMineHitTick: number }).lastMineHitTick = -999;
  g.mining = null;
  g.hardnessCache = 0;
  g.input = { mouseHeld: true, mouseX: 0, mouseY: 0 };
  g.camera = { screenToWorld: () => [0, 0] };
  g.player = {
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 },
    usedAmbrosia: false,
    equipStats: { chiselSpeed: false },
    inv: { heldItem: () => null },
  };
  g.killTileBreakSound = () => {};
  g.spawnParticles = () => {};
  g.tileAboveProtected = () => false;
  g.sfx = { play: () => {} };
  g.playSfxFile = () => {};
  g.canPoundTile = () => true;
  g.trackTile = 0;
  g.hammerPoundRelease = false;
  return { g, st: w.store };
}

const tryMine = (g: Record<string, unknown>, x: number, y: number, power = 40) =>
  (g.tryMine as (a: number, b: number, c: number, d: 'hammer', e: number, f?: number) => void).call(g, x, y, power, 'hammer', 10, 6);

describe('锤击优先级（按住拆墙 / 松开整形 / 开口门 / ×1.5）', () => {
  it('① 按住锤方块：拆该格背景墙（积累），方块形态不动', () => {
    const w = new World(40, 40, 20, 'open');
    const st = w.store;
    st.setTileSilent(20, 20, TILE_BY_KEY['stone'], 0, 0);
    st.setWall(20, 20, 1);                       // 石墙(房墙族,恒可拆)
    const { g } = makeGame(w);
    const i = st.idx(20, 20);
    tryMine(g, 20, 20, 40);                      // 1.5×40=60 <100 → 积累一击
    expect(st.slope[i]).toBe(0);                 // 方块未整形
    expect(st.half[i]).toBe(0);
    expect((g.hitTiles as { getDamage: (x: number, y: number, k: number) => number }).getDamage(20, 20, 2)).toBe(60);
    (g as { tickCount: number }).tickCount = 10;
    tryMine(g, 20, 20, 40);                      // 第二击 ≥100 → 墙毁
    expect(st.wall[st.idx(20, 20)]).toBe(0);
    expect(st.slope[i]).toBe(0);                 // 方块仍原样
  });

  it('② 松开闩态：整形一步（整→半砖），不拆墙', () => {
    const w = new World(40, 40, 20, 'open');
    const st = w.store;
    st.setTileSilent(20, 20, TILE_BY_KEY['stone'], 0, 0);
    st.setWall(20, 20, 1);
    const { g } = makeGame(w);
    g.hammerPoundRelease = true;                 // 松开闩置位
    tryMine(g, 20, 20, 40);
    const i = st.idx(20, 20);
    expect(st.half[i] !== 0 || st.slope[i] !== 0).toBe(true);   // 整形发生
    expect(st.wall[st.idx(20, 20)]).toBe(1);     // 墙不动
    expect(g.hammerPoundRelease).toBe(false);    // 闩已消费
  });

  it('③ CanPlayerSmashWall：自然墙片内部无开口不可拆，开窗后可拆；350 恒拒', () => {
    const w = new World(40, 40, 20, 'open');
    const st = w.store;
    // 自然墙 id = 不在 WALL_HOUSE 的最小正 id（运行时求,不依赖数据表细节）
    let natural = 1;
    while (WALL_HOUSE.has(natural)) natural++;
    for (let y = 18; y <= 22; y++) for (let x = 18; x <= 22; x++) st.setWall(x, y, natural);
    const { g } = makeGame(w);
    tryMine(g, 20, 20, 100);                     // 5×5 同墙片内部：无开口 → 不拆
    expect(st.wall[st.idx(20, 20)]).toBe(natural);
    expect((g.hitTiles as { getDamage: (x: number, y: number, k: number) => number }).getDamage(20, 20, 2)).toBe(0);
    st.setWall(20, 19, 0);                       // 开窗(邻格空墙)
    tryMine(g, 20, 20, 100);
    expect(st.wall[st.idx(20, 20)]).toBe(0);     // 有开口 → 拆
    // 350 恒拒
    st.setWall(20, 20, 350);
    tryMine(g, 20, 20, 100);
    expect(st.wall[st.idx(20, 20)]).toBe(350);
  });

  it('④ 亚格挪格：瞄准空格可拆到 2×2 邻域内贴角墙', () => {
    const w = new World(40, 40, 20, 'open');
    const st = w.store;
    const { g } = makeGame(w);
    // 鼠标世界 (0,0) → 象限 num=0 → 2×2 = (20..21, 20..21)；只有 (21,20) 有墙
    st.setWall(21, 20, 1);
    tryMine(g, 20, 20, 100);
    // 100 锤力 ×1.5 = 150 ≥100 → 贴角墙一击即毁
    expect(st.wall[st.idx(21, 20)]).toBe(0);
  });

  it('⑤ 空格挥击复位闩：锤墙途中残留闩不误整形扫过的方块(:46000-46007)', () => {
    const w = new World(40, 40, 20, 'open');
    const st = w.store;
    st.setTileSilent(20, 20, TILE_BY_KEY['stone'], 0, 0);   // 方块(将扫到的目标)
    const { g } = makeGame(w);
    g.hammerPoundRelease = true;                 // 模拟:锤墙途中曾松手 → 闩残留
    // 第一挥落在【空格】(锤墙位) → :46000 空格复位闩
    tryMine(g, 12, 12, 40);
    expect(g.hammerPoundRelease).toBe(false);
    // 第二挥光标扫到方块(仍按住) → 闩已复位 → 只拆方块背后的墙,不整形
    st.setTileSilent(20, 20, TILE_BY_KEY['stone'], 0, 0);
    st.setWall(20, 20, 1);
    (g as { tickCount: number }).tickCount = 10;
    tryMine(g, 20, 20, 100);                                     // 1.5×100=150 一击毁墙
    const i = st.idx(20, 20);
    expect(st.half[i] !== 0 || st.slope[i] !== 0).toBe(false);  // 不整形
    expect(st.wall[st.idx(20, 20)]).toBe(0);                     // 墙被拆(按住语义)
  });
});
