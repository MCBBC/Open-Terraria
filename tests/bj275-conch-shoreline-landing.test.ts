// BJ275 2026-09-22 用户实报：魔法海螺「应传到离海最近的物块,现在落到海上最远的平台」。
// 定谳：用户地图（=BJ240 物证图,md5 e304e13a 字节全等）海面栈桥 T11@414 铺 ≤6100..6364
// 盖死右缘起点列 → BJ242 补偿重试（内移 w-41）仍落栈桥远端 (6359,413)=实报病灶。
// 原版爬行语义本身（TeleportHelpers.cs:49-241 亲读）=起点列竖降优先+首个合法承位即停+
// 平台算承位（includePlatforms:true,WorldGen.cs:70515-70540）——甲板拦截非本仓实现差;
// 原版在本图的结果=右洋 InWorld quirk 败回左洋（BJ240）,「落甲板」是 BJ242 分歧送达的。
// 落刀（BJ242 语义锁同步,同闸 Game.CONCH_RIGHT_OCEAN_COMPENSATION 总揽）：补偿重试面
// solidOrSloped 以 includePlatforms=false 运行=平台不作承位——竖降穿栈桥→液面爬行照
// 原版爬到水线岸承位（=用户预期「离海最近的物块」）。实心障碍/左洋/自然图零变化。
// 变体备案（Face B,④锁）：栈桥不盖起点列时原版爬行从水侧爬停甲板右端（flag2 弹升臂）
// ——纯原版相,友好化属另一分歧,本刀不动。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';

function TILE_DEFS_SHEET(id: number): number {
  return TILE_DEFS[id]?.vanilla?.sheet ?? -1;
}
function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
function paintWater(st: TileStore, x0: number, x1: number, y0: number, y1: number, amount = 200): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setLiquid(x, y, amount, LIQUID_TYPE.WATER);
}
/** 自然右洋（无建筑）+可 选缀：edge 列构筑物/海面栈桥段 */
function oceanWorld(): World {
  const w = new World(600, 300, 11, 'bj275-ev');
  w.groundLevel = 200;
  const st = w.store;
  const W = st.w;
  const dirt = TILE_BY_KEY['dirt'];
  paintWater(st, W - 60, W - 1, 165, 195);
  paintRect(st, W - 60, W - 1, 196, 196, dirt);
  paintRect(st, W - 70, W - 61, 164, 196, dirt);   // 西岸（水线在 W-61）
  return w;
}
type ConchFn = (rightOcean: boolean, inwardRetry?: boolean) => { x: number; y: number } | null;
function stubGame(world: World, px: number, py: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    player: Record<string, unknown>;
    world: World;
    requestMagicConchTeleportPosition: ConchFn;
  };
  g.world = world;
  g.player = {
    x: px, y: py, vx: 1, vy: 1, w: 20, h: 42, cx: px + 10, cy: py + 21,
    iframes: 0, fallStartY: 1234, team: 0,
    inv: { removeHeld: () => {} },
    removeAllGrapplingHooks: () => {},
    updateUnbreakableWallScan: () => {},
    equipStats: { fireWalk: false },
    buffs: null,
  };
  g.sfx = { play: () => {} };
  g.spawnParticles = () => {};
  g.camera = { tryTrackPlayerTeleport: () => {} };
  g.golfState = { tryGetCameraTrackingPosition: () => null };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  return g as unknown as {
    player: { x: number; y: number; vy: number };
    world: World;
    requestMagicConchTeleportPosition: ConchFn;
  };
}
function fire(g: ReturnType<typeof stubGame>, px: number): { x: number; y: number; vy: number } {
  (g as unknown as { fireRecallTeleport(c: unknown): void }).fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  return g.player;
}

describe('BJ275 海螺补偿重试=平台不作承位,落水线岸承位（用户实报「海上最远的平台」）', () => {
  it('①起点列实心构筑物（非平台）：补偿重试照旧落于其顶 (w-41,顶-1)——inclPlat 只豁免平台', () => {
    const w = oceanWorld();
    const st = w.store;
    const W = st.w;
    const dirt = TILE_BY_KEY['dirt'];
    paintRect(st, W - 41, W - 40, 100, 196, dirt);   // 右缘双列实心塔（顶@100）
    expect(st.flags[st.idx(W - 40, 100)]).toBe(1);
    const g = stubGame(w, 0, 0);
    const dest = g.requestMagicConchTeleportPosition(true);
    expect(dest, '实心承位不受 BJ275 影响').not.toBeNull();
    expect(dest!.x).toBe((W - 41) * TILE + 8 - 10);
    expect(dest!.y).toBe(99 * TILE + 16 - 42);
  });

  it('②起点列 1 格悬浮平台（缺省 ON）：原版败(quirk)→重试穿平台落自然岸线 (w-51,163)', () => {
    const w = oceanWorld();
    const st = w.store;
    const W = st.w;
    const plat = TILE_BY_KEY['platform'];
    expect(TILE_DEFS_SHEET(plat)).toBe(19);
    paintRect(st, W - 40, W - 40, 100, 100, plat);   // 起点列单片平台
    const gOff = stubGame(w, 0, 0);
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    let off: ReturnType<ConchFn>;
    try { off = gOff.requestMagicConchTeleportPosition(true); } finally { Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev; }
    expect(off, 'OFF:平台算承位→零爬行落位→右缘 quirk 拒（原版）').toBeNull();
    const g = stubGame(w, 0, 0);
    const dest = g.requestMagicConchTeleportPosition(true);
    expect(dest, 'ON:重试穿平台→液面爬行→西岸水线').not.toBeNull();
    expect(dest!.x).toBe((W - 61) * TILE + 8 - 10);
    expect(dest!.y).toBe(163 * TILE + 16 - 42);
  });

  it('③fire 面（缺省 ON）：左半场直达右洋岸线,velocity=Zero 命中臂', () => {
    const w = oceanWorld();
    const st = w.store;
    const W = st.w;
    const plat = TILE_BY_KEY['platform'];
    paintRect(st, W - 46, W - 35, 164, 164, plat);   // 海面栈桥段（盖 W-40/W-41 起点列,桥下即水体）
    const g = stubGame(w, 40 * TILE, 110 * TILE);
    const p = fire(g, 40 * TILE);
    expect(p.x).toBe((W - 61) * TILE + 8 - 10);
    expect(p.y).toBe(163 * TILE + 16 - 42);
    expect(p.vy, '命中臂 velocity=Zero').toBe(0);
  });

  it('④Face B 备案锁：栈桥不盖起点列→原版爬行从水侧爬停栈桥右端 (w-41,163),ON/OFF 同相（纯原版相,友好化另案）', () => {
    const w = oceanWorld();
    const st = w.store;
    const W = st.w;
    const plat = TILE_BY_KEY['platform'];
    paintRect(st, W - 46, W - 41, 164, 164, plat);   // 栈桥段 [554..559],不盖 560
    const gOff = stubGame(w, 0, 0);
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    let off: ReturnType<ConchFn>;
    try { off = gOff.requestMagicConchTeleportPosition(true); } finally { Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev; }
    expect(off, 'OFF:爬行 1 步即停桥右端=原版相').not.toBeNull();
    expect(off!.x).toBe((W - 41) * TILE + 8 - 10);
    expect(off!.y).toBe(163 * TILE + 16 - 42);
    const gOn = stubGame(w, 0, 0);
    const on = gOn.requestMagicConchTeleportPosition(true);
    expect(on, 'ON:首试已合法,补偿臂不触发,同相').not.toBeNull();
    expect(on!.x).toBe((W - 41) * TILE + 8 - 10);
    expect(on!.y).toBe(163 * TILE + 16 - 42);
  });
});
