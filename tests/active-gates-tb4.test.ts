// 终审④批（2026-09-04）裸 active()/nactive() 门位收敛回归（蓝队四散点）：
// ① AISTYLE10_PLACE 1081 侧移门（Projectile.cs:79223-79232 `!Main.tile[..].active()`）
//    ——侧格门读 hasTile（含已致动格）,曾 isActive=nactive() → 致动侧格被当空位可侧移
//    （任务备案"已致动格可以侧移"方向系倒置：active() 对致动格恒真 → 原版恒拒侧移）;
// ② liqGateLegacy 岩浆窄域（Player.cs:40058 `!tile.active() && !IsBlockedByLava(..)`）
//    ——目标活性读 hasTile,致动目标格走 IsReplaceableBlock 臂（岩浆门不生效）,
//    曾 isActive → 致动+岩浆组合被误拒;
// ③ passableLq 语义债定谳（iiiii213 备案驳回）：Tile.nactive()=active∧!inActive
//    （Tile.cs:242-248 `(sTileHeader&0x60)==32`）,与 checkingLiquid（bTileHeader3
//    bit3,Tile.cs:496-509）完全无关——"checking 半边恒可通行"系误读,原版
//    「水-在-实心-格在列表」构型照样阻挡;LiquidSim.blocksLiquid 现式即 1:1,
//    waterCheckInner 首分支补 !inActive 半边（WorldGen.cs:81703）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const DIRT_T = TILE_BY_KEY['dirt']!;
const STONE_T = TILE_BY_KEY['stone']!;
const MUD_T = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 59);   // 原版泥块（1081 落泥放置格）
const WOOD_V = 9;                                                     // vi_9_Wood（legacy 块件）

let vidToId: Record<number, number> | null = null;
function iidOf(vid: number): number {
  if (!vidToId) {
    vidToId = {};
    ITEM_DEFS.forEach((d, i) => {
      const m = /^vi_(\d+)_/.exec(d.key);
      if (m) vidToId![+m[1]] = i;
    });
  }
  return vidToId[vid] ?? -1;
}
function defOf(vid: number) {
  return ITEM_DEFS[iidOf(vid)];
}
const WOOD_T = TILE_BY_KEY[defOf(WOOD_V)?.tile ?? '']!;

/** onProjectileDeath 壳（AISTYLE10 支消费面：world/chunks/player/spawnDrop） */
function deathShell(w: World, drops: Array<[string, number, number]>) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.player = { cx: 20 * 16, cy: 10 * 16 };
  g.spawnDrop = (x: number, y: number, key: string) => { drops.push([key, x, y]); return null; };
  return g as unknown as { onProjectileDeath: (p: number, x: number, y: number, w?: number, h?: number, ovx?: number, ovy?: number) => void };
}

/** 1081 侧移夹具：左下 (9,13) 实心;死亡格 (10,12) 空、正下 (10,13) 空（侧移臂门开） */
function world1081(): World {
  const w = new World(40, 40, 11, 'tb4-1081');
  const st = w.store;
  for (let x = 7; x <= 13; x++) for (let y = 10; y <= 14; y++) st.setTile(x, y, 0, 0, 0);
  st.setTile(9, 13, DIRT_T, 0, 0);
  return w;
}

describe('① 1081 侧移门=裸 active()（Projectile.cs:79223-79232）', () => {
  it('已致动侧格不侧移（active()=true 恒拒）→ 泥直铺原死亡格', () => {
    const w = world1081();
    const st = w.store;
    st.setTile(9, 12, DIRT_T, 0, 0);
    st.setActuated(9, 12, true);                    // hasTile 真 / nactive 假
    const g = deathShell(w, []);
    g.onProjectileDeath(1081, 10 * 16 + 3, 12 * 16 + 3, 10, 10, 0, 0);
    expect(st.type[st.idx(10, 12)]).toBe(MUD_T);    // 不侧移 → 原死亡格直铺泥
    expect(st.type[st.idx(9, 12)]).toBe(DIRT_T);    // 致动格原样
  });

  it('对照:侧格真空 → 照常侧移（:79227 num15--）', () => {
    const w = world1081();
    const st = w.store;
    const g = deathShell(w, []);
    g.onProjectileDeath(1081, 10 * 16 + 3, 12 * 16 + 3, 10, 10, 0, 0);
    expect(st.type[st.idx(9, 12)]).toBe(MUD_T);     // 侧移进左格
    expect(st.type[st.idx(10, 12)]).toBe(0);
  });

  it('液体-only 侧格（无 tile 位）→ 可侧移（nactive/hasTile 对 liquid-only 同判 false）', () => {
    const w = world1081();
    const st = w.store;
    st.setLiquid(9, 12, 255, 1);
    const g = deathShell(w, []);
    g.onProjectileDeath(1081, 10 * 16 + 3, 12 * 16 + 3, 10, 10, 0, 0);
    expect(st.type[st.idx(9, 12)]).toBe(MUD_T);
  });
});

/** tryPlace 壳（同 ghost-place-swap 壳的桩面） */
function placeShell(w: World, drops: Array<[string, number]>, heldVid: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.input = { rightDown: true };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.critterVid = () => -1;
  g.spawnNpcByVanilla = () => null;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); };
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0,
      slots: new Array(50).fill(null),
      heldItem: () => ({ id: iidOf(heldVid), stack: 5 }),
      removeAt: () => {},
    },
  };
  return g as unknown as { tryPlace: (tx: number, ty: number, def: (typeof ITEM_DEFS)[number]) => void };
}

/** 石地地面行 y=21,作业面 y=20（同 ghost-place-swap mkWorld） */
function worldPlace(): World {
  const w = new World(40, 40, 13, 'tb4-liqgate');
  const st = w.store;
  for (let x = 2; x < 38; x++) st.setTileSilent(x, 21, STONE_T);
  return w;
}

describe('② liqGateLegacy=裸 active() 目标门（Player.cs:40058 + IsBlockedByLava :41809-41824）', () => {
  // 判据载体=v_185_small_decos（BreakableWhenPlacing 族,framed → 不进 swap 段,
  // 直达 liqGateLegacy;木对其=placeObstructionClearable ✓ 清格后可放置）——
  // 火把目标走 BLOCK_SWAP 火把族 verdict（镐门先拒）,不到本门,不作判据。
  it('致动目标格（致动小石堆+岩浆）走 IsReplaceableBlock 臂 → 岩浆门不生效,可放置', () => {
    const w = worldPlace();
    const st = w.store;
    const STONES_T = TILE_BY_KEY['v_185_small_decos']!;
    st.setTileSilent(8, 20, STONES_T, 0, 0);
    st.setActuated(8, 20, true);                    // active()=true（裸 active 位不排致动）
    st.setLiquid(8, 20, 255, 2);                    // 岩浆
    const drops: Array<[string, number]> = [];
    placeShell(w, drops, WOOD_V).tryPlace(8, 20, defOf(WOOD_V));
    expect(st.type[st.idx(8, 20)]).toBe(WOOD_T);    // 岩浆门未拦（曾 isActive=nactive → 误拦）,石堆清、木放置
  });

  it('对照:非致动小石堆+岩浆 → 同走 IsReplaceableBlock 臂可放置（active()=true 与致动同判）', () => {
    const w = worldPlace();
    const st = w.store;
    const STONES_T = TILE_BY_KEY['v_185_small_decos']!;
    st.setTileSilent(8, 20, STONES_T, 0, 0);
    st.setLiquid(8, 20, 255, 2);
    const drops: Array<[string, number]> = [];
    placeShell(w, drops, WOOD_V).tryPlace(8, 20, defOf(WOOD_V));
    expect(st.type[st.idx(8, 20)]).toBe(WOOD_T);    // 裸 active() 门对致动/非致动同判=true → 都不设岩浆门
  });

  it('对照:非活性岩浆格（空格+岩浆）→ tileSolid 短路拒置（:41815-41817）', () => {
    const w = worldPlace();
    const st = w.store;
    st.setLiquid(8, 20, 255, 2);
    const drops: Array<[string, number]> = [];
    placeShell(w, drops, WOOD_V).tryPlace(8, 20, defOf(WOOD_V));
    expect(st.type[st.idx(8, 20)]).toBe(0);         // 木块 tileSolid → 拒
    expect(st.flags[st.idx(8, 20)]).toBe(0);
  });
});

describe('③ passableLq 定谳钉：nactive=active∧!inActive,与 checkingLiquid 无关', () => {
  /** blocksLiquid 私有直读（语义钉专用） */
  const blk = (sim: LiquidSim) => (sim as unknown as { blocksLiquid(x: number, y: number): boolean }).blocksLiquid.bind(sim);

  it('blocksLiquid 真值表（Liquid.cs 通行谓词 !nactive||!solid||solidTop 的补）', () => {
    const w = new World(40, 40, 17, 'tb4-liq');
    const st = w.store;
    const sim = new LiquidSim(w);
    const isBlk = blk(sim);
    st.setTileSilent(10, 10, DIRT_T, 0, 0);
    expect(isBlk(10, 10)).toBe(true);                       // 常规实心=阻挡
    st.setActuated(10, 10, true);
    expect(isBlk(10, 10)).toBe(false);                      // ★致动 → nactive=false → 可通行（IIIII70b）
    st.setActuated(10, 10, false);
    (sim as unknown as { checking: Uint8Array }).checking[st.idx(10, 10)] = 1;
    expect(isBlk(10, 10)).toBe(true);                       // ★checking=1 实心格仍阻挡——
    //   vanilla nactive()（Tile.cs:242-248）无 checking 项,「水-在-实心-格在列表」
    //   构型原版照样阻挡（iiiii213 "checking 半边恒可通行"备案驳回;旧把 checking
    //   并进本谓词=EEEEE EE 批误读,IIIII70b 已删,此钉防回潮）
    st.type[st.idx(11, 10)] = DIRT_T; st.flags[st.idx(11, 10)] = 0;
    expect(isBlk(11, 10)).toBe(false);                      // 幽灵残型=空气（active 位）
    st.flags[st.idx(12, 10)] = 1; st.type[st.idx(12, 10)] = 0;
    expect(isBlk(12, 10)).toBe(true);                       // act=1 type=0 残型（tileSolid[0]=true,IIIII227）
  });

  it('waterCheckInner 首分支 !inActive 半边（WorldGen.cs:81703）:致动实心格液体不清零', () => {
    const w = new World(40, 40, 19, 'tb4-wcheck');
    const st = w.store;
    const sim = new LiquidSim(w);
    st.setTileSilent(20, 10, DIRT_T, 0, 0);
    st.setLiquid(20, 10, 200, 1);
    st.setActuated(20, 10, true);
    (sim as unknown as { waterCheckInner(): void }).waterCheckInner.call(sim);
    expect(st.liquid[st.idx(20, 10)]).toBe(200);    // nactive=false → 不走首分支清零
    st.setTileSilent(21, 10, DIRT_T, 0, 0);
    st.setLiquid(21, 10, 200, 1);
    (sim as unknown as { waterCheckInner(): void }).waterCheckInner.call(sim);
    expect(st.liquid[st.idx(21, 10)]).toBe(0);      // 对照:非致动实心格含水 → 首分支清零
  });
});
