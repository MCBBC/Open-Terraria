// ★BJ499（2026-10-04）190 机械食人鱼补射位出生点盒心修正（BJ498 新登记,R9 同族）判别测试。
//  定谳锚（Terarria1457 亲读,行号=落刀日盘上）：
//   · 原版补射门 Player.cs:43878-43892 `type==1156 && channel && num<3` 只置 flag4 →
//     与首发同走 ItemCheck_Shoot 1156 专支（:48846-48862 逐发 NewProjectile）——
//     0/1/2 条补射【单路径】无独立补射位：出生点=pointPosition（:47605——★BJ665 勘正 伪锚 :47588
//     RotatedRelativePoint(MountedCenter),站立恒等玩家中心——fullRotation=0 时
//     vector2=(0,−4)+(0,4) 恒等零;NewProjectile 传位=盒心 Projectile.cs:10878-10879）,
//     瞄准原点=num4/num5 起算点=同 pointPosition（:47743-47744 MouseWorld−pointPosition）。
//     1156/190 无任何 per-type pointPosition 偏移支（:47636-48846 诸支均他型,亲读全表）。
//   · R9 判例口径：Game.ts 首发位 :20757 R9 批二已谳同式（placeAtShootSpawn 盒心回正）。
//   · 病面（两站同族,均 Game.ts :18554 批注「中心前14px/y−4 已全数拆除」的残留）：
//     ① Game.ts 0 条补射位（tickPiranhaChannelRefire）py=cy−4 直传 Arrow ctor（收盒
//       左上）→ 弹盒心 (+11,+7)px 系统偏 + 瞄准原点上偏 4px;
//     ② Arrow.pTopUp（1-2 条补弹位）中心前14px/y−4 自创枪口直传 → 同族盒偏。
//   · R9 族普查（grep 补弹/补射/TopUp/refire）：玩家 channel 补射面全仓仅此两站
//     （0 条=Game.tickPiranhaChannelRefire / 1-2 条=Arrow.pTopUp）;其余「补射」命中
//     均为 NPC/boss AI 域（克隆体补射 468/火星人 450 等,非 ItemCheck_Shoot 族）。
//  判别力（旧码必红项）：§1a 0 条补射盒心（回退 y−4 或摘 placeAtShootSpawn 必红）/
//    §1b 0 条瞄准原点=玩家中心（回退 y−4 必红;随机掷钉 0.5 → 扰动恰 0 零容差判别）/
//    §1c 结构锁 / §2a pTopUp 盒心（回退 14px/y−4 必红）/ §2b 结构锁 /
//    §3 armorPen 同源不回归（BJ498② 回声:0 条词缀份 + pTopUp 继承链双钉）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Arrow, PIRANHA_PROJ } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { prefixStat } from '../src/data/vanillaPrefixes';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = (p: string) => readFileSync(join(HERE, '..', 'src', p), 'utf8');
/** 结构锁用：块注释+整行注释剥离（not.toContain 断言防文档词误伤,BJ497/498 同款） */
const stripAll = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

/** vi_* 物品 vid → ITEM_DEFS 槽位（sw-bj18 同款） */
let vidToId: Record<number, number> | null = null;
function iidOf(vid: number): number {
  if (!vidToId) {
    vidToId = {};
    ITEM_DEFS.forEach((d, i) => {
      const m = /^vi_(\d+)_/.exec(d.key);
      if (m) vidToId![+m[1]] = i;
    });
  }
  return vidToId[vid] ?? -1;
}

const PIRANHA_GUN_ID = iidOf(1156);       // 食人鱼枪（ItemID 1156 → shoot 190）
const PREFIX_ARPEN = 95;                  // vanilla-prefix.json stats['95'].arpen=25（全表唯一 25 档）
const CX = 960, CY = 1440;                // 玩家中心（BJ498 夹具同值）
const MOUSE = [1200, 1000] as const;      // 鼠标世界坐标（camera mock 射影）

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

/** 0 条补射壳（BJ498 §2 mkShell 同款）：channel 电平在位+空弹场 */
function mkShell(armorPen: number): { g: Game; spawned: Arrow[] } {
  const spawned: Arrow[] = [];
  const inv = new Inventory();
  inv.slots[0] = { id: PIRANHA_GUN_ID, stack: 1, prefix: PREFIX_ARPEN };
  const player = {
    inv, dead: false, cx: CX, cy: CY,
    equipStats: { armorPen },
  } as unknown as Player;
  const g = Object.create(Game.prototype) as Record<string, unknown>;
  g['player'] = player;
  g['piranhaChanItemId'] = PIRANHA_GUN_ID;             // 首发位登记的 channel 态
  g['input'] = { mouseHeld: true, uiBlocking: false }; // channel 电平在位
  g['camera'] = { screenToWorld: () => [MOUSE[0], MOUSE[1]] };
  g['entities'] = {
    projectiles: spawned,
    add: (e: Arrow, _b: string) => { spawned.push(e); },
  };
  return { g: g as unknown as Game, spawned };
}

// ============ §1（①）0 条补射位（tickPiranhaChannelRefire）出生点=盒心 ============
describe('BJ499-§1：0 条补射出生/瞄准均=玩家中心（与首发 :20757 R9 批二同构）', () => {
  it('1a 补射出生点=盒心 949/1429（回退 y−4 或摘盒心回正必红）', () => {
    const { g, spawned } = mkShell(12);
    (g as unknown as { tickPiranhaChannelRefire: (inp: unknown) => void })
      .tickPiranhaChannelRefire({ mouseX: 400, mouseY: 300 });
    expect(spawned.length).toBe(3);                      // 0 条在场 → 补满 3 条（:43878 flag4 门）
    for (const pg of spawned) {
      expect(pg.projId).toBe(PIRANHA_PROJ);
      // 夹具自证：190 盒 22×22（SetDefaults,半盒非零 → 盒心修正可观测）
      expect(pg.w).toBe(22);
      expect(pg.h).toBe(22);
      // NewProjectile 传位=盒心（:10878-10879）→ ctor(收盒左上)+placeAtShootSpawn 回正
      // 后盒左上 = 玩家中心 − 半盒 = (960−11, 1440−11)。旧码直传 (cx,cy−4) → (960,1436)
      // 或旧式枪口 → 双双必红
      expect(pg.x).toBe(CX - 11);
      expect(pg.y).toBe(CY - 11);
    }
  });

  it('1b 补射瞄准原点=玩家中心（随机掷钉 0.5 → 扰动恰 0;回退 y−4 必红）', () => {
    const { g, spawned } = mkShell(12);
    // 扰动项 Math.floor(rand*81)−40 在 rand=0.5 时恰为 0 → 弹速=纯 aim 单位向×shootSpeed
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    (g as unknown as { tickPiranhaChannelRefire: (inp: unknown) => void })
      .tickPiranhaChannelRefire({ mouseX: 400, mouseY: 300 });
    expect(spawned.length).toBe(3);
    // 原版 num4/num5 = MouseWorld − pointPosition（:47743-47744,pointPosition=玩家中心
    // :47605——★BJ665 勘正 伪锚 :47588）→ aim 原点=玩家中心,非 (cx, cy−4)（旧码角度差 ~0.0044 rad ≫ 1e-4）
    const ang0 = Math.atan2(MOUSE[1] - CY, MOUSE[0] - CX);
    for (const pg of spawned) {
      expect(pg.pShootSpeed).toBe(14);                   // 夹具自证（itemCombat(1156).shootSpeed）
      expect(pg.vx).toBeCloseTo(14 * Math.cos(ang0), 4);
      expect(pg.vy).toBeCloseTo(14 * Math.sin(ang0), 4);
    }
  });

  it('1c 结构锁：px,py=玩家中心 + placeAtShootSpawn 在位（回填旧式必红）', () => {
    const gAll = stripAll(SRC('core/Game.ts'));
    expect(gAll).toContain('const px = this.player.cx, py = this.player.cy;');
    expect(gAll).toContain('placeAtShootSpawn(pg, px, py);');
    // 旧式直传整行零残留（:15555/17976 等他站 y−4 为不同上下文,锁定的是赋值形整行）
    expect(gAll).not.toContain('const px = this.player.cx, py = this.player.cy - 4;');
  });
});

// ============ §2（①续）1-2 条补弹位（Arrow.pTopUp）出生点=盒心 ============
describe('BJ499-§2：pTopUp 出生/瞄准均=玩家中心（拆除自创枪口 14px/y−4）', () => {
  it('2a 补弹出生点=盒心 949/1429 + BJ498② 继承链透传完好（回退枪口必红）', () => {
    const parent = new Arrow(CX, CY, 3, 0, 40, 1, PIRANHA_PROJ,
      { grav: 0, life: 3600, piranha: { channel: () => true, aim: () => ({ x: MOUSE[0], y: MOUSE[1] }) } });
    parent.armorPen = 37;
    parent.critChance = 0.04;
    parent.frostEligible = true;
    parent.pShootSpeed = 14;
    const added: Arrow[] = [];
    (parent as unknown as { pTopUp: (g: unknown) => void }).pTopUp({
      player: { cx: CX, cy: CY },
      entities: { projectiles: [parent], add: (e: Arrow) => { added.push(e); } },
    });
    expect(added.length).toBe(2);                        // alive=1 → 3−1=2（夹具自证）
    for (const np of added) {
      expect(np.projId).toBe(PIRANHA_PROJ);
      expect(np.w).toBe(22);                             // 夹具自证：半盒非零
      expect(np.h).toBe(22);
      // 盒心=玩家中心（旧码 中心前14px/y−4 枪口直传 → x≈966.7/y≈1423.8 双双必红）
      expect(np.x).toBe(CX - 11);
      expect(np.y).toBe(CY - 11);
      // BJ498①② 邻位透传完好（armorPen 继承/critChance/frostEligible/pShootSpeed）
      expect(np.armorPen).toBe(37);
      expect(np.critChance).toBe(0.04);
      expect(np.frostEligible).toBe(true);
      expect(np.pShootSpeed).toBe(14);
    }
  });

  it('2b 结构锁：ctor 收玩家中心+盒心回正在位（回填枪口式必红）', () => {
    const arrow = stripAll(SRC('entities/Arrow.ts'));
    expect(arrow).toContain('const np = new Arrow(p.cx, p.cy,');
    expect(arrow).toContain('np.x = p.cx - np.w / 2;');
    expect(arrow).toContain('np.y = p.cy - np.h / 2;');
    // 自创枪口两式零残留（「中心前14px」速度复用项/「y−4」基线均须绝迹）
    expect(arrow).not.toContain('Math.cos(a) * 14');
    expect(arrow).not.toContain('p.cy - 4');
  });
});

// ============ §3（②）armorPen 同源不回归（BJ498② 回声,本刀同站改写防回归） ============
describe('BJ499-§3：armorPen 同源不回归（BJ498② 钉值回声）', () => {
  it('3a 0 条补射 armorPen=equipStats+词缀 arpen（摘词缀份必红）', () => {
    const { g, spawned } = mkShell(12);
    (g as unknown as { tickPiranhaChannelRefire: (inp: unknown) => void })
      .tickPiranhaChannelRefire({ mouseX: 400, mouseY: 300 });
    const want = 12 + prefixStat(PREFIX_ARPEN).arpen;    // 12+25=37（词缀份在场）
    expect(want).not.toBe(12);                           // 夹具自证：词缀份非零
    for (const pg of spawned) expect(pg.armorPen).toBe(want);
  });

  it('3b pTopUp 继承链同源（断链必红,BJ498 §2b 同款）', () => {
    const gAll = stripAll(SRC('core/Game.ts'));
    // 补射位 armorPen 同式保持（BJ498② 原文锁回声）
    expect(gAll).toContain(
      'pg.armorPen = (this.player.equipStats.armorPen ?? 0) + (this.heldPrefixStat()?.arpen ?? 0);');
    // 首发位原式保持（:20761）
    expect(gAll).toContain('pg.armorPen = (eq.armorPen ?? 0) + (ps?.arpen ?? 0);');
    // pTopUp 邻位继承透传（BJ498 §1a 台账 np 位回声）
    const arrow = stripAll(SRC('entities/Arrow.ts'));
    expect(arrow).toContain('np.critChance = this.critChance;');
    expect(arrow).toContain('np.armorPen = this.armorPen;');
  });
});
