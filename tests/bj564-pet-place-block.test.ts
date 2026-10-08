// BJ564 用户实报：被宠物、照明宠物挡住的地方无法放置物块。
//
// 定谳链（1457 反编译亲读钉死）：
//  · WorldGen.PlaceTile（WorldGen.cs:59833，函数体至 :60786）——入口实体门只有
//    :59864 `forced || Collision.EmptyTile(i,j) || !Main.tileSolid[num] || …`；
//    函数体全扫（950 行）零实体阻挡检查，唯一实体引用 = :60696-60699
//    `direction = Main.player[plr].direction`（79/90 四向件读朝向,非门）。
//  · Collision.EmptyTile（Collision.cs:1361-1384）＝ tile 臂 + 玩家臂（:1368
//    `active && !dead && !ghost`）+ NPC 臂（:1374-1380 `Main.npc[l].active`），
//    【无 projectile 臂】（Collision.cs 全文无 Main.projectile 查询）。
//  · 原版宠物/照明宠物＝弹幕：Main.projectile（Main.cs:1706）承载，宠物旗面 =
//    Main.vanityPet / Main.lightPet（bool[BuffID.Count]，Main.cs:784/:786），
//    AI 由 Projectile.cs:26766-26768 分派 AI_026 —— 不在 Main.npc 表 ⇒
//    EmptyTile 两臂都咬不到 ⇒ 原版可以在宠物/光宠所在格放实心块（宠物被砌进）。
//  · 本仓自造门环：updatePetSlot 把 PetFollower 塞进 entities.npcs 桶
//    （Game.ts:45900 `this.entities.add(f, 'npcs')`），而 EmptyTile 单源
//    emptyTileEntitiesRect（Game.ts:28354）三桶全收 ⇒ 宠物误吃原版【NPC 臂】
//    ⇒ tryPlace legacy 实心档（Game.ts:27803-27808 overlapsEntity 逐格）拒绝放置
//    ＝用户实报。落刀＝EmptyTile 实体臂内豁免 PetFollower（单源一处修，
//    放置近似/关门/高门/活板门/导线门四门族全对齐原版「弹幕不占位」）。
//  · 卡住行为面（原版相）：宠物被砌进＝弹幕嵌入，放置面零交互——地面族原地卡住，
//    唯出口＝玩家挖开或超距瞬移（PetFollower 地面族 teleport 距离阈值，AI_026
//    跟随体超距重定位）；飞行/悬停族无 tileCollide（PetFollower 头注）穿墙无感。
//    判据：放置后宠物不死、不离桶、目标格有块。
//  · 判别力：宠物/光宠两臂（修复前=拒放即红）+ 玩家/城镇 NPC/敌怪三臂（原版相
//    不回归）+ 死亡玩家豁免臂（:1368）+ overlapsEntity 单源面（关门族同源）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { PetFollower } from '../src/entities/PetFollower';
import { TownNPC } from '../src/entities/TownNPC';

const STONE = TILE_BY_KEY['stone']!;
const stoneItem = () => {
  const def = ITEM_DEFS[ITEM_BY_KEY['vi_3_StoneBlock']];
  expect(def?.tile).toBe('stone');
  return def;
};
const TILE = 16;
const TX = 12, TY = 12;   // 目标格（地面行 13 之上）

interface GShell {
  world: World;
  player: Record<string, unknown> & { useTime: number; dead: boolean; isGhostPhase: (w: unknown) => boolean };
  smartCursor: { lockedContinuity: null; showing: boolean; x: number; y: number };
  chunks: { markDirtyArea: (...a: unknown[]) => void };
  sfx: { play: (...a: unknown[]) => void; playWavFile: (...a: unknown[]) => void };
  cb: { onInventoryChanged: () => void };
  entities: Record<string, unknown> & { enemies: unknown[]; npcs: unknown[]; critters: unknown[] };
  spawnParticles: (...a: unknown[]) => void;
  spawnDrop: (...a: unknown[]) => unknown;
  recLog: (...a: unknown[]) => void;
  dumpChest: () => void;
  killTileDropBait: () => void;
  trackTile: number;
  flexWandCycle: number;
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
  overlapsEntity: (px: number, py: number) => boolean;
}
function mkShell(): { g: GShell; w: World; consumed: { n: number } } {
  const w = new World(40, 40, 564, 'bj564-pet-place-block');
  const consumed = { n: 0 };
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { nextId: 1, add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => null;
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.trackTile = 0;
  g.flexWandCycle = 0;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    // 玩家位与目标格（12,12）不重叠（占 x 162..174 / y 202..230 = 格 10 列）
    cx: 10 * TILE + 8, cy: 13 * TILE + 8, x: 10 * TILE + 2, y: 13 * TILE - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false, dead: false, isGhostPhase: () => false,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0, slots: new Array(60).fill(null),
      heldItem: () => ({ id: -1, stack: 9 }),
      removeHeld: () => { consumed.n++; },
      removeAt: () => {}, countOf: () => 0,
    },
  };
  // 地面行（13）铺石，目标格 (12,12) 有下方支撑
  const st = w.store;
  for (let dx = 8; dx <= 18; dx++) st.setTileSilent(dx, 13, STONE, 0, 0);
  return { g, w, consumed };
}

/** 把 16×16 级实体盒居中钉在目标格（构造后按实际 w/h 回中，覆盖全格 ⇒ hit() 恒真） */
function pinAt(e: { x: number; y: number; w: number; h: number }, tx: number, ty: number): void {
  e.x = tx * TILE + 8 - e.w / 2;
  e.y = ty * TILE + 8 - e.h / 2;
}

describe('BJ564-⓪ 数据面：判别件与实体盒前提', () => {
  it('石头＝legacy 实心档（TILE_DEFS solid true）→ tryPlace 吃 EmptyTile 实体臂', () => {
    expect(TILE_DEFS[STONE].solid).toBe(true);
  });
  it('宠物跟随体 16×16 级盒可居中钉格（碰撞盒消费面 = x/y/w/h 左上角制）', () => {
    const pet = new PetFollower(0, 0, 764, () => null);   // 764 随行星（vanilla-pets.json vid 4365）
    expect(pet.w).toBeGreaterThan(0);
    expect(pet.h).toBeGreaterThan(0);
  });
});

describe('BJ564-① 原版相：宠物/照明宠物所在格可放实心块（用户实报主判）', () => {
  it('宠物（764 随行星）钉在目标格 → 放置成功（消耗 1+格写入）,宠物不被放置面伤害', () => {
    const { g, w, consumed } = mkShell();
    const pet = new PetFollower(0, 0, 764, () => null);
    pinAt(pet, TX, TY);
    g.entities.npcs.push(pet);
    g.tryPlace(TX, TY, stoneItem());
    expect(consumed.n).toBe(1);                              // 原版：弹幕不占 EmptyTile → 放行
    expect(w.store.get(TX, TY)).toBe(STONE);                 // 实心块写入
    expect(pet.dead).toBe(false);                            // 放置面零交互（卡住面：嵌入非清除）
    expect(g.entities.npcs).toContain(pet);                  // 不离桶（AI 照常跑）
  });

  it('照明宠物（211 明珠之瓶 Wisp）钉在目标格 → 同相放行', () => {
    const { g, w, consumed } = mkShell();
    const lp = new PetFollower(0, 0, 211, () => null);       // vanilla-pets.json vid 1183 buff 57 light=1
    pinAt(lp, TX, TY);
    g.entities.npcs.push(lp);
    g.tryPlace(TX, TY, stoneItem());
    expect(consumed.n).toBe(1);
    expect(w.store.get(TX, TY)).toBe(STONE);
    expect(lp.dead).toBe(false);
  });

  it('卡住行为面：宠物被砌后相邻格再放置仍成功（tile 层判定与实体无关）+ 宠物存活', () => {
    const { g, w } = mkShell();
    const pet = new PetFollower(0, 0, 764, () => null);
    pinAt(pet, TX, TY);
    g.entities.npcs.push(pet);
    g.tryPlace(TX, TY, stoneItem());
    expect(w.store.get(TX, TY)).toBe(STONE);
    g.player.useTime = 0;                                    // 复位使用拍
    g.tryPlace(TX + 1, TY, stoneItem());                     // 邻格照放（原版 tile 层零实体面）
    expect(w.store.get(TX + 1, TY)).toBe(STONE);
    expect(pet.dead).toBe(false);
  });
});

describe('BJ564-② 原版相不回归：EmptyTile 两臂（玩家 :1368 / NPC :1374-1380）钉位', () => {
  it('活体玩家钉目标格 → 拒放（零消耗+零写入）', () => {
    const { g, w, consumed } = mkShell();
    g.player.x = TX * TILE + 2; g.player.y = TY * TILE + 2;  // 玩家盒压目标格
    g.tryPlace(TX, TY, stoneItem());
    expect(consumed.n).toBe(0);
    expect(w.store.get(TX, TY)).toBe(0);
  });

  it('死亡玩家豁免臂（:1368 !dead）→ 死亡玩家所在格可放', () => {
    const { g, w, consumed } = mkShell();
    g.player.x = TX * TILE + 2; g.player.y = TY * TILE + 2;
    g.player.dead = true;                                    // 原版玩家臂要求 !dead
    g.tryPlace(TX, TY, stoneItem());
    expect(consumed.n).toBe(1);
    expect(w.store.get(TX, TY)).toBe(STONE);
  });

  it('城镇 NPC（guide）钉目标格 → 拒放（原版 NPC 臂=Main.npc 全表）', () => {
    const { g, w, consumed } = mkShell();
    const npc = new TownNPC('guide', 0, 0);
    pinAt(npc, TX, TY);
    g.entities.npcs.push(npc);
    g.tryPlace(TX, TY, stoneItem());
    expect(consumed.n).toBe(0);
    expect(w.store.get(TX, TY)).toBe(0);
  });

  it('敌怪桶实体钉目标格 → 拒放（原版敌怪+城镇+小动物同在 Main.npc 一张表）', () => {
    const { g, w, consumed } = mkShell();
    g.entities.enemies.push({ x: TX * TILE + 4, y: TY * TILE + 4, w: 16, h: 16 });
    g.tryPlace(TX, TY, stoneItem());
    expect(consumed.n).toBe(0);
    expect(w.store.get(TX, TY)).toBe(0);
  });
});

describe('BJ564-③ 单源面：overlapsEntity（EmptyTile 实体臂唯一入口,关门四族同消费）', () => {
  it('宠物格 false / 城镇 NPC 格 true / 死亡玩家格 false / 敌怪格 true', () => {
    const { g } = mkShell();
    const pet = new PetFollower(0, 0, 764, () => null);
    pinAt(pet, TX, TY);
    g.entities.npcs.push(pet);
    expect(g.overlapsEntity(TX, TY)).toBe(false);            // ★BJ564：弹幕不占位
    const npc = new TownNPC('guide', 0, 0);
    pinAt(npc, TX + 3, TY);
    g.entities.npcs.push(npc);
    expect(g.overlapsEntity(TX + 3, TY)).toBe(true);         // NPC 臂保持
    g.player.dead = true;
    expect(g.overlapsEntity(TX, TY)).toBe(false);            // :1368 死亡豁免保持
    g.entities.enemies.push({ x: (TX + 5) * TILE + 4, y: TY * TILE + 4, w: 16, h: 16 });
    expect(g.overlapsEntity(TX + 5, TY)).toBe(true);         // 敌怪臂保持
  });
});
