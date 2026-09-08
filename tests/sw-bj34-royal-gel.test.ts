// SW-BJ34 2026-09-08 皇家凝胶（Royal Gel 3090）装备后熔岩史莱姆仍攻击——用户实报回归。
// 原版考古（1457 反编译,唯一标杆;1456 同面校验）：
//   置位   Player.cs:14790-14814（1456 :14144-14168）ApplyEquipFunctional
//          `currentItem.type == 3090` → npcTypeNoAggro[23 类史莱姆]=true（含 59 熔岩）；
//          数组声明 :2977；每帧清零 :17157(UpdateDead)/:18922(ResetEffects)。
//          ★镇静药水 player.calmed（NPC.cs:708-712）只改刷怪率,不置 npcTypeNoAggro。
//   消费面 ①接触伤害跳过 Player.cs:31588 Update_NPCCollision `||
//          npcTypeNoAggro[Main.npc[i].type]` → continue（先于 :31595 GetMeleeCollisionData
//          与 :31598 蜂蜜史莱姆支——凝胶在身蜂蜜史莱姆也不蹭蜜）；②AI_001 弹射门
//          NPC.cs:61303(539 携物)/:61768(184)/:61823(535)/:61878(658)/:61958(659)/
//          :62007(204)；③aiStyle22 122 充能/开火 :24935/:24969 + 垂直决策 :25139-25154；
//          ④索敌 +1000 罚/不面向门 :78490/:78542（direction!=0 守卫仅此两处）。
//   视觉   Item.cs:28594-28601 无 equipSlot/bodySlot,NPC.cs 全文无 crown 绘制点
//          ——原版无凝胶皇冠视觉,N/A（本文件尾含源级断言钉住）。
// 本仓偏差（本批清偿）：接触面整缺=用户实报根因;539/184/204 弹射门缺（535/658/659
// 表外型原文恒开,补写为逐字 1:1）;122 充能/开火/垂直决策缺;索敌面此前已接。
// 1458 增量：同链逐行比对零差异（Player.cs:14789/:2977/NPC.cs 同行号）,无需移植。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Enemy, CALMING_NO_AGGRO_TYPES, npcTypeNoAggro } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';
import type { Player as PlayerT } from '../src/entities/Player';

const SRC = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8');
const DECOMP_PLAYER = readFileSync(
  join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8');
const DECOMP_NPC = readFileSync(
  join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'NPC.cs'), 'utf8');

// ---------------- 玩家桩（接触结算读 x/y/w/h/cx/cy/dead/luck/equipStats/buffs） ----------------
interface StubPlayer {
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean; luck: number; aggro: number; useTime: number; itemAnimTicks: number;
  equipStats?: { royalGel?: boolean };
  buffs?: { has: (t: number) => boolean; apply: (t: number, s: number) => void };
}
const stubPlayer = (over: Partial<StubPlayer> = {}): StubPlayer => ({
  x: 0, y: 0, w: 20, h: 42, cx: 10, cy: 21,
  dead: false, luck: 0, aggro: 0, useTime: 0, itemAnimTicks: 0,
  equipStats: {}, buffs: { has: () => false, apply: () => {} },
  ...over,
});
const asPlayer = (p: StubPlayer) => p as unknown as PlayerT;

function makeGame(world: World, player: StubPlayer) {
  const damageCalls: number[] = [];
  const honeyApplies: number[] = [];
  (player.buffs as NonNullable<StubPlayer['buffs']>).apply = (t, s) => {
    if (t === BuffType.Honey) honeyApplies.push(s);
  };
  const game = {
    world,
    player: player as unknown as PlayerT,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (dmg: number) => { damageCalls.push(dmg); return dmg; },
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    showPickupLabel: () => {},
    spawnDust: () => null,
    addLightAt: () => {},
    entities: { add: () => {} },
    achievements: { handleSpecialEvent: () => {} },
  } as unknown as GameHooks;
  return { game, damageCalls, honeyApplies };
}

// 平地世界：y=60 一行石头,地面线 40
function flatWorld(): World {
  const w = new World(80, 80, 3407, 'sw-bj34');
  w.groundLevel = 40;
  for (let x = 0; x < 80; x++) w.store.setTileSilent(x, 60, 1);
  return w;
}

/** 把史莱姆放上地面、玩家桩与其盒重叠（接触面必交,1 tick 内漂移 ≤3px 不脱） */
function contactPair(world: World, vid: number, gel: boolean, playerOver: Partial<StubPlayer> = {}) {
  const e = Enemy.fromVanilla(vid, 40 * 16, 60 * 16)!;
  e.x = 40 * 16; e.y = 60 * 16 - e.h;      // 站在地板上
  e.vx = 0; e.vy = 0;
  const p = stubPlayer({
    x: e.x - 4, y: e.y - 10, w: 20, h: e.h + 24,   // 盒罩住史莱姆（含余量）
    cx: e.cx, cy: e.y + (e.h + 24) / 2,
    equipStats: { royalGel: gel },
    ...playerOver,
  });
  return { e, p };
}

// ==================== 1. 原版锚：置位表金标（1457 反编译直读） ====================
describe('SW-BJ34 原版锚（1457 反编译金标）', () => {
  it('Player.cs 3090 块逐项置位表 ≡ CALMING_NO_AGGRO_TYPES（23 类,含 59 熔岩史莱姆）', () => {
    const set = [...DECOMP_PLAYER.matchAll(/npcTypeNoAggro\[(\d+)\] = true;/g)]
      .map((m) => Number(m[1]));
    expect(set.length).toBe(23);                       // :14792-14814 恰 23 行
    expect(new Set(set)).toEqual(new Set(CALMING_NO_AGGRO_TYPES));
    expect(CALMING_NO_AGGRO_TYPES.has(59)).toBe(true); // ★实报主角：熔岩史莱姆在友好域内
    expect(CALMING_NO_AGGRO_TYPES.has(3)).toBe(false); // 僵尸不表
  });

  it('接触面原文（Player.cs:31588）含 npcTypeNoAggro 数组直查,且先于 GetMeleeCollisionData', () => {
    const line = DECOMP_PLAYER.split('\n')[31587];     // 0 起 → 文件 31588 行
    expect(line).toContain('npcTypeNoAggro[Main.npc[i].type]');
    const gmcLine = DECOMP_PLAYER.indexOf('GetMeleeCollisionData(rectangle, i,');
    expect(gmcLine).toBeGreaterThan(0);
    expect(gmcLine).toBeGreaterThan(DECOMP_PLAYER.indexOf('npcTypeNoAggro[Main.npc[i].type]'));
  });

  it('镇静药水不置 npcTypeNoAggro（player.calmed 只吃刷怪率,NPC.cs:708-712）', () => {
    expect(DECOMP_PLAYER).not.toMatch(/calmed[^;]*npcTypeNoAggro|npcTypeNoAggro[^;]*calmed/);
    expect(DECOMP_NPC).toMatch(/if \(player\.calmed\)/); // NPC.cs:708 刷怪率面在
  });

  it('数据面：vanilla-accfx.json 3090 → royalGel:1', () => {
    const accfx = JSON.parse(readFileSync(
      join(__dirname, '..', 'src', 'data', 'vanilla-accfx.json'), 'utf8')) as Record<string, Record<string, number>>;
    expect(acfx['3090']?.royalGel).toBe(1);
  });

  it('皇冠视觉 N/A：Item 3090 无装备视觉位,NPC.cs 无 crown 绘制点', () => {
    const setDefaults = DECOMP_PLAYER && readFileSync(
      join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    const m = setDefaults.match(/case 3090:\s*\n([\s\S]*?)return;/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(/equipSlot|bodySlot|hairSlot/);  // 纯功能配饰
    expect(DECOMP_NPC.toLowerCase()).not.toContain('crown');
  });
});

// ==================== 2. 判定子：装备旗专面（不含镇静） ====================
describe('SW-BJ34 npcTypeNoAggro 判定子（=型在 23 类表 ∧ equipStats.royalGel）', () => {
  it('凝胶装备：23 类逐型全真（含 59 熔岩）', () => {
    const p = asPlayer(stubPlayer({ equipStats: { royalGel: true } }));
    for (const vid of CALMING_NO_AGGRO_TYPES) {
      expect(npcTypeNoAggro(vid, p)).toBe(true);
    }
  });

  it('未装备：全假;表外型（僵尸 3/尖刺 535/史后仆从 658·659）装了也假——逐字 1:1', () => {
    const bare = asPlayer(stubPlayer());
    const gel = asPlayer(stubPlayer({ equipStats: { royalGel: true } }));
    for (const vid of [3, 535, 658, 659, 490, 685]) {
      expect(npcTypeNoAggro(vid, gel)).toBe(false);
    }
    expect(npcTypeNoAggro(59, bare)).toBe(false);
    expect(npcTypeNoAggro(null, gel)).toBe(false);
  });

  it('镇静药水单独存在：判定子仍假（vanilla 1:1——calmed 不置数组）', () => {
    const calm = stubPlayer({ buffs: { has: (t) => t === BuffType.Calming, apply: () => {} } });
    expect(npcTypeNoAggro(59, asPlayer(calm))).toBe(false);
  });
});

// ==================== 3. 接触面（用户实报根因,真实 fixedUpdate 行为） ====================
describe('SW-BJ34 接触伤害面（Update_NPCCollision :31588 → 本仓 fixedUpdate 接触块）', () => {
  it('★实报主案：装凝胶,熔岩史莱姆(59)贴身 → 零接触结算', () => {
    const w = flatWorld();
    const { e, p } = contactPair(w, 59, true);
    const { game, damageCalls } = makeGame(w, p);
    e.fixedUpdate(1 / 60, game);
    expect(damageCalls).toEqual([]);
  });

  it('未装凝胶：熔岩史莱姆贴身照常结算（基线不变）', () => {
    const w = flatWorld();
    const { e, p } = contactPair(w, 59, false);
    const { game, damageCalls } = makeGame(w, p);
    e.fixedUpdate(1 / 60, game);
    expect(damageCalls.length).toBeGreaterThan(0);
    expect(damageCalls[0]).toBeGreaterThan(0);
  });

  it('装凝胶但非表内型（535 尖刺史莱姆）→ 照常结算（原文恒开逐字面）', () => {
    const w = flatWorld();
    const { e, p } = contactPair(w, 535, true);
    const { game, damageCalls } = makeGame(w, p);
    e.fixedUpdate(1 / 60, game);
    expect(damageCalls.length).toBeGreaterThan(0);
  });

  it('凝胶在身,蜂蜜史莱姆(1+ai1=1125)也不蹭蜜（:31588 continue 先于 :31598 蜂蜜支）', () => {
    const w = flatWorld();
    const { e, p } = contactPair(w, 1, true);
    e.ai1 = 1125;
    const { game, honeyApplies } = makeGame(w, p);
    e.fixedUpdate(1 / 60, game);
    expect(honeyApplies).toEqual([]);
    // 对照：不装凝胶 → 蹭蜜（原 honey 分支基线）
    const w2 = flatWorld();
    const pair2 = contactPair(w2, 1, false);
    pair2.e.ai1 = 1125;
    const g2 = makeGame(w2, pair2.p);
    pair2.e.fixedUpdate(1 / 60, g2.game);
    expect(g2.honeyApplies.length).toBe(1);
  });

  it('访客端同面：netPuppetContact 门在源（Game.ts）——每客户端各跑 Update_NPCCollision', () => {
    const src = SRC(join('core', 'Game.ts'));
    expect(src).toMatch(/★SW-BJ34 2026-09-08：访客端同面[\s\S]{0,240}if \(npcTypeNoAggro\(e\.vanillaId, p\)\) continue;/);
  });
});

// ==================== 4. AI 弹射门（AI_001 :61303/:61768/:61823/:61878/:61958/:62007） ====================
describe('SW-BJ34 AI_001 弹射门（凝胶在身不蓄射）', () => {
  const enemySrc = SRC(join('entities', 'Enemy.ts'));

  it('539 携物掷弹门（:61303）：!npcTypeNoAggro 已接,旧「省略登记」已清偿', () => {
    expect(enemySrc).toMatch(/1\/num11 且[\s\S]{0,200}★SW-BJ34 2026-09-08：补 `!Main\.player\[target\]\.npcTypeNoAggro\[type\]` 门[\s\S]{0,80}1457 :61303/);
    expect(enemySrc).toMatch(/roll\(num11\) === 0 && player && !player\.dead\s*\n?\s*&& !npcTypeNoAggro\(this\.vanillaId, player\)/);
    expect(enemySrc).not.toContain('npcTypeNoAggo');   // 旧错拼登记注已删
  });

  it('尖刺三型射击头门（184=:61768/535=:61823/204=:62007）已接', () => {
    expect(enemySrc).toMatch(/if \(player && !player\.dead && !this\.wet && !npcTypeNoAggro\(this\.vanillaId, player\)\) \{/);
  });

  it('史后仆从 658/659 射击头门（:61878/:61958）已接（表外型恒开=逐字 1:1）', () => {
    expect(enemySrc).toMatch(/!this\.wet && this\.vy === 0\s*\n\s*&& !npcTypeNoAggro\(this\.vanillaId, player\)/);
  });

  it('aiStyle22 122 充能(:24969)/开火(:24935)门已接', () => {
    expect(enemySrc).toMatch(/if \(this\.ai3 === 32 && player && !npcTypeNoAggro\(vid, player\)\)/);
    expect(enemySrc).toMatch(/!npcTypeNoAggro\(vid, player\)\s*\n\s*&& aiGlobalFiringDistanceCheck/);
  });

  it('aiStyle22 no-aggro 垂直决策（:25136-25154）：行为面——凝胶在身 dirY 按支承覆写', () => {
    const w = flatWorld();
    const e = Enemy.fromVanilla(122, 40 * 16, 60 * 16)!;   // 站地板上（探测列脚下有支承）
    e.x = 40 * 16; e.y = 60 * 16 - e.h; e.vx = 0; e.vy = 0;
    const p = stubPlayer({
      x: e.x, y: e.y + 200, w: 20, h: 42,                   // 玩家在下方（TargetClosest 会给 dirY=+1）
      cx: e.cx, cy: e.y + 200 + 21,
      equipStats: { royalGel: true },
    });
    const { game } = makeGame(w, p);
    e.fixedUpdate(1 / 60, game);
    expect(e.dirY).toBe(-1);   // 脚下 6 行内有地板 → flag37 → 上浮（覆写追人 +1）
    // 对照：不装凝胶 → dirY 随玩家（在下方 → +1）
    const w2 = flatWorld();
    const e2 = Enemy.fromVanilla(122, 40 * 16, 60 * 16)!;
    e2.x = 40 * 16; e2.y = 60 * 16 - e2.h; e2.vx = 0; e2.vy = 0;
    const p2 = stubPlayer({
      x: e2.x, y: e2.y + 200, w: 20, h: 42, cx: e2.cx, cy: e2.y + 200 + 21,
    });
    const g2 = makeGame(w2, p2);
    e2.fixedUpdate(1 / 60, g2.game);
    expect(e2.dirY).toBe(1);
  });
});

// ==================== 5. 索敌面回归钉（此前已接,本批不回归） ====================
describe('SW-BJ34 索敌面（TargetClosest :78490 +1000 / :78542 不面向门）', () => {
  it('熔岩史莱姆装凝胶:+1000 罚 + 不转身门保留旧朝向', () => {
    const e = Enemy.fromVanilla(59, 100 * 16, 50 * 16)!;
    e.facing = 1;                       // 旧朝向朝右
    e.hadTarget = true;
    const gel = stubPlayer({ cx: 0, cy: 50 * 16, equipStats: { royalGel: true } });
    // 不转身门（:78542 faceTarget=false 等效）：玩家在左也不转头
    expect(e.seekDirX(asPlayer(gel))).toBe(1);
    // +1000 罚（:78490）
    const far = stubPlayer({ cx: 300 + 100 * 16, cy: 50 * 16, equipStats: { royalGel: true } });
    const e2 = Enemy.fromVanilla(59, 100 * 16, 50 * 16)!;
    expect(e2.effectiveTargetDist(asPlayer(far))).toBe(300 + 1000);
  });

  it('不装凝胶:熔岩史莱姆照常面向玩家（基线）', () => {
    const e = Enemy.fromVanilla(59, 100 * 16, 50 * 16)!;
    e.facing = 1;
    e.hadTarget = true;
    const p = stubPlayer({ cx: 0, cy: 50 * 16 });
    expect(e.seekDirX(asPlayer(p))).toBe(-1);
  });
});
