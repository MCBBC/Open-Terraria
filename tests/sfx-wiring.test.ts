// 音效接线回归（sfx wiring，2026-08-13）：
//  A. 数据层：vanillaSoundFiles 把 DD2_*/Deerclops* 命名轨解析为多变体 wav 组
//     （Enemy per-NPC hit/death 直取真 wav，不再回落合成音）
//  B. bossAI_dd2.ts：Betsy 全组状态音（风压冲/火焰吐息/空袭火球/翻转俯冲/召唤咆哮/
//     召唤出怪）+ DarkMage 施法组 + 弹幕出膛表（675/682/686）
//  C. MinionProj.ts：族召唤音（首帧）+ 阿比盖尔挥击 + 射弹出膛（376 小鬼火球 Item_20）+
//     OOA 哨兵放置/开火音
// 全部断言走 mock 的 game.playSfxFiles 录音（不触真实音频）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { vanillaSoundFiles } from '../src/data/vanillaNpcs';
import type { GameHooks } from '../src/entities/types';

// ---------- DD2 侧 mock（bossAI-dd2.test.ts 同款 + playSfxFiles 录音） ----------
const W = 200, H = 140, FLOOR = 110;

function makeWorld(): World {
  const w = new World(W, H, 7, 'sfx-wiring');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) { st.setTile(x, FLOOR, 1); st.setTile(x, FLOOR + 1, 1); }
  return w;
}

type SfxCall = { files: string[]; vol?: number; x?: number; y?: number };

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: { damage: number; projId: number }[] = [];
  const sfx: SfxCall[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as { damage: number; projId: number });
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (files: string[], vol?: number, x?: number, y?: number) => {
      sfx.push({ files, vol, x, y });
    },
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, sfx, player };
}

function spawnBetsy(h: ReturnType<typeof makeHooks>, tx = 100, ty = 96): Enemy {
  const e = Enemy.fromVanilla(551, tx * TILE, ty * TILE)!;
  e.id = 1000;
  h.enemies.push(e);
  return e;
}

function tickEnemy(e: Enemy, h: ReturnType<typeof makeHooks>, n: number): void {
  for (let i = 0; i < n; i++) if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
}

const played = (sfx: SfxCall[], prefix: string): string[] =>
  sfx.flatMap((c) => c.files).filter((f) => f.startsWith(prefix));

describe('A. 数据层：命名轨 → wav 变体组', () => {
  it('DD2_*/Deerclops* HitSound/DeathSound 全部解析为多变体 wav', () => {
    expect(vanillaSoundFiles('DD2_BetsyHurt')).toEqual(['dd2_betsy_hurt_0', 'dd2_betsy_hurt_1', 'dd2_betsy_hurt_2']);
    expect(vanillaSoundFiles('DD2_BetsyDeath')).toHaveLength(3);
    expect(vanillaSoundFiles('DD2_GoblinHurt')).toHaveLength(6);          // goblin_hurt 声明 6 变体
    expect(vanillaSoundFiles('DD2_CrystalCartImpact')).toHaveLength(3);   // 548 永恒水晶受击
    expect(vanillaSoundFiles('DD2_BookStaffCast')).toHaveLength(3);       // NPC.cs:17680 命名轨 HitSound
    expect(vanillaSoundFiles('DeerclopsHit')).toHaveLength(3);
    expect(vanillaSoundFiles('DeerclopsDeath')).toEqual(['deerclops_death']);
  });
  it('legacy 轨与已格式名照旧单文件；未知名回 null', () => {
    expect(vanillaSoundFiles('NPCHit37')).toEqual(['NPC_Hit_37']);
    expect(vanillaSoundFiles('NPCDeath40')).toEqual(['NPC_Killed_40']);
    expect(vanillaSoundFiles('NPC_Hit_53')).toEqual(['NPC_Hit_53']);
    expect(vanillaSoundFiles(undefined)).toBeNull();
    expect(vanillaSoundFiles('NotASound')).toBeNull();
  });
  it('Enemy.fromVanilla 直取变体组（Betsy/骷髅/鹿角怪）', () => {
    const betsy = Enemy.fromVanilla(551, 0, 0)!;
    expect(betsy.def.hitSound).toEqual(['dd2_betsy_hurt_0', 'dd2_betsy_hurt_1', 'dd2_betsy_hurt_2']);
    expect(betsy.def.killedSound).toEqual(['dd2_betsy_death_0', 'dd2_betsy_death_1', 'dd2_betsy_death_2']);
    const skel = Enemy.fromVanilla(566, 0, 0)!;
    expect(skel.def.hitSound[0]).toBe('dd2_skeleton_hurt_0');
    expect(Enemy.fromVanilla(667, 0, 0)!.def.killedSound).toEqual(['deerclops_death']);
  });
});

describe('B. bossAI_dd2.ts 状态机音', () => {
  it('Betsy：八槽循环自然走到风压冲 → dd2_betsy_wind_attack', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    tickEnemy(e, h, 12 + 32);            // 入场 10t + 悬停 30t → 首选招（ai[3]=0 → 风压冲）
    expect(e.ai0).toBe(2);
    expect(played(h.sfx, 'dd2_betsy_wind_attack')).toHaveLength(1);
    expect(h.sfx[h.sfx.length - 1].vol).toBeGreaterThanOrEqual(0.5);
  });
  it('Betsy：火焰吐息 40t 接位帧 → dd2_betsy_flame_breath + 687 喷焰', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0;
    tickEnemy(e, h, 41);
    expect(played(h.sfx, 'dd2_betsy_flame_breath')).toHaveLength(1);
    expect(h.projectiles.some((p) => p.damage === 35)).toBe(true);
  });
  it('Betsy：空袭掠射投 686 火球 → 出膛音 dd2_betsy_fireball_shot', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    e.ai0 = 4; e.ai1 = 60; e.ai2 = 0;    // BOMB_APR_T=60：直接进掠射段
    tickEnemy(e, h, 12);
    expect(h.projectiles.some((p) => p.damage === 35)).toBe(true);
    expect(played(h.sfx, 'dd2_betsy_fireball_shot').length).toBeGreaterThanOrEqual(1);
  });
  it('Betsy：翻转俯冲首帧 → dd2_betsy_flying_circle_attack', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    e.ai0 = 5; e.ai1 = 0;
    tickEnemy(e, h, 2);
    expect(played(h.sfx, 'dd2_betsy_flying_circle_attack')).toHaveLength(1);
  });
  it('Betsy：召唤态 → scream 一声 + summon 三拍（20/45/70）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    e.ai0 = 6; e.ai1 = 1;                // 越过贴位段直接进召唤演出
    tickEnemy(e, h, 2);
    expect(played(h.sfx, 'dd2_betsy_scream')).toHaveLength(1);
    tickEnemy(e, h, 70);
    expect(played(h.sfx, 'dd2_betsy_summon').length).toBeGreaterThanOrEqual(3);
  });
  it('DarkMage：三连招各状态音（cast_heal 126 / heal_impact 三拍 / summon_skeleton 80 + 骷髅阵眼）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 104 });
    const e = Enemy.fromVanilla(564, 100 * TILE, 108 * TILE)!;
    e.id = 1001; h.enemies.push(e);
    e.ai0 = 127; e.ai1 = 1;              // 治疗招起手
    tickEnemy(e, h, 1);
    expect(played(h.sfx, 'dd2_dark_mage_cast_heal')).toHaveLength(1);   // ai[0]==126（:66461）
    tickEnemy(e, h, 90);
    expect(played(h.sfx, 'dd2_dark_mage_heal_impact').length).toBeGreaterThanOrEqual(2);
    e.ai0 = 81; e.ai1 = 2;               // 召骷髅招
    tickEnemy(e, h, 1);
    expect(played(h.sfx, 'dd2_dark_mage_summon_skeleton')).toHaveLength(1);  // ai[0]==80（:66445）
    tickEnemy(e, h, 16);
    expect(played(h.sfx, 'dd2_skeleton_summoned').length).toBeGreaterThanOrEqual(1); // 673 阵眼（:35516）
  });
  it('弹幕出膛表：675 暗影矢 dd2_dark_mage_attack / 682 电弧 dd2_lightning_bug_zap', () => {
    const h = makeHooks(makeWorld(), { x: 108, y: 106 });
    const bug = Enemy.fromVanilla(578, 100 * TILE, 108 * TILE)!;
    bug.id = 1002; h.enemies.push(bug);
    tickEnemy(bug, h, 70 + 60);          // 渐显 60t + 蓄电 5t → 发 682
    expect(played(h.sfx, 'dd2_lightning_bug_zap').length).toBeGreaterThanOrEqual(1);
    const mage = Enemy.fromVanilla(565, 60 * TILE, 108 * TILE)!;
    mage.id = 1003; h.enemies.push(mage);
    mage.ai0 = 33; mage.ai1 = 0;         // 暗影矢招 ai[0]==32 发弹
    tickEnemy(mage, h, 1);
    expect(played(h.sfx, 'dd2_dark_mage_attack').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------- 随从侧 mock（summon-r6.test.ts 同款 + playSfxFiles 录音） ----------
function makeMinionHooks(enemyAt?: { x: number; y: number }) {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  const player = new Player(60 * TILE, 90 * TILE, new Inventory());
  const sfx: SfxCall[] = [];
  const enemies: Array<Record<string, unknown>> = [];
  if (enemyAt) {
    enemies.push({
      x: enemyAt.x, y: enemyAt.y, w: 24, h: 40,
      cx: enemyAt.x + 12, cy: enemyAt.y + 20, id: 7, dead: false,
      hurt: () => false,
    });
  }
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies as never,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (files: string[], vol?: number, x?: number, y?: number) => {
      sfx.push({ files, vol, x, y });
    },
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown) => void } }).entities =
    { add: () => {} };
  return { hooks, player, sfx };
}

describe('C. MinionProj.ts 族专属音', () => {
  it('阿比盖尔 970：首帧召唤音 + 同类>1 升级音', () => {
    const { hooks, sfx } = makeMinionHooks();
    const a = new MinionProj(60 * TILE, 90 * TILE, 970, 6, 2, false, 0, false, () => hooks.player as never as Player);
    a.fixedUpdate(1, hooks);
    expect(played(sfx, 'abigail_summon')).toHaveLength(1);
    const b = new MinionProj(61 * TILE, 90 * TILE, 970, 6, 2, false, 1, false, () => hooks.player as never as Player);
    b.fixedUpdate(1, hooks);
    expect(played(sfx, 'abigail_upgrade').length).toBeGreaterThanOrEqual(1);
  });
  it('阿比盖尔本体 963：贴身挥击起手 → abigail_attack（一拍一声非每帧）', () => {
    const { hooks, sfx } = makeMinionHooks({ x: 60 * TILE, y: 89 * TILE });
    const m = new MinionProj(60 * TILE + 4, 89 * TILE, 963, 6, 2, false, 0, false, () => hooks.player as never as Player);
    m.fixedUpdate(1, hooks);
    m.fixedUpdate(1, hooks);
    expect(played(sfx, 'abigail_attack')).toHaveLength(1);   // 第二帧 attackFlash 未耗尽不重播
  });
  it('小鬼 375：射程内出膛 → 376 火球弹 + Item_20 出膛音', () => {
    const { hooks, sfx } = makeMinionHooks({ x: 64 * TILE, y: 90 * TILE });
    const m = new MinionProj(60 * TILE, 90 * TILE, 375, 17, 2, false, 0, false, () => hooks.player as never as Player);
    m.fixedUpdate(1, hooks);
    expect(played(sfx, 'Item_20')).toHaveLength(1);
  });
  it('OOA 哨兵 663：放置首帧 dd2_defense_tower_spawn；开火帧 dd2_flameburst_tower_shot', () => {
    const { hooks, sfx } = makeMinionHooks({ x: 64 * TILE, y: 96 * TILE });
    const s = new MinionProj(60 * TILE, 96 * TILE, 663, 30, 2, true, 0, false, () => hooks.player as never as Player);
    s.fixedUpdate(1, hooks);
    expect(played(sfx, 'dd2_defense_tower_spawn')).toHaveLength(1);
    s.fixedUpdate(1, hooks);              // 进入开火状态机（sFire=1 起手）
    for (let k = 0; k < 14; k++) s.fixedUpdate(1, hooks);   // 第 12t 开火帧
    expect(played(sfx, 'dd2_flameburst_tower_shot').length).toBeGreaterThanOrEqual(1);
  });
  it('爆炸机关哨兵 691：探测盒内有敌 → dd2_explosive_trap_explode', () => {
    const { hooks, sfx } = makeMinionHooks({ x: 60 * TILE, y: 94 * TILE });
    const s = new MinionProj(60 * TILE, 96 * TILE, 691, 40, 2, true, 0, false, () => hooks.player as never as Player);
    s.fixedUpdate(1, hooks);
    expect(played(sfx, 'dd2_explosive_trap_explode')).toHaveLength(1);
    const len = sfx.length;
    s.fixedUpdate(1, hooks);
    expect(sfx.length).toBe(len);         // 90t 冷却内不重播
  });
  it('Foxparks 1094：首帧叫一声，20t 后 pal_summon', () => {
    const { hooks, sfx } = makeMinionHooks();
    const m = new MinionProj(60 * TILE, 90 * TILE, 1094, 20, 2, false, 0, false, () => hooks.player as never as Player);
    m.fixedUpdate(1, hooks);
    expect(played(sfx, 'pal_foxparks')).toHaveLength(1);
    for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
    expect(played(sfx, 'pal_summon')).toHaveLength(1);
  });
});
