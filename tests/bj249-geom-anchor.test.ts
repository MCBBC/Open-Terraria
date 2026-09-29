// BJ249 清债刀 F4：236 掉落位 / 238 召王距离几何归位（原版 WorldGen.cs:48409-48425/:48441,
// 1458 同位 :48442/:48449——R4 原引 Main.cs 系文件注记偏差,锚值同）：
//   · 236 掉落 = Item.NewItem(i*16,j*16,32,32,1291)——盒=【被击格】(i,j) 左上 2×2,
//     中心 (i*16+16,j*16+16);spawnDrop 收中心锚（Game.ts:22715 约定）。
//     旧=锚格 (ax,ay) 半补偿 → 被击右/下格时左/上漂 8~16px。
//   · 238 召王距离 = |player.position - (i*16,j*16)|（被击格左上 vs 玩家【盒左上】）
//     < 50 格曼哈顿。旧=锚 2×2 中心 vs 玩家盒心 → 域差最大 32px,50 格门仅边界带可见。
//   盒左上域判例=BJ111（本仓 Entity 存左上角,NewNPC:81594 同相）。
// 夹具形制照抄 tests/bj226-life-fruit-break-face.test.ts（未导出,本地复刻）。
// 变异判别点：玩家盒左上 (ax*16-790, ay*16) → 新面 790<800 召王 / 旧面 806≥800 不召
// （旧基准=ax*16+8/ay*16+8 双轴 +8 平移）——回退旧锚必红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const FRUIT = TILE_BY_KEY['v_236_life_fruit_plant'];
const BULB = TILE_BY_KEY['v_238_plantera_s_bulb'];
const GRASS = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 60);
expect(FRUIT).toBeGreaterThan(0);
expect(BULB).toBeGreaterThan(0);

function mkWorld(): World {
  return new World(60, 260, 11, 'bj249');
}

type Drop = [number, number, string, number];

function shell(w: World, drops: Drop[]): Game & Record<string, unknown> {
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown> & {
    breakTile(x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {}, playWavFile: () => {}, playFiles: () => true } as never;
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push([x, y, key, n]); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.spawnBossOnPlayer = vi.fn();
  g.player = {
    x: 5 * 16, y: 5 * 16,                  // 盒左上域（BJ111 判例）
    cx: 5 * 16 + 8, cy: 5 * 16 + 8,
    equipStats: {},
    inv: { accSlotMax: 0, isItemSlotUnlockedAndUsable: () => false, armor: [], heldItem: () => null },   // 清偿刀 P：旧界 0=无配饰,谓词 false 同义
  } as never;
  return g;
}

/** PlaceJunglePlant 2×2 帧布局（W.cs:48256-48272,styleX=0） */
function placeJunglePlant2x2(st: World['store'], t: number, ax: number, ay: number): void {
  st.setTileSilent(ax, ay, t, 0, 0);
  st.setTileSilent(ax + 1, ay, t, 18, 0);
  st.setTileSilent(ax, ay + 1, t, 0, 18);
  st.setTileSilent(ax + 1, ay + 1, t, 18, 18);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ249 F4 236 掉落位=被击格中心（Item.NewItem(i*16,j*16,32,32)）', () => {
  it('四角逐一格挖 → 掉落中心随被击格走 (i*16+16, j*16+16)', () => {
    for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const w = mkWorld();
      const st = w.store;
      st.setTileSilent(20, 20, GRASS);
      const ax = 20, ay = 18;
      placeJunglePlant2x2(st, FRUIT, ax, ay);
      const drops: Drop[] = [];
      const g = shell(w, drops);
      g.breakTile(ax + hx, ay + hy, true, false, true);
      expect(drops).toEqual([[(ax + hx) * 16 + 16, (ay + hy) * 16 + 16, 'vi_1291_life_fruit', 1]]);
    }
  });
});

describe('BJ249 F4 238 召王距离=被击格左上 vs 玩家盒左上（50 格曼哈顿门）', () => {
  it('① 判别点（ax*16-790, ay*16）:新面 790<800 → 召王（旧面 806 不召=变异红点）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(20, 20, GRASS);
    placeJunglePlant2x2(st, BULB, 20, 18);
    const g = shell(w, []);
    const pp = g.player as unknown as { x: number; y: number; cx: number; cy: number };
    pp.x = 20 * 16 - 790; pp.y = 18 * 16;
    pp.cx = pp.x + 8; pp.cy = pp.y + 8;
    g.breakTile(20, 18, true, false, true);   // 被击格=(20,18)=2×2 左上格
    expect(g.spawnBossOnPlayer).toHaveBeenCalledTimes(1);
    expect(g.spawnBossOnPlayer).toHaveBeenCalledWith(262);
  });
  it('② 恰 800 格外（ax*16-800, ay*16）→ 门闭不召王', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(20, 20, GRASS);
    placeJunglePlant2x2(st, BULB, 20, 18);
    const g = shell(w, []);
    const pp = g.player as unknown as { x: number; y: number; cx: number; cy: number };
    pp.x = 20 * 16 - 800; pp.y = 18 * 16;
    pp.cx = pp.x + 8; pp.cy = pp.y + 8;
    g.breakTile(20, 18, true, false, true);
    expect(g.spawnBossOnPlayer).not.toHaveBeenCalled();
  });
});
