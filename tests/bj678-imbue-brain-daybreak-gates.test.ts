// BJ678（2026-10-14）：BJ677 普查登记三债收编——玩家侧 NPC debuff 直写点补
// NPC.AddBuff buffImmune 拒绝门（NPC.cs:91037 `if (buffImmune[type]) return;` +
// NPCID.Sets.DebuffImmunitySets 表 = src/data/vanillaNpcImmunity.ts,单源闸 =
// projStatus.debuffWriteAllowed）。三债原版锚亲读定谳（1457 基线,Projectile 侧
// StatusNPC :11197-11221 与 1458 Player.cs:6499-6531 交叉同构）：
//
// 【债1】Game.ts updateSwingHits 浸剂块八行直写（70/395/39/24/72/69/31/20）——
//   原版 = Player.StatusToNPC :6502-6531 逐支 Main.npc[i].AddBuff(…) 全部过
//   buffImmune 门（亲读每支无绕门路径）⇒ 骨蛇 39 [20,24,31,323] 等免疫族挥砍
//   不上火/不困惑。逐支对位复核另揪出伴发错位：395 PotentAcid 伴发属
//   meleeEnchant==1【毒液浸剂】支（buff 71→:6504-6508 AddBuff(70)+AddBuff(395,60);
//   火浸剂 buff 74→meleeEnchant 3 :6513-6515 仅 AddBuff(24)）——曾误挂火浸剂支,
//   随本刀归位（投射物侧 applyMeleeImbue 双胞胎本就正确;handover-1457 旧锁随刀改判）。
//
// 【债2】Game.ts damagePlayer 混乱之脑反伤 en.confusedT 直写——原版 =
//   Player.Hurt Retaliate 分支 :38691-38722 逐敌 `Main.npc[n].AddBuff(31,(int)num14)`
//   过门 ⇒ 骷髅族等数百 31 免疫族被反伤【不】困惑。时长掷保持在闸前（原版
//   「掷后 AddBuff 拒」同拍,RNG 消耗不变）。
//
// 【债3】SolarEruption.ts applyDaybreak 两处直写 daybreakT——原版 =
//   Projectile.StatusNPC :11356-11361 `type==611/612 → nPC.AddBuff(189,300)` 过门
//   （636/953 表驱动路同款,projstatus.json 表内亲证）⇒ 316/521/533 长表族 +
//   ImmuneToAll 37 键档不吃破晓。复核另揪出单位错：daybreakT 消费侧为秒
//   （Enemy.fixedUpdate -=dt;636 表路 weapons-entities 锁 5s）,裸写 300=60 倍时长
//   ——收编 = applyDaybreak 经 applyBuffTicks 单源注入器（免疫门+300t→5s 换算+
//   max 合并,直投零掷）。
//
// 【变异自证】摘门恰红位（本测试为判别锁,摘任一门对应面必红）：
//   债1=Game.ts 浸剂块 debuffWriteAllowed(e,24)/(e,31)/(e,70)+(e,395)（A1/A2/A3）;
//   债2=damagePlayer 反伤 debuffWriteAllowed(en,31)（B1）;债3=SolarEruption
//   applyDaybreak 回裸写 daybreakT=300（C1/C2 双红:免疫失效+60 倍时长）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { npcImmuneTo } from '../src/data/vanillaNpcImmunity';
import { SolarFlare, SolarEruptionWhip } from '../src/entities/SolarEruption';
import type { GameHooks } from '../src/entities/types';

afterEach(() => { vi.restoreAllMocks(); });

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ---------------------------------------------------------------------------
// 夹具①：updateSwingHits 驱动桩（handover-1457-gates swingGame 同构——
// Object.create(Game.prototype) 挂最小字段直调私有方法,挥击已起手、手持铁镐 1）
function swingGame(vanillaIds: number[], imbue?: BuffType) {
  const world = new World(120, 120, 30, 'bj678-swing');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(1, 1);   // 铁镐（damage>0 的 melee 工具,过 noMelee/damage 门）
  if (imbue !== undefined) player.buffs.apply(imbue, 60);
  // 摆位 = handover-1457 已验证的小敌落点（x=player.cx+8 顶对齐 player.y——判定盒
  // 底缘 p.y+offY 恒覆盖敌顶带;敌怪环不改 x/y,免疫差分唯一变量=vanillaId）。
  // id 手动赋值:Entity.id 缺省 0,仅实体入桶时分配——桩夹具双敌同 0 会让
  // swingHitSet/meleeNpcCd 按实体 id 去重时互撞（第二敌被首敌的 hitSet 挡住）
  const enemies = vanillaIds
    .map((vid, i) => {
      const e = Enemy.fromVanilla(vid, player.cx + 8, player.y)!;
      e.id = i + 1;
      return e;
    })
    .filter(Boolean);
  g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: 1, useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.entities = { critters: [], npcs: [], enemies };
  g.player = player;
  g.world = world;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.net = null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  return { g, player, enemies: enemies as Enemy[] };
}
const runSwing = (g: Record<string, unknown>) =>
  (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
/** 多拍驱动：原版 ItemCheck_MeleeHitNPCs 循环门（Player.cs:44598）含 `attackCD<=0`
 *  ——单帧只受理首个命中,attackCD=(int)(itemAnimation×0.33) 解锁后续帧再中下一敌
 *  （挥砍逐帧扫过弧内多目标,repo 同构三重门 Game.ts 敌怪环头）。dur=30 →
 *  attackCd=9,双目标差分需 ≥10 拍（swing.t=20 够用,swingHitSet 防首敌重复中）。 */
const runSwingMulti = (g: Record<string, unknown>, ticks = 12) => {
  for (let i = 0; i < ticks; i++) runSwing(g);
};

// 夹具②：damagePlayer 驱动桩（orphan-b3 stubGame 同构,attacker 缺省环境伤路）
function brainGame(withBrain: boolean) {
  const world = new World(120, 120, 30, 'bj678-brain');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  // 混乱之脑 3223（Brain of Confusion）装 armor[3]（ACC_ARMOR_START=3 配饰首格）
  if (withBrain) player.inv.armor[3] = { id: _iid(3223), stack: 1 };
  const serpent = Enemy.fromVanilla(39, player.cx + 10, player.cy - 60)!;  // 31 免疫族
  const zombie = Enemy.fromVanilla(3, player.cx + 10, player.cy + 60)!;    // 无条目对照
  g.player = player;
  g.world = world;
  g.enemies = () => [serpent, zombie];
  g.entities = { critters: [], npcs: [], enemies: [serpent, zombie], projectiles: [], add: () => {} };
  g.net = null;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = () => {};
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  return { g, player, serpent, zombie };
}

// 夹具③：SolarFlare/SolarEruptionWhip 驱动钩（BJ677 hooks 同构 + entities.add）
function flareHooks(enemies: Enemy[]): GameHooks {
  const player = new Player(40 * TILE, 30 * TILE, new Inventory());
  const w = new World(60, 64, 20, 'bj678-flare');
  return {
    world: w, player,
    enemies: () => enemies, critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    entities: { add: () => {} },
  } as unknown as GameHooks;
}

// ---------------------------------------------------------------------------
describe('BJ678 静态基础面（免疫差分依据钉值,vanillaNpcImmunity 表）', () => {
  it('差分样本逐值：39 免 24/31;316 免 70/395/189;82 ImmuneToAll 免 72/189;3 无条目', () => {
    // 骨蛇 39（NPCID.cs:641 [20,24,31,323]）
    expect(npcImmuneTo(39, 24)).toBe(true);
    expect(npcImmuneTo(39, 31)).toBe(true);
    expect(npcImmuneTo(39, 70)).toBe(false);   // 不免毒液——per-buff 判定
    // 幽灵 316（14 项长表含 70/395/189）
    expect(npcImmuneTo(316, 70)).toBe(true);
    expect(npcImmuneTo(316, 395)).toBe(true);
    expect(npcImmuneTo(316, 189)).toBe(true);
    // 幽灵 82（ImmuneToAll 非鞭档——72 Midas/189 Daybreak 全拒）
    expect(npcImmuneTo(82, 72)).toBe(true);
    expect(npcImmuneTo(82, 189)).toBe(true);
    // 僵尸 3（无条目——对照组全放行）
    expect(npcImmuneTo(3, 24)).toBe(false);
    expect(npcImmuneTo(3, 31)).toBe(false);
    expect(npcImmuneTo(3, 70)).toBe(false);
    expect(npcImmuneTo(3, 189)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('BJ678 债1：updateSwingHits 浸剂八支免疫闸（StatusToNPC :6502-6531）', () => {
  it('火浸剂差分：骨蛇 39 不上火（免 24）且无 395（火支本无伴发）,僵尸 3 上火 3-7s', () => {
    const { g, enemies } = swingGame([39, 3], BuffType.ImbueFire);
    runSwingMulti(g);
    const [serpent, zombie] = enemies;
    expect(serpent.hp).toBeLessThan(serpent.def.hp);   // 命中落地（直伤不在 buffImmune 门内）
    expect(serpent.onFireT).toBe(0);                   // ★债1 主锁：免 24 拒上火
    expect(serpent.potentAcidT).toBe(0);               // ★395 伴发归位锁：火支（meleeEnchant==3）无此支
    expect(zombie.hp).toBeLessThan(zombie.def.hp);     // 对照组同拍受击
    expect(zombie.onFireT).toBeGreaterThanOrEqual(3);  // AddBuff(24, 60×Next(3,7))
    expect(zombie.onFireT).toBeLessThanOrEqual(7);
  });

  it('纳米浸剂差分：骨蛇 39 不困惑（免 31）,僵尸 3 困惑 1-4s', () => {
    const { g, enemies } = swingGame([39, 3], BuffType.ImbueNano);
    runSwingMulti(g);
    const [serpent, zombie] = enemies;
    expect(serpent.confusedT).toBe(0);                  // ★免 31 拒困惑
    expect(serpent.hp).toBeLessThan(serpent.def.hp);
    expect(zombie.confusedT).toBeGreaterThanOrEqual(1); // AddBuff(31, 60×Next(1,4))
    expect(zombie.confusedT).toBeLessThanOrEqual(4);
  });

  it('毒液浸剂 per-buff 双拒：幽灵 316 双免（70+395）零上,僵尸 3 双上（伴发归位正锁）', () => {
    const { g, enemies } = swingGame([316, 3], BuffType.ImbueVenom);
    runSwingMulti(g);
    const [ghost, zombie] = enemies;
    expect(ghost.hp).toBeLessThan(ghost.def.hp);       // 命中落地
    expect(ghost.venomT).toBe(0);                      // 免 70 拒毒液
    expect(ghost.potentAcidT).toBe(0);                 // 免 395 拒伴发（per-buff 判定,非整支全拒）
    expect(zombie.venomT).toBeGreaterThanOrEqual(5);   // AddBuff(70, 60×Next(5,10))
    expect(zombie.potentAcidT).toBeGreaterThanOrEqual(1); // ★伴发归位毒液支（meleeEnchant==1 AddBuff(395,60)）
  });

  it('金浸剂差分：ImmuneToAll 档幽灵 82 不沾金（免 72）,僵尸 3 midasT=2', () => {
    const { g, enemies } = swingGame([82, 3], BuffType.ImbueGold);
    runSwingMulti(g);
    const [wraith, zombie] = enemies;
    expect(wraith.hp).toBeLessThan(wraith.def.hp);
    expect(wraith.midasT).toBe(0);                     // 免 72 拒 Midas
    expect(zombie.midasT).toBe(2);                     // AddBuff(72,120)=2s
  });
});

// ---------------------------------------------------------------------------
describe('BJ678 债2：混乱之脑反伤 31 免疫闸（Player.Hurt :38691-38722）', () => {
  it('装 3223 受击：31 免疫族骨蛇 39 被反伤不困惑,无条目僵尸 3 困惑（同拍同圈差分）', () => {
    const { g, player, serpent, zombie } = brainGame(true);
    // Math.random→0.5 定掷：①避开 boc 1/6 闪避掷（Player.damage :11860
    // `random()<1/6` return 0——mock 0 会必中闪避把 ok 打成 0,反伤圈不达）;
    // ②命中掷 0.5×500=250<300+2×ok 必过、半径≈200+ok/2+72（两敌 ±60px 圈内）、
    // 时长中档——反伤圈与伤害独立,只锁困惑差分
    const rvi = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ok = (g as unknown as { damagePlayer(d: number, x: number, y: number): number })
      .damagePlayer(30, player.cx + 10, player.cy);
    rvi.mockRestore();
    expect(ok).toBeGreaterThan(0);                     // 受击真实落地（反伤圈前置条件）
    expect(zombie.confusedT).toBeGreaterThan(0);       // 反伤困惑照上（AddBuff(31)）
    expect(zombie.confusedT).toBeLessThanOrEqual(6.7); // Next(90+dmg/3, 300+dmg/2) 上界
    expect(serpent.confusedT).toBe(0);                 // ★债2 主锁：免 31 拒反伤困惑
  });

  it('未装 3223 受击：无反伤圈,两敌均不困惑（装备位差分,防 always-on 伪绿）', () => {
    const { g, player, serpent, zombie } = brainGame(false);
    const rvi = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ok = (g as unknown as { damagePlayer(d: number, x: number, y: number): number })
      .damagePlayer(30, player.cx + 10, player.cy);
    rvi.mockRestore();
    expect(ok).toBeGreaterThan(0);
    expect(zombie.confusedT).toBe(0);
    expect(serpent.confusedT).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('BJ678 债3：日耀喷发破晓 189 免疫闸（Projectile.StatusNPC :11356-11361）', () => {
  it('爆焰 612 命中：僵尸 3 daybreakT=5s（300t/60 单位归位锁）,幽灵 316 不吃（长表含 189）', () => {
    const zombie = Enemy.fromVanilla(3, 20 * TILE, 30 * TILE)!;
    const ghost = Enemy.fromVanilla(316, 20 * TILE, 45 * TILE)!;   // 相距 15 tile>reach 34px 无串扰
    const hooks = flareHooks([ghost, zombie]);
    new SolarFlare(zombie.cx, zombie.cy, 20, 0.85).fixedUpdate(1 / 60, hooks);
    new SolarFlare(ghost.cx, ghost.cy, 20, 0.85).fixedUpdate(1 / 60, hooks);
    expect(zombie.daybreakT).toBeCloseTo(5, 5);        // AddBuff(189,300)=5s（旧裸写 300=60 倍,归位）
    expect(ghost.daybreakT).toBe(0);                   // ★债3 主锁：免 189 拒破晓
    expect(ghost.hp).toBeLessThan(ghost.def.hp);       // 直伤照吃（不在 buffImmune 门内）
  });

  it('链鞭 611 命中：僵尸 3 daybreakT=5s,ImmuneToAll 档幽灵 82 不吃', () => {
    const zombie = Enemy.fromVanilla(3, 20 * TILE, 30 * TILE)!;
    const wraith = Enemy.fromVanilla(82, 20 * TILE, 15 * TILE)!;
    const hooks = flareHooks([wraith, zombie]);
    const rvi = vi.spyOn(Math, 'random').mockReturnValue(0);
    // 首拍运动学（random=0 → ai1=−π/8,num50=−1,ang=π/2）：x 位移≈0、y += 48×sin(π/8)
    // ≈18.369——预置于敌心上方 8+18.369px,移动后 16×16 盒仍居敌盒内
    const spawnOn = (e: Enemy): SolarEruptionWhip => {
      const whip = new SolarEruptionWhip(0, 0, 20);
      whip.x = e.cx - 8;
      whip.y = e.cy - 8 - 48 * Math.sin(Math.PI / 8);
      return whip;
    };
    spawnOn(zombie).fixedUpdate(1 / 60, hooks);
    spawnOn(wraith).fixedUpdate(1 / 60, hooks);
    rvi.mockRestore();
    expect(zombie.daybreakT).toBeCloseTo(5, 5);        // 611 同款 AddBuff(189,300)
    expect(zombie.hp).toBeLessThan(zombie.def.hp);
    expect(wraith.daybreakT).toBe(0);                  // ImmuneToAll 37 键档拒破晓
    expect(wraith.hp).toBeLessThan(wraith.def.hp);     // 直伤照吃
  });
});
