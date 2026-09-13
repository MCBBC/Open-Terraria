// SW-BJ12 2026-09-07：物块交换（Block Swap）全量对账守卫测试。
// 标杆 = Terarria1457 Player.cs PlaceThing_TryReplacingTiles(:40156-40245) /
// PlaceThing_ValidTileForReplacement(:40250-40361) /
// PlaceThing_CheckSpecificValidtyCaseForBlockSwap(:40376-40411) / GetBestPickaxe(:40413)
// / WorldGen.ReplaceTile(:63061)+WouldTileReplacementWork(:63209)+KillTile_GetItemDrops
// (:64477)；TileID.Sets 表 = TileID.cs:217/:233/:235/:395。
// 本批刀：A1 积累不足分支摆拍冷却+整段 ItemTimeIsZero 闸（用户直诉"无冷却/比镐快"）、
// A2 镐段=pickSpeed 乘区（非 attackSpeedMult,无 14 floor）、A3 最佳镐选择器锁定、
// B2/A4 每击伤害=tileHitDamage 全式（GetPickaxeDamage 除数/门槛/FTW×2）、
// C1 受重力物块 / C5 掉落门修复（旧比对恒 false 死门）/ C6 例外集补接（绳物品/苔
// 放置/tileCut 目标/FTW 脆蜂蜜/放置物类目）/ C7 格栅含液、E7 换墙冷却=墙面物品 useTime。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, blockSwapDropMatches } from '../src/core/Game';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { BuffType } from '../src/stats/Buffs';

// ---- vid 权威（原版 item id）----
const WOOD_V = 9;        // 木材（放置物）
const DIRT_V = 2;        // 土块（掉落门:草 drop=2）
const STONE_V = 3;       // 石块
const SAND_V = 169;      // 沙块（Falling 53）
const ASH_V = 172;       // 灰烬块（灰烬草 drop=172）
const COPPER_PICK = 3509;  // 铜镐 pick 35 ut 15
const COBALT_PICK = 776;   // 钴镐 pick 110 ut 13（110% 门槛判定用）
const TITANIUM_PICK = 1202; // 钛金镐 pick 190 ut 7
const TIE_TOP = 3485;      // pick 59 ut 15（同力 tie 组）
const TIE_LOW = 2341;      // pick 59 ut 13（同力 tie 组）
const ROPE_COIL = 965;     // 绳线圈（SortingPriorityRopes {85,965,2996,3077,3078}）

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
function defOf(vid: number): (typeof ITEM_DEFS)[number] {
  const d = ITEM_DEFS[iidOf(vid)];
  if (!d) throw new Error(`missing ITEM_DEFS for vid ${vid}`);
  return d;
}
function panelDefOf(tileKey: string): (typeof ITEM_DEFS)[number] {
  const d = ITEM_DEFS.find((x) => x.key.startsWith('place_') && x.tile === tileKey);
  if (!d) throw new Error(`missing place panel for ${tileKey}`);
  return d;
}

/** 状态化 HitTile 桩（分缓冲积累——块换走 buf 1,挖掘走 buf 0） */
function mkHitTiles() {
  const acc = new Map<number, number>();
  const calls: Array<{ dmg: number; buf: number }> = [];
  return {
    calls,
    addDamage(_tx: number, _ty: number, dmg: number, buf = 0): number {
      calls.push({ dmg, buf });
      const v = (acc.get(buf) ?? 0) + dmg;
      acc.set(buf, v);
      return v;
    },
    getDamage(_tx: number, _ty: number, buf = 0): number { return acc.get(buf) ?? 0; },
    clear(_tx: number, _ty: number, buf = 0): void { acc.delete(buf); },
  };
}

interface Shell {
  world: World;
  player: Record<string, unknown> & {
    useTime: number;
    inv: { slots: unknown[]; heldItem(): unknown; removeHeld(n?: number): void };
  };
  drops: Array<[string, number]>;
  achievements: Record<string, unknown>;   // SW-RB6a 2026-09-07：Shell 缺声明（F6 测试覆写 notifyTileDestroyed 用）
  hit: ReturnType<typeof mkHitTiles>;
  tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
  tryPlaceWall(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
}

function shell(w: World, opts: {
  held?: number;                                        // 手持 vid（默认木材）
  heldDef?: (typeof ITEM_DEFS)[number];                 // 或直接给 def（面板物品等）
  picks?: Array<[vid: number, slot: number]>;           // 背包镐分布（A3 选择器）
  miningBuff?: boolean;                                 // pickSpeed ×0.75 档
  seedFlags?: Record<string, boolean>;
}): Shell {
  const drops: Array<[string, number]> = [];
  const hit = mkHitTiles();
  const g = Object.create(Game.prototype) as unknown as Shell & Record<string, unknown>;
  g.world = w;
  (w as unknown as { seedFlags: Record<string, boolean> }).seedFlags = { ...opts.seedFlags };
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
  g.playSfxFile = () => {};                                // fail 支每击音（KillTile_PlaySounds）
  g.hitTiles = hit;
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  // BJ10 SmartCursorHelper.TileTargetDesired 门（tryPlace 头 lockedContinuity 读）
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  const heldDef = opts.heldDef ?? (opts.held !== undefined ? defOf(opts.held) : defOf(WOOD_V));
  const heldId = ITEM_DEFS.indexOf(heldDef);
  const slots: unknown[] = new Array(50).fill(null);
  for (const [vid, slot] of opts.picks ?? []) slots[slot] = { id: iidOf(vid), stack: 1 };
  g.player = {
    placeSpeedTileRaw: () => 1,   // ★SW-BJ59 后桩须携法(旧 Game 内联已迁 Player 委托;桩 buff/equipStats 空 ⇒ 恒 1)
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, usedAmbrosia: false,
    // pickSpeedMult 读面：wellFedTier/hungerPickSpeed（pickSpeed 加法减量链）
    buffs: { has: (b: number) => !!opts.miningBuff && b === BuffType.Mining, wellFedTier: 0, hungerPickSpeed: 0 },
    equipStats: {},
    inv: {
      slots,
      heldItem: () => ({ id: heldId, stack: 9 }),
      removeHeld: () => {},
    },
  };
  g.drops = drops;
  g.hit = hit;
  return g;
}

/** 石地地面行 y=21,作业面 y=20 */
function mkWorld(): World {
  const w = new World(40, 40, 7, 'sw-bj12');
  for (let x = 2; x < 38; x++) w.store.setTileSilent(x, 21, TILE_BY_KEY['stone']);
  return w;
}

const STONE_T = TILE_BY_KEY['stone'];
const GRASS_T = TILE_BY_KEY['grass'];
const WOOD_T = TILE_BY_KEY[defOf(WOOD_V).tile ?? ''];
const setT = (k: string) => TILE_BY_KEY[k];
const useTimeOf = (vid: number) => itemCombat(vid)?.useTime ?? 0;

// ============================================================
// A1 冷却（用户直诉：无冷却体感+比镐快）——Player.cs:40163/:40188-40203
// ============================================================
describe('A1 积累不足分支摆拍冷却 + 整段 ItemTimeIsZero 闸', () => {
  it('每击冷却 = 最佳镐 useTime×pickSpeed（铜镐 15t）;冷却窗内闸停积累', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);                    // 石:每击 35（tileHitDamage 全式）
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(1);
    expect(g.hit.calls[0]).toMatchObject({ dmg: 35, buf: 1 });   // 块换积累条=buf 1（原版 hitReplace）
    expect(g.player.useTime).toBe(useTimeOf(COPPER_PICK));       // 15 = itemCombat useTime×1
    expect(st.type[st.idx(9, 20)]).toBe(STONE_T);                // 未破坏
    expect(g.drops).toEqual([]);                                 // 不掉落不消耗
    // 冷却窗内再次点击：:40163 ItemTimeIsZero 总闸——不积累、冷却值不被触碰
    g.player.useTime = 10;
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(1);
    expect(g.player.useTime).toBe(10);
    // 冷却结束（useTime 归零）→ 恢复积累
    g.player.useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(2);
    expect(g.hit.calls[1].dmg).toBe(35);
    expect(g.player.useTime).toBe(useTimeOf(COPPER_PICK));
  });

  it('冷却受挖矿速度奖励影响（Mining 药水 pickSpeed -0.25 → 15t×0.75=11t）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]], miningBuff: true });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.player.useTime).toBe(Math.max(1, Math.round(useTimeOf(COPPER_PICK) * 0.75)));
    expect(st.type[st.idx(9, 20)]).toBe(STONE_T);
  });

  it('无镐不可块换（:40165 GetBestPickaxe null → false,零积累零冷却）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);
    const g = shell(w, { held: WOOD_V, picks: [] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(g.player.useTime).toBe(0);
    expect(st.type[st.idx(9, 20)]).toBe(STONE_T);
    expect(g.drops).toEqual([]);
  });

  it('F6 不获成就面（byPlayer=false → 不计 tileDestroyed/HandleMining）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('dirt'));
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    const destroyed: number[] = [];
    (g.achievements as unknown as { notifyTileDestroyed: (n: number) => void }).notifyTileDestroyed =
      (n: number) => destroyed.push(n);
    g.player.useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));                    // 一拍换完（土 70×2）
    g.player.useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);
    expect(destroyed).toEqual([]);                       // ReplaceTile 非破坏面,无成就
  });
});

// ============================================================
// F1 油漆移除（vanilla ReplaceTile ClearBlockPaintAndCoating :63171 同效面）
// ============================================================
describe('F1 交换移除油漆', () => {
  it('带漆目标块换后新块无漆（breakTile 清格清漆 → 新块 fresh）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('dirt'));
    const i = st.idx(9, 20);
    st.paint[i] = 5;                                      // 旧块带漆
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.player.useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));
    g.player.useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(st.type[i]).toBe(WOOD_T);
    expect(st.paint[i]).toBe(0);                          // 漆随旧块移除
  });
});

// ============================================================
// A2 成功拍双段冷却 + A3 最佳镐选择器（GetBestPickaxe :40413-40422）
// ============================================================
describe('A2 成功拍合并冷却 + A3 最佳镐选择器', () => {
  it('成功拍冷却 = 镐段+方块段（铜镐 15 + 木材 10 = 25;原版 SetItemTime(num4+num5)）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('dirt'));               // 土:每击 70（SOFT 加速档 ×2）
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));                    // 第一击 70 <100 → fail 冷却 15
    expect(g.player.useTime).toBe(useTimeOf(COPPER_PICK));
    expect(st.type[st.idx(9, 20)]).toBe(setT('dirt'));
    g.player.useTime = 0;
    g.tryPlace(9, 20, defOf(WOOD_V));                    // 第二击 140 ≥100 → 同拍换完
    expect(g.drops.some(([k]) => k.startsWith('vi_2_'))).toBe(true);   // 旧土掉落
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);         // 新块落位
    expect(g.player.useTime).toBe(useTimeOf(COPPER_PICK) + useTimeOf(WOOD_V));   // 15+10=25
  });

  it('最高镐力者胜（铜 35 vs 钛金 190 → 钛金段 7t;伤害=190 一击换完）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5], [TITANIUM_PICK, 20]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);         // 190 ≥100 一拍换完
    expect(g.player.useTime).toBe(useTimeOf(TITANIUM_PICK) + useTimeOf(WOOD_V));   // 7+10=17（非铜 25）
  });

  it('同镐力取背包序最上（slot 3 tie 组 vs slot 12）——严格大于=先入者守位', () => {
    // tie 组:3485/2341 同 pick 59,useTime 15/13——冷却值指认赢家
    const w1 = mkWorld();
    w1.store.setTileSilent(9, 20, STONE_T);
    const g1 = shell(w1, { held: WOOD_V, picks: [[TIE_TOP, 3], [TIE_LOW, 12]] });
    g1.tryPlace(9, 20, defOf(WOOD_V));
    expect(g1.player.useTime).toBe(useTimeOf(TIE_TOP));   // 15（先入 3485 守位）
    const w2 = mkWorld();
    w2.store.setTileSilent(9, 20, STONE_T);
    const g2 = shell(w2, { held: WOOD_V, picks: [[TIE_LOW, 3], [TIE_TOP, 12]] });
    g2.tryPlace(9, 20, defOf(WOOD_V));
    expect(g2.player.useTime).toBe(useTimeOf(TIE_LOW));   // 13（换位后 2341 守位）
  });
});

// ============================================================
// B2/A4 每击伤害模型 = GetPickaxeDamage 全式（:54545 + FTW ×2 :40174-40176）
// ============================================================
describe('B2/A4 每击伤害模型（tileHitDamage 全式,非平铺镐力）', () => {
  it('硬块除数生效：黑檀石 ÷2（钴镐 110 → 55/击 <100 → fail 冷却 13t）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_25_ebonstone_block'));
    const g = shell(w, { held: WOOD_V, picks: [[COBALT_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls[0].dmg).toBe(55);                  // floor(110/2),非平铺 110
    expect(st.type[st.idx(9, 20)]).toBe(setT('v_25_ebonstone_block'));
    expect(g.player.useTime).toBe(useTimeOf(COBALT_PICK));
  });

  it('镐力门槛归零（B2 per-tile 门）：铜镐 35<黑檀石 65 档 / 钴镐 110<绿藻 200 档 → 不积累不冷却', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_25_ebonstone_block'));
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));                    // :54557 门槛 65 → dmg=0
    expect(g.hit.calls).toHaveLength(0);
    expect(g.player.useTime).toBe(0);                    // :40178 num2==0 早退,无摆拍冷却
    expect(st.type[st.idx(9, 20)]).toBe(setT('v_25_ebonstone_block'));
    // 门槛归零面二:绿藻 211 需 200——钴镐 110 < 200
    const w2 = mkWorld();
    w2.store.setTileSilent(12, 20, setT('ore_chlorophyte'));
    const g2 = shell(w2, { held: WOOD_V, picks: [[COBALT_PICK, 5]] });
    g2.tryPlace(12, 20, defOf(WOOD_V));
    expect(g2.hit.calls).toHaveLength(0);                 // dmg=0 → :40178 恒不积累
    expect(w2.store.type[w2.store.idx(12, 20)]).toBe(setT('ore_chlorophyte'));
    expect(g2.player.useTime).toBe(0);
  });

  it('FTW 对块伤害 ×2（:40174-40176）', () => {
    const w = mkWorld();
    w.store.setTileSilent(9, 20, STONE_T);
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]], seedFlags: { getGoodWorld: true } });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls[0].dmg).toBe(70);                  // 35×2
  });
});

// ============================================================
// C1 受重力物块（CheckSpecificValidtyCaseForBlockSwap :40376-40411）
// ============================================================
describe('C1 受重力物块交换向（TileID.Sets.Falling,TileID.cs:395）', () => {
  it('无 110 镐力:上方同为受重力 → 拒（只能自最上方起由上到下）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 19, setT('sand'));               // 上邻沙（受重力）
    st.setTileSilent(9, 20, setT('sand'));               // 目标沙
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(setT('sand'));
    expect(g.player.useTime).toBe(0);                    // verdict 级拒:无冷却
    expect(g.drops).toEqual([]);
  });

  it('无 110 镐力:上方非受重力（石）→ 放行,积累启动', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 19, STONE_T);
    st.setTileSilent(9, 20, setT('sand'));
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(1);                 // 沙 SOFT 档 70/击 → fail 冷却
    expect(g.player.useTime).toBe(useTimeOf(COPPER_PICK));
  });

  it('无 110 镐力:上方空 = 最上层 → 放行', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('sand'));
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(1);
  });

  it('受重力物块互相之间总是自由（沙换黑檀沙,无视上方受重力与镐力）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 19, setT('sand'));
    st.setTileSilent(9, 20, setT('v_112_ebonsand_block'));
    const g = shell(w, { held: SAND_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(SAND_V));
    expect(g.hit.calls).toHaveLength(1);                 // flag=Falling[placed] → flag2=false
  });

  it('≥110 镐力（钴镐 110）:自由交换（上方受重力仍放行,一拍换完）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 19, setT('sand'));
    st.setTileSilent(9, 20, setT('sand'));
    const g = shell(w, { held: WOOD_V, picks: [[COBALT_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(st.type[st.idx(9, 20)]).toBe(WOOD_T);         // 沙 SOFT 220 一拍换完
    expect(g.drops.some(([k]) => k.startsWith('vi_169_'))).toBe(true);
    expect(g.player.useTime).toBe(useTimeOf(COBALT_PICK) + useTimeOf(WOOD_V));
  });
});

// ============================================================
// C5 草/苔/灰烬草掉落门（:40347-40354 dropItem==HeldItem.type）
// ============================================================
describe('C5 掉落门修复（草→土/苔→石/灰烬草→灰烬块不可换）', () => {
  it('草→土:拒（草 drop=泥土 item 2 == 手持泥土）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, GRASS_T);
    const g = shell(w, { held: DIRT_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(DIRT_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(GRASS_T);
    expect(g.player.useTime).toBe(0);
    expect(g.drops).toEqual([]);
  });

  it('苔→石:拒（苔 drop=石 item 3）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_179_green_moss_block'));
    const g = shell(w, { held: STONE_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(STONE_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(setT('v_179_green_moss_block'));
  });

  it('灰烬草→灰烬块:拒（drop=172）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_633_ash_grass_block'));
    const g = shell(w, { held: ASH_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(ASH_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(setT('v_633_ash_grass_block'));
  });

  it('草→石:放行（掉落不同,掉落门不拦）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, GRASS_T);
    const g = shell(w, { held: STONE_V, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(STONE_V));
    expect(g.hit.calls).toHaveLength(1);                 // 35/击 → fail 冷却
    expect(g.player.useTime).toBe(useTimeOf(COPPER_PICK));
  });

  it('blockSwapDropMatches 单元:vid 面/面板 createTile 等价面/Ignores{158,30} 豁免', () => {
    const grassDef = TILE_DEFS[GRASS_T];
    expect(grassDef?.drop).toBe(2);
    expect(blockSwapDropMatches(grassDef, DIRT_V, -1)).toBe(true);       // drop 2 == 泥土 vid
    expect(blockSwapDropMatches(grassDef, -1, 0)).toBe(true);            // 面板:泥土 item createTile 0 == 放置 sheet 0
    expect(blockSwapDropMatches(grassDef, -1, 5)).toBe(false);           // 面板木材 ≠
    expect(blockSwapDropMatches(grassDef, STONE_V, 1)).toBe(false);      // 石 vid 3 ≠
    expect(blockSwapDropMatches(TILE_DEFS[STONE_T], -1, 158)).toBe(false);   // Ignores 豁免域
    expect(blockSwapDropMatches(undefined, DIRT_V, 0)).toBe(false);      // 无 def 恒否
  });
});

// ============================================================
// C6/C7/C8 例外集（DoesntGetReplaced :235 / DoesntPlace :233 / 格栅 :40404-40406）
// ============================================================
describe('C6/C7/C8 例外集', () => {
  it('C6 狱石不可换出（DoesntGetReplaced 58）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('ore_hellstone'));
    const g = shell(w, { held: WOOD_V, picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(setT('ore_hellstone'));
    expect(g.player.useTime).toBe(0);
  });

  it('C8 蜂巢块不可换出（DoesntGetReplaced 225）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_225_hive_block'));
    const g = shell(w, { held: WOOD_V, picks: [[TITANIUM_PICK, 5]] });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(setT('v_225_hive_block'));
  });

  it('C7 格栅（546）含液不可换;干格栅可换', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_546_grate'));
    const i = st.idx(9, 20);
    st.liquid[i] = 120;                                   // 含液
    const g1 = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g1.tryPlace(9, 20, defOf(WOOD_V));
    expect(g1.hit.calls).toHaveLength(0);
    expect(st.type[i]).toBe(setT('v_546_grate'));
    st.liquid[i] = 0;                                     // 干格栅 → 可换
    g1.player.useTime = 0;
    g1.tryPlace(9, 20, defOf(WOOD_V));
    expect(g1.hit.calls).toHaveLength(1);
  });

  it('C6 FTW 脆蜂蜜块（230）不可换出;非 FTW 可换', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, setT('v_230_crispy_honey_block'));
    const g = shell(w, { held: WOOD_V, picks: [[COPPER_PICK, 5]], seedFlags: { getGoodWorld: true } });
    g.tryPlace(9, 20, defOf(WOOD_V));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(setT('v_230_crispy_honey_block'));
    // 非 FTW 世界:脆蜂蜜块是普通可换块
    const w2 = mkWorld();
    w2.store.setTileSilent(9, 20, setT('v_230_crispy_honey_block'));
    const g2 = shell(w2, { held: WOOD_V, picks: [[COPPER_PICK, 5]] });
    g2.tryPlace(9, 20, defOf(WOOD_V));
    expect(g2.hit.calls).toHaveLength(1);
  });

  it('C6 放置侧:苔类面板物品不可经块换放置（Main.tileMoss[placed] :40252-40254）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);
    const panel = panelDefOf('v_179_green_moss_block');
    const g = shell(w, { heldDef: panel, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, panel);
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(STONE_T);
    expect(g.player.useTime).toBe(0);
  });

  it('C6 放置侧:灰烬草面板物品不可经块换放置（DoesntPlace 633）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);
    const panel = panelDefOf('v_633_ash_grass_block');
    const g = shell(w, { heldDef: panel, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, panel);
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(STONE_T);
  });

  it('D6 门面:绳类物品不做块换（SortingPriorityRopes 965 :40248-40250）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(9, 20, STONE_T);
    const g = shell(w, { held: ROPE_COIL, picks: [[COPPER_PICK, 5]] });
    g.tryPlace(9, 20, defOf(ROPE_COIL));
    expect(g.hit.calls).toHaveLength(0);
    expect(st.type[st.idx(9, 20)]).toBe(STONE_T);
    expect(g.player.useTime).toBe(0);
    expect(g.drops).toEqual([]);
  });
});

// ============================================================
// E7 换墙冷却 = 墙面物品 useTime×wallSpeed（Player.cs:40137 ApplyItemTime）
// ============================================================
describe('E7 换墙冷却（SW-BF1 面 data 化）', () => {
  it('玻璃墙（vid 392,wallId 21,useTime 7）→ 冷却 7t（旧硬编码 15 会判 15）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setWall(9, 20, 5);                                 // 旧墙 5（木墙,非地牢/87/350）
    // SW-BG1:wallId 挂在影子 def 上（蛇形/驼峰双 def 家族）——按 wallId 查
    const wallDef = ITEM_DEFS.find((d) => d.wallId === 21);
    expect(wallDef?.wallId).toBe(21);
    expect(wallDef!.key.startsWith('vi_392_')).toBe(true);   // vid 392 = 玻璃墙（useTime 7）
    const g = shell(w, { heldDef: wallDef! });
    (g as unknown as { skeletronDowned(): boolean }).skeletronDowned = () => true;
    g.tryPlaceWall(9, 20, wallDef!);
    expect(st.wall[st.idx(9, 20)]).toBe(21);              // 换墙一击
    expect(g.player.useTime).toBe(useTimeOf(392));        // 7 = itemCombat useTime×wallSpeed 1
  });
});
