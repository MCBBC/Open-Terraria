// BJ242 2026-09-21 用户明令分歧：右海洋传送友好化=补偿式内移重试（回滚口
// Game.CONCH_RIGHT_OCEAN_COMPENSATION,缺省 ON,登记注在 Game.ts 静态闸处）。
// 原版本相（BJ240 定谳 + BJ242 三路实锤 wiki/反编译调用链/rig,/tmp/bj242-evidence/）：
//   右缘起点 x=w-40 零爬行落位在 InWorld(x≥w-40) 恒界外 → 右洋必败回退左洋;
//   左缘 x=40 零爬行合法 = 原版左右不对称根。补偿=右洋尝试 InWorld 右边界拒绝
//   （px≥w-40⇒必零爬行）时内移起点 x=w-41 重试右洋一次;py 面拒绝/左洋不补偿;
//   自然地图（右洋原版直达）零分支。回滚=置 false ⇒ 与原版逐字全等（bj240 锁面 OFF 态全绿）。
import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Camera } from '../src/render/Camera';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';

// ── 夹具 = bj240 同款几何（tests/bj240-conch-ocean-edge.test.ts,未导出故本地复刻）──
function TILE_DEFS_SHEET(id: number): number {
  return TILE_DEFS[id]?.vanilla?.sheet ?? -1;
}
function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
function paintWater(st: TileStore, x0: number, x1: number, y0: number, y1: number, amount = 200): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setLiquid(x, y, amount, LIQUID_TYPE.WATER);
}
function evidenceSignatureWorld(): World {
  const w = new World(600, 300, 7, 'bj242-ev');
  w.groundLevel = 200;
  const st = w.store;
  const W = st.w;
  const plat = TILE_BY_KEY['platform'];
  expect(TILE_DEFS_SHEET(plat)).toBe(19);
  paintRect(st, W - 46, W - 35, 164, 164, plat);
  paintWater(st, W - 34, W - 1, 165, 195);
  paintRect(st, 36, 46, 112, 112, plat);
  paintWater(st, 30, 60, 112, 143);
  st.setLiquid(40, 112, 127, LIQUID_TYPE.WATER);
  expect(st.flags[st.idx(W - 40, 164)]).toBe(1);
  expect(st.liquid[st.idx(W - 40, 164)]).toBe(0);
  return w;
}
function naturalSignatureWorld(): World {
  const w = evidenceSignatureWorld();
  const st = w.store;
  const W = st.w;
  const dirt = TILE_BY_KEY['dirt'];
  paintRect(st, W - 46, W - 35, 164, 164, 0);
  paintWater(st, W - 34, W - 1, 165, 195, 0);
  paintWater(st, W - 50, W - 1, 165, 195);
  paintRect(st, W - 50, W - 1, 196, 196, dirt);
  paintRect(st, W - 60, W - 51, 164, 196, dirt);
  expect(st.flags[st.idx(W - 40, 164)]).toBe(0);
  expect(st.liquid[st.idx(W - 40, 165)]).toBe(200);
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
  g.camera = new Camera(800, 600);
  g.golfState = { tryGetCameraTrackingPosition: () => null };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  return g;
}
/** request 调用计数探针（委托真身,记录 [rightOcean, inwardRetry] 序） */
function spyRequest(g: ReturnType<typeof stubGame>): Array<[boolean, boolean]> {
  const calls: Array<[boolean, boolean]> = [];
  const proto = Game.prototype as unknown as { requestMagicConchTeleportPosition: ConchFn };
  g.requestMagicConchTeleportPosition = (ro: boolean, inward?: boolean) => {
    calls.push([ro, inward === true]);
    return proto.requestMagicConchTeleportPosition.call(g, ro, inward);
  };
  return calls;
}
function fire(g: ReturnType<typeof stubGame>, px: number): { x: number; y: number; vy: number } {
  (g as unknown as { fireRecallTeleport(c: unknown): void }).fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  return g.player as { x: number; y: number; vy: number };
}

// ★BJ249 F5 缺省值采样（R4 变异 M4 揭缺：beforeEach 赋 true 会掩盖静态初始化被删
//  ——闸变 undefined=falsy=永 OFF 且现有四测全绿伪象;顶层采样先于本文件一切
//  beforeEach,直接锁静态初始化面 `= true`）
const CONCH_DEFAULT_AT_IMPORT = Game.CONCH_RIGHT_OCEAN_COMPENSATION;

describe('BJ242 右洋补偿式内移重试（用户明令分歧,回滚口 Game.CONCH_RIGHT_OCEAN_COMPENSATION）', () => {
  beforeEach(() => { Game.CONCH_RIGHT_OCEAN_COMPENSATION = true; });   // 缺省=分歧开启

  it('⑤缺省闸=开（R4-M4 锁:静态初始化 Game.CONCH_RIGHT_OCEAN_COMPENSATION=true）', () => {
    expect(CONCH_DEFAULT_AT_IMPORT).toBe(true);
  });

  it('①物证特征世界（缺省 ON）：右洋重试命中——落右洋甲板 (w-41,163),fire 面从左半场直达右洋', () => {
    const w = evidenceSignatureWorld();
    const W = w.store.w;
    // 函数面：右洋边界拒 → 内移起点 559 落甲板 (559,163)（站 deck@164 顶面）
    const g = stubGame(w, 0, 0);
    const dest = g.requestMagicConchTeleportPosition(true);
    expect(dest, '补偿重试后右洋可达').not.toBeNull();
    expect(dest!.x).toBe((W - 41) * TILE + 8 - 10);
    expect(dest!.y).toBe(163 * TILE + 16 - 42);
    expect(dest!.x).toBeGreaterThan(W * TILE / 2);   // 落点在世界右半=右洋域
    // fire 面：左半场玩家 → 首选右洋（原版败）→ 补偿重试命中 → velocity=Zero 命中臂
    const g2 = stubGame(w, 40 * TILE, 110 * TILE);
    const p = fire(g2, 40 * TILE);
    expect(p.x).toBe((W - 41) * TILE + 8 - 10);
    expect(p.y).toBe(163 * TILE + 16 - 42);
    expect(p.vy, '命中臂 velocity=Zero（Player.cs:56820）').toBe(0);
  });

  it('②自然地图（缺省 ON）零变化：右洋原版直达,重试臂未触发（单次调用,无内移重试）', () => {
    const w = naturalSignatureWorld();
    const W = w.store.w;
    const g = stubGame(w, 0, 0);
    const calls = spyRequest(g);
    const p = fire(g, 40 * TILE);
    expect(p.x).toBe((W - 51) * TILE + 8 - 10);   // 与 bj240 自然档全等（液面爬行 11 步落泥架）
    expect(p.y).toBe(163 * TILE + 16 - 42);
    expect(calls, '单次右洋尝试直达,重试臂未触发').toEqual([[true, false]]);
  });

  it('③左洋零变化（缺省 ON）：左洋请求不补偿;右半场首选即左洋（无右洋尝试）', () => {
    const w = evidenceSignatureWorld();
    const g = stubGame(w, 0, 0);
    const dest = g.requestMagicConchTeleportPosition(false);
    expect(dest!.x).toBe(40 * TILE + 8 - 10);
    expect(dest!.y).toBe(111 * TILE + 16 - 42);
    // 右半场玩家：首试=左洋（对侧）命中即止——calls 只有 [false,_]
    const g2 = stubGame(w, 570 * TILE, 100 * TILE);
    const calls = spyRequest(g2);
    const p = fire(g2, 570 * TILE);
    expect(p.x).toBe(40 * TILE + 8 - 10);
    expect(p.y).toBe(111 * TILE + 16 - 42);
    expect(calls, '右半场首试左洋命中,无补偿支').toEqual([[false, false]]);
  });

  it('④回滚口关闭=原版逐字全等：双尝试序回落左洋,无第三脚（bj240 语义锁同相）', () => {
    const w = evidenceSignatureWorld();
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    try {
      const g = stubGame(w, 0, 0);
      expect(g.requestMagicConchTeleportPosition(true), 'OFF:右洋恒败=原版').toBeNull();
      const g2 = stubGame(w, 40 * TILE, 110 * TILE);
      const calls = spyRequest(g2);
      const p = fire(g2, 40 * TILE);
      expect(p.x).toBe(40 * TILE + 8 - 10);          // 回退左洋（=bj240 锁面值）
      expect(p.y).toBe(111 * TILE + 16 - 42);
      expect(p.vy).toBe(0);
      expect(calls, '恰好两脚原版序:右洋(true)败→左洋(false),无内移重试').toEqual([[true, false], [false, false]]);
    } finally {
      Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev;
    }
  });
});
