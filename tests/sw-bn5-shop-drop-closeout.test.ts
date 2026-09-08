// SW-BN5 2026-09-08 —— 商店/掉落域收尾清偿守卫矩阵。
//   ① KillWall per-wall 音/尘（BF1/BL1 备案清偿）：KillWall_PlaySounds 三族+默认音
//      （WorldGen.cs:60914-60932）+ 尘 10/fail 3（:60877-60884）接齐 KillWall 全消费面
//      （锤墙/钻头/爆炸清墙×2/ReplaceWall 换墙）；爆炸面并存语义=原文（Projectile.
//      ExplodeTiles :80488 逐格直调 KillWall,弹侧 Item14 爆炸音独立一拍,两音都响）。
//   ② GetItem 空槽序三臂（BP1 新发现清偿+热栏臂补全）：热栏空格臂（:39671-39680
//      `!isACoin && useStyle!=0`,vanilla-itemfunc.useStyle exact-only 取数）/
//      favorited 升序（:39681-39687）/ 非收藏【降序】（:39688-39700）——Inventory.add
//      ③ merge-only 化+favoritedGate 拒收门解耦（FillAmmo 无门/袋合并有门）；
//      coin/ammo 专格路径守恒。
//   ③ D6 绳目标互换（BJ18 §6 分期清偿）：外门绳支（Player.cs:40328-40334）+ 内门绳邻
//      特例（WorldGen.cs:63220-63236,紧邻左/右同型）——绳上平台/种植盆 380/矿车轨 314。
// 分层钉法：行为面直调 + 源文本结构锁（tests/sw-ay1/sw-bp1/sw-bf1 车道同款壳）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { VI } from '../src/data/itemKeys';

const src = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

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
function defByVid(vid: number): (typeof ITEM_DEFS)[number] {
  const d = ITEM_DEFS[iidOf(vid)];
  if (!d) throw new Error(`missing ITEM_DEFS for vid ${vid}`);
  return d;
}
/** 手持放置物 def：vi_ 真物品或 place_ 面板，按 tile 键查（sw-bj18 同款） */
function defForTile(tileKey: string): (typeof ITEM_DEFS)[number] {
  const d = ITEM_DEFS.find((x) => x.tile === tileKey
    && (x.key.startsWith('vi_') || x.key.startsWith('place_')));
  if (!d) throw new Error(`missing held item def for tile ${tileKey}`);
  return d;
}

// ============================================================
// ① KillWall_PlaySounds 三族+默认音（WorldGen.cs:60914-60932）
// ============================================================
describe('★SW-BN5 killWallSound 三族+默认音（KillWall_PlaySounds :60914 1:1）', () => {
  function mkSoundShell(): { g: Record<string, unknown>; keys: string[]; files: string[] } {
    const keys: string[] = [];
    const files: string[] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.sfx = { play: (n: string) => { keys.push(n); } };
    g.playSfxFile = (f: string) => { files.push(f); return true; };
    return { g, keys, files };
  }

  it('族① PlaySound(13)=Shatter：{241,88-93,21,186,136,137,168,169,172,226,227,242,243,347,365}', () => {
    const { g, keys } = mkSoundShell();
    for (const w of [21, 88, 93, 136, 137, 168, 169, 172, 186, 226, 227, 241, 242, 243, 347, 365]) {
      (g as Record<string, unknown> as { killWallSound: (w: number, x: number, y: number) => void })
        .killWallSound(w, 3, 4);
    }
    expect(keys).toHaveLength(16);
    expect(keys.every((k) => k === 'shatter')).toBe(true);
  });

  it('族② PlaySound(6)=Grass：{63-70,264,265,268}；wall 357→NPCHit25 直文件', () => {
    const { g, keys, files } = mkSoundShell();
    for (const w of [63, 64, 65, 66, 67, 68, 69, 70, 264, 265, 268]) {
      (g as { killWallSound: (w: number, x: number, y: number) => void }).killWallSound(w, 3, 4);
    }
    expect(keys).toHaveLength(11);
    expect(keys.every((k) => k === 'chop')).toBe(true);      // chop=Grass.wav（WAV_MAP）
    (g as { killWallSound: (w: number, x: number, y: number) => void }).killWallSound(357, 3, 4);
    expect(files).toEqual(['NPC_Hit_25']);                    // SoundID.cs:210=(3,25)
  });

  it('默认 PlaySound(0)=Dig（地牢 7/土墙 16/天然石 1）；结构锁：分族表原文逐值', () => {
    const { g, keys } = mkSoundShell();
    for (const w of [1, 7, 16]) {
      (g as { killWallSound: (w: number, x: number, y: number) => void }).killWallSound(w, 3, 4);
    }
    expect(keys).toEqual(['dig', 'dig', 'dig']);
    const game = src('../src/core/Game.ts');
    expect(game).toContain('const KILL_WALL_SHATTER = new Set([241, 88, 89, 90, 91, 92, 93, 21, 186, 136, 137, 168, 169, 172, 226, 227, 242, 243, 347, 365]);');
    expect(game).toContain('const KILL_WALL_GRASS = new Set([63, 64, 65, 66, 67, 68, 69, 70, 264, 265, 268]);');
    expect(game).toContain("if (wall === 357) { this.playSfxFile('NPC_Hit_25', 1, px, py); return; }");
  });
});

// ---------- 锤墙/钻头/换墙/爆炸四消费面（行为面,桩形制=sw-bf1 同款） ----------
type Drop = { x: number; y: number; key: string; n: number };
interface HG {
  netCanEditTile: () => boolean;
  world: World;
  hitTiles: { addDamage(x: number, y: number, d: number, b?: number): number; clear(x: number, y: number, b?: number): void; getDamage(x: number, y: number, b?: number): number };
  tickCount: number;
  lastMineHitTick: number;
  mining: unknown;
  hardnessCache: number;
  hammerPoundRelease: boolean;
  player: Record<string, unknown>;
  inTileRange: (...a: unknown[]) => boolean;
  smartCursor: { lockedContinuity: unknown; showing: boolean; x: number; y: number };
  spawnParticles: (...a: unknown[]) => void;
  sfx: { play: (...a: unknown[]) => void } | Record<string, unknown>;
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => null;
  drops: Drop[];
  pruneHitTiles: () => void;
  tryMine: (x: number, y: number, p: number, t: 'hammer', s: number, u?: number) => void;
  drillPickWall: (x: number, y: number) => void;
}

function mkMineGame(): { g: HG; st: World['store']; w: World; parts: Array<{ n: number }>; sfx: string[] } {
  const w = new World(48, 64, 20, 'open');
  const drops: Drop[] = [];
  const parts: Array<{ n: number }> = [];
  const sfx: string[] = [];
  const acc = new Map<number, number>();
  const g = Object.create(Game.prototype) as unknown as HG;
  g.netCanEditTile = () => true;
  g.world = w;
  g.hitTiles = {
    addDamage(x: number, y: number, d: number, b = 0) {
      const v = (acc.get(b) ?? 0) + d;
      acc.set(b, v);
      return v;
    },
    clear(x: number, y: number, b = 0) { acc.delete(b); },
    getDamage(x: number, y: number, b = 0) { return acc.get(b) ?? 0; },
  };
  g.tickCount = 0;
  g.lastMineHitTick = -999;
  g.mining = null;
  g.hardnessCache = 0;
  g.hammerPoundRelease = false;
  g.player = { buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, usedAmbrosia: false, equipStats: {}, inv: { removeHeld: () => true } };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.inTileRange = () => true;
  g.spawnParticles = (...a: unknown[]) => { parts.push({ n: a[3] as number }); };
  g.sfx = { play: (n: string) => { sfx.push(n); } };
  g.spawnDrop = (x, y, key, n) => { drops.push({ x, y, key, n }); return null; };
  g.drops = drops;
  g.pruneHitTiles = () => {};
  return { g, st: w.store, w, parts, sfx };
}

describe('★SW-BN5 锤/钻墙面 KillWall 音恒放+尘 10/fail 3（:60876-60884）', () => {
  it('锤墙成功档（房墙 16）：dig 音 + 10 尘 + 墙拆 + 掉 30', () => {
    const { g, st, parts, sfx } = mkMineGame();
    st.setWall(24, 40, 16);
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(sfx).toEqual(['dig']);                              // 旧 'chop' 近似退役
    expect(parts.some((p) => p.n === 10)).toBe(true);          // KillWall 尘 10
    expect(g.drops[0]).toMatchObject({ key: VI(30), n: 1 });
  });

  it('锤墙 fail 档（地牢墙 7 未败骷髅王）：音/尘照放（3 尘）墙保持不掉物（:60876 fail 早退前恒放）', () => {
    const { g, st, parts, sfx } = mkMineGame();
    st.setWall(24, 40, 7);
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(7);
    expect(sfx).toEqual(['dig']);                              // fail 亦放（BF1 简化面退役）
    expect(parts.some((p) => p.n === 3)).toBe(true);           // fail 档 3 尘
    expect(g.drops).toHaveLength(0);
  });

  it('钻头成功档（天然土墙 2,不掉集合）：dig 音 + 10 尘 + 拆墙零掉落', () => {
    const { g, st, parts, sfx } = mkMineGame();
    st.setWall(24, 40, 2);
    g.drillPickWall(24, 40);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(sfx).toEqual(['dig']);
    expect(parts.some((p) => p.n === 10)).toBe(true);
    expect(g.drops).toHaveLength(0);                            // 天然土墙 2 不掉（BF1 表）
  });
});

describe('★SW-BN5 换墙面 ReplaceWall 音/尘（WorldGen.cs:63050-63053）', () => {
  it('旧墙 16 换铺墙 1：10 尘 + dig 音（fail 门已先行拦截,无 fail 尘档）', () => {
    const w = new World(48, 64, 20, 'open');
    const drops: Drop[] = [];
    const parts: Array<{ n: number }> = [];
    const sfx: string[] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.netCanEditTile = () => true;
    g.world = w;
    g.chunks = { markDirtyArea: () => {} };
    g.sfx = { play: (n: string) => { sfx.push(n); } };
    g.cb = { onInventoryChanged: () => {} };
    g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
    g.inTileRange = () => true;
    g.player = { buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, usedAmbrosia: false, equipStats: {}, inv: { removeHeld: () => true }, useTime: 0 };
    g.spawnParticles = (...a: unknown[]) => { parts.push({ n: a[3] as number }); };
    g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ x, y, key, n }); return null; };
    g.recLog = () => {};
    g.paintWallSpeed = () => 1;
    const st = w.store;
    st.setWall(24, 40, 16);
    st.setWall(25, 40, 16);   // 邻接门
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: { wallId: number; key: string }) => void })
      .tryPlaceWall(24, 40, { wallId: 1, key: 'vi_30_stone_wall' });
    expect(st.wall[st.idx(24, 40)]).toBe(1);
    expect(drops.map((d) => d.key)).toContain(VI(30));         // BF1 掉落面守恒
    expect(parts.some((p) => p.n === 10)).toBe(true);          // 旧 6 尘近似退役
    expect(sfx).toEqual(['dig']);                              // KillWall_PlaySounds 默认族
  });
});

describe('★SW-BN5 爆炸清墙面 per-wall 音/尘并存（Projectile.cs:80488 → KillWall :60876-60884）', () => {
  function mkBoomGame(): { g: Record<string, unknown>; st: World['store']; w: World;
    drops: Array<{ key: string; n: number }>; parts: Array<{ n: number }>; sfx: string[] } {
    const w = new World(40, 40, 7, 'open');
    const drops: Array<{ key: string; n: number }> = [];
    const parts: Array<{ n: number }> = [];
    const sfx: string[] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.world = w;
    g.chunks = { markDirtyArea: () => {} };
    g.sfx = { play: (n: string) => { sfx.push(n); } };
    g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
    g.spawnParticles = (...a: unknown[]) => { parts.push({ n: a[3] as number }); };
    g.recLog = () => {};
    g.spawnDrop = (_x: unknown, _y: unknown, key: string, n: number) => { drops.push({ key, n }); return null; };
    g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
    g.player = { cx: -500, cy: -500, x: -510, y: -521, w: 12, h: 28, facing: 1, buffs: { has: () => false }, equipStats: {}, hp: 100, luck: 0 };
    return { g, st: w.store, w, drops, parts, sfx };
  }

  it('成功档（房墙 16）：逐墙 dig 音 + 逐墙 10 尘（与爆炸音并存=原文）', () => {
    const { g, st, drops, parts, sfx } = mkBoomGame();
    for (let y = 16; y <= 24; y++) for (let x = 16; x <= 24; x++) st.setTileSilent(x, y, 1);
    for (let y = 16; y <= 24; y++) for (let x = 16; x <= 24; x++) st.setWallSilent(x, y, 16);
    st.setWallSilent(19, 19, 0);                               // 无墙口袋（预扫面,sw-bf1 D1 同款）
    (g as { explodeAt: (...a: unknown[]) => void }).explodeAt(20, 20, 100, 3, true);
    expect(st.wall[st.idx(20, 20)]).toBe(0);
    expect(drops.filter((d) => d.key === VI(30)).length).toBeGreaterThanOrEqual(20);   // BL1 掉落面守恒
    expect(sfx.filter((k) => k === 'dig').length).toBeGreaterThanOrEqual(20);          // per-wall 音
    expect(parts.filter((p) => p.n === 10).length).toBeGreaterThanOrEqual(20);         // per-wall 10 尘
  });

  it('fail 档（地牢墙 7）：音/尘照放（3 尘）墙保持不掉物（:60890-60892 fail 早退）', () => {
    const { g, st, drops, parts, sfx } = mkBoomGame();
    for (let y = 16; y <= 24; y++) {
      for (let x = 16; x <= 24; x++) {
        st.setTileSilent(x, y, 1);
        st.setWallSilent(x, y, 7);
      }
    }
    st.setWallSilent(19, 19, 0);
    (g as { explodeAt: (...a: unknown[]) => void }).explodeAt(20, 20, 100, 3, true);
    expect(st.wall[st.idx(20, 20)]).toBe(7);                   // fail：墙保持原状
    expect(drops.filter((d) => d.key === VI(135))).toHaveLength(0);
    expect(sfx.filter((k) => k === 'dig').length).toBeGreaterThanOrEqual(20);   // fail 亦放
    expect(parts.filter((p) => p.n === 3).length).toBeGreaterThanOrEqual(20);   // fail 3 尘
    expect(parts.filter((p) => p.n === 10)).toHaveLength(0);   // 无成功档尘
  });
});

// ============================================================
// ② GetItem 空槽序两臂（Player.cs:39681-39700）
// ============================================================
describe('★SW-BN5 Inventory.add 空槽序三臂（③ merge-only + 热栏臂 + favorited/降序臂）', () => {
  const WOOD = iidOf(9);            // useStyle 1（itemfunc 显式）→ 接热栏臂
  const GEL = iidOf(23);            // useStyle 0（itemfunc 无条目=原版缺省）→ 落降序臂
  const GEM = iidOf(1522);          // OnlyNeedOne 覆写表真值族 + useStyle 0
  const ARROW = iidOf(40);          // useStyle 0
  const COPPER = iidOf(71);         // itemfunc useStyle=1 但币类 → isACoin 拒支
  const STONE = iidOf(3);           // useStyle 1
  const WOOD_MAX = ITEM_DEFS[WOOD].maxStack ?? 999;
  const ARROW_MAX = ITEM_DEFS[ARROW].maxStack ?? 999;
  const COPPER_MAX = ITEM_DEFS[COPPER].maxStack ?? 100;

  it('useStyle≠0 件热栏臂（:39671-39680）：空包 → 落热栏 0（不落 49）', () => {
    const inv = new Inventory();
    expect(inv.add(WOOD, 1)).toBe(0);
    expect(inv.slots[0]?.id).toBe(WOOD);
    expect(inv.slots[49]).toBeNull();
  });

  it('useStyle-0 件降序臂（:39688-39700）：空包 → 落 49（凝胶,原版 useStyle 0 不接热栏臂）', () => {
    const inv = new Inventory();
    expect(inv.add(GEL, 1)).toBe(0);
    expect(inv.slots[49]?.id).toBe(GEL);
    expect(inv.slots[0]).toBeNull();                           // 旧升序空格支预占=BP1 登记偏差已清偿
  });

  it('降序臂跳满格尾段：49/48/47 占位 → 落 46', () => {
    const inv = new Inventory();
    for (const i of [49, 48, 47]) inv.slots[i] = { id: STONE, stack: ITEM_DEFS[STONE].maxStack ?? 999 };
    expect(inv.add(GEL, 1)).toBe(0);
    expect(inv.slots[46]?.id).toBe(GEL);
    expect(inv.slots[10]).toBeNull();
  });

  it('热栏臂跳满热栏：0-9 全占 → 落降序 49', () => {
    const inv = new Inventory();
    for (let i = 0; i < 10; i++) inv.slots[i] = { id: STONE, stack: 1 };
    expect(inv.add(WOOD, 1)).toBe(0);
    expect(inv.slots[49]?.id).toBe(WOOD);
  });

  it('③ 合并先于空槽（GetItem_FillIntoOccupiedSlot :39796）：同型余位先并满,残量接热栏臂', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: WOOD, stack: WOOD_MAX - 3 };
    expect(inv.add(WOOD, 5)).toBe(0);
    expect(inv.slots[10]?.stack).toBe(WOOD_MAX);               // 并堆 3
    expect(inv.slots[0]?.stack).toBe(2);                       // 残量 2 → 热栏臂落 0
    expect(inv.slots[49]).toBeNull();
  });

  it('守恒：favorited 件升序（:39681-39687 零回退）——useStyle-0 件走 favorited 臂,≠0 件热栏臂同向', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: STONE, stack: 1 };
    expect(inv.add(WOOD, 1, undefined, undefined, false, false, true)).toBe(0);
    expect(inv.slots[1]?.id).toBe(WOOD);                       // 热栏臂首空格 1（BP1 断言同位）
    expect(inv.slots[1]?.favorited).toBe(true);                // favorited 随行守恒
    expect(inv.slots[49]).toBeNull();
    const inv2 = new Inventory();
    inv2.slots[5] = { id: STONE, stack: 1 };                   // 热栏中段占位
    inv2.add(GEL, 1, undefined, undefined, false, false, true);
    expect(inv2.slots[0]?.id).toBe(GEL);                       // useStyle-0 收藏件 → favorited 臂升序 0
    expect(inv2.slots[0]?.favorited).toBe(true);
  });

  it('守恒：favorited OnlyNeedOne 拒收门在 merge-only 化后保持（:39536-39539,favoritedGate 解耦面）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: GEM, stack: 10, favorited: true };
    expect(inv.add(GEM, 5)).toBe(0);
    expect(inv.slots[10]?.stack).toBe(10);                     // 收藏堆分毫不动
    expect(inv.slots[49]?.id).toBe(GEM);                       // 拒并后降序落空格（useStyle 0）
  });

  it('coin 路径：isACoin 拒支热栏臂（币 71 useStyle=1 但 :39671 !isACoin）+ 专格守恒+溢出降序', () => {
    const inv = new Inventory();
    for (let i = 50; i < 54; i++) inv.slots[i] = { id: iidOf(72), stack: COPPER_MAX };   // 银币满格
    expect(inv.addNoCoinMerge(COPPER, 250)).toBe(0);           // noCoinMerge: 免 doCoins 升面额级联
    for (let i = 50; i < 54; i++) expect(inv.slots[i]?.id).toBe(iidOf(72));   // 钱币格未被铜币侵入
    expect(inv.slots[0]).toBeNull();                           // 币不接热栏臂（判别力:铜 useStyle=1）
    expect(inv.slots[49]?.id).toBe(COPPER);
    expect(inv.slots[49]?.stack).toBe(COPPER_MAX);             // 降序首格装满
    expect(inv.slots[48]?.stack).toBe(COPPER_MAX);
    expect(inv.slots[47]?.stack).toBe(50);                     // 残量 50
    expect(inv.slots[10]).toBeNull();
    const fresh = new Inventory();                             // 专格路径守恒:空钱币格先进 50
    fresh.addNoCoinMerge(COPPER, 30);
    expect(fresh.slots[50]?.stack).toBe(30);
  });

  it('ammo 路径守恒：箭入空弹药格 54（FillAmmo 空格支,useStyle 0 不接热栏臂）,溢出袋降序落 49', () => {
    const inv = new Inventory();
    expect(inv.add(ARROW, 5)).toBe(0);
    expect(inv.slots[54]?.id).toBe(ARROW);                     // 专格路径守恒
    const full = new Inventory();
    for (let i = 54; i < 58; i++) full.slots[i] = { id: ARROW, stack: ARROW_MAX };
    expect(full.add(ARROW, 5)).toBe(0);
    expect(full.slots[49]?.id).toBe(ARROW);                    // 弹药格全满 → 袋降序
    expect(full.slots[10]).toBeNull();
  });

  it('结构锁：fillBagArms 三臂签名 + itemUseStyleOf + isACoin 拒支 + 旧耦合门退役', () => {
    const invSrc = src('../src/items/Inventory.ts');
    expect(invSrc).toContain('private fillBagArms(id: number, count: number, max: number, placeStyle: number | undefined,');
    expect(invSrc).toContain('favorited: boolean, isACoin = false): number');
    expect(invSrc).toContain('private itemUseStyleOf(id: number): number');
    expect(invSrc).toContain('if (count > 0 && !isACoin && this.itemUseStyleOf(id) !== 0) {');
    expect(invSrc).toContain('private fillDescending(id: number, count: number, max: number, placeStyle: number | undefined,');
    expect(invSrc).toContain('favoritedGate = !mergeOnly): number');
    expect(invSrc).toContain('count = this.fillRange(0, BAG_SIZE, id, count, max, placeStyle, true, prefix, favorited, true);');
    expect(invSrc.includes('!(!mergeOnly && s.favorited && onlyNeedOneInInventory(s.id))')).toBe(false);
    expect(invSrc).toContain('favorited ? { favorited: true } : {}');
  });
});

// ============================================================
// ③ D6 绳目标互换（Player.cs:40328-40334 外门 + WorldGen.cs:63220-63236 内门绳邻支）
// ============================================================
const TITANIUM_PICK = 1202;
const ROPE_T = TILE_BY_KEY['v_213_rope'];
const PLATFORM_T = TILE_BY_KEY['platform'];
const PLANTER_T = TILE_BY_KEY['v_380_planter_boxes'];
const TRACK_T = TILE_BY_KEY['v_314_minecart_track'];

interface Shell {
  world: World;
  player: Record<string, unknown>;
  drops: Array<[string, number]>;
  tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
}

function shell(w: World, heldDef: (typeof ITEM_DEFS)[number]): Shell {
  const drops: Array<[string, number]> = [];
  const acc = new Map<number, number>();
  const g = Object.create(Game.prototype) as unknown as Shell & Record<string, unknown>;
  g.world = w;
  (w as unknown as { seedFlags: Record<string, boolean> }).seedFlags = {};
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
  g.playSfxFile = () => {};
  g.playSfxFiles = () => {};
  g.wiring = { hitSwitch: () => {} };
  g.hitTiles = {
    addDamage(_tx: number, _ty: number, dmg: number, buf = 0): number {
      const v = (acc.get(buf) ?? 0) + dmg;
      acc.set(buf, v);
      return v;
    },
    getDamage(_tx: number, _ty: number, buf = 0): number { return acc.get(buf) ?? 0; },
    clear(_tx: number, _ty: number, buf = 0): void { acc.delete(buf); },
  };
  g.swingTileCutSet = new Set<number>();
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  const heldId = ITEM_DEFS.indexOf(heldDef);
  const slots: unknown[] = new Array(50).fill(null);
  slots[5] = { id: iidOf(TITANIUM_PICK), stack: 1 };
  g.player = {
    cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, attackSpeedMult: 1, usedAmbrosia: false,
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 },
    equipStats: {},
    inv: {
      slots,
      countOf: () => 0,
      heldItem: () => ({ id: heldId, stack: 9 }),
      removeHeld: () => {},
    },
  };
  g.drops = drops;
  return g;
}

function mkWorld(): World {
  const w = new World(40, 40, 7, 'sw-bn5');
  for (let x = 2; x < 38; x++) w.store.setTileSilent(x, 21, TILE_BY_KEY['stone']);
  return w;
}

describe('★SW-BN5 D6 绳目标互换（外门绳支 :40328-40334 + 内门绳邻支 :63220-63236）', () => {
  it('绳上换平台：紧邻左/右有平台 → 可换（wiki 规则）;旧绳掉绳圈 965', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, ROPE_T);
    st.setTileSilent(11, 20, PLATFORM_T);                      // 紧邻右有平台
    const g = shell(w, defByVid(94));                          // 木平台 94 → tile 19
    g.tryPlace(10, 20, defByVid(94));
    expect(st.type[st.idx(10, 20)]).toBe(PLATFORM_T);
    expect(g.drops.map((d) => d[0])).toContain(VI(965));       // 旧绳掉落（:63079 includeLarge 面）
  });

  it('绳上换平台：无紧邻同型 → 内门拒（绳保持,零掉落）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, ROPE_T);
    st.setTileSilent(11, 20, TILE_BY_KEY['stone']);            // 邻格非平台
    const g = shell(w, defByVid(94));
    g.tryPlace(10, 20, defByVid(94));
    expect(st.type[st.idx(10, 20)]).toBe(ROPE_T);
    expect(g.drops).toEqual([]);
  });

  it('绳上换种植盆（380）:紧邻有种植盆 → 可换;轨道产物/种植盆同理', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, ROPE_T);
    st.setTileSilent(9, 20, PLANTER_T);                        // 紧邻左有种植盆
    const g = shell(w, defForTile('v_380_planter_boxes'));
    g.tryPlace(10, 20, defForTile('v_380_planter_boxes'));
    expect(st.type[st.idx(10, 20)]).toBe(PLANTER_T);
  });

  it('绳上换矿车轨（314）：紧邻有轨 → 可换;vi_2340 placeStyle 0 = 产物恒常规矿车轨', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, ROPE_T);
    st.setTileSilent(11, 20, TRACK_T);                         // 紧邻右有轨
    const g = shell(w, defByVid(2340));
    g.tryPlace(10, 20, defByVid(2340));
    expect(st.type[st.idx(10, 20)]).toBe(TRACK_T);
  });

  it('实心块点绳目标：外门绳支拒（放置物 ∉ {314,380,平台}）——绳保持零掉落', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, ROPE_T);
    const stoneDef = ITEM_DEFS.find((d) => d.tile === 'stone');
    expect(stoneDef).toBeTruthy();
    const g = shell(w, stoneDef!);
    g.tryPlace(10, 20, stoneDef!);
    expect(st.type[st.idx(10, 20)]).toBe(ROPE_T);
    expect(g.drops).toEqual([]);
  });

  it('绳物品（965 绳圈）仍拒（:40245-40247 SortingPriorityRopes 优先于一切,BJ12 锁定面守恒）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, ROPE_T);
    st.setTileSilent(11, 20, ROPE_T);
    const g = shell(w, defByVid(965));
    g.tryPlace(10, 20, defByVid(965));
    expect(st.type[st.idx(10, 20)]).toBe(ROPE_T);
    expect(g.drops).toEqual([]);
  });

  it('结构锁：wouldTileReplacementWorkRopeArm 源文本（InWorld(2) 门/左右邻/三族判定）', () => {
    const game = src('../src/core/Game.ts');
    expect(game).toContain('function wouldTileReplacementWorkRopeArm(');
    expect(game).toContain('if (!TILE_ROPE_SHEETS.has(tsheet)) return false;                       // Main.tileRope[tile.type]');
    expect(game).toContain('if (x < 2 || y < 2 || x >= st.w - 2 || y >= st.h - 2) return false;    // InWorld(x,y,2)');
    expect(game).toContain('if (placedSheet === 314 ? nSheet === 314');
    // 外门绳支（:40328-40334）在 swapOk 基门,decor 代理对绳目标豁免（tileCut[213]=false）
    expect(game).toContain('const ropeTargetArm = TILE_ROPE_SHEETS.has(tsheet) && placeTileSheet >= 0');
    expect(game).toContain('else if (ropeTargetArm) swapOk = wouldTileReplacementWorkRopeArm(st, tx, ty, placeTileSheet);');
  });
});
