// ★BJ-C6（2026-10-06）红蓝 R6 NPC 批 findings 清偿 F1/F2/F3/F4/F5/F7——判别面测试。
//  判例锚（反编译 Terarria1457/Terraria/ 唯一标杆,动刀前逐件亲读定谳）：
//  · F1 TownNPC.hurt 9999 静默门补 owner 维度——NPC.cs:82065
//      `bool flag = Damage >= 9999 && owner == 255`（StrikeNPC_Inner）：owner=255
//      （StrikeNPCNoInteraction :82012 缺省/hostile·陷阱弹 Projectile.cs:13702
//      `ownedBySomeone ? owner : 255` 反相位）→ 静默;玩家来源 owner=玩家位 → 照飘。
//      本仓 owner 255 位承载 = !fromPlayer（hitTownNpcs source==='playerProj' 传真;
//      pendingStrikeOwner 远端通道对 TownNPC 结构性缺位——netApplyStrike 只扫
//      enemies 桶,访客城镇 NPC=Enemy 傀儡）→ 静默 = dmg≥9999 ∧ !fromPlayer。
//      force 通道（毁灭派对 Game.ts:11731 / DoT / 圣诞自灭 / 出界面 F3 调用尾参
//      恒 (…,false,true)）保持静默。判别面=R6 原文：城镇 9999 fromPlayer 照飘 /
//      142 圣诞自灭+毁灭派对静默。
//  · F2 Arrow.ts 弹 283（VenomBullet Kill :77513-77580 三连 Damage() 重结算）小动物
//      支补全参——原版 Damage() 单趟 victim 循环对小动物（=NPC）与敌怪同链同参
//      （banner/穿甲/DPS 计/免疫窗全同面）→ 与敌怪支 :4320 同构（banner+settlePen+
//      pierce=1+fromPlayer=true）;旧单参 shim 退役。
//  · F3 城镇 NPC 出界致死面——NPC.UpdateNPC :91439-91442
//      `aiStyle==7 && position.Y > Main.bottomWorld-640f+height && netMode!=1 →
//      StrikeNPCNoInteraction(9999,0,0)`。此前 repo 无此面=出界恒坠落滞留。
//  · F4 bossAI_dd2.ts 荷兰飞盗船注释锚勘正（1456 树 :40918-41028 → 1457 :39245-39355,
//      自毁 :39275 StrikeNPCNoInteraction(9999)）——行为 1:1 仅注释漂移,无判别测试。
//  · F5 图鉴 dummy 宝箱怪段位——NPC.cs:74303
//      `ai[3]==2f || (IsABestiaryIconDummy && type==85) → frame.Y += num*6`：type 85
//      图鉴 dummy 显暗影箱段（基帧 0+6,纯视觉）;341/629 无此特例照旧段首帧 0。
//  · F7（台账口径备注,无代码刀）：宝箱怪尘域无独立测试文件=bj479 承载——
//      AI_025 命中尘段位判定（ai3 锁定值）在 tests/bj484-mimic-family-dust.test.ts
//      以 NpcHitDust 表达式承载,不另立文件。
//  变异证红契约（≥4 发→恰红,逐字节还原+sha256 对拍）：
//   M1 F1 门去 !fromPlayer（还原 unconditional）→ ①a 红
//   M2 F1 门恒飘（strikeSilent=false）→ ①b/①d-hostile/①e 红
//   M3 F3 出界面整块移除 → ③红
//   M4 F2 还原单参 shim → ②红
//   M5 F5 还原 aiStyle25 恒 0 → ④红
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { hitTownNpcs } from '../src/entities/projTargets';
import { Arrow } from '../src/entities/Arrow';
import { bestiaryDummyFrameIdx } from '../src/render/Renderer';
import { TILE } from '../src/core/constants';

// ---- 公共桩 ----------------------------------------------------------------

/** 记录型 GameHooks（TownNPC.hurt / fixedUpdate 首拍消费面） */
function mkGame(w: World, floats: number[] = []): never {
  return {
    world: w,
    player: { dead: true, hp: 100, maxHp: 100, x: -9999, y: -9999, w: 0, h: 0 },
    addDamageNumber: (_x: number, _y: number, amt: number) => { floats.push(amt); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    spawnDust: () => null, playSfxFile: () => {},
    critters: () => [], enemies: () => [], npcs: () => [],
    behavioLog: () => {}, recLog: () => {},
  } as never;
}

const guide = (x = 100 * 16, y = 90 * 16) => new TownNPC('guide', x, y);

// ---- ① F1：TownNPC.hurt 9999 静默门 owner 维度（NPC.cs:82065） ----------------

describe('BJ-C6 F1：TownNPC.hurt 9999 静默门 = dmg≥9999 ∧ !fromPlayer', () => {
  it('①a fromPlayer=true 9999 → 照飘（原版 owner=玩家位,flag 假 → CombatText 发射）', () => {
    const w = new World(200, 200, 110, 'bj541-f1a');
    const floats: number[] = [];
    const n = guide(100 * 16, 90 * 16);
    const ok = n.hurt(9999, 0, 0, mkGame(w, floats), 0, 0, false, false, true, 0);
    expect(ok).toBe(true);
    expect(n.dead).toBe(true);
    // dmg = trunc((9999 + 0 − def30×0.5) × 1) = 9984（向导 def=30,vanilla-npcs 表）
    expect(floats).toEqual([9984]);                      // ★判别位：照飘
  });

  it('①b force 通道（毁灭派对 Game.ts:11731 / DoT / 圣诞自灭调用尾参 …,false,true）→ 静默', () => {
    const w = new World(200, 200, 110, 'bj541-f1b');
    const floats: number[] = [];
    const n = guide(100 * 16, 90 * 16);
    const ok = n.hurt(9999, -n.facing * 10, 0, mkGame(w, floats), 0, 0, false, true);
    expect(ok).toBe(true);
    expect(n.dead).toBe(true);
    expect(floats).toEqual([]);                          // ★判别位：owner255 静默
  });

  it('①c 9998（<9999 边界）force 通道 → 照飘（门=≥9999 非精确匹配,BJ476 同族防再窄化）', () => {
    const w = new World(200, 200, 110, 'bj541-f1c');
    const floats: number[] = [];
    const n = guide(100 * 16, 90 * 16);
    n.hurt(9998, 0, 0, mkGame(w, floats), 0, 0, false, true);
    expect(n.dead).toBe(true);
    expect(floats).toEqual([9983]);                      // trunc(9998−15)=9983
  });

  it('①d hitTownNpcs 接线：playerProj（318 臭鸡蛋窄门例外）照飘 / hostile（owner255）静默', () => {
    // 玩家弹支：318 无条件过巫毒窄门（:11971 flag |= type==318）
    const wP = new World(200, 200, 110, 'bj541-f1d-p');
    const nP = guide(100 * 16, 90 * 16);
    const floatsP: number[] = [];
    const gP = {
      world: wP,
      player: { dead: true, x: -9999, y: -9999, w: 0, h: 0 },
      addDamageNumber: (_x: number, _y: number, amt: number) => { floatsP.push(amt); },
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      critters: () => [], enemies: () => [], npcs: () => [nP],
    } as never;
    const hitP = hitTownNpcs({ x: nP.x - 4, y: nP.y - 4, w: nP.w + 8, h: nP.h + 8 },
      gP, 9999, 0, 'playerProj', 318);
    expect(hitP).toBe(true);
    expect(floatsP).toEqual([9984]);                     // ★playerProj 照飘（9999−def30×0.5）

    // 敌怪弹支：fromPlayer=false → owner255 静默
    const wH = new World(200, 200, 110, 'bj541-f1d-h');
    const floatsH: number[] = [];
    const nH = guide(100 * 16, 90 * 16);
    const gH = {
      world: wH,
      player: { dead: true, x: -9999, y: -9999, w: 0, h: 0 },
      addDamageNumber: (_x: number, _y: number, amt: number) => { floatsH.push(amt); },
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      critters: () => [], enemies: () => [], npcs: () => [nH],
    } as never;
    const hitH = hitTownNpcs({ x: nH.x - 4, y: nH.y - 4, w: nH.w + 8, h: nH.h + 8 },
      gH, 9999, 0, 'hostile', 283);
    expect(hitH).toBe(true);
    expect(nH.dead).toBe(true);
    expect(floatsH).toEqual([]);                         // ★hostile（owner255）静默
  });

  it('①e Santa 142 季末自灭（AI_007 :53708）→ 死 + 静默（R6 判别面「142 圣诞自灭」）', () => {
    const w = new World(200, 200, 110, 'bj541-f1e');
    (w.clock as unknown as { xMas: boolean }).xMas = false;   // 季窗外（checkXMas 关）
    const floats: number[] = [];
    const npc = new TownNPC('santa_claus', 100 * 16, 90 * 16);
    try {
      (npc as unknown as { fixedUpdate: (dt: number, g: never) => void })
        .fixedUpdate(1 / 60, mkGame(w, floats));
    } catch {
      // 自灭臂在 fixedUpdate 头部（AI 之前）;后续 AI 走空世界缺面可容忍
    }
    expect(npc.dead).toBe(true);
    expect(floats).toEqual([]);                          // ★静默清算（owner255）
  });
});

// ---- ② F2：弹 283 小动物支全参（与敌怪支同构） -------------------------------

describe('BJ-C6 F2：Arrow 283 Kill 三段重结算——critter 支 banner+settlePen+pierce1+fromPlayer', () => {
  it('critter.hurt 收 8 参全形（args[7]===true 判别位;banner 空档 dmg 直通）', () => {
    const w = new World(200, 200, 110, 'bj541-f2');
    const calls: unknown[][] = [];
    const a = new Arrow(100 * TILE, 180 * TILE, 2, 6, 500, 3, 283, {});
    // 小动物盒中心 = 弹中心右偏 10px（seg0=R283 圆心,sign(ccx−seg.cx)=1 → kb=3）
    const critter = {
      x: a.x + a.w / 2 - 8 + 10, y: a.y + a.h / 2 - 6, w: 16, h: 12,
      dead: false, vanillaId: 46,
      hurt: (...args: unknown[]) => { calls.push(args); return true; },
    };
    const game = {
      world: w,
      player: { dead: true, x: -9999, y: -9999, w: 0, h: 0 },
      spawnDust: () => null, playSfxFile: () => {},
      enemies: () => [], critters: () => [critter],
    } as never;
    (a as unknown as { killNow: (g: never) => void }).killNow(game);
    // 仅 seg0 覆盖（seg1/seg2 沿弹向步进 60/120px,盒半径 48 不可达 → 单命中）
    expect(calls.length).toBe(1);
    const args = calls[0] as unknown as
      [number, number, number, unknown, number, boolean, number, boolean];
    expect(args.length).toBe(8);                         // ★旧单参 shim=4 参 → 恰红
    expect(args[0]).toBe(500);                           // banner 空档（无 bannerNpcActive）直通
    expect(args[1]).toBe(3);                             // sign(+10)×knockback3
    expect(args[2]).toBe(0);
    expect(args[3]).toBe(game);
    expect(args[4]).toBe((a as unknown as { settlePen: number }).settlePen);
    expect(args[5]).toBe(false);                         // crit 掷不在此支（与敌怪支同形）
    expect(args[6]).toBe(1);                             // pierce=1 单发弹免疫窗豁免
    expect(args[7]).toBe(true);                          // ★fromPlayer=true（F2 主判别位）
  });
});

// ---- ③ F3：城镇 NPC 出界致死面（NPC.UpdateNPC :91439-91442） -----------------

describe('BJ-C6 F3：城镇 NPC 出界（y > bottomWorld−640+height）→ StrikeNPCNoInteraction(9999)', () => {
  it('出界（200t 世界:bottomWorld=3200,阈值=2560+h）→ 当拍死 + 静默', () => {
    const w = new World(200, 200, 110, 'bj541-f3a');
    const floats: number[] = [];
    const n = guide(100 * 16, 3200 - 640 + 40 + 100);    // 阈值下 100px
    expect(n.dead).toBe(false);
    (n as unknown as { fixedUpdate: (dt: number, g: never) => void })
      .fixedUpdate(1 / 60, mkGame(w, floats));
    expect(n.dead).toBe(true);                           // ★整缺面补齐（出界不再滞留）
    expect(floats).toEqual([]);                          // ★StrikeNPCNoInteraction owner255 静默
  });

  it('阈值等号（y == bottomWorld−640+height）不触发（原版严格 >）——NPC 照常存活', () => {
    const w = new World(200, 200, 110, 'bj541-f3b');
    const n = guide(100 * 16, 3200 - 640 + 40);
    try {
      (n as unknown as { fixedUpdate: (dt: number, g: never) => void })
        .fixedUpdate(1 / 60, mkGame(w));
    } catch {
      // 正常位 NPC 会继续跑 AI_007（空世界桩缺面可容忍）;守卫位=出界面已过
    }
    expect(n.dead).toBe(false);
  });
});

// ---- ④ F5：图鉴 dummy 宝箱怪段位（NPC.cs:74303） -----------------------------

describe('BJ-C6 F5：bestiaryDummyFrameIdx aiStyle25——type85 dummy=暗影箱段（+6）', () => {
  it('85：任意 t 恒段 6（基帧 0 + num×6,frames=18 表内合法）;341/629 无特例恒 0', () => {
    for (const t of [1, 7, 30, 120]) {
      expect(bestiaryDummyFrameIdx(85, 25, t, 0, 18, false)).toBe(6);   // ★暗影箱段
      expect(bestiaryDummyFrameIdx(341, 25, t, 0, 6, false)).toBe(0);
      expect(bestiaryDummyFrameIdx(629, 25, t, 0, 6, false)).toBe(0);
    }
  });
});
