// ★SW-BO1 2026-09-07（BJ2 债①②③清偿守卫）：
//  债① 优先型锁 UpdatePrioritizedTownNPC（WorldGen.cs:72168-72183 1:1）——扫描面
//      pickPrioritizedTownNPCType 纯函数直驱（数组序首个 homeless 城镇体类型;
//      368/160 逐字排除 + 453/bound 本仓建模面排除;无人合格 -1=不写锁）。
//  债③ 夜扫清场 UnspawnHomelessNPC（WorldGen.cs:5127-5155 1:1）——决策核
//      unspawnHomelessSweep 纯函数直驱（首个持标者三态:离场/仅清标/玩家邻域跳过;
//      安全邻域盒 = sWidth/2+safeRange 外扩,NPC.cs:6172-6174/:6791-6793 常量）。
//  Game 层胶水（fixedUpdate 昼夜门 :66022-66028 / 晨间流浪生成位 :5110 标置 /
//  runQuickFindHome 成功支 :5701 清标 / 近链 RelocatedHomeless :5380 清标+锁清零）
//  由 tsc + 下方契约锁钉面。
import { describe, it, expect } from 'vitest';
import {
  pickPrioritizedTownNPCType, unspawnHomelessSweep,
  NPC_SAFE_RANGE_X, NPC_SAFE_RANGE_Y, NPC_S_WIDTH, NPC_S_HEIGHT,
  type PrioritizedLockNpcView, type HomelessSweepNpcView,
} from '../src/world/Housing';

describe('SW-BO1 债①：优先型锁扫描面（UpdatePrioritizedTownNPC :72168-72183）', () => {
  const v = (npcId: number, homeless: boolean, opts?: { bound?: boolean; dead?: boolean }): PrioritizedLockNpcView =>
    ({ npcId, homeless, bound: opts?.bound ?? false, dead: opts?.dead ?? false });

  it('数组序首个 homeless 城镇体持锁（Main.npc 槽序语义）', () => {
    expect(pickPrioritizedTownNPCType([v(22, false), v(17, true), v(18, true)])).toBe(17);
    // 首个合格者之后即使有更小 id 也不再回看
    expect(pickPrioritizedTownNPCType([v(38, false), v(20, false), v(54, true)])).toBe(54);
  });

  it('368/160 逐字排除（:72176）；453/bound 本仓建模面排除', () => {
    expect(pickPrioritizedTownNPCType([v(368, true), v(160, true), v(453, true)])).toBe(-1);
    expect(pickPrioritizedTownNPCType([v(17, false), v(107, true, { bound: true }), v(22, true)])).toBe(22);
  });

  it('无人合格返回 -1=不写锁（vanilla 循环无人命中不赋值——锁不因空扫清零）', () => {
    expect(pickPrioritizedTownNPCType([v(17, false), v(22, false)])).toBe(-1);
    expect(pickPrioritizedTownNPCType([])).toBe(-1);
    expect(pickPrioritizedTownNPCType([v(17, true, { dead: true })])).toBe(-1);
  });
});

describe('SW-BO1 债③：夜扫清场决策核（UnspawnHomelessNPC :5127-5155）', () => {
  const NPC = 16;   // tile px
  // 中心 (tile 200,200) = 像素 (3208,3208)（num2*16+8）
  const mk = (over: Partial<HomelessSweepNpcView> = {}): HomelessSweepNpcView => ({
    key: 'merchant', npcId: 17, home: null, homelessDespawn: true, bound: false, dead: false,
    cx: 200 * NPC + 8, cy: 200 * NPC + 8, w: 18, h: 40, ref: { tag: 'm' },
    ...over,
  });
  // 玩家在安全邻域外（rect 半宽 960+62px ≈ 64 格）——站 tile 300,200 处盒外
  const farPlayer = { x: 300 * NPC, y: 200 * NPC, w: 20, h: 42 };
  const nearPlayer = { x: 205 * NPC, y: 200 * NPC, w: 20, h: 42 };

  it('常量面（NPC.cs:6172-6174/:6791-6793）：sWidth/sHeight 1920/1200、safeRange 62/39', () => {
    expect(NPC_S_WIDTH).toBe(1920);
    expect(NPC_S_HEIGHT).toBe(1200);
    expect(NPC_SAFE_RANGE_X).toBe(Math.trunc((1920 / 16) * 0.52));   // 62
    expect(NPC_SAFE_RANGE_Y).toBe(Math.trunc((1200 / 16) * 0.52));   // 39
  });

  it('无玩家邻域：首个持标者离场（active=false 档）', () => {
    const r = unspawnHomelessSweep([mk()], [farPlayer]);
    expect(r.despawned?.ref).toEqual({ tag: 'm' });
    expect(r.flagCleared).toBeNull();
    expect(r.skippedByPlayer).toBe(false);
  });

  it('玩家在安全邻域盒内 → 本 tick 跳过（:5146-5154 标与实体均不动）', () => {
    const r = unspawnHomelessSweep([mk()], [nearPlayer]);
    expect(r.skippedByPlayer).toBe(true);
    expect(r.despawned).toBeNull();
  });

  it('数组序取【第一个】持标者；后续持标者本 tick 不消费（每 tick 一个）', () => {
    const a = mk({ key: 'guide', ref: { tag: 'a' } });
    const b = mk({ key: 'nurse', ref: { tag: 'b' } });
    expect(unspawnHomelessSweep([a, b], [farPlayer]).despawned?.ref).toEqual({ tag: 'a' });
    // 消费 a 后（下一 tick a 已无标/已离场）轮到 b
    expect(unspawnHomelessSweep([b], [farPlayer]).despawned?.ref).toEqual({ tag: 'b' });
  });

  it(':5138-5142 非 homeless 复核失败 → 仅清标不离场（已安家/死亡/被缚三档）', () => {
    const housed = mk({ home: { x: 200, y: 198 }, ref: { tag: 'housed' } });
    const r1 = unspawnHomelessSweep([housed], [farPlayer]);
    expect(r1.flagCleared?.ref).toEqual({ tag: 'housed' });
    expect(r1.despawned).toBeNull();
    expect(unspawnHomelessSweep([mk({ dead: true })], [farPlayer]).flagCleared).toBeNull();
    expect(unspawnHomelessSweep([mk({ bound: true })], [farPlayer]).flagCleared).not.toBeNull();
  });

  it('安全邻域盒边界（verbatim Rectangle 求交）：盒缘恰触=跳过、离盒一格=离场', () => {
    // 盒 x 半径 = 960+62 = 1022px；NPC 中心 3208 → 盒 x∈[2186, 4230)
    // XNA Rectangle.Intersects = 严格不等式（触缘即不相交）：
    //   玩家盒右缘 2187 > 2186（入盒 1px）→ 相交=跳过
    const edgePlayer = { x: 2186 - 20 + 1, y: 3208 - 21, w: 20, h: 42 };
    expect(unspawnHomelessSweep([mk()], [edgePlayer]).skippedByPlayer).toBe(true);
    // 玩家右缘恰触 2186（=盒左界,严格不等式不成立）→ 不相交=离场
    const outPlayer = { x: 2186 - 20, y: 3208 - 21, w: 20, h: 42 };
    expect(unspawnHomelessSweep([mk()], [outPlayer]).despawned).not.toBeNull();
  });

  it('无持标者 → 三态皆空（空扫不产生行为）', () => {
    const r = unspawnHomelessSweep([mk({ homelessDespawn: false })], [nearPlayer]);
    expect(r.despawned).toBeNull();
    expect(r.flagCleared).toBeNull();
    expect(r.skippedByPlayer).toBe(false);
  });
});
