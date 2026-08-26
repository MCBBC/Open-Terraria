// 音效接线回归（sfx wiring，2026-08-13）：
//  A. 数据层：vanillaSoundFiles 把 DD2_*/Deerclops* 命名轨解析为多变体 wav 组
//     （Enemy per-NPC hit/death 直取真 wav，不再回落合成音）
//  B. bossAI_dd2.ts：Betsy 全组状态音（风压冲/火焰吐息/空袭火球/翻转俯冲/召唤咆哮/
//     召唤出怪）+ DarkMage 施法组 + 弹幕出膛表（675/682/686）
//  C. MinionProj.ts：族召唤音（首帧）+ 阿比盖尔挥击 + 射弹出膛（376 小鬼火球 Item_20）+
//     OOA 哨兵放置/开火音
// 全部断言走 mock 的 game.playSfxFiles 录音（不触真实音频）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// ★Enemy 须先于 bossAI_dd2 加载（2026-08-26 审计修复）：bossAI_dd2→bossAI→Arrow→
//   TownNPC→…→Enemy 是活环,Enemy.ts 尾部顶层 bindEnemyCtor(Enemy) 在环内求值时
//   bossAI 尚未初始化 → 模块加载即 TypeError 整文件红。先完整加载 Enemy 断环。
import { Enemy } from '../src/entities/Enemy';
import { BetsyBreath } from '../src/entities/bossAI_dd2';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { vanillaSoundFiles } from '../src/data/vanillaNpcs';
import { Sfx } from '../src/core/Sfx';
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

/** 手动拨状态前先跑一帧：AI 家族首帧 bInit 门会清 ai[0..3]（与生产语义一致） */
function prime(e: Enemy, h: ReturnType<typeof makeHooks>): void {
  e.fixedUpdate(1 / 60, h.hooks);
  h.sfx.length = 0;
}

function tickEnemy(e: Enemy, h: ReturnType<typeof makeHooks>, n: number): void {
  for (let i = 0; i < n; i++) if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
}

const played = (sfx: SfxCall[], prefix: string): SfxCall[] =>
  sfx.filter((c) => c.files.some((f) => f.startsWith(prefix)));

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
    expect(Enemy.fromVanilla(668, 0, 0)!.def.killedSound).toEqual(['deerclops_death']);
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
    prime(e, h);
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0;
    tickEnemy(e, h, 41);
    expect(played(h.sfx, 'dd2_betsy_flame_breath')).toHaveLength(1);
    // 687 = 锚定 Betsy 嘴部的持续喷焰实体(AI_136 :65843,78t 寿命——曾坍缩为
    // 30×30 自由飞弹,2026-08-19 大件批 D 已按原版锚定化,断言同步更新)
    const breath = h.projectiles.find((p) => p instanceof BetsyBreath);
    expect(breath).toBeTruthy();
    expect((breath as BetsyBreath).dmg).toBe(35);
  });
  it('Betsy：空袭掠射投 686 火球 → 出膛音 dd2_betsy_fireball_shot', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    prime(e, h);
    e.ai0 = 4; e.ai1 = 60; e.ai2 = 0;    // BOMB_APR_T=60：直接进掠射段
    tickEnemy(e, h, 12);
    expect(h.projectiles.some((p) => p.damage === 35)).toBe(true);
    expect(played(h.sfx, 'dd2_betsy_fireball_shot').length).toBeGreaterThanOrEqual(1);
  });
  it('Betsy：翻转俯冲首帧 → dd2_betsy_flying_circle_attack', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    prime(e, h);
    e.ai0 = 5; e.ai1 = 0;
    tickEnemy(e, h, 2);
    expect(played(h.sfx, 'dd2_betsy_flying_circle_attack')).toHaveLength(1);
  });
  it('Betsy：召唤态 → scream 一声 + summon 三拍（20/45/70）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: 100 });
    const e = spawnBetsy(h);
    prime(e, h);
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
    prime(e, h);
    e.ai0 = 127; e.ai1 = 1;              // 治疗招起手
    tickEnemy(e, h, 1);
    expect(played(h.sfx, 'dd2_dark_mage_cast_heal')).toHaveLength(1);   // ai[0]==126（:66461）
    // 674 脉动已实体化（DD2HealPulse）：heal_impact 移到脉动首帧（Projectile.cs
    // :35544-35547）——魔法师与弹幕都要驱动
    for (let i = 0; i < 90 && !e.dead; i++) {
      tickEnemy(e, h, 1);
      for (const p of h.projectiles as unknown as Array<{ dead?: boolean; fixedUpdate: (dt: number, g: typeof h.hooks) => void }>) {
        if (!p.dead) p.fixedUpdate(1 / 60, h.hooks);
      }
    }
    expect(played(h.sfx, 'dd2_dark_mage_heal_impact').length).toBeGreaterThanOrEqual(2);
    e.ai0 = 81; e.ai1 = 2;               // 召骷髅招（ai[0] 递减过 80）
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
    prime(mage, h);
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
  const projectiles: unknown[] = [];
  (hooks as unknown as { entities: { add: (e: unknown) => void; projectiles: unknown[] } }).entities =
    { add: (e: unknown) => { projectiles.push(e); }, projectiles };
  return { hooks, player, sfx, projectiles };
}

describe('C. MinionProj.ts 族专属音', () => {
  it('阿比盖尔 970：召唤音单播在 UseSound 面（R31 §A③ 收口），同类>1 升级音仍随从侧', () => {
    // ★2026-08-25 R31 §A③ 双播收口（MinionProj.ts MINION_SUMMON_SFX 注释块）：
    //   5114→AbigailSummon 已由 Game.playUseSound 经 vanilla-itemusesound.json 单播,
    //   随从首帧不再播 summon——本断言钉"不双播";升级音(:43974 同类>1)保留随从侧。
    const { hooks, sfx, projectiles } = makeMinionHooks();
    const a = new MinionProj(60 * TILE, 90 * TILE, 970, 6, 2, false, 0, false, () => hooks.player as never as Player);
    projectiles.push(a);                  // 生产侧经 entities.add 入桶（peerCount 计数源）
    a.fixedUpdate(1, hooks);
    expect(played(sfx, 'abigail_summon')).toHaveLength(0);   // 单播面在物品使用链
    const b = new MinionProj(61 * TILE, 90 * TILE, 970, 6, 2, false, 1, false, () => hooks.player as never as Player);
    projectiles.push(b);
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
  it('OOA 哨兵 663：放置音单播在 UseSound 面（R31 §A③ 收口）；开火帧 dd2_flameburst_tower_shot', () => {
    // ★2026-08-25 R31 §A③：3818-3834 → DD2_DefenseTowerSpawn 由物品使用链单播,
    //   哨兵首帧不重播——本断言钉"不双播";开火帧射击音保留随从侧。
    const { hooks, sfx } = makeMinionHooks({ x: 64 * TILE, y: 96 * TILE });
    const s = new MinionProj(60 * TILE, 96 * TILE, 663, 30, 2, true, 0, false, () => hooks.player as never as Player);
    s.fixedUpdate(1, hooks);
    expect(played(sfx, 'dd2_defense_tower_spawn')).toHaveLength(0);
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
  it('Foxparks 1094：首帧 pal_summon（soundDelay 0→-1 :59131），20t 后家族叫声（→-20 :59128）', () => {
    const { hooks, sfx } = makeMinionHooks();
    const m = new MinionProj(60 * TILE, 90 * TILE, 1094, 20, 2, false, 0, false, () => hooks.player as never as Player);
    m.fixedUpdate(1, hooks);
    expect(played(sfx, 'pal_summon')).toHaveLength(1);
    for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
    expect(played(sfx, 'pal_foxparks')).toHaveLength(1);
  });
});

// ===========================================================================
// D. 载入期静音门（suppress，2026-08-13"进世界音效爆发"修复批）：
//    afterWorldLoad 的 waterCheck 全图收敛期间 Game 置位，三个一次性播放入口直接
//    短路（不触 ensure = 不建 AudioContext / 不起后加载）。node 环境桩 window。
// ===========================================================================
const windowBackup = (globalThis as { window?: unknown }).window;

describe('D. 载入期静音门（Sfx.suppress 三入口短路）', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {};  // AudioContext 缺失 → ensure 理应返回 null
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = windowBackup;
  });

  /** spy ensure：返回 null（模拟无 AudioContext），记录触达次数 */
  function spyEnsure(s: Sfx) {
    const p = s as unknown as { ensure: (silent?: boolean) => unknown; calls: number[] };
    p.calls = [];
    p.ensure = (silent?: boolean) => { p.calls.push(silent ? 1 : 0); return null; };
    return p;
  }

  it('suppress=true：play/playWavFile/startTrackedLoop 一律不触 ensure', () => {
    const s = new Sfx();
    const spy = spyEnsure(s);
    s.suppress = true;
    s.play('dig', 1, 100, 100);
    expect(s.playWavFile('Dig_0', 1, 100, 100)).toBe(false);
    expect(s.startTrackedLoop('dig', 1, 100, 100)).toBeNull();
    expect(spy.calls).toHaveLength(0);          // 连 AudioContext 都不建
  });

  it('suppress=false（默认）：正常路径 ensure 被触达', () => {
    const s = new Sfx();
    const spy = spyEnsure(s);
    expect(s.suppress).toBe(false);             // 默认关——门只由 Game 载入窗临时开
    s.play('dig', 1, 100, 100);                 // playWav 失败回退合成也要先 ensure
    expect(spy.calls.length).toBeGreaterThan(0);
    expect(s.playWavFile('Dig_0', 1, 100, 100)).toBe(false);  // ensure 返回 null → false
  });

  it('清除后恢复播放（门不粘滞）', () => {
    const s = new Sfx();
    const spy = spyEnsure(s);
    s.suppress = true;
    s.play('chop', 1, 100, 100);
    expect(spy.calls).toHaveLength(0);
    s.suppress = false;
    s.play('chop', 1, 100, 100);
    expect(spy.calls.length).toBeGreaterThan(0);
  });
});
