// BJ225 钩爪 CutTiles 割面 × 猪龙彩罐（wiki 连续打碎技巧）守卫（2026-09-21 用户实报
// 「wiki 技巧失效」定谳 = 现仓三环全通、技巧可复现——本文件钉住该行为面防回归）。
//
// wiki 原话：「一次打破大量猪龙彩罐的一种简单的办法是钩抓在天花板上然后只要放置它们
// 即可。钩爪可以在玩家放置彩罐后立即将其打碎。」
//
// 原版三环锚（1457 亲读；1458 同面）：
//  ① 钩爪割面 = 通用 CutTiles 旁路，与 AI 无关：Projectile.Update :17184 Damage() →
//     :12512-12518 `friendly && owner==Main.myPlayer && !npcProj && !minion && type!=1054`
//     → CutTiles() :15276 → CanCutTiles() :15407 排除表=aiStyle{45,137,92,105,106}+高尔夫
//     +型表{463,69,70,621,10,11,379,407,476,623,625..628,833..835,818,831,820,864,970,995,
//     908,1020,1105,1040}+尾支 1091——**aiStyle 7 钩爪不在表内**且无逐型 PlotTileLine 特支
//     → flag 恒真 → 尾段 CutTilesAt(position,width,height) :15349。Damage_CanDealDamage
//     :12461 无 damage 数值门（latch 时 damage=0 :53694 仍割）。扫描盒 = 弹盒 18×18 →
//     3×3 tile（CutTilesAt 右/下 +1 排除界）。
//  ② 彩罐可割性：Main.cs:8460 tileCut[454]=true；CutTilesAt :15395
//     `flag && WorldGen.CanCutTile(i,j,AttackProjectile)` → KillTile :64029 → 尾
//     SquareTileFrame → TileFrame case 34/454 :86799-86801 → CheckChand :53254 整件 4×3
//     杀 + 454 战利品掷 :53339-53414；GetItemDrops 454 ∈ no-drop 组 :66454（无放置返还）。
//     CanCutTile :88111 拒切三族=wall 350/下格∈{78,380,579}/未熟南瓜 254。
//  ③ 挂钩放置允许：原版放置链无 grapple 门；非实心 454 不吃
//     PlaceThing_Tiles_BlockPlacementIfOverPlayers :41753（实心/32×32 名单外）。
//
// 本仓承载：中央 CutTiles 收口（Entity.ts:135-158，projectiles 桶全弹跑 cutTilesBox；
// GrappleProj 经 Game.ts:42109 entities.add 入桶，vid=vanillaId??projId??0 ∉
// CUT_EXCLUDE_VIDS :99=vanilla 型表 1:1）→ Game.cutTile :38907（TILE_CUT∪canCutTile 门
// world/CanCutTile.ts=WorldGen.cs:88111 1:1）→ breakTile → breakPigronata（Game.ts
// :22636，CheckChand 1:1）。技巧窗口 = latched 钩盒（18×18 吸附锚格中心,doLatch
// :49856-49864 等价）扫 3×3 → 4 宽彩罐顶行相触即割：件左格 ax ∈ [Lx−4, Lx+1]。
//
// 变异证红（开发期实测）：
//  M1 Entity.ts 收口 vid 摘钩爪（`?? 0`→`?? -1` 且 -1 视为排除）→ T1/T2 红（技巧断）；
//  M2 Game.cutTile 摘 canCutTile 门 → T5 红（盆上草误割）；
//  M3 breakTileBody 摘 454 特支 → T1 红（越权掉 place_v_454 + 残件不整清）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { EntityManager, Entity } from '../src/entities/Entity';
import { GrappleProj, GRAPPLE_LATCH, GRAPPLE_FLY, GRAPPLE_RETRACT } from '../src/entities/GrappleProj';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE } from '../src/core/constants';

const PG = TILE_BY_KEY['v_454_pigronata']!;
const STONE = TILE_BY_KEY['stone']!;
const GRASS = TILE_BY_KEY['tallgrass']!;          // sheet 3 ∈ TILE_CUT（非实心可割候选）
const PLANTER = TILE_BY_KEY['v_380_planter_boxes']!;  // sheet 380 ∈ CanCutTile 下格拒切表

interface Drop { x: number; y: number; key: string; n: number }
interface Rec { drops: Drop[]; digs: number; chops: number }

/** breakTile/cutTile/tryPlace/EntityManager 可驱动面最小壳（形制=tests/bj114-pigronata-tileface
 *  mkShell ×tests/bj114-d 中央收口台合集）：真 World+真 Game.prototype 判路面+桩效应面。 */
interface GShell {
  world: World;
  player: Record<string, unknown> & { useTime: number; grappleProjs: GrappleProj[] };
  smartCursor: { lockedContinuity: null; showing: boolean; x: number; y: number };
  chunks: { markDirtyArea: (...a: unknown[]) => void };
  sfx: { play: (name: string, v?: number, x?: number, y?: number) => void; playWavFile: (...a: unknown[]) => void };
  cb: { onInventoryChanged: () => void };
  entities: EntityManager;
  spawnParticles: (...a: unknown[]) => void;
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => unknown;
  recLog: (...a: unknown[]) => void;
  dumpChest: () => void;
  killTileDropBait: () => void;
  trackTile: number;
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
  breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean) => void;
  cutTile: (x: number, y: number, vid?: number, extraCut?: boolean) => void;
}
function mkShell(seed = 7): { g: GShell; w: World; rec: Rec } {
  const w = new World(60, 60, seed, 'bj225');
  const rec: Rec = { drops: [], digs: 0, chops: 0 };
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = {
    play: (name: string) => {
      if (name === 'dig') rec.digs++;
      if (name === 'chop') rec.chops++;
    },
    playWavFile: () => {},
  };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = new EntityManager();
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    rec.drops.push({ x, y, key, n });
    return null;
  };
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.trackTile = 0;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    cx: 17 * 16 + 8, cy: 14 * 16 + 8, x: 17 * 16 + 2, y: 14 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false,
    grappleProjs: [],
    registerGrapple: () => {}, unregisterGrapple: () => {}, isBlacklistedForGrappling: () => false,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0, slots: new Array(60).fill(null),
      heldItem: () => ({ id: -1, stack: 9 }), removeHeld: () => {}, removeAt: () => {}, countOf: () => 0,
    },
  };
  return { g, w, rec };
}

/** 石天花板行（y 行 x0..x1）+ latched 钩爪（=doLatch 终态：吸附锚格视觉中心） */
function latchHook(g: GShell, w: World, Lx: number, Ly: number): GrappleProj {
  const st = w.store;
  for (let dx = -6; dx <= 12; dx++) st.setTileSilent(Lx + dx, Ly, STONE, 0, 0);
  const proj = new GrappleProj(0, 0, 0, 0, 13, () => g.player as never);
  proj.ai0 = GRAPPLE_LATCH;
  proj.latchX = Lx; proj.latchY = Ly;
  proj.x = Lx * TILE + 8 - proj.projW / 2;
  proj.y = Ly * TILE + 8 - proj.projH / 2;
  g.entities.add(proj, 'projectiles');
  g.player.grappleProjs.push(proj);
  return proj;
}

/** 4×3 整件写入（wld 导入语义,帧 dx*18/dy*18） */
function placeObjectAt(w: World, ax: number, ay: number): void {
  const st = w.store;
  for (let dx = 0; dx < 4; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(ax + dx, ay + dy, PG, dx * 18, dy * 18);
    }
  }
}
const cellsLeft = (w: World, ax: number, ay: number): number => {
  let n = 0;
  for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
    if (w.store.get(ax + dx, ay + dy) === PG) n++;
  }
  return n;
};
const dropKeys = (rec: Rec): string[] => rec.drops.map((d) => d.key);
const PIG_DEF = () => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3746]!]];

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ225-①：wiki 技巧 e2e（latched 钩爪割面 × 彩罐整件碎）', () => {
  it('挂天花+锚下放置 → 一拍实体轮整件碎：零武器参与、无放置物品返还、钩爪保持锚定', () => {
    const { g, w, rec } = mkShell();
    const proj = latchHook(g, w, 15, 9);
    // 件左格 ax=Lx=15（顶行 y=10=Ly+1,列 15..18 与钩盒列 14..16 相触）——真实 tryPlace 链放置
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(17, 10, PIG_DEF());
    expect(cellsLeft(w, 15, 10)).toBe(12);
    // 一拍实体轮（真实顺序：fixedUpdate → 中央 CutTiles 收口）
    g.entities.update(1 / 60, g as never);
    expect(cellsLeft(w, 15, 10)).toBe(0);                  // 整件 4×3 清（CheckChand 语义）
    expect(rec.digs).toBe(1);                              // KillTile_PlaySounds(454)=Dig（非 chop）
    expect(rec.chops).toBe(0);
    for (const k of dropKeys(rec)) {                       // 战利品可掷五支（币/瓶/弹/无）,绝无放置返还
      expect(['place_v_454_pigronata', 'vi_3746_Pigronata']).not.toContain(k);
    }
    expect(proj.ai0).toBe(GRAPPLE_LATCH);                  // 锚格（天花）未动 → 连放可续
  });

  it('连续打碎：同位清残再放再割 → 三连碎 + 钩爪全程在役（wiki「一次打破大量」）', () => {
    const { g, w, rec } = mkShell();
    latchHook(g, w, 15, 9);
    let placed = 0;
    for (let round = 0; round < 3; round++) {
      (g.player as unknown as { useTime: number }).useTime = 0;
      g.tryPlace(17, 10, PIG_DEF());
      if (cellsLeft(w, 15, 10) === 12) placed++;
      g.entities.update(1 / 60, g as never);
      expect(cellsLeft(w, 15, 10)).toBe(0);                // 每轮放置当拍即碎
      rec.drops.length = 0;
    }
    expect(placed).toBe(3);                                // 割面清场 → 重复放置门不拦（连续放行）
    expect(g.player.grappleProjs.every((gr) => gr.ai0 === GRAPPLE_LATCH)).toBe(true);
  });
});

describe('BJ225-②：割面窗口与载体（vanilla CutTilesAt 3×3 扫描界 1:1）', () => {
  it('飞行钩（ai0=0）弹盒掠过彩罐 → 割（投掷穿越面=「一次破大量」第二形态）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    for (let dx = -6; dx <= 12; dx++) st.setTileSilent(9 + dx, 6, STONE, 0, 0);
    placeObjectAt(w, 15, 10);                              // 件腹地行 y=11
    const proj = new GrappleProj(0, 0, 0, 0, 13, () => g.player as never);
    proj.ai0 = GRAPPLE_FLY;
    proj.x = 15 * TILE + 8, proj.y = 11 * TILE + 4;        // 盒心落在件内（离天花 ≥2 行不误挂）
    proj.vx = 5; proj.vy = 0;
    g.entities.add(proj, 'projectiles');
    g.entities.update(1 / 60, g as never);
    expect(cellsLeft(w, 15, 10)).toBe(0);
    expect(proj.ai0).toBe(GRAPPLE_FLY);                    // 未触实心 → 不转回收（割面与 AI 无关）
  });

  it('盒外放置不误割（件左格 ax=Lx+2 越出 3×3 扫描界）→ 整件完好', () => {
    const { g, w } = mkShell();
    latchHook(g, w, 15, 9);
    placeObjectAt(w, 17, 10);                              // 列 17..20,钩盒列 14..16 零交
    g.entities.update(1 / 60, g as never);
    expect(cellsLeft(w, 17, 10)).toBe(12);
  });

  it('非可割格零操作：实心石在钩盒内不误割（Game.cutTile 非 tileCut 候选零操作）', () => {
    const { g, w } = mkShell();
    latchHook(g, w, 15, 9);                                // 钩盒含锚格石（列/行 ±1）
    g.entities.update(1 / 60, g as never);
    for (let dx = -1; dx <= 1; dx++) {
      expect(w.store.get(15 + dx, 9)).toBe(STONE);         // 天花三格原样
    }
  });
});

describe('BJ225-③：CanCutTile 门语义（WorldGen.cs:88111 攻击弹上下文）', () => {
  it('下格 380 种植盆拒切：盆上草在钩盒内不割;移盆后照割（红蓝-C 门弹域承载）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    latchHook(g, w, 15, 9);
    st.setTileSilent(15, 10, GRASS, 0, 0);                 // 候选格（钩盒内）
    st.setTileSilent(15, 11, PLANTER, 0, 0);               // 下格种植盆（sheet 380 ∈ :88114 拒切表;78 陶盆无仓内 def,380 同族承载）
    g.entities.update(1 / 60, g as never);
    expect(st.get(15, 10)).toBe(GRASS);                    // 门拦：不割
    st.setTile(15, 11, 0);                                 // 移盆
    g.entities.update(1 / 60, g as never);
    expect(st.get(15, 10)).not.toBe(GRASS);                // 割
  });

  it('wall 350 拒切：标记墙上的草不割（同门第二族）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    latchHook(g, w, 15, 9);
    st.setTileSilent(15, 10, GRASS, 0, 0);
    st.wall[st.idx(15, 10)] = 350;
    g.entities.update(1 / 60, g as never);
    expect(st.get(15, 10)).toBe(GRASS);
  });
});

describe('BJ225-④：挂钩放置允许（链③回归钉）', () => {
  it('钩爪 latched 在役 + 玩家悬停件位 → tryPlace 照常放置 12 格（放置链无 grapple 门）', () => {
    const { g, w } = mkShell();
    latchHook(g, w, 15, 9);
    expect(g.player.grappleProjs.length).toBe(1);
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(17, 10, PIG_DEF());
    expect(cellsLeft(w, 15, 10)).toBe(12);                 // 非实心 454 压玩家/压钩位照放（:41753 名单外）
  });
});

// ==================== BJ232：死弹 1-tick 过割窗（2026-09-21 债刀,BJ225 登记债） ====================
// 原版 Projectile.Update 在 HandleMovement（AI/Kill 可达）后、Damage/CutTiles 前
// 有 `if (!active) return` 门（P.cs:17132-135;1458 同构 :17121/:17132/:17185——
// Kill :71752 置 active=false :72086;割面在 Damage 内 :12517）——被杀弹当拍即
// 不再割,下拍 Update 头门 :16766 亦不跑。本仓中央收口（Entity.ts projectiles 桶
// post-fixedUpdate）原无 dead 门 → 被杀弹当拍多割一拍（症状向=多割非漏割）。
// 落刀=收口守卫补 `!e.dead`（dead=compact 唯一移除通道,与 active 一一对应;
// 门位语义同构:AI 后、割前——当拍跳过,无一拍延迟）。
//
// 变异证红（开发期实测）：
//  M1 收口摘 `!e.dead` 门 → T1/T2 红（死弹当拍复割）;T3 恒绿（活弹面无关）;
//  M2 门位后移伪修复（改为快照 fixedUpdate 前的 dead 值再于割前判）→ T1 红
//     （同拍 Kill 在快照之后,T2 预置支恒绿——钉死「当拍」语义无一拍延迟）。
/** 门探针弹：vid=13 钩爪（∈ 收口面,∉ CUT_EXCLUDE_VIDS）;killOnTick 模拟 AI 内 Kill */
class GateProbeProj extends Entity {
  vanillaId = 13;
  killOnTick = false;
  fixedUpdate(): void { if (this.killOnTick) this.dead = true; }
  draw(): void {}
}

describe('BJ232：死弹 1-tick 过割窗（原版 Update :17132 active 门——Kill 当拍不再割）', () => {
  it('T1 真实弹型：RETRACT 近手同拍 Kill 的钩爪罩可割草 → 当拍不割（弹确死）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    st.setTileSilent(15, 10, GRASS, 0, 0);
    // 玩家中心移到草格中心（RETRACT 近手支 :49888 dist<24 → fixedUpdate 内当拍 kill()）
    const pl = g.player as unknown as { cx: number; cy: number };
    pl.cx = 15 * TILE + 8; pl.cy = 10 * TILE + 8;
    const proj = new GrappleProj(0, 0, 0, 0, 13, () => g.player as never);
    proj.ai0 = GRAPPLE_RETRACT;
    proj.x = 15 * TILE + 8 - proj.projW / 2;               // 盒心=玩家中心 → dist=0 < 24
    proj.y = 10 * TILE + 8 - proj.projH / 2;
    g.entities.add(proj, 'projectiles');
    g.entities.update(1 / 60, g as never);
    expect(proj.dead).toBe(true);                          // Kill 确实同拍发生（收口之前）
    expect(st.get(15, 10)).toBe(GRASS);                    // ★门拦：死弹当拍不再割
  });

  it('T2 探针：fixedUpdate 内 Kill 罩草当拍不割;预置 dead 同面（:16766 头门族=更早窗）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    st.setTileSilent(15, 10, GRASS, 0, 0);
    const proj = new GateProbeProj();
    proj.killOnTick = true;
    proj.x = 15 * TILE; proj.y = 10 * TILE;                // 16×16 盒精确罩草格
    g.entities.add(proj, 'projectiles');
    g.entities.update(1 / 60, g as never);
    expect(proj.dead).toBe(true);
    expect(st.get(15, 10)).toBe(GRASS);                    // ★同拍 Kill → 当拍不割
    // 预置 dead 变体（同拍前段已被他者 Kill——原版 Update 头门 :16766 同面）
    st.setTileSilent(15, 10, GRASS, 0, 0);
    const pre = new GateProbeProj();
    pre.dead = true;
    pre.x = 15 * TILE; pre.y = 10 * TILE;
    g.entities.add(pre, 'projectiles');
    g.entities.update(1 / 60, g as never);
    expect(st.get(15, 10)).toBe(GRASS);
  });

  it('T3 控制组：活弹（不 Kill）同位罩草 → 当拍照割（活弹割面零回归）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    st.setTileSilent(15, 10, GRASS, 0, 0);
    const proj = new GateProbeProj();
    proj.killOnTick = false;
    proj.x = 15 * TILE; proj.y = 10 * TILE;
    g.entities.add(proj, 'projectiles');
    g.entities.update(1 / 60, g as never);
    expect(proj.dead).toBe(false);
    expect(st.get(15, 10)).not.toBe(GRASS);                // 割
  });
});
