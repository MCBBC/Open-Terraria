// 实体侧 Collision.CanHit 家族对账批（2026-08-30）回归：
// 原版 NPC.cs / Projectile.cs 全量 CanHit 站点清账后本批补的四道门——
//   ① 城镇 NPC 挥击结算视线门（NPC.cs:55635 noTileCollide||CanHit）
//   ② 城镇 NPC 入态外加门：弓族斜率 ±0.5（:56048-56049）/ 狼人态 ≤50px（:56022-56025）
//   ③ 闪电光环三试视线（AI_137_LightningAura_CanHit，Projectile.cs:71574-71614
//      ——直线不过走 ±π/2 中点弧线两段；目标格实心直接 false）
// OOA 四塔/浮动哨兵的 CanHitLine 索敌门在 MinionProj 内经 nearestEnemy('line') 落地：
// 锚定 FindTarget 支为点对端（CanHitLine(shootingSpot,0,0→nPC.Center,0,0)，★F4 定案
// 2026-08-31），非锚定 AI_062 族仍走 canHitLine rect 版（:66392）——分叉场景钉案见
// tests/tower-aim-gates。此处用纯函数钉弧线几何。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TownNPC } from '../src/entities/TownNPC';
import { lightningAuraCanHitFrom, FLAMEBURST_TIERS } from '../src/entities/MinionProj';
import { getSwingStatsAnchor, tweakSwingStats } from '../src/entities/townNpcSwing';
import { canHit as canHitRect, canHitPoint } from '../src/physics/LineOfSight';

const STONE = TILE_BY_KEY['stone'];

/** 最小 LOS 场景：64×64 世界（默认空场） */
function makeWorld() {
  return new World(64, 64, 42, '测试');
}

describe('AI_137_LightningAura_CanHit 三试视线（71574-71614）', () => {
  const O = { x: 100, y: 100 };          // 起点：场盒顶沿中点(+Y 20)近似锚
  const T = { x: 500, y: 100 };          // 目标

  it('开阔地:直线支直接通过', () => {
    const st = makeWorld().store;
    expect(lightningAuraCanHitFrom(st, O.x, O.y, T.x, T.y)).toBe(true);
  });

  it('目标格实心:早退 false（SolidTile :71577）', () => {
    const st = makeWorld().store;
    st.setTile(Math.floor(T.x / 16), Math.floor(T.y / 16), STONE);
    expect(lightningAuraCanHitFrom(st, O.x, O.y, T.x, T.y)).toBe(false);
  });

  it('★F3 平台上目标不拒:平台=tileSolidTop 非整块实心（SolidTile 不含平台族,'
    + 'WorldGen.cs:70642-70661）', () => {
    const st = makeWorld().store;
    // 同格石块必拒 / 换平台 tile 后走弧线判定正常通过——isSolid 含平台曾错拒
    st.setTile(Math.floor(T.x / 16), Math.floor(T.y / 16), TILE_BY_KEY['platform']);
    expect(lightningAuraCanHitFrom(st, O.x, O.y, T.x, T.y)).toBe(true);
  });

  it('直路一堵薄墙:直线挡,±π/2 弧线两段绕行 → true', () => {
    const st = makeWorld().store;
    // 直线沿行 row=6；墙放 tile (15..16, 6)
    st.setTile(15, 6, STONE);
    st.setTile(16, 6, STONE);
    // 弧线中点偏移 |v|×0.2 = 80px → 上/下各 5 行的斜向两段
    expect(lightningAuraCanHitFrom(st, O.x, O.y, T.x, T.y)).toBe(true);
  });

  it('全封板墙:直线与两条弧线全被挡 → false', () => {
    const st = makeWorld().store;
    for (let x = 14; x <= 21; x++) {
      for (let y = 1; y <= 11; y++) st.setTile(x, y, STONE);
    }
    expect(lightningAuraCanHitFrom(st, O.x, O.y, T.x, T.y)).toBe(false);
  });
});

describe('★F5 AI_130 三档分层表（Projectile.cs:69166-69398 case 链）', () => {
  it('663/665/667 → 弹型·速度·周期·冷却·炮口 dy 全档钉值(-40/-44/-46)', () => {
    expect(FLAMEBURST_TIERS[663]).toEqual({ shot: 664, speed: 12, cycle: 24, cool: 80, dy: 40 });
    expect(FLAMEBURST_TIERS[665]).toEqual({ shot: 666, speed: 15, cycle: 32, cool: 70, dy: 44 });
    expect(FLAMEBURST_TIERS[667]).toEqual({ shot: 668, speed: 18, cycle: 32, cool: 60, dy: 46 });
  });
});

type PickFn = (
  w: unknown,
  o?: { slopeCapY?: number; maxDist?: number; lineMode?: boolean },
) => { cx: number; cy: number } | null;

/**
 * 城镇 NPC 入态目标选择 pickSideTarget（★C2 统一定案：入态选靶直读 dangerUpdate
 * 产出的 threatPool 快照,独立重扫已删除）——本组用例经真实 dangerUpdate 生成池
 * 后调 pickSideTarget,断言选侧钦定/重验回退/带检拒发语义(锚行号同旧口径)：
 */
describe('城镇 NPC 入态目标选择 pickSideTarget(池直读,threatPool 单点产出)', () => {
  /** 敌 mock（damage>0 即过扫描门;不带 dontTakeDamage → 过 CanBeChasedBy :91141 族） */
  function foe(me: { cx: number; cy: number }, dx: number, dy = 0) {
    return { x: me.cx + dx - 9, y: me.cy + dy - 20, w: 18, h: 40, dead: false, damage: 10,
      def: { friendly: false } };
  }
  /** 真实 dangerUpdate 产出候选池 → pickSideTarget(缺省/带检/lineMode 面不变)。
   *  实例取 guide(22):TOWN_DANGER_RANGE 无表项 → num11=200(等价旧显式 range 入参)。 */
  function callPick(
    enemies: Array<{ x: number; y: number; w: number; h: number }>,
    opts?: { slopeCapY?: number; maxDist?: number; lineMode?: boolean },
  ) {
    const world = makeWorld();
    const n = new TownNPC('guide', 32 * 16 - 2, 16 * 16 + 8 - 21);
    (TownNPC.prototype as unknown as Record<string, (wd: unknown, g: unknown) => void>)
      .dangerUpdate.call(n, { store: world.store }, { enemies: () => enemies } as never);
    expect((n as unknown as { threatRaw: boolean }).threatRaw).toBe(true);   // 池非空前提
    const fn = (TownNPC.prototype as unknown as Record<string, PickFn>).pickSideTarget;
    return fn.call(n, { store: world.store }, opts);
  }

  it('无门:同侧双敌取 |dx| 近者（原版 num13/num14 dx 口径,:54034-54049）', () => {
    const me = { cx: 32 * 16 + 8, cy: 16 * 16 + 8 };
    const shallowFar = { ...foe(me, 150), damage: 10 };     // d≈150 斜率≈0.07
    const steepNear = { ...foe(me, 40, 96), damage: 10 };    // 右下 d≈106 斜率≈0.91
    const got = callPick([shallowFar, steepNear]);
    expect(got?.cx).toBe(steepNear.x + 9);
  });

  it('弓族 slopeCapY=0.5(:56048-56049):终选者出带 → 整 tick 拒发(null),不再试他敌', () => {
    const me = { cx: 32 * 16 + 8, cy: 16 * 16 + 8 };
    const shallowFar = foe(me, 150);
    const steepNear = foe(me, 40, 96);
    // 主候选 = |dx| 近的 steepNear(dx 40<150)，斜率 0.91>0.5 出带 → 原版本 tick 拒发:
    // 支内 vector8.Y 门只对 num127 终选判（:56052-56057），不回落 shallowFar
    const got = callPick([shallowFar, steepNear], { slopeCapY: 0.5, lineMode: true });
    expect(got).toBeNull();
  });

  it('全陡:弓族入态候选为空(退回 null)', () => {
    const me = { cx: 32 * 16 + 8, cy: 16 * 16 + 8 };
    const steepOnly = foe(me, 40, 96);
    expect(callPick([steepOnly], { slopeCapY: 0.5 })).toBeNull();
  });

  it('狼人态 maxDist=50(:56022-56025):主候选 Distance>50 整次拒发', () => {
    const me = { cx: 32 * 16 + 8, cy: 16 * 16 + 8 };
    const far = foe(me, 70);
    expect(callPick([far], { maxDist: 50 })).toBeNull();
    expect(callPick([far])?.cx).toBe(far.x + 9);
  });

  it('★F2 回归·双敌异侧:危险侧(|dx| 近)主候选出格 → 整 tick 无攻击目标,对侧幸存者不救场'
    + '(:56019-56026/:56052-56057 失败即拒发不跨侧重试)', () => {
    const me = { cx: 32 * 16 + 8, cy: 16 * 16 + 8 };
    // 右侧近敌（|dx| 40 < 左侧 150）＝主候选/危险侧；其斜率 0.91 > 弓族带 0.5（出格）
    const rightSteep = foe(me, 40, 96);
    // 左侧远敌在带内——旧「池过滤+hypot 择近」会改打它;原版在本 tick 一发都不打
    const leftShallow = foe(me, -150);
    const refused = callPick([rightSteep, leftShallow],
      { slopeCapY: 0.5, lineMode: true });
    expect(refused).toBeNull();                     // 主候选带检失败 → null（无攻击）
    // 对照:无带检门时钦定规则照常命中主候选（同一几何,门位差异可证）
    const ungated = callPick([rightSteep, leftShallow]);
    expect(ungated?.cx).toBe(rightSteep.x + 9);
    // 反向对照:把右侧主候选拉远(|dx| 180>左侧 150)→ 危险侧钦定翻到左，带内正常入态
    // （排除"永远打不到"假阳性——拒发只发生在钦定者出带的 tick）
    const flipped = callPick([{ ...leftShallow }, { ...rightSteep, x: me.cx + 180 - 9 }],
      { slopeCapY: 0.5, lineMode: true });
    expect(flipped?.cx).toBe(leftShallow.x + 9);
  });
});

type SwingFn = (w: unknown, g: unknown) => void;

// ---- ★2026-08-31 对齐批②：挥击态重写（GetSwingStats/TweakSwingStats 逐拍盒 +
//      危险侧前探 32px 退出链 + 「换敌再接」重起手,NPC.cs:55615-55686）----
type SwingSelf = Record<string, unknown> & {
  atkTimer: number; atkState: number; facing: number;
};

function makeSwingSelf(cx: number, cy: number, over: Partial<Record<string, unknown>> = {}): SwingSelf {
  return {
    vanillaId: 207, givenName: '', tipsy: false,
    facing: -1, atkState: 15, atkTimer: 0, holdAim: 0, atkTick: 3,
    walkMode: 0, walkT: 100, turnLock: 0, vx: 0, vy: 0,
    x: cx - 6, y: cy - 21, w: 12, h: 42, cx, cy,
    rng: () => 0.2,
    swingImmune: new Map<number, number>(),
    prevAi0: 0, dangerSide: 1, threatRaw: false,
    threatPool: { left: null, right: null },
    corneredT: 0, fleeing: false,
    ...over,
  } as SwingSelf;
}

/** 挥击危险侧候选引用(与 TownNPC.dangerUpdate 记录位同构——★治理批 B1②后
 *  ThreatRef 无 isAlive 位:消费端按原文直读 Main.npc[numXX],不设活性门) */
function threatRef(x: number, y: number, w: number, h: number) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

describe('城镇 NPC 挥击逐拍判定盒(GetSwingStats/TweakSwingStats) + 结算视线门', () => {
  const CX = 30 * 16 + 8, CY = 16 * 16 + 8;

  function runSwing(fillWall?: (st: World['store']) => void,
    over?: Partial<Record<string, unknown>>, victimX = CX - 44) {
    const w = makeWorld();
    fillWall?.(w.store);
    const me = makeSwingSelf(CX, CY, { atkTimer: 12, ...over });   // 中带 B(ai[1]∈[10,20))
    const hits: string[] = [];
    const victim = {
      name: 'left', id: 7,
      dead: false, damage: 12, def: {},
      x: victimX, y: CY - 20, w: 18, h: 40,
      hurt(dmg: number): boolean { hits.push(`hit:${dmg}`); return true; },
    };
    const game = { enemies: () => [victim], addDamageNumber: () => undefined };
    const fn = (TownNPC.prototype as unknown as Record<string, SwingFn>).swingUpdate;
    fn.call(me, { store: w.store, flags: {}, difficulty: 0 }, game);
    return { hits, me };
  }

  it('中带(B)判定盒:明处敌人命中一次 + immune 锁 (int)ai[1]+2', () => {
    const { hits, me } = runSwing();
    expect(hits).toHaveLength(1);
    // immune[owner] = (int)ai[1]+2 = 14(NPC.cs:55639)
    const map = me.swingImmune as Map<number, number>;
    expect(map.get(7)).toBe(Math.trunc(12) + 2);
  });

  it('隔整列石壁:矩形相交也不打(:55635 noTileCollide||CanHit 站点保真)', () => {
    const { hits } = runSwing((st) => {
      // 本体右沿(482)与敌身(444..462)之间立满高石柱——列 29 = 464..479 全断视线
      for (let ty = 10; ty <= 23; ty++) st.setTile(29, ty, STONE);
    });
    expect(hits).toEqual([]);
  });

  it('收势带(A)变形:TweakSwingStats W×1.4/H×1.1(+Y 半高下压)逐拍生效', () => {
    const { hits, me } = runSwing(undefined, { atkTimer: 9 }, CX - 52);
    // ai[1]=9 < 15×2×0.333 → A 带:盒加宽到 trunc(32×1.4)=44、加高 trunc(35)
    expect(hits).toHaveLength(1);
    void me;
  });
});

describe('★对齐批② 挥击退出链(NPC.cs:55645-55686)', () => {
  const CX = 30 * 16 + 8, CY = 16 * 16 + 8;

  /** 真实例驱动（私有位经 any 注入——exitAttackCommon 等原型方法保持可达） */
  function runExit(fillWall?: (st: World['store']) => void,
    over?: Partial<Record<string, unknown>>) {
    const w = makeWorld();
    fillWall?.(w.store);
    const n = new TownNPC('dyer', CX - 10, CY - 21);   // cx=CX, cy=CY, w=20
    const me = n as unknown as Record<string, unknown>;
    me.facing = -1;
    for (const [k, v] of Object.entries({
      atkState: 15, atkTimer: 0, holdAim: 0, atkTick: 3,
      walkMode: 0, walkT: 100, turnLock: 0,
      rng: () => 0.2, prevAi0: 0, dangerSide: 1, threatRaw: false,
      threatPool: { left: null as unknown, right: null as unknown },
      corneredT: 0, fleeing: false,
      ...over,
    })) me[k] = v;
    const fn = (TownNPC.prototype as unknown as Record<string, SwingFn>).swingUpdate;
    fn.call(n, { store: w.store, flags: {}, difficulty: 0 },
      { enemies: () => [], behavioLog: () => undefined });
    return me;
  }

  it('退路堵死(背向危险侧前探 32px 命墙)+主候选可见 → 换敌再接(atkTimer=AttackTime 重起手)', () => {
    // 危险在左(dangerSide=-1) → 背向探测 = 右 +32px;右立满高石柱封退路。
    // 主候选 = 同危险侧左敌(num15==-1 → num16 左) 可见 → 立即重接挥击
    const me = runExit((st) => {
      for (let ty = 10; ty <= 22; ty++) { st.setTile(31, ty, STONE); st.setTile(32, ty, STONE); }
    }, {
      threatRaw: true, dangerSide: -1, facing: -1,
      threatPool: { left: threatRef(CX - 60, CY - 20, 18, 40), right: null },
    });
    expect(me.atkTimer).toBe(15);              // num87 = NPCID.Sets.AttackTime[207]
    expect(me.atkState).toBe(15);              // ai[0] 保持 15(重起手)
    expect(me.atkTick).toBe(0);                // localAI[3]=0
    expect(me.holdAim).toBe(0);                // ai[2]=0
    expect(me.facing).toBe(-1);                // direction = 朝新目标(同侧)
  });

  it('入态时是被逼停(prevAi0==8)→ 无墙也连击(:55650 ||localAI[2]==8f 支)', () => {
    const me = runExit(undefined, {
      threatRaw: true, dangerSide: 1, facing: 1, prevAi0: 8,
      threatPool: { left: null, right: threatRef(CX + 40, CY - 20, 18, 40) },
    });
    expect(me.atkState).toBe(15);
    expect(me.atkTimer).toBe(15);
  });

  it('主候选失 LOS 单次回退另一侧候选 → 新敌换向(direction 翻面 :55656-55671)', () => {
    // 危险在左、左侧主候选被柱子遮挡(点对失败)、退路由 localAI[2]==8 支放行
    // → 回退右侧次候选,方向翻向右
    const me = runExit((st) => {
      for (let ty = 10; ty <= 22; ty++) st.setTile(28, ty, STONE);   // 本体与左敌间柱列
    }, {
      threatRaw: true, dangerSide: -1, facing: -1, prevAi0: 8,
      threatPool: {
        left: threatRef(CX - 96, CY - 20, 18, 40),                   // 柱后→CanHit 点对失败
        right: threatRef(CX + 44, CY - 20, 18, 40),
      },
    });
    expect(me.facing).toBe(1);                 // 换向朝右侧幸存者
    expect(me.atkState).toBe(15);
    expect(me.atkTimer).toBe(15);
  });

  it('★原版不对称:主候选缺位(即使另一侧有活敌)不接链 → 标准退出(:55655 嵌套三元)',
    () => {
      const me = runExit((st) => {
        for (let ty = 10; ty <= 22; ty++) { st.setTile(27, ty, STONE); st.setTile(28, ty, STONE); }
      }, {
        threatRaw: true, dangerSide: 1, facing: 1,
        // 主候选(num17 右)缺位;左侧候选拒救——vanilla 只在【主候选存在但 LOS 断】
        // 时才动用 num89 回退
        threatPool: { left: threatRef(CX - 120, CY - 20, 18, 40), right: null },
      });
      expect(me.atkState).toBe(0);               // 标准退出
      expect(me.walkT).toBe(13);                 // legT = 12 + floor(0.2×6)
      expect(me.atkCd).toBe(7);                  // localAI[1] = 12/2 + floor(0.2×6)
      expect(me.corneredT).toBe(0);
    });

  it('被逼停复位支:(localAI[2]==8)&flag16 且主候选缺位(不接链)→ 回 ai[0]=8 态(ai[1]=legT)', () => {
    const me = runExit(undefined, {
      threatRaw: true, dangerSide: 1, prevAi0: 8, facing: 1,
      // prevAi0==8 触发连击尝试,但主候选(num17 右)缺位 → 放弃连击走标准退出,
      // cornered 复位分支接管
      threatPool: { left: null, right: null },
    });
    expect(me.atkState).toBe(0);               // ai[0] 归位由 cornered 承载
    expect(me.corneredT).toBe(13);             // ai[1] = legT 同值
    expect(me.walkT).toBe(13);
  });

  it('非危险态自然退出:flag16=false → 纯标准退出(冷却/腿程写入,rng 注入确定性)', () => {
    const me = runExit(undefined, { threatRaw: false, prevAi0: 0 });
    expect(me.atkState).toBe(0);
    expect(me.corneredT).toBe(0);              // 无复位
    expect(me.walkT).toBe(13);
    expect(me.atkCd).toBe(7);
  });
});

// ---- ★2026-08-31 治理批 B1：换敌再接候选池双偏离翻正回归 ----
describe('★B1① 危险扫描候选记录前置 CanBeChasedBy 门（NPC.cs:54042 flag19）', () => {
  const CX = 30 * 16 + 8, CY = 16 * 16 + 8;

  function scan(foes: Array<Record<string, unknown>>) {
    const w = makeWorld();
    // 用 guide（DangerDetectRange 无表项 → 默认 200；dyer 表值仅 60px 容不下
    // 本组敌距）——dangerUpdate 与攻击型无关，纯扫描面单测
    const n = new TownNPC('guide', CX - 10, CY - 21);
    const fn = (TownNPC.prototype as unknown as Record<string,
      (wd: unknown, g: unknown) => void>).dangerUpdate;
    fn.call(n, w, { enemies: () => foes } as never);
    return n as unknown as { threatPool: { left: unknown; right: unknown }; threatRaw: boolean };
  }

  /** 右侧两敌：近者 dontTakeDamage（过扫描门但不入索敌 :91141 族）、远者普通 */
  const nearDonT = (x: number) => ({ x: x - 10, y: CY - 20, w: 18, h: 40, dead: false,
    damage: 40, dontTakeDamage: true, def: { friendly: false } });
  const farNormal = (x: number) => ({ x: x - 10, y: CY - 20, w: 18, h: 40, dead: false,
    damage: 30, def: { friendly: false } });

  it('扫描序 [先远后近]:近敌只刷 num14 不覆盖已记录的远候选（沿用上一合格者）', () => {
    // 原版字面形状:num14 刷新与 flag19 无关,num17 仅在刷新时若过 CanBeChasedBy 才写
    // ——不过门的更近威胁【保留】此前最近合格候选
    const r = scan([farNormal(CX + 100), nearDonT(CX + 50)]);
    expect(r.threatRaw).toBe(true);                    // 威胁面照旧置位(:53887 串)
    const cand = r.threatPool.right as { cx: number };
    expect(cand).not.toBeNull();
    // 盒心几何：x=CX+90（farNormal 内 -10 偏置）→ cx = x+w/2 = CX+99
    expect(cand.cx).toBeCloseTo(CX + 99, 5);           // 远者保位（近敌未覆盖）
  });

  it('扫描序 [先近后远]:近敌不过门且 num14 未再刷 → num17 全程空缺(null)', () => {
    const r = scan([nearDonT(CX + 50), farNormal(CX + 100)]);
    expect(r.threatRaw).toBe(true);
    expect(r.threatPool.right).toBeNull();             // 远者 dx 更大不入 num14 刷新窗
  });

  it('双侧皆合格:左右候选各记各的', () => {
    const r = scan([farNormal(CX + 60), farNormal(CX - 70)]);
    expect((r.threatPool.right as { cx: number }).cx).toBeGreaterThan(CX);
    expect((r.threatPool.left as { cx: number }).cx).toBeLessThan(CX);
  });
});

describe('★B1② 重接消费无活性门（:55652-55669 直读 Main.npc 无 .active 查询）', () => {
  const CX = 30 * 16 + 8, CY = 16 * 16 + 8;

  it('同拍先行致死目标(仅 dead 位翻真)仍被重接——原版可链到该拍刚死的怪', () => {
    const w = makeWorld();
    const n = new TownNPC('dyer', CX - 10, CY - 21);
    // 退路堵死:背向危险侧(-1→前探右)立柱
    for (let ty = 10; ty <= 22; ty++) { w.store.setTile(31, ty, STONE); }
    const me = n as unknown as Record<string, unknown>;
    Object.assign(me, {
      atkState: 15, atkTimer: 0, holdAim: 0, atkTick: 3, facing: -1,
      walkMode: 0, walkT: 100, turnLock: 0, rng: () => 0.2,
      prevAi0: 0, dangerSide: -1, threatRaw: true, corneredT: 0, fleeing: false,
      swingImmune: new Map<number, number>(),
      threatPool: { left: threatRef(CX - 80, CY - 20, 18, 40), right: null },
    });
    const victim = { id: 11, dead: true };              // 同拍致死——Ref 快照仍在
    void victim;
    const log: Array<{ phase?: string }> = [];
    (TownNPC.prototype as unknown as Record<string, SwingFn>).swingUpdate.call(
      n, { store: w.store, flags: {}, difficulty: 0 },
      { enemies: () => [], behavioLog: (_e: string, o: { phase?: string }) => log.push(o) },
    );
    expect(log[0]?.phase).toBe('rechain');              // 不设活性门 → 接上
    expect(me.atkTimer).toBe(15);
    expect(me.atkState).toBe(15);
  });

  it('主候选 LOS 断+无次候选 → 照旧标准退出(活性门删除不改变其余分支)', () => {
    const me2 = (() => {
      const w = makeWorld();
      for (let ty = 10; ty <= 22; ty++) st_wall(w.store);
      const n = new TownNPC('dyer', CX - 10, CY - 21);
      Object.assign(n as unknown as Record<string, unknown>, {
        atkState: 15, atkTimer: 0, holdAim: 0, atkTick: 3, facing: 1,
        walkMode: 0, walkT: 100, turnLock: 0, rng: () => 0.2,
        prevAi0: 0, dangerSide: 1, threatRaw: true, corneredT: 0, fleeing: false,
        swingImmune: new Map<number, number>(),
        threatPool: { left: null, right: threatRef(CX + 90, CY - 20, 18, 40) },   // 柱后断视
      });
      (TownNPC.prototype as unknown as Record<string, SwingFn>).swingUpdate.call(
        n, { store: w.store, flags: {}, difficulty: 0 },
        { enemies: () => [], behavioLog: () => undefined });
      return n as unknown as Record<string, unknown>;
    })();
    expect(me2.atkState).toBe(0);                       // 标准退出面不变
  });

  function st_wall(st: World['store']): void {
    for (let ty = 10; ty <= 22; ty++) { st.setTile(33, ty, STONE); st.setTile(34, ty, STONE); }
  }
});

// ---- ★对齐批③ point 版 CanHit 通道保真(R5 leftover#4):
//      AI_007 站点全部改传 0 尺寸点对,端点 tile 与 rect 写法逐布局零差 ----
describe('canHitPoint ↔ canHit(rect) 端点等价(AI_007 :54030/:56019 形状换写保真)', () => {
  interface BoxEnt { cx: number; cy: number; w: number; h: number }

  const cases: Array<{ label: string; layout?: (st: World['store']) => void }> = [
    { label: '开阔直线' },
    { label: '中线整柱拦截', layout: (st) => { for (let ty = 14; ty <= 19; ty++) st.setTile(16, ty, STONE); } },
    { label: '半砖/平台不拦', layout: (st) => { st.setTile(16, 16, TILE_BY_KEY['platform']); } },
    { label: '旁柱不拦', layout: (st) => { for (let ty = 2; ty <= 8; ty++) st.setTile(16, ty, STONE); } },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const w = makeWorld();
      c.layout?.(w.store);
      const a: BoxEnt = { cx: 8 * 16, cy: 16 * 16, w: 20, h: 42 };
      const b: BoxEnt = { cx: 26 * 16 + 8, cy: 16 * 16 + 4, w: 18, h: 40 };
      const viaRect = canHitRect(
        w.store, a.cx - a.w / 2, a.cy - a.h / 2, a.w, a.h,
        b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h,
      );
      const viaPoint = canHitPoint(w.store, a.cx, a.cy, b.cx, b.cy);
      expect(viaPoint).toBe(viaRect);
    });
  }
});


// ---- GetSwingStats/TweakSwingStats 纯函数钉值(NPC.cs:67247-67370;207 盒 32×32)----
describe('GetSwingStatsAnchor / tweakSwingStats 三带钉值(207 rect=32)', () => {
  const CX = 1000, PY = 2000;

  it('中带 B(×0.333..×0.666):锚 = centerX+(16−10)×dir / posY+10,无变形', () => {
    const a = getSwingStatsAnchor(30, 15, 1, 32, 32, CX, PY);
    expect(a.x).toBeCloseTo(CX + 6);           // (32/2−10)×(+1)——32 不入 >32 档
    expect(a.y).toBe(PY + 10);                 // itemH=32:无 >32 分档 → 默认 10
    const r = { x: Math.trunc(a.x), y: Math.trunc(a.y), w: 32, h: 32 };
    tweakSwingStats(r, 30, 15, 1);
    expect(r).toEqual({ x: CX + 6, y: PY + 10, w: 32, h: 32 });   // 中段恒原样
  });

  it('收势带 A(<×0.333):锚 +6/+24 → W→44/H→35/Y+16(dir=1 无回退)', () => {
    const a = getSwingStatsAnchor(30, 9, 1, 32, 32, CX, PY);
    expect(a.x).toBe(CX + 6);                  // (16−10)×(+1)
    expect(a.y).toBe(PY + 24);
    const r = { x: a.x, y: a.y, w: 32, h: 32 };
    tweakSwingStats(r, 30, 9, 1);
    expect(r.w).toBe(Math.trunc(32 * 1.4));    // 44(:67357)
    expect(r.h).toBe(Math.trunc(32 * 1.1));    // 35(:67359)
    expect(r.y).toBe(Math.trunc(PY + 24) + Math.trunc(32 * 0.5));
  });

  it('收势带 A 反向:X 先回退 trunc(W×1.4)−W(:67355-56)', () => {
    const a = getSwingStatsAnchor(30, 9, -1, 32, 32, CX, PY);
    const r = { x: a.x, y: a.y, w: 32, h: 32 };
    tweakSwingStats(r, 30, 9, -1);
    expect(r.x).toBe(a.x - (Math.trunc(32 * 1.4) - 32));
  });

  it('尾带 C(≥×0.666,重起手后 ai[1]=AttackTime 不可达,几何仍钉值):反号锚 + W×2/H×1.4', () => {
    const a = getSwingStatsAnchor(30, 25, 1, 32, 32, CX, PY);
    expect(a.x).toBe(CX - 10);                 // centerX − (16−6)×(+1)——32 无 >32/>48 档
    expect(a.y).toBe(PY + 10);                 // itemH=32:全档不命中 → 10
    const r = { x: a.x, y: a.y, w: 32, h: 32 };
    tweakSwingStats(r, 30, 25, 1);
    expect(r.w).toBe(64);                      // ×2
    expect(r.h).toBe(Math.trunc(32 * 1.4));
    expect(r.x).toBe(a.x - Math.trunc(32 * 1.2));   // aimDir==1 回退
  });
});
