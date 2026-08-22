// 召唤域 Game.ts 修复批回归（审计 ❌2 项 2026-08-22，标杆 Terarria1456/Terraria/Player.cs）：
//   ① MinionSacrificable 门（FreeUpPetsAndMinions :50963，ProjectileID.cs:307）：
//      新召弹不可牺牲 → 在场随从一个不杀（哨兵族/表外弹型不挤随从位）
//   ② 625 龙头/628 龙尾/623 星尘守护者驱逐豁免（:51017）
//   ③ 1093 帕鲁猫召唤即清同型（:50955-50962）
//   ④ 驱逐序 = 槽位升序稳定 + num4 双子交替门（:50976-50988/:51001-51023）
//   ⑤ 召唤出生点 = 鼠标世界点经 LimitPointToPlayerReachableArea 钳制
//      （SpawnMinionOnCursor :48745-48768 + :44828-44855）——曾误用玩家中心前 14px
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, freeUpMinionsForSummon, MINION_SACRIFICABLE } from '../src/core/Game';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const player = new Player(60 * 16, 90 * 16, new Inventory());
const mk = (projId: number, noSlot = false): MinionProj =>
  new MinionProj(player.cx, player.cy - 40, projId, 10, 2, false, 0, false, () => player) as MinionProj &
    { noSlot: boolean };
const deads = (ms: MinionProj[]): string =>
  ms.map((m) => `${m.projId}${m.dead ? '†' : ''}`).join(',');

// ---------------------------------------------------------------------------
// ① MinionSacrificable 门（:50963）
// ---------------------------------------------------------------------------
describe('① MinionSacrificable 门（:50963）', () => {
  it('表内弹型（191 史莱姆）正常腾位：1 槽随从在 maxMinions=1 时被逐', () => {
    const a = mk(375), b = mk(266);
    freeUpMinionsForSummon(191, [a, b], 1);       // used=2 > 1-1=0 → 逐到腾够
    expect(a.dead).toBe(true);
    expect(b.dead).toBe(true);
  });
  it('表外弹型（1025，5463 星旋炮台）整段跳过：在场随从一个不杀', () => {
    const a = mk(375), b = mk(266);
    freeUpMinionsForSummon(1025, [a, b], 1);      // :50963 门 → 直接 return
    expect(a.dead).toBe(false);
    expect(b.dead).toBe(false);
  });
  it('哨兵弹型不在表（308/641/966/1025）——哨兵不挤随从位', () => {
    for (const s of [308, 641, 966, 1025]) expect(MINION_SACRIFICABLE.has(s)).toBe(false);
    for (const s of [191, 373, 387, 388, 625, 626, 627, 628, 831, 963, 970, 1093, 1094]) {
      expect(MINION_SACRIFICABLE.has(s)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ② 625/628/623 保护（:51017）
// ---------------------------------------------------------------------------
describe('② 625 龙头/628 龙尾/623 守护者驱逐豁免（:51017）', () => {
  it('池混龙头：只杀普通随从，625 活（旧版龙头会被驱逐=整龙暴毙）', () => {
    const head = mk(625), a = mk(375), b = mk(266);
    freeUpMinionsForSummon(191, [head, a, b], 1); // used=3 → 逐杀 375/266，625 豁免
    expect(head.dead).toBe(false);
    expect(a.dead).toBe(true);
    expect(b.dead).toBe(true);
  });
  it('623/628 同受 ：51017 豁免（本仓 noSlot 不入池，函数域仍双保险）', () => {
    const g623 = mk(623), tail = mk(628), a = mk(375);
    freeUpMinionsForSummon(191, [g623, tail, a], 1);
    expect(g623.dead).toBe(false);
    expect(tail.dead).toBe(false);
    expect(a.dead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ③ 1093 帕鲁猫清同型（:50955-50962）
// ---------------------------------------------------------------------------
describe('③ 1093 召唤即清同型（:50955-50962）', () => {
  it('召 1093 → 场上全部 1093 死，异型随从不动', () => {
    const p1 = mk(1093), p2 = mk(1093), other = mk(375);
    freeUpMinionsForSummon(1093, [p1, p2, other], 10);   // 上限宽裕仍清同型
    expect(p1.dead).toBe(true);
    expect(p2.dead).toBe(true);
    expect(other.dead).toBe(false);
  });
  it('召 1094 不清 1093（清同型仅 ：50955 的 shoot==1093 分支）', () => {
    const p = mk(1093);
    freeUpMinionsForSummon(1094, [p], 10);
    expect(p.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ④ 驱逐序：槽位升序稳定 + 双子交替门（:50976-50988/:51001-51023）
// ---------------------------------------------------------------------------
describe('④ 驱逐序与双子交替门（:50976-50988/:51001-51023）', () => {
  it('升序先杀 0.5 槽双子再杀 1 槽；同权保插入序（后者存活）', () => {
    const twin = mk(387), first = mk(375), last = mk(266), extra = mk(375);
    freeUpMinionsForSummon(191, [first, twin, last, extra], 3);
    // used=3.5 → 须降到 ≤2：杀 387(0.5)→3.0、杀 375（同权先位）→2.0 ≤ 2 停
    expect(twin.dead).toBe(true);
    expect(first.dead).toBe(true);
    expect(last.dead).toBe(false);
    expect(extra.dead).toBe(false);
  });
  it('num4 交替门：孤残 387 第二只不补杀（杀 387 后护 387，:51017+:51022）', () => {
    const a = mk(387), b = mk(387), c = mk(375), d = mk(266);
    freeUpMinionsForSummon(191, [a, b, c, d], 1);
    // used=4 → 逐到 0：杀 a(387,guard→387) → b 被 guard 豁免 → 杀 c/d
    expect(deads([a, b, c, d])).toBe('387†,387,375†,266†');
  });
  it('成对双子按对死（guard 初值 388：387→388→387→388 交替）', () => {
    const a1 = mk(387), b1 = mk(388), a2 = mk(387), b2 = mk(388);
    freeUpMinionsForSummon(387, [a1, b1, a2, b2], 1);
    expect(deads([a1, b1, a2, b2])).toBe('387†,388†,387†,388†');
  });
});

// ---------------------------------------------------------------------------
// ⑤ 召唤出生点 = 光标世界点经可达区钳制（:48745-48768 + :44828-44855）
// ---------------------------------------------------------------------------
/** clampPointToPlayerReachableArea 零场桩（Object.create(Game.prototype) 先例） */
function clampOf(cx: number, cy: number, worldW: number, worldH: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.player = { cx, cy };
  g.world = { store: { w: worldW, h: worldH } };
  return (g.clampPointToPlayerReachableArea as (x: number, y: number) => { x: number; y: number })
    .bind(g);
}

describe('⑤ 召唤出生点钳制（SpawnMinionOnCursor :48748-48752）', () => {
  const W = 840, H = 300;                       // 13440×4800px（可达区矩形活动余地足）
  it('光标在可达区内 → 出生点 = 光标原值（不再玩家中心+14px）', () => {
    const f = clampOf(5000, 3000, W, H);
    expect(f(5100, 2950)).toEqual({ x: 5100, y: 2950 });
  });
  it('超距光标沿 心→点 方向等比拉回矩形边（x +2000 → +960）', () => {
    const f = clampOf(5000, 3000, W, H);
    expect(f(7000, 3000)).toEqual({ x: 5960, y: 3000 });   // 5000+960（半宽）
    expect(f(5000, 3800)).toEqual({ x: 5000, y: 3600 });   // +600（半高）
  });
  it('矩形触世界边界（内收 640）后心偏移：近界光标钳到矩形边 640', () => {
    const f = clampOf(700, 3000, W, H);          // rx=-260 → ClampToWorldBorders → 640
    expect(f(100, 3000)).toEqual({ x: 640, y: 3000 });     // 矩形左缘（非世界 0）
  });
  it('召唤支线接线：出生点走钳制光标、驱逐走 freeUpMinionsForSummon（源级断言）', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src).toContain('this.clampPointToPlayerReachableArea(mwx, mwy)');
    expect(src).toContain('freeUpMinionsForSummon(cw.shoot, minions, this.player.maxMinions)');
    expect(src).toContain('spawnMinion(625, cursor)');      // 3531 龙首=裸 MouseWorld（:47908）
  });
});
