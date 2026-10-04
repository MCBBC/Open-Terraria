// ★BJ498（2026-10-04）掷率收编尾六（BJ497 新登记两件,收编战役真尾批）判别测试。
//  定谳锚（Terarria1457 亲读,行号=落刀日盘上）：
//   · ①Arrow.ts critBonus 传播链写位清扫：BJ497 定谳「字段零读者但 14 传播写位抄 0 死值」
//     ——普查=13 位存活（第 14 位=MagnetSphereProj bolt 位,BJ497② 已摘）。各写位
//     `X.critBonus = this.critBonus` 的源恒类缺省 0（spawn 写位 BJ493②③/BJ496①② 全
//     退役）,唯一读面（Arrow 主环 `??` 兜底）不可达（critChance 类缺省 0,?? 不认 0 为
//     未设）⇒ 链上零读者死值,摘除零漂移。字段+hellwing-cast 契约+主环 `??` 兜底原文
//     （bj489 1c 结构锁）保留。
//   · ②190 补射位 armorPen 同源化：190=MechanicalPiranha（Terraria.ID/ProjectileID.cs:832）
//     =食人鱼枪 PiranhaGun（Terraria.ID/ItemID.cs:3858,vid 1156）专用弹（SetDefaults
//     Projectile.cs:2781-2791：aiStyle 39/ranged/penetrate −1/22×22,自身 armorPenetration
//     无 SetDefaults 直写=0）。原版补射=【逐发重算】非首发定值继承：Player.cs:43878
//     `type==1156 && channel && num<3` 置 flag4 → 与首发同走 1156 专支（Player.cs
//     :48847-48862）逐发 NewProjectile(EntitySource_ItemUse) → Projectile.
//     ApplyStatsFromSource :11130 逐发 `armorPenetration += item.armorPenetration`
//     （词缀份=Item.cs:587 `armorPenetration += arpen` 烘入 item 值）;owner 装备份=
//     命中拍 GetArmorPenetration（Projectile.cs:12852）。仓内 spawn 冻结注入=BJ491③
//     登记口径,补射位 Game.ts 补 `heldPrefixStat()?.arpen` 与首发 :20761 同式;
//     Arrow.pTopUp 继承链随之同源。
//  判别力（旧码必红项）：§1a 传播写位回填必红（结构锁）+邻位 critChance/armorPen 透传
//    完好（过删必红）/§1b 字段摘除或 `??` 兜底改形必红（hellwing 契约+BJ489 锁回声）/
//    §2a 补射位摘词缀份必红（armorPen 12→37 钉值翻转）/§2b 首发位改形或 pTopUp 继承
//    断链必红。
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
/** 结构锁用：块注释+整行注释一并剥离（not.toContain 断言防文档词误伤,BJ497 同款） */
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

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

// ================ §1（①）Arrow critBonus 传播链写位清扫 ================
describe('BJ498-§1：13 位传播写位零残留（字段+契约+`??` 兜底保留）', () => {
  it('1a 写位零残留结构锁+邻位透传完好（回填/过删必红）', () => {
    const arrow = stripAll(SRC('entities/Arrow.ts'));
    // 传播写位（成员赋值形）零残留——旧码 13 位 `X.critBonus = this.critBonus;` 回填任一即红
    expect((arrow.match(/\.critBonus\s*=/g) ?? []).length).toBe(0);
    // 剥注释后全文件恰 2 处 critBonus：字段声明 + 主环 `??` 兜底读面（不可达死支原文）
    expect((arrow.match(/critBonus/g) ?? []).length).toBe(2);
    // 13 位邻位透传完好（bee 双位=蜂蜜徽章箭+蜜雷锋;变量名单=普查台账）
    for (const v of ['cloud', 'pillar', 'snake', 'bee', 's', 'c', 'pin', 'cone1', 'b', 'a630', 'np', 'child']) {
      expect(arrow).toContain(`${v}.critChance = this.critChance;`);
      expect(arrow).toContain(`${v}.armorPen = this.armorPen;`);
    }
  });

  it('1b 字段+hellwing 契约+主环 `??` 兜底保留（删字段/改兜底必红）', () => {
    const arrow = stripAll(SRC('entities/Arrow.ts'));
    expect(arrow).toContain('critBonus = 0;');                                // 字段保留（BJ497① 判词不动）
    expect(arrow).toContain('this.critChance ?? (4 + this.critBonus) / 100'); // BJ489 1c 原文锁回声
    expect(arrow).toContain('this.critChance, this.armorPen);');              // 535 转换站调用形（BJ497③ 后形）
    // hellwing-cast 契约同款回声（tests/hellwing-cast.test.ts :146-149 直写直读）
    const a = new Arrow(0, 0, 1, 0, 5, 1, 2, {});
    a.critBonus = 18;
    expect(a.critBonus).toBe(18);
  });
});

// ================ §2（②）190 补射位 armorPen 同源化 ================
describe('BJ498-§2：190 补射 armorPen 同源钉值（词缀份在场）', () => {
  interface ShellRec { g: Game; spawned: Arrow[]; }
  function mkShell(armorPen: number): ShellRec {
    const spawned: Arrow[] = [];
    const inv = new Inventory();
    inv.slots[0] = { id: PIRANHA_GUN_ID, stack: 1, prefix: PREFIX_ARPEN };
    const player = {
      inv, dead: false, cx: 960, cy: 1440,
      equipStats: { armorPen },
    } as unknown as Player;
    // Game.prototype 壳（sw-bj18 同款）：按需挂成员,绕开私有/具体类型面
    const g = Object.create(Game.prototype) as Record<string, unknown>;
    g['player'] = player;
    g['piranhaChanItemId'] = PIRANHA_GUN_ID;            // 首发位登记的 channel 态
    g['input'] = { mouseHeld: true, uiBlocking: false }; // channel 电平在位
    g['camera'] = { screenToWorld: () => [1200, 1000] };
    g['entities'] = {
      projectiles: spawned,
      add: (e: Arrow, _b: string) => { spawned.push(e); },
    };
    return { g: g as unknown as Game, spawned };
  }

  it('2a 0 条补射 armorPen=equipStats+词缀 arpen（摘词缀份必红）', () => {
    const { g, spawned } = mkShell(12);
    (g as unknown as { tickPiranhaChannelRefire: (inp: unknown) => void })
      .tickPiranhaChannelRefire({ mouseX: 400, mouseY: 300 });
    expect(spawned.length).toBe(3);                      // 0 条在场 → 补满 3 条（:43878 flag4 门）
    const want = 12 + prefixStat(PREFIX_ARPEN).arpen;    // 12+25=37（词缀份在场）
    expect(want).not.toBe(12);                           // 夹具自证：词缀份非零
    for (const pg of spawned) {
      expect(pg.projId).toBe(PIRANHA_PROJ);
      expect(pg.critChance).toBe(0.04);                  // 0.04 路由门在位（BJ497① 同形）
      expect(pg.armorPen).toBe(want);                    // ★钉值（旧式 12 必红）
      expect(pg.frostEligible).toBe(true);
      expect(pg.pShootSpeed).toBe(14);                   // itemCombat(1156).shootSpeed
    }
  });

  it('2b 首发位同式对拍+pTopUp 继承链同源（断链必红）', () => {
    const gAll = stripAll(SRC('core/Game.ts'));
    // 首发位原式保持（:20761）
    expect(gAll).toContain('pg.armorPen = (eq.armorPen ?? 0) + (ps?.arpen ?? 0);');
    // 补射位同式（heldPrefixStat 词缀份在场）
    expect(gAll).toContain(
      'pg.armorPen = (this.player.equipStats.armorPen ?? 0) + (this.heldPrefixStat()?.arpen ?? 0);');
    // pTopUp 继承链：补射/首发生成的父弹 armorPen(37) → 1-2 条补弹同源（P:42856 语义路径）
    const parent = new Arrow(960, 1436, 3, 0, 40, 1, PIRANHA_PROJ,
      { grav: 0, life: 3600, piranha: { channel: () => true, aim: () => ({ x: 1200, y: 1000 }) } });
    parent.armorPen = 37;
    parent.critChance = 0.04;
    parent.frostEligible = true;
    parent.pShootSpeed = 14;
    const added: Arrow[] = [];
    (parent as unknown as { pTopUp: (g: unknown) => void }).pTopUp({
      player: { cx: 960, cy: 1440 },
      entities: { projectiles: [parent], add: (e: Arrow) => { added.push(e); } },
    });
    expect(added.length).toBe(2);                        // alive=1 → 3−1=2（夹具自证）
    for (const np of added) {
      expect(np.projId).toBe(PIRANHA_PROJ);
      expect(np.armorPen).toBe(37);                      // 继承父弹同源值
      expect(np.critChance).toBe(0.04);
      expect(np.frostEligible).toBe(true);
    }
  });
});
