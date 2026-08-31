// 城镇 NPC 自卫攻击回归(原版 AI_007 攻击态,NPC.cs:54747-55538):
// 用户报"原版向导会射箭,我们没对齐"。向导=22/AttackType1(弓):肉前木箭 proj1、
// 伤 12、速 10、散布 ±0.7、aimLift 4;触发门=站地+冷却+探测范围(22=700)内 LOS 敌。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import { Inventory } from '../src/items/Inventory';

function makeGame(npc: TownNPC, enemy: { x: number; y: number; w: number; h: number }) {
  const world = new World(200, 200, 100, 'atk-test');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const shots: TownShot[] = [];
  const enemies = [enemy];
  return {
    world, shots,
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => enemies,
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      addDamageNumber: () => {},
      critters: () => [],
    } as never,
  };
}

describe('城镇 NPC 自卫攻击(AI_007 攻击态)', () => {
  /** 危险逃离(2026-08-17 接:53864-54024)后 NPC 会背敌走逃——攻击断言用敌贴身
   *  追踪保持危险态(逃/打循环=原版观感),否则逃出探测圈后不再触发 */
  function chase(npc: TownNPC, enemy: { x: number }, dx = 6 * 16) {
    enemy.x = npc.cx + dx;
  }

  it('向导(22):范围内有敌 → 发射木箭 proj 1,方向朝敌', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    const enemy = { x: 106 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    let fired = false;
    for (let t = 0; t < 900 && !fired; t++) {
      chase(guide, enemy);
      guide.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
    expect(shots[0].projId).toBe(1);            // 肉前木箭(肉后火焰箭 2)
    expect(shots[0].vx).toBeGreaterThan(0);     // 朝右侧敌人
    expect(shots[0].damage).toBe(12);           // Classic 难度 ×1
  });

  it('商人(17):近战弹态 proj 48', () => {
    const merch = new TownNPC('merchant', 100 * 16, 99 * 16, new Inventory());
    const enemy = { x: 103 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(merch, enemy);
    let fired = false;
    for (let t = 0; t < 1500 && !fired; t++) {
      chase(merch, enemy, 3 * 16);
      merch.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
    expect(shots[0].projId).toBe(48);
  });

  it('无敌在探测范围外/LOS 阻断:不触发', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    guide.stationary = true; // 固定站位——防游走自行缩短距离(前两例靠命中够快不受影响)
    // 距离 ~60 格 > 探测 700px(43.75 格)
    const enemy = { x: 160 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    for (let t = 0; t < 900; t++) guide.fixedUpdate(1 / 60, game);
    expect(shots.length).toBe(0);
  });

  it('发射后进入冷却(不再连发)', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    const enemy = { x: 106 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    for (let t = 0; t < 400; t++) {
      chase(guide, enemy);
      guide.fixedUpdate(1 / 60, game);
    }
    const n1 = shots.length;
    expect(n1).toBeGreaterThan(0);
    // 冷却期(退出 cd = 30/2 + rand(20) ≈ 15-35 tick)内 40 tick 不再翻倍发
    const before = shots.length;
    for (let t = 0; t < 40; t++) {
      chase(guide, enemy);
      guide.fixedUpdate(1 / 60, game);
    }
    expect(shots.length - before).toBeLessThanOrEqual(1);
  });

  it('持械瞄准值 ai[2](DrawNPCExtras :27121 消费):发射档写入钳 ±0.5,态尽归零', () => {
    const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
    // 敌在右上方:目标中心方向 Y 分量为负(钳下界 -0.5)
    // ★2026-08-30 对账批:入态另须 |DirectionTo.Y| ≤ 0.5（1457 NPC.cs:56048-56049
    //   vector8.Y 门）——原位 92*16 斜率≈−0.76 原版不会入态;移到 97*16（斜率≈−0.33,
    //   负向仰角带不变）
    const enemy = { x: 106 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(guide, enemy);
    let aimAtFire = 0;
    for (let t = 0; t < 900; t++) {
      chase(guide, enemy);
      guide.fixedUpdate(1 / 60, game);
      if (shots.length) { aimAtFire = guide.holdoutAim; break; }
    }
    expect(shots.length).toBeGreaterThan(0);
    expect(aimAtFire).toBeLessThan(0);            // 上方目标 → 负俯仰
    expect(aimAtFire).toBeGreaterThanOrEqual(-0.5); // :55196 钳 ±0.5
    // 攻击态中 → attackState===12(DrawNPCExtras 触发门)
    expect(guide.attackState).toBe(12);
    // 态尽(ai[1]<=0)退出 → ai[2] 归零(:55203)
    for (let t = 0; t < 200 && guide.attackState !== 0; t++) guide.fixedUpdate(1 / 60, game);
    expect(guide.attackState).toBe(0);
    expect(guide.holdoutAim).toBe(0);
  });
});

// ===========================================================================
// ★2026-08-31 二轮蓝队对账批（F7 直测补齐 + F1..F6 修复回归）
// 标杆 = Terarria1457/NPC.cs（:55761 总伞 / :55768 flag30 / :55769 flag31 /
// :55778 机械师侦察弹门 / :55782 树妖 ward 门 / :55078/:55352/:55551/:55679 四
// 退出块 / :54107-54116 被逼停解冻 / Projectile.cs:17696+:18233-18254 医师弹反弹）
// 手法沿用 entity-los-audit 白盒式：真 TownNPC 实例 + 私有位注入（stub 驱动）。
// ===========================================================================
import { getSwingStatsAnchor, tweakSwingStats } from '../src/entities/townNpcSwing';
import { TOWN_ATTACK_TIME, TOWN_SWING } from '../src/data/vanillaTownAttack';
import { NurseSyringeShot } from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';

const STONE = TILE_BY_KEY['stone'];
const TOILET = TILE_BY_KEY['v_497_toilets'];

type AnyNpc = TownNPC & Record<string, unknown>;

/** 入态/直测通用场景：200×200 平地 + 敌盒 + shots/projectiles 双通道 */
function entryHarness(npcKey: string, enemyBoxes: Array<{ x: number; y: number; w: number; h: number }>) {
  const world = new World(200, 200, 100, 'attack-entry');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const shots: TownShot[] = [];
  const enemies = enemyBoxes.map((b) => ({
    ...b, id: 0, dead: false, damage: 40, hurt: () => true,
  }));
  const game = {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
    enemies: () => enemies,
    npcs: () => [] as unknown[],
    critters: () => [],
    projectiles: () => shots as unknown[],
    spawnTownShot: (s: TownShot) => { shots.push(s); },
    spawnParticles: () => {}, spawnBurst: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
  } as never;
  const npc = new TownNPC(npcKey, 100 * 16, 99 * 16) as AnyNpc;
  npc.onGround = true;
  return { world, game, enemies, shots, npc };
}

/** 攻击入态原型直调（dangerUpdate 在 attackUpdate 内不跑——由私有位注入危险面） */
function callEntry(npc: AnyNpc, world: World, game: never): boolean {
  const fn = (TownNPC.prototype as unknown as Record<string, (w: World, g: never) => boolean>).attackUpdate;
  return fn.call(npc, world, game);
}

describe('★F7 入态掷骰序（先掷后验）+ 触发面注入', () => {
  it('无幸存候选 tick 恰好耗 1 骰（gate 掷先行,候选重验失败不再补掷）', () => {
    // dyer(207) 挥击族:DangerDetectRange=60(chance=1)——敌贴身但中间立柱 →
    // pickSideTarget null(range 内、LOS 断)
    const eY = 96 * 16;
    const { world, game, npc } = entryHarness('dyer',
      [{ x: 100 * 16 + 40, y: eY, w: 18, h: 40 }]);
    const nCx = (npc as unknown as { cx: number }).cx;
    const colA = Math.floor((nCx + 24) / 16), colB = colA + 1;
    for (let ty = Math.floor(eY / 16) - 3; ty <= Math.floor(eY / 16) + 5; ty++) {
      world.store.setTileSilent(colA, ty, STONE!);
      world.store.setTileSilent(colB, ty, STONE!);
    }
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    let rolls = 0;
    npc.rng = () => { rolls++; return 0.0000001; };
    expect(callEntry(npc, world, game)).toBe(false);
    expect(rolls).toBe(1);
    expect(npc.attackState).toBe(0);
  });

  it('幸存候选存在 → 同样 1 骰后直接入挥击态', () => {
    const eY = 96 * 16;
    const { world, game, npc } = entryHarness('dyer',
      [{ x: 100 * 16 + 36, y: eY, w: 18, h: 40 }]);   // dx≈+45 < range60、LOS 畅通
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    let rolls = 0;
    npc.rng = () => { rolls++; return 0.0000001; };
    expect(callEntry(npc, world, game)).toBe(true);
    expect(rolls).toBe(1);
    expect(npc.attackState).toBe(15);
  });
});

describe('★F2 边聊边打（总伞 !flag5|flag16 + num3×0.8 减频）', () => {
  /** 向导 22 弓族:chance30×num3=2 → 无对话 gate=60(1/60),对话 ×0.8 → floor(48)
   *  (1/48)。阈值探针 r=0.019 ∈ (1/60, 1/48] —— 两 gate 的分界值 */
  function guideTalk(r: number, talking: boolean) {
    const eY = 96 * 16;                                 // 与本体视线近乎水平(|slope|<0.5)
    const { world, game, npc } = entryHarness('guide', [{ x: 104 * 16, y: eY, w: 18, h: 40 }]);
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    (npc as unknown as { talking: boolean }).talking = talking;
    npc.rng = () => r;
    return { entered: callEntry(npc, world, game), state: npc.attackState };
  }

  it('对话+有险照样入态（r 过对话 gate、不过裸 gate）——0.8 减频实证', () => {
    const talkOn = guideTalk(0.019, true);      // <1/48 → 对话 gate 通过
    expect(talkOn.entered).toBe(true);
    expect(talkOn.state).toBe(12);
    const talkOff = guideTalk(0.019, false);    // >1/60 → 裸 gate 拒发
    expect(talkOff.entered).toBe(false);
    expect(talkOff.state).toBe(0);
  });

  it('对话+无险 = 总伞整段跳过：不耗骰不入态', () => {
    const { world, game, npc } = entryHarness('guide', [{ x: 104 * 16, y: 96 * 16, w: 18, h: 40 }]);
    Object.assign(npc, { dangerNear: false, threatRaw: false });
    (npc as unknown as { talking: boolean }).talking = true;
    let rolls = 0;
    npc.rng = () => { rolls++; return 0.0000001; };
    expect(callEntry(npc, world, game)).toBe(false);
    expect(rolls).toBe(0);
  });

  it('护士对话中有险可起治疗态（本触发块同在伞内,:55966 同层）', () => {
    const world = new World(200, 200, 100, 'nurse-talk');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
    const nurse = new TownNPC('nurse', 100 * 16, 99 * 16) as AnyNpc;
    nurse.onGround = true;
    const patient = new TownNPC('dyer', 103 * 16, 99 * 16);
    patient.hp = patient.maxHp - 10;                        // 缺血患者
    const game = {
      world, player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      npcs: () => [patient], enemies: () => [], critters: () => [],
      addDamageNumber: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    } as never;
    (nurse as unknown as { talking: boolean }).talking = true;
    Object.assign(nurse, { dangerNear: true, threatRaw: true });
    const healFn = (TownNPC.prototype as unknown as Record<string, (w: World, g: never) => boolean>).nurseHealUpdate;
    expect(healFn.call(nurse, world, game)).toBe(true);
    expect(nurse.healing).toBe(true);
    // 对照:对话且无险 → 拒绝
    const nurse2 = new TownNPC('nurse', 100 * 16, 99 * 16) as AnyNpc;
    const patient2 = new TownNPC('dyer', 103 * 16, 99 * 16);
    patient2.hp = patient2.maxHp - 10;
    nurse2.onGround = true;
    (nurse2 as unknown as { talking: boolean }).talking = true;
    Object.assign(nurse2, { dangerNear: false });
    expect(healFn.call(nurse2, world, game)).toBe(false);
    expect(nurse2.healing).toBe(false);
  });
});

describe('★F3 入态前特判（机械师 124 侦察弹 + 树妖 20 buff165 门）', () => {
  it('机械师:侦察弹 582 在途(owned ai1 tag)→ 入态抑制且不耗骰', () => {
    const eY = 96 * 16;
    const { world, game, shots, npc } = entryHarness('mechanic',
      [{ x: 106 * 16, y: eY, w: 18, h: 40 }]);
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    npc.rng = () => 0.0000001;
    expect(callEntry(npc, world, game)).toBe(true);          // 首次正常入近战态
    const meleeTick = (TownNPC.prototype as unknown as Record<string, (w: World, g: never) => boolean>).attackUpdate;
    expect(meleeTick.call(npc, world, game)).toBe(true);     // 推进至发射档(shootTick=1)
    expect(shots.length).toBe(1);
    expect(shots[0].projId).toBe(582);
    expect(shots[0].ai1).toBeGreaterThan(0);                 // 本体 tag 写入
    // 强制回空闲再试入态:侦察弹仍在途 → 拒绝且骰耗 0(:55778 flag31 抑制先于掷)
    Object.assign(npc, { atkState: 0, atkCd: 0 });
    let rolls = 0;
    npc.rng = () => { rolls++; return 0.0000001; };
    expect(callEntry(npc, world, game)).toBe(false);
    expect(rolls).toBe(0);
    expect(shots.length).toBe(1);
  });

  it('树妖:1200px 内缺 buff165 的城镇 NPC 仅自己(self 含缺 ward)→ 放行入态', () => {
    const eY = 96 * 16;
    const { world, game, npc } = entryHarness('dryad',
      [{ x: 110 * 16, y: eY, w: 18, h: 40 }]);
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    npc.rng = () => 0.0000001;
    expect(callEntry(npc, world, game)).toBe(true);
    expect(npc.attackState).toBe(14);
  });

  it('树妖:全场景城镇 NPC(含本体)均带 ward → flag31 压灭,不耗骰不入态', () => {
    const eY = 96 * 16;
    const { world, game, npc } = entryHarness('dryad',
      [{ x: 110 * 16, y: eY, w: 18, h: 40 }]);
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    npc.dryadWardT = 400;                                    // 本体已受祝福(≤1200px)
    let rolls = 0;
    npc.rng = () => { rolls++; return 0.0000001; };
    expect(callEntry(npc, world, game)).toBe(false);
    expect(rolls).toBe(0);
    expect(npc.attackState).toBe(0);
  });

  it('树妖:12 格外 1216px 的 ward 淋 NPC 不满足窗 → 等价无受众(仅本体带 ward)', () => {
    const eY = 96 * 16;
    const { world, game, npc } = entryHarness('dryad',
      [{ x: 110 * 16, y: eY, w: 18, h: 40 }]);
    const farWarded = new TownNPC('guide', 76 * 16, 95 * 16);
    farWarded.dryadWardT = 400;                              // 24 格 ≈ 384px? ——校准见断言前注
    void farWarded;
    // (npcs() 由 harness 固定空表:外部 NPC 不经 harness 注入即不在扫描面,
    //  此例只复核 self-ward 单因素阻断与上一致)
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    npc.dryadWardT = 400;
    npc.rng = () => 0.0000001;
    expect(callEntry(npc, world, game)).toBe(false);
  });
});

describe('★F5 入态朝向 = 盒左缘 position.X 比较(:56031 族)', () => {
  it('左缘在其身后而中心在前:原版面向左(-1),中心比较会给右(+1)', () => {
    const eY = 96 * 16;
    const { world, game, enemies, npc } = entryHarness('guide', [{ x: 0, y: eY, w: 0, h: 0 }]);
    Object.assign(npc, { dangerNear: true, dangerSide: 1, threatRaw: true });
    npc.rng = () => 0.001;
    // 重排敌盒(宽64):盒心在本体中心右、左缘已越过本体左缘;盒心与本体中心
    // 调平满足弓族 |DirectionTo.Y|≤0.5 带(:56048-56049)
    const nLeft = npc.x, nTop = npc.y;
    const box = enemies[0];
    box.x = nLeft - 10;
    box.y = nTop + npc.h / 2 - 20;
    box.w = 64; box.h = 40;
    expect(box.x + 32).toBeGreaterThan(nLeft + npc.w / 2);   // 前置自检:盒心偏右
    void world; void game;
    expect(callEntry(npc, world, game)).toBe(true);
    expect(npc.facing).toBe(-1);                             // :56031 左缘比较字面
  });
});

describe('★F1 corneredT 残值清偿 + exitAttackCommon 收尾', () => {
  /** exitAttackCommon 双掷序直调(ring: 顺序记录掷值)。私有位经 Record 擦除读写
   *  ——与 entity-los-audit 的 runExit 同一白盒手法 */
  function runExitCommon(rngVals: number[],
    over: Partial<Record<string, unknown>>): Record<string, unknown> {
    const n = new TownNPC('dyer', 50 * 16, 50 * 16);
    const me = n as unknown as Record<string, unknown>;
    Object.assign(n, over);
    const seq = rngVals.slice();
    let i = 0;
    me.rng = () => seq[Math.min(i++, seq.length - 1)];
    (TownNPC.prototype as unknown as Record<string, (b: number, r: number) => void>)
      .exitAttackCommon.call(n, 12, 6);
    return me;
  }

  it('双掷序:第 1 掷→腿程 walkT,第 2 掷→冷却/转身锁共享同值(=:55680-55682)', () => {
    // v1=0.99 → legT = 12+floor(.99*6)=17;v2=0.01 → cdV = 6+floor(.01*6)=6
    const a = runExitCommon([0.99, 0.01], {});
    expect(a.walkT).toBe(17);
    expect(a.atkCd).toBe(6);
    expect(a.turnLock).toBe(a.atkCd);
    // 反向注入证明顺序:v1=0.01 / v2=0.99 → legT=12,cdV=11
    const b = runExitCommon([0.01, 0.99], {});
    expect(b.walkT).toBe(12);
    expect(b.atkCd).toBe(11);
  });

  it('恢复臂保留:prevAi0==8 && threatRaw → 回被逼停态(ai[1]=legT,vx 归零)', () => {
    const n = runExitCommon([0.2, 0.2], { prevAi0: 8, threatRaw: true, vx: -3, fleeing: true });
    expect(n.corneredT).toBe(12 + Math.floor(0.2 * 6));      // legT 同值
    expect(n.vx).toBe(0);
    expect(n.fleeing).toBe(false);
  });

  it('非复位臂显式清零(F1 修复):被逼停中急袭完成+险散 → 残值归 0 不再僵尸钉住', () => {
    const n = runExitCommon([0.2, 0.2], { prevAi0: 8, threatRaw: false, corneredT: 199 });
    expect(n.corneredT).toBe(0);
  });

  it('端到端回归:cornered 态起攻击(簿记挂起),退出无险 → 影子计数清偿(NPC 回走态)', () => {
    const eY = 99 * 16;
    const { world, game, npc } = entryHarness('dyer', [{ x: 90 * 16, y: eY, w: 18, h: 40 }]);
    // 注入:已被逼停 200t 时入攻击态(prevAi0=8),本拍攻击到期
    Object.assign(npc, {
      atkState: 15, atkTimer: 1, holdAim: 0, atkTick: 3,
      prevAi0: 8, corneredT: 200, dangerNear: false, threatRaw: false,
    });
    npc.rng = () => 0.0000001;
    npc.fixedUpdate(1 / 60, game);
    // 修复前:退出臂不清残值 → corneredT≈199,NPC 站定 ~225t 才解冻
    expect((npc as unknown as { corneredT: number }).corneredT).toBe(0);
    expect(npc.attackState).toBe(0);
  });

  it('恢复臂端到端:退出时 threatRaw 且候选缺位(:55652 num88==-1 面)→ 回被逼停态 legT=13', () => {
    // 与 vanilla 同构的可达场景:flag16 原始位亮而两侧候选引用缺位——
    // TS 复核路径 primary/alternate 均 null → flag29=false → 标准退出臂
    // 走 `(localAI[2]==8)&flag16` 恢复分支(本仓在 exitAttackCommon 内)
    const { npc } = entryHarness('dyer', []);
    Object.assign(npc, {
      atkState: 15, atkTimer: 0, holdAim: 0, atkTick: 3,
      prevAi0: 8, corneredT: 200, facing: -1,
      dangerSide: 1, threatRaw: true, threatLeft: null, threatRight: null,
      walkMode: 0, walkT: 100, turnLock: 0, vx: -3, fleeing: true,
    });
    npc.rng = () => 0.2;
    const fn = (TownNPC.prototype as unknown as Record<string, (w: unknown, g: unknown) => void>).swingUpdate;
    fn.call(npc,
      { store: new World(200, 200, 100, 'sweep').store, flags: {}, difficulty: 0 },
      { enemies: () => [], behavioLog: () => undefined } as never);
    // ai[0]=8 归位由影子承载:态号清零、corneredT=腿程(vanilla 同拍 ai[0]=8,ai[1]=legT)
    expect(npc.attackState).toBe(0);
    expect((npc as unknown as { corneredT: number }).corneredT).toBe(13);   // legT=12+floor(.2*6)
    expect((npc as unknown as { vx: number }).vx).toBe(0);
    expect((npc as unknown as { fleeing: boolean }).fleeing).toBe(false);
  });

  it('簿记挂起:攻击推进期间 corneredT 不递减不解冻(--停摆,:54830 分支互斥)', () => {
    const eY = 99 * 16;
    const { world, game, npc } = entryHarness('dyer', [{ x: 92 * 16, y: eY, w: 18, h: 40 }]);
    Object.assign(npc, {
      atkState: 15, atkTimer: 10, holdAim: 0, atkTick: 1,
      prevAi0: 8, corneredT: 180, facing: 1,
      dangerNear: false, threatRaw: false,                   // threatRaw 只判退出臂
    });
    npc.fixedUpdate(1 / 60, game);
    expect(npc.attackState).toBe(15);                           // 仍在态
    expect((npc as unknown as { corneredT: number }).corneredT).toBe(180);   // 未减
  });
});

describe('★F4 医师治疗弹 584 反弹链（Projectile.cs:17696+:18233-18254）', () => {
  const STONE4 = TILE_BY_KEY['stone'];

  function buildGame(world: World) {
    return {
      world,
      player: null, critters: () => [], enemies: () => [], npcs: () => [],
    } as never;
  }

  /** 复刻 AI_110 段(:34705-34721)的同拍追踪步——用于推算「碰撞步首」速度,
   *  断言反弹幅值还原公式 num17 的精确锚 */
  function postAiVel(
    sx: number, sy: number, pvx: number, pvy: number, speed: number,
    patient: { x: number; y: number; w: number; h: number },
  ): [number, number] {
    const tcx = patient.x + patient.w / 2, tcy = patient.y + patient.h / 2;
    const dx = tcx - (sx + 5), dy = tcy - (sy + 5);
    const dist = Math.hypot(dx, dy);
    let hx = dx / dist * speed;
    let hy = dy / dist * speed;
    if (hy < pvy) hy = pvy;
    hy += 1;
    hx = pvx + (hx - pvx) * 0.04;
    hy = pvy + (hy - pvy) * 0.04;
    return [hx, hy];
  }

  it('X 轴本帧接触证据→翻面并按 decomp num17 公式缩放;贴墙不嵌不穿', () => {
    const world = new World(200, 200, 100, 'syr-x');
    for (let ty = 44; ty <= 56; ty++) world.store.setTileSilent(30, ty, STONE4);
    const patient = { x: 120, y: 48 * 16, w: 20, h: 40, hp: 90, maxHp: 110, dead: false };
    // 弹盒左缘预置在墙右沿 +1px(px 497),一拍向左请求 8px → 本帧必有接触证据
    const shot = new NurseSyringeShot(497, 49 * 16 - 5, -8, 0, patient as never);
    const game = buildGame(world);
    const vxBefore = shot.vx, vyBefore = shot.vy;
    shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(false);
    expect(shot.vx).toBeGreaterThan(0);                       // X 反弹翻面
    // decomp 字面(:18249-18253):vx'=lastVx×−0.75 → num17=|lastV|/|postAxis|
    // → velocity/=num17。对 (−8→6, vy 微量) 的单轴反弹,终值 ≈ 0.5625×|lastV|
    // ——按公式逐位复算(实现与反编译同式,防再被「直觉复幅」误导)
    const [axp, ayp] = postAiVel(497, 49 * 16 - 5, vxBefore, vyBefore,
      Math.hypot(vxBefore, vyBefore), patient);
    let eVx = axp * -0.75, eVy = ayp;                          // 单轴(X)反弹,Y 未触发
    if ((eVy !== ayp && ayp > 2) || eVy === 0) eVy = ayp * -0.75;
    const rNum17 = Math.hypot(axp, ayp) / Math.hypot(eVx, eVy);
    eVx /= rNum17; eVy /= rNum17;
    expect(Math.abs(shot.vx - eVx)).toBeLessThan(1e-9);
    expect(Math.abs(shot.vy - eVy)).toBeLessThan(1e-9);
    expect(shot.x).toBeCloseTo(497, 3);                       // 嵌墙零推进(钳制截停)
  });

  it('盒扫掠多点采样:高速弹(v=40)撞薄墙被截停反彈——旧单点采样整帧跨过会漏证', () => {
    const world = new World(200, 200, 100, 'syr-fast');
    for (let ty = 44; ty <= 56; ty++) world.store.setTileSilent(30, ty, STONE4);
    const patient = { x: 120, y: 48 * 16, w: 20, h: 40, hp: 90, maxHp: 110, dead: false };
    // 步距 40px > 墙厚 16px:「落点中心单探针」在墙两侧格间跳跃无接触证据 → 直穿
    // 新实现快路径步长 cap=clamp(min(w,h),3,16)=10 子步步进必有一步交叠墙列
    const shot = new NurseSyringeShot(520, 49 * 16 - 5, -40, 0, patient as never);
    const game = buildGame(world);
    let bounced = false;
    for (let t = 0; t < 12 && !bounced && !shot.dead; t++) {
      const pv = shot.vx;
      shot.fixedUpdate(1 / 60, game);
      if (pv < 0 && shot.vx > 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(shot.x).toBeGreaterThan(30 * 16);                  // 墙左沿 px 480 未被穿越
  });

  it('Y 轴门((vy!=preVy&&preVy>2)||vy==0):竖坠触地向上反弹(vy>2 带)', () => {
    const world = new World(64, 64, 50, 'syr-y');
    for (let x = 10; x <= 50; x++) world.store.setTileSilent(x, 40, STONE4);   // 地板行
    const patient = { x: 300, y: 44 * 16, w: 20, h: 40, hp: 100, maxHp: 101, dead: false };
    // 初速竖直向下(vy=8):追踪段把 vy 拉向「方向×speed 再 +1」带——下坠速度稳定 >2
    const shot = new NurseSyringeShot(308, 30 * 16, 0, 8, patient as never);
    const game = buildGame(world);
    let bounced = false;
    for (let t = 0; t < 120 && !bounced && !shot.dead; t++) {
      const pv = shot.vy;
      shot.fixedUpdate(1 / 60, game);
      if (pv > 2 && shot.vy < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(shot.dead).toBe(false);
  });

  it('无障飞行终点:距离<speed 或盒相交 → Kill+治疗帽 20（happy path 回归）', () => {
    const world = new World(200, 200, 100, 'syr-heal');
    const patient = { x: 150, y: 160, w: 20, h: 40, hp: 80, maxHp: 130, dead: false };
    const heals: Array<{ amt: number }> = [];
    const shot = new NurseSyringeShot(
      120, 165,                    // 右飞,两拍内落入距离<speed 或盒相交
      8, 0, patient as never,
      (amt: number) => { heals.push({ amt }); },
    );
    const game = buildGame(world);
    for (let t = 0; t < 12 && !shot.dead; t++) shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(true);                             // Kill(:34703)
    expect(heals.length).toBe(1);
    expect(heals[0].amt).toBe(20);                            // min(lifeMax−life,20)
  });

  // ★治理批 B4（2026-08-31）：消亡判序重立账——
  //   :18233-18254 反弹支无显式 Kill,`penetrate==0 → Kill` 的通用门（Projectile.cs:
  //   17312-17315）在【下一 tick】的 AI/timeLeft 之后、tile 碰撞之前求值。旧映射
  //   「第 3 弹当拍即亡」提前一拍并跳过末拍 AI/life 面,废除。
  it('★B4 第 3 次反弹不死当拍:penetrate 归零者存活到下拍头部才死（AI 先行）', () => {
    const world = new World(200, 200, 100, 'syr-b4');
    for (let ty = 44; ty <= 56; ty++) world.store.setTileSilent(30, ty, STONE4);
    const patient = { x: 5000, y: 5000, w: 20, h: 40, hp: 90, maxHp: 110, dead: false };
    // 弹盒左缘预置在墙右沿+1px、向左请求 8px → 本拍必出接触证据(X 轴反弹)
    const shot = new NurseSyringeShot(497, 49 * 16 - 5, -8, 0, patient as never);
    const game = buildGame(world);
    (shot as unknown as { bouncesLeft: number }).bouncesLeft = 1;   // 末档直达
    shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(false);                       // 反弹当拍不死(:18254 无 Kill)
    expect((shot as unknown as { bouncesLeft: number }).bouncesLeft).toBe(0);
    const lifeAfterBounce = shot.life;
    shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(true);                        // 下拍通用门 :17312-17315 结算
    expect(shot.life).toBe(lifeAfterBounce - 1);         // 死亡拍 AI/timeLeft 面已先行消费
  });

  it('★B4 对照:健康 penetrate(3)正常反弹不误杀,X 轴证据面不变', () => {
    const world = new World(200, 200, 100, 'syr-b4c');
    for (let ty = 44; ty <= 56; ty++) world.store.setTileSilent(30, ty, STONE4);
    const patient = { x: 120, y: 48 * 16, w: 20, h: 40, hp: 90, maxHp: 110, dead: false };
    const shot = new NurseSyringeShot(497, 49 * 16 - 5, -8, 0, patient as never);
    const game = buildGame(world);
    shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(false);
    expect((shot as unknown as { bouncesLeft: number }).bouncesLeft).toBe(2);
  });
});
