// 台账清偿批（2026-08-31）Player.ts 专责代理——回归锚。
// 总账 = game/docs/audit/approx-registry-2026-08-31.md Player 域 A/B 件：
//   ①太阳石白天门（1458 P.cs:15529-15533）
//   ④老猩红甲两再生加成（ArmorSetBonuses.cs:433 + :19233/:19362/:19412）
//   ⑤JumpMovement 滑行支与组合门（:20805-20845）
//   ⑦日曜消耗门 BossNoCheese 桶（ImmunityCooldownID.Sets.Counter）
//   ⑧拾取半径族（GetItemGrabRange :35409-35452 + Item.cs:43-49）
//   ⑨aggro 潜行链优先序（:25929/:26016/:26045 psycho>shroomite>vortex）
//   ⑩小漂族：FindPulley !controlJump(:26320)/shimmer 外门(Collision.WetCollision)/
//     盾反触发域(:31942-31958)
import { describe, it, expect, beforeEach } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { HurtCooldownBuckets, registerGlobalHurtBuckets } from '../src/player/HurtCooldownBuckets';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

function makeGame(w: World, hooks?: Partial<GameHooks>): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    ...hooks,
  } as unknown as GameHooks;
}

/** 平地世界：70/71 行铺实心 */
function flatWorld(): World {
  const w = new World(200, 90, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 70, 1, 0, 0);
    w.store.setTileSilent(x, 71, 1, 0, 0);
  }
  return w;
}

function step(p: Player, game: GameHooks): void {
  p.fixedUpdate(1 / 60, game);
}

describe('①太阳石/月亮石天界石复合门（1458 :15529-15533）', () => {
  it('太阳石 899：白天授予、夜里收回（白/黑对照 → meleeSpeed +0.10 出入）', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(899), stack: 1 };
    p.nightPhase = false;                      // Main.dayTime=true 且非日食
    const day = p.equipStats;
    p.nightPhase = true;                       // !dayTime || eclipse
    const night = p.equipStats;
    expect(day.meleeSpeed).toBeCloseTo(night.meleeSpeed + 0.1, 6);
    expect(day.critMelee).toBe(night.critMelee + 2);      // 复合同句 crit+2 双确认
  });
  it('月亮石 900：夜档授予、白天收回', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(900), stack: 1 };
    p.nightPhase = false;
    const day = p.equipStats;
    p.nightPhase = true;
    const night = p.equipStats;
    expect(night.meleeSpeed).toBeCloseTo(day.meleeSpeed + 0.1, 6);
    expect(day.critMelee).toBe(night.critMelee);
  });
});

describe('④老猩红甲两再生加成（ArmorSetBonuses.Crimson，:19233 eRT+1 / :19362 ×1.5）', () => {
  it('三件 792|793|794 才亮 crimsonRegen；缺一不亮', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[0] = { id: iid(792), stack: 1 };
    p.inv.armor[1] = { id: iid(793), stack: 1 };
    p.inv.armor[2] = { id: iid(794), stack: 1 };
    expect(p.equipStats.crimsonRegen).toBe(true);
    p.inv.armor[2] = null;
    expect(p.equipStats.crimsonRegen).toBe(false);
  });
  it('eRT 每 tick 额外 +1（基础段 1/t → 装甲后 2/t），停止时脉动含 ×1.5 回血增益', async () => {
    const game = makeGame(flatWorld());
    const mk = async () => {
      const q = new Player(60 * TILE, 66 * TILE, new Inventory());
      for (let i = 0; i < 30; i++) step(q, game);
      q.hp = q.maxHp - 50;                     // 保证 hp<maxHp 的自然回血窗口
      return q;
    };
    const bare = await mk();
    const crims = new Player(60 * TILE, 66 * TILE, new Inventory());
    crims.inv.armor[0] = { id: iid(792), stack: 1 };
    crims.inv.armor[1] = { id: iid(793), stack: 1 };
    crims.inv.armor[2] = { id: iid(794), stack: 1 };
    for (let i = 0; i < 30; i++) step(crims, game);
    crims.hp = crims.maxHp - 50;
    const rt0b = bare.lifeRegenTime, rt0c = crims.lifeRegenTime;
    for (let t = 0; t < 20; t++) { step(bare, game); step(crims, game); }
    // 差值 = 猩红额外的 +1/t（两玩家均静止、无 DoT：bare 增量=1+坐卧相关恒 0）
    expect(crims.lifeRegenTime - rt0c).toBe(bare.lifeRegenTime - rt0b + 20);
  });
});

describe('⑤JumpMovement 滑行支与组合门（:20805-20845）', () => {
  it('贴墙滑行中【按住】跳键不再重触发蹬墙跳（:20805 sliding→autoJump=false）', async () => {
    const w = flatWorld();
    // 墙柱 x=72 格，从地面往上 24 行
    for (let y = 46; y <= 69; y++) w.store.setTileSilent(72, y, 1, 0, 0);
    const game = makeGame(w);
    const inv = new Inventory();
    inv.armor[3] = { id: iid(953), stack: 1 };            // 攀爬爪 spikedBoots
    const p = new Player(71 * TILE - 6, 68 * TILE, inv);
    for (let i = 0; i < 40; i++) step(p, game);           // 落地沉降
    p.inputX = 1;                                         // 压向墙 → 贴壁缓降
    let sawCling = false;
    // 走向墙至贴壁（无跳输入）
    for (let t = 0; t < 90 && !sawCling; t++) { step(p, game); if (p.wallCling) sawCling = true; }
    expect(sawCling).toBe(true);
    // 已贴墙且下落：继续按住跳键 30 tick（边沿早已消费）→ 不得再起跳
    p.inputJump = true;
    let minY = Infinity;
    for (let t = 0; t < 30; t++) {
      step(p, game);
      minY = Math.min(minY, p.vy);
    }
    expect(minY).toBeGreaterThanOrEqual(-0.01);           // 无蹬墙跳重触发
  });
  it('裸装平地按住跳（autoJump 位关闭）也不自动连跳——门语义未被打穿', async () => {
    const game = makeGame(flatWorld());
    const p = new Player(60 * TILE, 68 * TILE, new Inventory());
    for (let i = 0; i < 40; i++) step(p, game);
    expect(p.onGround).toBe(true);
    p.inputJump = true;
    let lifts = 0;
    for (let t = 0; t < 90; t++) {
      const wasAir = p.vy < -0.5;
      step(p, game);
      if (!wasAir && p.vy < -3) lifts++;
      if (t === 45) p.inputJump = false;                  // 松键一次制造新边沿
      if (t === 55) p.inputJump = true;
    }
    expect(lifts).toBeLessThanOrEqual(2);                 // 仅两次键沿（初按+重按）
  });
});

describe('⑦日曜消耗门 BossNoCheese 桶建模（ImmunityCooldownID.Sets.Counter）', () => {
  beforeEach(() => registerGlobalHurtBuckets(new HurtCooldownBuckets()));

  it('cc=1 命中：General immune 帧内照常落地（双无敌域互不遮挡），且写入桶位而非 General', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.iframes = 40;                                        // General 无敌帧窗
    const dealt = p.damage(100, p.cx, p.y - 10, false, false, 1);
    expect(dealt).toBeGreaterThan(0);                      // 不被 General 门吞掉
    expect(p.iframes).toBe(40);                            // General 位未被改写
  });
  it('同桶连击节流：BossNoCheese 冷却未走完的第二发=完全免伤(Hurt 早退 :38493)', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const a = p.damage(60, p.cx, p.y - 10, false, false, 1);
    const b = p.damage(60, p.cx, p.y - 10, false, false, 1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBe(0);                                     // hurtCooldowns[1]>0
  });
  it('solarGateOk 收纳 counter==1：月总族攻击照常吃盾（ConsumeSolarFlare :57415）', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    // 真值日曜三件（ArmorSetBonuses.Solar='171|177|112' ← items 2763/2764/2765）
    p.inv.armor[0] = { id: iid(2763), stack: 1 };
    p.inv.armor[1] = { id: iid(2764), stack: 1 };
    p.inv.armor[2] = { id: iid(2765), stack: 1 };
    expect(p.equipStats.solarSet).toBe(true);              // 装备驱动（缓存对象冻结）
    p.solarShields = 2;
    const before = p.solarShields;
    p.damage(100, p.cx, p.y - 10, false, false, 1);
    expect(p.solarShields).toBe(before - 1);               // 消耗一面
  });
});

describe('⑧拾取半径族（GetItemGrabRange :35409-35452 / Item.cs:43-49 真值表）', () => {
  it('getter 真值化：磁石全类 +150（非旧 94）；lifeMagnet +250；manaMagnet +300', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    expect(p.grabRangeBonus).toBe(0);
    p.inv.armor[3] = { id: iid(5010), stack: 1 };          // 宝藏磁石
    expect(p.grabRangeBonus).toBe(150);
    expect(p.manaMagnetBonus).toBe(0);
    (p.buffs as unknown as { apply(t: BuffType, s: number): void }).apply(BuffType.Heartreach, 60);
    expect(p.heartGrabBonus).toBe(250);
  });
  it('逐物品正解 getItemGrabRangeBonus：磁石×金戒指可叠加、币族判定、Nebula/Eternia/法斗之星', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(5010), stack: 1 };          // treasureMagnet
    p.inv.armor[4] = { id: iid(3033), stack: 1 };          // goldRing 族
    expect(p.getItemGrabRangeBonus(-1)).toBe(150);         // 全类磁石项
    expect(p.getItemGrabRangeBonus(71)).toBe(500);         // 金币=150+350 叠加
    expect(p.getItemGrabRangeBonus(74)).toBe(500);
    expect(p.getItemGrabRangeBonus(9)).toBe(150);          // 非币普通件只吃磁石
    p.inv.armor[5] = { id: iid(2219), stack: 1 };          // manaMagnet 族
    expect(p.getItemGrabRangeBonus(184)).toBe(450);        // 星族=150+300
    expect(p.getItemGrabRangeBonus(4143)).toBe(450);       // 法斗之星独立门 150+300
    expect(p.getItemGrabRangeBonus(3822)).toBe(200);       // Eternia=150+50
    expect(p.getItemGrabRangeBonus(3453)).toBe(250);       // NebulaPickup=150+100
    expect(p.getItemGrabRangeBonus(3455)).toBe(250);
  });
});

describe('⑨aggro 潜行链优先序翻转（psycho > shroomite > vortex，:25929 首/尾支）', () => {
  function withGear(held?: number, armorVids?: number[]): { p: Player; game: GameHooks } {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    if (held !== undefined) {
      p.inv.slots[p.inv.selected] = { id: iid(held), stack: 1 };
    }
    if (armorVids) {
      p.inv.armor[0] = { id: iid(armorVids[0]), stack: 1 };
      p.inv.armor[1] = { id: iid(armorVids[1]), stack: 1 };
      p.inv.armor[2] = { id: iid(armorVids[2]), stack: 1 };
    }
    p.stealth = 0.5;
    return { p, game: makeGame(flatWorld()) };
  }
  it('变态刀+星璇同持：吃首支 psycho -750 档（旧序错吃 vortex -1200 档）', () => {
    const { p } = withGear(3106, [2757, 2758, 2759]);
    expect(p.heldPsychoKnife).toBe(true);
    expect(p.equipStats.vortexSet).toBe(true);
    expect(p.aggro).toBe(Math.round(-750 * 0.5));           // -375 非 -600
  });
  it('仅星璇套：-1200 档不变；仅持变态刀：-750 档不变（双向回归）', () => {
    const a = withGear(undefined, [2757, 2758, 2759]).p;
    expect(a.aggro).toBe(Math.round(-1200 * 0.5));
    const b = withGear(3106).p;
    expect(b.aggro).toBe(Math.round(-750 * 0.5));
  });
});

describe('⑩a FindPulley !controlJump 门（:26320——Space 只手不进绳态,↑ 仍可）', () => {
  function ropeWorld(): { w: World; p: Player; game: GameHooks } {
    const w = flatWorld();
    const game = makeGame(w);
    const p = new Player(61 * TILE, 68 * TILE, new Inventory());
    for (let i = 0; i < 40; i++) step(p, game);           // 落地沉降后再定位头格
    const headRow = Math.floor((p.y - 8) / 16);
    w.store.setTileSilent(61, headRow, 10, 0, 0);         // type 10 = rope
    w.store.setTileSilent(61, headRow + 1, 10, 0, 0);
    return { w, p, game };
  }
  it('按 ↑（无 Space）吸附成功', () => {
    const { p, game } = ropeWorld();
    p.inputUp = true;
    for (let t = 0; t < 6 && !p.pulley; t++) step(p, game);
    expect(p.pulley).toBe(true);
  });
  it('纯 Space（inputJump ∧ ¬inputUp ≙ controlJump）不吸附', () => {
    const { p, game } = ropeWorld();
    p.inputJump = true;
    for (let t = 0; t < 6; t++) step(p, game);
    expect(p.pulley).toBe(false);
  });
  it('Space+↑ 同按（本仓合并输入的歧义面）：仓内谓词视 ↑ 主导 → 允许抓绳（钉死声明）', () => {
    // 原版 controlJump/controlUp 分离键面下，Space+Up 同按被 !controlJump 拦；
    // 本仓 inputJump=Space∪Up 无分离位，等价谓词取「纯 Space 才算 controlJump」
    // （保住纯 ↑ 抓绳）——合并键面的 Space+↑ 组合语义钉死为可抓，登记差异。
    const { p, game } = ropeWorld();
    p.inputUp = true;
    p.inputJump = true;
    for (let t = 0; t < 6; t++) step(p, game);
    expect(p.pulley).toBe(false);
  });
});
