// 实体侧 Collision.CanHit 家族对账批（2026-08-30）回归：
// 原版 NPC.cs / Projectile.cs 全量 CanHit 站点清账后本批补的四道门——
//   ① 城镇 NPC 挥击结算视线门（NPC.cs:55635 noTileCollide||CanHit）
//   ② 城镇 NPC 入态外加门：弓族斜率 ±0.5（:56048-56049）/ 狼人态 ≤50px（:56022-56025）
//   ③ 闪电光环三试视线（AI_137_LightningAura_CanHit，Projectile.cs:71574-71614
//      ——直线不过走 ±π/2 中点弧线两段；目标格实心直接 false）
// OOA 四塔/浮动哨兵的 CanHitLine 索敌门在 MinionProj 内经 nearestEnemy('line') 落地，
// 由既有 'line' 通道承载（canHitLine rect 版），此处用纯函数钉弧线几何。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TownNPC } from '../src/entities/TownNPC';
import { lightningAuraCanHitFrom, FLAMEBURST_TIERS } from '../src/entities/MinionProj';

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
  w: unknown, g: unknown, r: number,
  o?: { slopeCapY?: number; maxDist?: number; lineMode?: boolean },
) => { cx: number; cy: number } | null;

describe('城镇 NPC 入态目标选择 pickSideTarget（NPC.cs:53887-53963 扫描+56012-56103 支内）', () => {
  // ★F2 翻修口径（2026-08-30）：主候选按危险侧 |dx| 钦定 → 重验失败单次回退次候选 →
  // 带检（slopeCapY/maxDist）只对【终选者】判，失败即整 tick 拒发——不再是
  // 「带检预过滤候选池后择近」
  /** 挥击型假身借方法（过滤路径与攻击表无关） */
  function npcAt(cx: number, cy: number) {
    return {
      vanillaId: 227,
      x: cx - 10, y: cy - 21, w: 20, h: 42, cx, cy,
    };
  }
  function callPick(
    thisArg: Record<string, number>,
    store: World['store'],
    enemies: Array<{ x: number; y: number; w: number; h: number }>,
    range: number, opts?: { slopeCapY?: number; maxDist?: number; lineMode?: boolean },
  ) {
    const fn = (TownNPC.prototype as unknown as Record<string, PickFn>).pickSideTarget;
    return fn.call(thisArg, { store }, { enemies: () => enemies }, range, opts);
  }

  it('无门:同侧双敌取 |dx| 近者（原版 num13/num14 dx 口径,:54034-54049）', () => {
    const w = makeWorld();
    const me = npcAt(32 * 16 + 8, 16 * 16 + 8);
    const shallowFar = { x: me.cx + 150, y: me.cy - 10, w: 18, h: 40, damage: 10 };   // d≈150 斜率≈0.07
    const steepNear = { x: me.cx + 40, y: me.cy + 96, w: 18, h: 40, damage: 10 };     // 右下 d≈106 斜率≈0.91
    const got = callPick(me, w.store, [shallowFar, steepNear], 200);
    expect(got?.cx).toBe(steepNear.x + 9);
  });

  it('弓族 slopeCapY=0.5(:56048-56049):终选者出带 → 整 tick 拒发(null),不再试他敌', () => {
    const w = makeWorld();
    const me = npcAt(32 * 16 + 8, 16 * 16 + 8);
    const shallowFar = { x: me.cx + 150, y: me.cy - 10, w: 18, h: 40, damage: 10 };
    const steepNear = { x: me.cx + 40, y: me.cy + 96, w: 18, h: 40, damage: 10 };
    // 主候选 = |dx| 近的 steepNear(dx 40<150)，斜率 0.91>0.5 出带 → 原版本 tick 拒发:
    // 支内 vector8.Y 门只对 num127 终选判（:56052-56057），不回落 shallowFar
    const got = callPick(me, w.store, [shallowFar, steepNear], 200, { slopeCapY: 0.5, lineMode: true });
    expect(got).toBeNull();
  });

  it('全陡:弓族入态候选为空(退回 null)', () => {
    const w = makeWorld();
    const me = npcAt(32 * 16 + 8, 16 * 16 + 8);
    const steepOnly = { x: me.cx + 40, y: me.cy + 96, w: 18, h: 40, damage: 10 };
    expect(callPick(me, w.store, [steepOnly], 200, { slopeCapY: 0.5 })).toBeNull();
  });

  it('狼人态 maxDist=50(:56022-56025):主候选 Distance>50 整次拒发', () => {
    const w = makeWorld();
    const me = npcAt(32 * 16 + 8, 16 * 16 + 8);
    const far = { x: me.cx + 70, y: me.cy, w: 18, h: 40, damage: 10 };
    expect(callPick(me, w.store, [far], 200, { maxDist: 50 })).toBeNull();
    expect(callPick(me, w.store, [far], 200)?.cx).toBe(far.x + 9);
  });

  it('★F2 回归·双敌异侧:危险侧(|dx| 近)主候选出格 → 整 tick 无攻击目标,对侧幸存者不救场'
    + '(:56019-56026/:56052-56057 失败即拒发不跨侧重试)', () => {
    const w = makeWorld();
    const me = npcAt(32 * 16 + 8, 16 * 16 + 8);
    // 右侧近敌（|dx| 40 < 左侧 150）＝主候选/危险侧；其斜率 0.91 > 弓族带 0.5（出格）
    const rightSteep = { x: me.cx + 40, y: me.cy + 96, w: 18, h: 40, damage: 10 };
    // 左侧远敌在带内——旧「池过滤+hypot 择近」会改打它;原版在本 tick 一发都不打
    const leftShallow = { x: me.cx - 150, y: me.cy - 10, w: 18, h: 40, damage: 10 };
    const refused = callPick(me, w.store, [rightSteep, leftShallow], 200,
      { slopeCapY: 0.5, lineMode: true });
    expect(refused).toBeNull();                     // 主候选带检失败 → null（无攻击）
    // 对照:无带检门时钦定规则照常命中主候选（同一几何,门位差异可证）
    const ungated = callPick(me, w.store, [rightSteep, leftShallow], 200);
    expect(ungated?.cx).toBe(rightSteep.x + 9);
    // 反向对照:把右侧主候选拉远(|dx| 180>左侧 150)→ 危险侧钦定翻到左，带内正常入态
    // （排除"永远打不到"假阳性——拒发只发生在钦定者出带的 tick）
    const flipped = callPick(me, w.store,
      [{ ...leftShallow }, { ...rightSteep, x: me.cx + 180 }], 200, { slopeCapY: 0.5, lineMode: true });
    expect(flipped?.cx).toBe(leftShallow.x + 9);
  });
});

type SwingFn = (w: unknown, g: unknown) => void;

describe('城镇 NPC 挥击结算视线门（NPC.cs:55635 noTileCollide||CanHit）', () => {
  // ai[0]==15 攻击态中段 tick：TOWN_ATTACK_TIME[207]=15 → 中段 = max(1,floor(15/2))
  const SWING_ATK_TICK = Math.max(1, Math.floor(15 / 2));

  function runSwing(fillWall?: (st: World['store']) => void) {
    const w = makeWorld();
    fillWall?.(w.store);
    const cx = 30 * 16 + 8, cy = 16 * 16 + 8;
    // facing=-1：挥击矩形 = [cx−32, cx] × [cy−16, cy+16]
    // 身宽缩至 12（矩形锚在 cx,与身宽无关——给墙留净缝）
    const me = {
      vanillaId: 207, givenName: '', tipsy: false,
      facing: -1, atkTick: SWING_ATK_TICK,
      x: cx - 6, y: cy - 21, w: 12, h: 42, cx, cy,
    };
    const hits: string[] = [];
    const victim = {
      name: 'left',
      dead: false, damage: 12, def: {},
      x: cx - 48, y: cy - 20, w: 18, h: 40,           // 右缘探入矩形内 2px
      hurt(dmg: number): boolean { hits.push(`hit:${dmg}`); return true; },
    };
    const game = { enemies: () => [victim], addDamageNumber: () => undefined };
    const fn = (TownNPC.prototype as unknown as Record<string, SwingFn>).swingUpdate;
    fn.call(me, { store: w.store, flags: {}, difficulty: 0 }, game);
    return hits;
  }

  it('明处敌人:命中一次', () => {
    expect(runSwing()).toHaveLength(1);
  });

  it('隔整列石壁:矩形相交也不打（2026-08-30 补门回归）', () => {
    const hits = runSwing((st) => {
      // 本体右沿 cx−6 与敌身之间立一列满高石柱——矩形仍相交但视线全断
      // （cx=488：敌 440..458、缝 458..482 → 墙列 29 = 464..479 恰在缝内）
      for (let ty = 12; ty <= 22; ty++) st.setTile(29, ty, STONE);
    });
    expect(hits).toEqual([]);
  });
});
