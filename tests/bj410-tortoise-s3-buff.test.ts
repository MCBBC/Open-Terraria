import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// BJ410-S3 陆龟 AI 强化债收刀判别面（2026-09-30,Q2/R3 登记的态 3 强化主面 +
// 飞行重叠阻尼门 + 三条冗余定谳的 417 seekDirX 面）。
//
// 定谳锚（Terarria1457 唯一标杆,亲读）：
//   S3#1 态 3 每 tick 伤害/防御强化（NPC.cs:29624-29630）：num616=2 全域缺省
//     |1.5（496/497 :29625-29628 系数亲读）;damage = GetAttackDamage_LerpBetween-
//     FinalValues(defDamage×num616, ×num616×0.9)（:7074 = Utils.Remap Classic→
//     Expert 截断,≥Expert 取右值——经典 ×2/专家 ×1.8,496/497 ×1.5/×1.35）;
//     defense = defDefense×2。基准 = ScaleStats 后 defDamage/defDefense（非现值,
//     防复利）;态 4/5 无复位写点（值残留,原版同相）→ 态 0 复位（R3#1 机构）
//     =逐拍解除点。417 经 wet 转态 3（:29855-29858）无型门同落。
//   S3#2 飞行重叠阻尼门（:29672-29680,两段【串行】if 非互斥）：
//     X 重叠（盒对盒,无容差——旧 |dx|<(w1+w2)/2+8 的 +8=自造,退位）∧ Y 门
//     npc 顶<玩家底（:29672 第三连项,旧缺）→ vx×0.8/ai[3]=0/vy<0→+0.2（旧缺）;
//     ai[3]≠0 → vx=ai[3]+vy−=0.22。★旧 if/else 在 ai[3]==0 时照写 vx=0+vy−=0.22
//     =无源上推偏差（串行序修正）。
//   S3#3 三冗余定谳（落注为主,判别锁其可观察半面）：
//     a) 态 1→3 转态 TargetClosest（:29599）——朝向在下拍弹射拍重调（:29635/
//        :29781）消费前零读点=行为面无差;本仓非 417 支省略=等价（对照锁:
//        非 417 转态拍不改 facing）。
//     b) 态 3→4 noGravity=false（:29688）——SetDefaults 153/154 显式 false
//        （:10972/:10990）、496/497/417 缺省 false、aiStyle 39 全域无 true 写点
//        =恒空操作;本仓省略=等价（无行为面,不设判别）。
//     c) 417 sroller raw sign——417 可达的 TargetClosest 五位点：entry :29339
//        =分发级 targetClosest 选段（本仓架构,朝向由态 0 头 sign(vx) 消费）/
//        justHit :29397 原版排 417（本仓 :7123 同门）/ :29599 态 1→6（已对齐
//        seekDirX）/ :29635 wet 转态 3 弹射（R3#2c 已 seekDirX）/ :29781 态 6
//        弹射（本刀对齐）/ :29850 态 5 复位（R3#3 已 seekDirX）——收刀面 =
//        :29599/:29781 两点的 aggro 不转身门（:78553）/confused 反转（:78577）。
//
// 判别面（每面一发;变异基线见文件尾注）。

const T = 16;

function world70() {
  return new World(80, 80, 42, 'open');
}

function playerMock(x: number, yFloorPx: number) {
  return {
    x: x - 10, y: yFloorPx - 42, w: 20, h: 42,
    cx: x, cy: yFloorPx - 21, dead: false, useTime: 0,
  };
}

function hooksFor(w: World, player: ReturnType<typeof playerMock>) {
  return {
    world: w,
    player,
    playSfx: () => {}, playSfxWav: () => {}, playSfxFiles: () => {},
    addDamageNumber: () => {}, spawnParticles: () => {},
    enemies: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0,
    entities: { add: () => {} },
  } as never;
}

function flatHooks(player: ReturnType<typeof playerMock>) {
  const w = world70();
  for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 60, 2);
  return { w, hooks: hooksFor(w, player), player };
}

type PlayerMock = ReturnType<typeof playerMock>;
type Hooks = ReturnType<typeof hooksFor>;

function driveOnce(e: Enemy, hooks: Hooks, player: PlayerMock) {
  (e as unknown as { tortoiseAI: (g: unknown, p: PlayerMock) => void }).tortoiseAI.call(e, hooks, player);
}

describe('BJ410-S3#1: 态 3 伤害/防御强化（NPC.cs:29624-29630）', () => {
  it('154 经典档:态 3 拍 damage=trunc(base×2)/defense=base×2（旧:无强化写点=红）', () => {
    const player = playerMock(52 * T, 60 * T);          // 远离（无重叠,纯强化面）
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    driveOnce(e, hooks, player);                        // aiInit 捕获基准（先于强化）
    const base = e.tortoiseDefBase!;
    expect(base.dmg).toBeGreaterThan(0);
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 1; e.vx = 1; e.vy = 0;   // 弹射后飞行拍（else 支）
    driveOnce(e, hooks, player);
    expect(e.def.damage).toBe(Math.trunc(base.dmg * 2));   // 经典 ×2（旧:base.dmg 红）
    expect(e.def.defense).toBe(base.def * 2);              // ×2（旧:base.def 红）
    expect(e.def.damage).toBeGreaterThan(base.dmg);
  });

  it('154 专家档取右值 ×1.8（Remap 钳）;496 系数亲读面 ×1.5/×1.35（:29625-29628）', () => {
    {  // 154 专家:trunc(base×1.8)（旧:恒经典值红）
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
      driveOnce(e, hooks, player);
      const base = e.tortoiseDefBase!;
      e.difficulty = 2;
      e.ai0 = 3; e.ai1 = 5; e.ai3 = 1; e.vx = 1; e.vy = 0;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(Math.trunc(base.dmg * 1.8));
      expect(e.def.defense).toBe(base.def * 2);
    }
    {  // 496 经典 ×1.5（非陆龟缺省 ×2——系数位判别）
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(496, 40 * T, 59 * T)!;
      driveOnce(e, hooks, player);
      const base = e.tortoiseDefBase!;
      e.ai0 = 3; e.ai1 = 5; e.ai3 = 1; e.vx = 1; e.vy = 0;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(Math.trunc(base.dmg * 1.5));
      expect(e.def.defense).toBe(base.def * 2);
    }
    {  // 496 专家 ×1.35（=×1.5×0.9 右值）
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(496, 40 * T, 59 * T)!;
      driveOnce(e, hooks, player);
      const base = e.tortoiseDefBase!;
      e.difficulty = 3;                                    // 大师=Remap 钳 Expert 值
      e.ai0 = 3; e.ai1 = 5; e.ai3 = 1; e.vx = 1; e.vy = 0;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(Math.trunc(base.dmg * 1.35));
    }
  });

  it('强化/卸载联动:态 4/5 值残留（原版无复位写点）→ 态 0 一拍卸载（R3#1 机构同拍互验）', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    driveOnce(e, hooks, player);
    const base = e.tortoiseDefBase!;
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 1; e.vx = 1; e.vy = 0;
    driveOnce(e, hooks, player);
    expect(e.def.damage).toBe(Math.trunc(base.dmg * 2));
    {  // 态 4:值残留（旧:若有复位写点会提前卸载=红;亦锁本刀不越态写）
      e.ai0 = 4; e.ai2 = 0.5; e.vy = 0;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(Math.trunc(base.dmg * 2));
      expect(e.def.defense).toBe(base.def * 2);
    }
    {  // 态 5:仍残留
      e.ai0 = 5; e.ai1 = 0; e.vy = 0;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(Math.trunc(base.dmg * 2));
    }
    {  // 态 0:R3#1 复位机构逐拍解除（投毒面同型——强化态回 0 卸载）
      e.ai0 = 0; e.ai1 = 0; e.vy = 0;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(base.dmg);
      expect(e.def.defense).toBe(base.def);
    }
  });

  it('def 复利防线:连拍态 3 值稳定在 ×2 档（基准=首拍快照,非现值）', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    driveOnce(e, hooks, player);
    const base = e.tortoiseDefBase!;
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 1; e.vx = 1; e.vy = 0;
    driveOnce(e, hooks, player);
    driveOnce(e, hooks, player);
    driveOnce(e, hooks, player);
    expect(e.def.damage).toBe(Math.trunc(base.dmg * 2));   // ×2 复利=红
    expect(e.def.defense).toBe(base.def * 2);
  });
});

describe('BJ410-S3#2: 态 3 飞行重叠阻尼门（NPC.cs:29672-29680）', () => {
  // 半空出生（y=20*T,同 R3#2a 先例）隔离 tile 碰撞对 vy 的污染;断言仅此拍。
  it('a) Y 门:玩家整体悬在上方（盒底≤龟顶）→ 不阻尼,vx=ai3 续航+vy−=0.22（旧:阻尼+ai3 归零=红）', () => {
    const player = playerMock(52 * T, 60 * T);            // 基准 hooks（玩家位下置覆写）
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 20 * T)!;    // 中心出生→盒 y=304..336
    driveOnce(e, hooks, player);
    const above = { ...playerMock(40 * T + 4, 0), y: 230, cy: 251 };  // 盒底 272<龟顶 304,X 重叠 634..654∩617..663
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 1.5; e.vx = 1.5; e.vy = -0.1;
    driveOnce(e, hooks, above);
    expect(e.x + e.w).toBeGreaterThan(above.x);           // X 重叠前提成立
    expect(e.y).toBeGreaterThanOrEqual(above.y + above.h); // Y 门假（玩家整体在上）
    expect(e.vx).toBeCloseTo(1.5, 6);                      // 续航=ai3 原值（旧:×0.8=1.2 红）
    expect(e.ai3).toBeCloseTo(1.5, 6);                     // 未归零（旧:0 红）
    expect(e.vy).toBeCloseTo(-0.1 - 0.22 + 0.3, 5);        // 续航上推+干重力 0.3（:91879 ENEMY_GRAVITY;旧:+0.1 红）
  });

  it('b) X 无容差:X 间隙 4px（旧 +8 容差内）→ 不阻尼（旧:|dx|<+8 阻尼=红）', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 20 * T)!;     // 中心出生→盒 x=617..663,cx=640
    driveOnce(e, hooks, player);
    const aside = { ...playerMock(677, 60 * T), y: 310, cy: 331 };  // x=667..687（间隙 4px）,cx=677,Y 门真
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 1.5; e.vx = 1.5; e.vy = -0.1;
    driveOnce(e, hooks, aside);
    expect(e.x + e.w).toBeLessThanOrEqual(aside.x);        // 盒对盒不重叠（4px 间隙:663→667）
    expect(e.vx).toBeCloseTo(1.5, 6);                      // 旧:|dx|=37<41 容差内阻尼 1.2 红
    expect(e.ai3).toBeCloseTo(1.5, 6);
  });

  it('c) 全重叠+vy<0:vx×0.8/ai3 归零/vy 托升 +0.2（旧缺托升臂=红）', () => {
    const player = { ...playerMock(650, 60 * T), y: 310, cy: 331 };  // x=640..660 与盒 617..663 重叠,Y 门真
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 20 * T)!;
    driveOnce(e, hooks, player);
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 1.5; e.vx = 1.5; e.vy = -0.1;
    driveOnce(e, hooks, player);
    expect(e.vx).toBeCloseTo(1.2, 6);                      // ×0.8
    expect(e.ai3).toBe(0);                                 // 归零
    expect(e.vy).toBeCloseTo(-0.1 + 0.2 + 0.3, 5);         // 托升+0.2 后干重力+0.3（旧:缺托升=0.2 红）
  });

  it('d) 串行序:ai3==0 且无重叠 → vx/vy 双不动（旧 else 支无源上推 vx=0+vy−=0.22=红）', () => {
    const player = playerMock(52 * T, 60 * T);             // 远离
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 20 * T)!;
    driveOnce(e, hooks, player);
    e.ai0 = 3; e.ai1 = 5; e.ai3 = 0; e.vx = 1; e.vy = 0;
    driveOnce(e, hooks, player);
    expect(e.vx).toBeCloseTo(1, 6);                        // 旧:ai3(0) 覆写=0 红
    expect(e.vy).toBeCloseTo(0.3, 5);                      // 纯干重力 0.3（旧:无源上推 −0.22+0.3=0.08 红）
  });
});

describe('BJ410-S3#3c: 417 sroller TargetClosest 位点 seekDirX 对齐（:29599/:29781）', () => {
  const gatedPlayer = () => ({ ...playerMock(52 * T, 60 * T), itemAnimTicks: 0, aggro: -100 });

  it('态 6 弹射拍 aggro 不转身门（:78553）:潜行玩家不回头（旧 raw sign→+1 红）', () => {
    const player = gatedPlayer();
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(417, 40 * T, 924)!;
    driveOnce(e, hooks, player);
    e.hadTarget = true;                                    // 原版 oldTarget≥0（:78550 flag）
    e.ai0 = 6; e.ai1 = 0; e.facing = -1;                   // 玩家在右、龟朝左
    driveOnce(e, hooks, player);
    expect(e.ai0).toBe(6);
    expect(e.ai1).toBe(1);                                 // 弹射拍已走（位点在场）
    expect(e.facing).toBe(-1);                             // 门保向（旧:+1 红）
  });

  it('态 6 弹射拍 confused 反转（:78577）:面右反转朝左（旧 raw sign→+1 红）', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(417, 40 * T, 924)!;
    driveOnce(e, hooks, player);
    e.confusedT = 30;
    e.ai0 = 6; e.ai1 = 0; e.facing = 1;
    driveOnce(e, hooks, player);
    expect(e.facing).toBe(-1);                             // -sign(dx)（旧:+1 红）
  });

  it('态 1→6 转态拍（:29599）同款 aggro 门+罐装高度面（位点身份锁）', () => {
    const player = gatedPlayer();
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(417, 40 * T, 924)!;
    driveOnce(e, hooks, player);
    e.hadTarget = true;
    e.ai0 = 1; e.ai1 = 29; e.facing = -1; e.vx = 0; e.vy = 0;
    driveOnce(e, hooks, player);
    expect(e.ai0).toBe(6);                                 // 转态已发生（位点在场）
    expect(e.h).toBe(32);                                  // 罐装 52→32（身份锁）
    expect(e.facing).toBe(-1);                             // 门保向（旧:+1 红）
  });

  it('S3#3a 对照锁:非 417 态 1→3 转态拍不写朝向（:29599 冗余=省略等价）', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    driveOnce(e, hooks, player);
    e.ai0 = 1; e.ai1 = 29; e.facing = -1; e.vx = 0; e.vy = 0;
    driveOnce(e, hooks, player);
    expect(e.ai0).toBe(3);                                 // 转态
    expect(e.facing).toBe(-1);                             // 冗余点省略=朝向不动（弹射拍下拍才面）
  });
});

// 变异基线（逐字节还原+sha256 对拍后自证）：
//   去 S3#1 强化写点 → S3#1 全组红;num616 回 2 恒定 → 496 两发红;
//   基准回 this.def.damage 现值 → 复利防线红;去态 0 复位（R3#1）→ 卸载联动红。
//   Y 门去第三连项 → a 红;+8 容差复活 → b 红;托升臂去 → c 红;串行回 if/else → d 红。
//   seekDirX 回 raw sign → ③c 三发红;非 417 支补写点 → ③a 对照锁红。
