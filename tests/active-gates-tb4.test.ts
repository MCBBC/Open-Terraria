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
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { FallingBlock } from '../src/entities/FallingBlock';

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
  // ★SW-BJ12 2026-09-07 重钉：BJ10 SmartCursorHelper.TileTargetDesired 门
  // （tryPlace 头 lockedContinuity 读）缺 stub——锁存续期 null=无锁直通
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.player = {
    placeSpeedTileRaw: () => 1,   // ★SW-BJ59 后桩须携法(旧 Game 内联已迁 Player 委托;桩 buff/equipStats 空 ⇒ 恒 1)
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1,
    // ★SW-BJ12：pickSpeedMult（块换镐段冷却）读面补齐
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, equipStats: {},
    inv: {
      selected: 0,
      slots: new Array(50).fill(null),
      heldItem: () => ({ id: iidOf(heldVid), stack: 5 }),
      removeAt: () => {},
      removeHeld: () => {},   // SW-AZ1:手持消耗统一入口
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

// ===================== ★M13 批（2026-09-04）：A-2 BBMSF 单源 / B-3 触发集 / B-4 药草 active 臂 =====================

/** 空窗世界（清出 8..30 行,排除生成残留） */
function worldCleared(seed: number): World {
  const w = new World(40, 40, seed, 'tb4-m13');
  const st = w.store;
  for (let x = 2; x < 38; x++) for (let y = 8; y <= 30; y++) st.setTile(x, y, 0, 0, 0);
  return w;
}

describe('④ A-2 BBMSF 单源：平台=tileSolid 支撑 → AISTYLE10_PLACE flag2 假 → 铺上', () => {
  // 消费位=Projectile.Kill :79267-79270 WorldGen.BlockBelowMakesSandFall(num15,num16)
  // （Game.sandFallsBelow → FallingBlock.blockBelowMakesSandFall,tileSolidOf=def.solid
  // ∪tileSolid∩tileSolidTop 九件套）。旧内联版 arm2 `!st.isSolid(下方)` 对平台恒真
  // → flag2 误拦 → 不铺。
  it('落黑檀砂弹 56 死亡格正下=平台 → 平台上铺黑檀砂、不掉兜底件 370', () => {
    const w = worldCleared(23);
    const st = w.store;
    st.setTile(10, 13, TILE_BY_KEY['platform']!, 0, 0);
    const drops: Array<[string, number, number]> = [];
    deathShell(w, drops).onProjectileDeath(56, 10 * 16 + 3, 12 * 16 + 3, 10, 10, 0, 0);
    expect(st.type[st.idx(10, 12)]).toBe(TILE_INTERNAL_BY_SHEET.get(112)!);   // 平台上铺上
    expect(st.type[st.idx(10, 13)]).toBe(TILE_BY_KEY['platform']!);           // 平台原样
    expect(drops).toEqual([]);                      // flag2 假 → 不掉 370
  });

  it('对照:死亡格正下=悬空工作台（tileSolid=false 且再下格空）→ arm2 真 → flag2 拒铺掉 370', () => {
    const w = worldCleared(23);
    const st = w.store;
    st.setTileSilent(10, 13, TILE_BY_KEY['workbench']!, 0, 0);
    const drops: Array<[string, number, number]> = [];
    deathShell(w, drops).onProjectileDeath(56, 10 * 16 + 3, 12 * 16 + 3, 10, 10, 0, 0);
    expect(st.type[st.idx(10, 12)]).toBe(0);        // 不铺（arm2 家具支真值=原版语义）
    expect(drops.length).toBe(1);
    expect(drops[0][0]).toMatch(/^vi_370_/);        // Center+(0,-2) 兜底件（:79293-79296）
  });
});

describe('⑤ B-3 FALLING_TILES 触发集补齐（TileID.cs:395 全 11 件）+钱币堆零伤档', () => {
  const FALLING_SHEETS = [53, 112, 116, 123, 224, 234, 330, 331, 332, 333, 495];

  it('触发集含 330-333 钱币堆/495 贝壳堆（此前 6/11=掉件表有、触发集无的死数据）', () => {
    const FT = (Game as unknown as { FALLING_TILES: Set<number> }).FALLING_TILES;
    expect(FT.size).toBe(11);
    for (const sh of FALLING_SHEETS) {
      expect(FT.has(TILE_INTERNAL_BY_SHEET.get(sh)!), `sheet ${sh}`).toBe(true);
    }
  });

  it('drainSandQueue:钱币堆失支撑 → 转 FallingBlock 且 dmg=0（GetSandfallProjData :87824-87831）;贝壳堆 dmg=10', () => {
    const w = worldCleared(29);
    const st = w.store;
    const projs: unknown[] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.world = w;
    g.entities = { add: (e: unknown) => { projs.push(e); }, projectiles: [] };
    const dq = g as unknown as { sandQueue: Array<[number, number]>; drainSandQueue(): void };
    st.setTileSilent(10, 20, TILE_INTERNAL_BY_SHEET.get(330)!);   // 铜币堆
    st.setTileSilent(12, 20, TILE_INTERNAL_BY_SHEET.get(495)!);   // 贝壳堆
    dq.sandQueue = [[10, 20], [12, 20]];
    dq.drainSandQueue();
    expect(st.hasTile(10, 20)).toBe(false);         // 触发集命中 → 格转换
    expect(st.hasTile(12, 20)).toBe(false);
    expect(projs.length).toBe(2);
    expect((projs[0] as FallingBlock).dmg).toBe(0); // 钱币堆 → 弹 411-414 dmg=0
    expect((projs[1] as FallingBlock).dmg).toBe(10);  // 贝壳堆 812 → 缺省档
  });
});

describe('⑥ B-4 liqGateHerb 补 active 臂（Player.cs:40058 只对非活性格设岩浆门）', () => {
  // 载体=火焰花种子 vi_312（tile v_83_herbs_mature,placeStyle 5=岩浆 Allowed 档——
  // TileObjectData.cs:4777-4780 liqStyles[5].lava=allowed;基座=灰烬 57（PlaceAlch
  // style5 白名单 {57,633,78,380}）→ 放置后 CheckAlch col5 岩浆支存活（>16 岩浆熟
  // 转换 83→84）。判据载体须避开"放上去就被 CheckAlch 杀"的基座失配干扰。
  const SEED_FIRE_V = 312;
  const SEED_DAY_V = 307;   // vi_307_daybloom_seeds（placeStyle 0,岩浆 NotAllowed 档）

  it('活性目标格（小石堆+岩浆）→ 走 IsReplaceableBlock 臂 → 岩浆门不生效,火焰花植上', () => {
    const w = worldPlace();
    const st = w.store;
    const ASH_T = TILE_INTERNAL_BY_SHEET.get(57)!;
    st.setTileSilent(8, 21, ASH_T, 0, 0);           // 灰烬基座（col5 白名单）
    st.setTileSilent(8, 20, TILE_BY_KEY['v_185_small_decos']!, 0, 0);
    st.setActuated(8, 20, true);                    // active()=true（裸 active 位不排致动）
    st.setLiquid(8, 20, 255, 2);                    // 岩浆
    const drops: Array<[string, number]> = [];
    placeShell(w, drops, SEED_FIRE_V).tryPlace(8, 20, defOf(SEED_FIRE_V));
    // ★②（2026-09-04 掉落/放置族批）PlaceAlch 运行时接链后写面=82 芽（PlaceAlch :45866
    //  tile.type=82 硬编码;82 未熟档不参与 col5 岩浆熟转换 :46451 break → 保持 82）
    expect(st.type[st.idx(8, 20)]).toBe(TILE_INTERNAL_BY_SHEET.get(82)!);
    expect(st.flags[st.idx(8, 20)]).not.toBe(0);
  });

  it('对照:非活性岩浆空格 + style0 种子 → 岩浆门生效（LavaPlacement=NotAllowed）拒植', () => {
    const w = worldPlace();
    const st = w.store;
    st.setTile(8, 20, 0, 0, 0);
    st.setLiquid(8, 20, 255, 2);
    const drops: Array<[string, number]> = [];
    placeShell(w, drops, SEED_DAY_V).tryPlace(8, 20, defOf(SEED_DAY_V));
    expect(st.type[st.idx(8, 20)]).toBe(0);         // 岩浆门拦（:41815-41817 域）
    expect(st.flags[st.idx(8, 20)]).toBe(0);
  });

  it('★B-4 判别:活性岩浆格（小石堆）+ style0 种子 → 门不生效（曾无条件查岩浆=误拒,石堆原样）', () => {
    const w = worldPlace();
    const st = w.store;
    st.setTileSilent(8, 20, TILE_BY_KEY['v_185_small_decos']!, 0, 0);
    st.setActuated(8, 20, true);
    st.setLiquid(8, 20, 255, 2);
    const drops: Array<[string, number]> = [];
    placeShell(w, drops, SEED_DAY_V).tryPlace(8, 20, defOf(SEED_DAY_V));
    // 门放行 → IsReplaceableBlock 臂照走：石堆（BreakableWhenPlacing）被清格
    //（AssortedThings :41653-41660 flag8 alch 支）——pre-fix 在此无条件 return=石堆原样
    expect(st.hasTile(8, 20)).toBe(false);
  });
});
