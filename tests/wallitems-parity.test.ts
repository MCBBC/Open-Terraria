// 墙物品放置链硬闸门（2026-08-13，功能缺口 §2）：
// vanilla-wallitems.json × Item.cs SetDefaults1-5 createWall 全量 × WallID 常量表 三方对账。
//
// 根因：旧提取器只认 `case N:\n + createWall = 数字;` 一种写法，漏共享 case 段算式
// （:21113 `116 + type - 1948`）、if 区间段（:22764-22769）、嵌套 switch 内层 case
// （:25866-25929）与 DefaultToPlaceableWall 辅助（:48017）→ 未入表的墙物品放置静默无效。
//
// 三层检查（运行时直读反编译源码，零快照零腐烂）：
//   A. 向上归因独立重推导——每处 createWall 赋值行从下往上找归属 case 组/区间段，
//      与提取器的"标签→体"向下解析互为独立算法，共享解析 bug 必炸；
//   B. 表结构完整性——wall 正整数、key=vi_{id}_{slug(name)}、id↔wall 双射；
//   C. WallID.cs 常量语义对账——墙 id 必须有常量专名，物品名/墙名规范化后相等
//      （45 条原版命名怪癖白名单：Dungeon↔Brick、Echo/Unsafe 后缀、RichMaogany 原版拼写错等）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import wallItems from '../src/data/vanilla-wallitems.json';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// ★树锚保持 1456：1457 Item.cs 已把 SetDefaults1-5 合并为单个 SetDefaults(int Type,
// ItemVariant variant=null)（:48666,物品系统重构）——本测试的独立重推导按 1-5 方法体
// 分区解析,结构绑定 1-5 布局,无法直读 1457;数据等价性已核：createWall 赋值 136 处
// 两版逐字节同、WallID.cs 全同 → vanilla-wallitems.json 对 1457 仍成立。
const ITEM_CS = `${ROOT}/Terarria1456/Terraria/Item.cs`;
const WALLID_CS = `${ROOT}/Terarria1456/Terraria.ID/WallID.cs`;

type Entry = { wall: number; key: string; name: string; line: number };
const table = wallItems as Record<string, Entry>;

const itemLines = readFileSync(ITEM_CS, 'utf8').split('\n');
const depthOf = (i: number): number => {
  let d = 0;
  while (itemLines[i]?.[d] === '\t') d++;
  return d;
};

/** SetDefaults1-5 方法体切片（按下一方法声明收边；:27625 DefaultToQuestFish、
 *  :35420 DefaultToGolfBall 夹在中间须排除，DefaultToPlaceableWall 定义 :48017 在外） */
function regionSlices(): Array<[number, number]> {
  const decl = /^\t(?:public|private|internal|protected)[\w<>\[\], .]* [\w]+\(/;
  const out: Array<[number, number]> = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const s = itemLines.findIndex((l) => l.startsWith(`\tpublic void SetDefaults${n}(`));
    expect(s, `Item.cs 缺 SetDefaults${n}`).toBeGreaterThan(0);
    let e = s + 1;
    while (e < itemLines.length && !decl.test(itemLines[e])) e++;
    out.push([s + 1, e]);
  }
  return out;
}
const SLICES = regionSlices();
const inRegion = (i: number) => SLICES.some(([a, b]) => i >= a && i < b);

const evalExpr = (expr: string, type: number): number => {
  const js = expr.replace(/\(ushort\)/g, '').replace(/\(int\)/g, '').replace(/\btype\b/g, `(${type})`).replace(/\s+/g, '');
  expect(js, `不支持的 createWall 表达式: ${expr}`).toMatch(/^[-+*/()0-9]+$/);
  return Math.trunc(Function(`"use strict"; return (${js});`)() as number);
};

/** 层 A：向上归因。每个赋值行 → 归属物品 id 集合。
 *  规则：赋值行缩进 k，归属 = 缩进 k-1 的 case 标签连排组（内层 switch 的 case 恰好
 *  在 k-1，天然取到最内层）；无标签则回退到最小包含 if(type…) 区间段。 */
function upwardLedger(): Map<number, { wall: number; line: number }> {
  const labelRe = /^(\t*)(case (\d+)|default):$/;
  const labels: Array<{ i: number; d: number; ids: number[] | null }> = [];
  for (let i = 0; i < itemLines.length; i++) {
    if (!inRegion(i)) continue;
    const m = labelRe.exec(itemLines[i]);
    if (m) labels.push({ i, d: m[1].length, ids: m[3] ? [Number(m[3])] : null });
  }
  const rangeRe = /if \(type (>=|>|<=|<) (\d+) && type (>=|>|<=|<) (\d+)\)/;
  const cmp = (op: string, a: number, b: number) =>
    op === '>=' ? a >= b : op === '>' ? a > b : op === '<=' ? a <= b : a < b;
  // 全体 if(type…) 区间段及其花括号块行界
  const ranges: Array<{ from: number; to: number; lo: number; hi: number; ops: [string, string] }> = [];
  for (let i = 0; i < itemLines.length; i++) {
    if (!inRegion(i)) continue;
    const m = rangeRe.exec(itemLines[i]);
    if (!m) continue;
    let net = 0;
    let started = false;
    let j = i;
    do {
      net += (itemLines[j].match(/\{/g) ?? []).length - (itemLines[j].match(/\}/g) ?? []).length;
      if (net > 0) started = true;
      j++;
    } while (j < itemLines.length && (!started || net > 0));
    const [x, y] = [Number(m[2]), Number(m[4])].sort((p, q) => p - q);
    ranges.push({ from: i, to: j, lo: x, hi: y, ops: [m[1], m[3]] });
  }

  const ledger = new Map<number, { wall: number; line: number }>();
  let occurrences = 0;
  for (let i = 0; i < itemLines.length; i++) {
    if (!inRegion(i)) continue;
    const cw = /\bcreateWall\s*=\s*([^;]+);/.exec(itemLines[i]);
    const dw = /DefaultToPlaceableWall\((.+?)\);/.exec(itemLines[i]);
    if (!cw && !dw) continue;
    occurrences++;
    const expr = (cw ? cw[1] : dw![1]).trim();
    const k = depthOf(i);
    // (a) 最靠近的上一行缩进 k-1 标签，且其与赋值行之间无缩进 <= k-1 的行
    let groupEnd = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (depthOf(j) < k) { groupEnd = j; break; } // switch 收口或更外层 → 不属任何 case 体
      if (depthOf(j) === k - 1 && labelRe.test(itemLines[j])) { groupEnd = j; break; }
    }
    let owners: number[] = [];
    if (groupEnd >= 0 && labelRe.test(itemLines[groupEnd]) && depthOf(groupEnd) === k - 1) {
      // 沿相邻同缩进标签行向左扩成连排组
      let j = groupEnd;
      while (j - 1 >= 0 && labelRe.test(itemLines[j - 1]) && depthOf(j - 1) === k - 1 && itemLines[j - 1].endsWith(':')) j--;
      for (let t = j; t <= groupEnd; t++) {
        const m = labelRe.exec(itemLines[t]);
        if (m?.[3]) owners.push(Number(m[3]));
      }
    } else {
      // (b) 区间段：最小包含块
      let best: (typeof ranges)[number] | undefined;
      for (const r of ranges) if (i >= r.from && i < r.to && (!best || r.to - r.from < best.to - best.from)) best = r;
      expect(best, `Item.cs:${i + 1} createWall 既不在 case 体也不在 if(type…) 区间段`).toBeTruthy();
      for (let id = best!.lo; id <= best!.hi; id++) {
        if (cmp(best!.ops[0], id, Number(rangeRe.exec(itemLines[best!.from])![2])) &&
            cmp(best!.ops[1], id, Number(rangeRe.exec(itemLines[best!.from])![4]))) owners.push(id);
      }
    }
    expect(owners.length, `Item.cs:${i + 1} createWall 归属为空`).toBeGreaterThan(0);
    for (const id of owners) {
      const wall = evalExpr(expr, id);
      const prev = ledger.get(id);
      if (prev) expect(prev.wall, `item ${id} 两处 createWall 不一致(:${prev.line + 1} vs :${i + 1})`).toBe(wall);
      else ledger.set(id, { wall, line: i });
    }
  }
  expect(occurrences, '源码侧 createWall 赋值行数').toBeGreaterThan(200);
  return ledger;
}

describe('wallitems parity（Item.cs createWall 全量 ↔ vanilla-wallitems.json）', () => {
  const ledger = upwardLedger();

  it('A. 表与源码账本逐条相等（id 集合 + 墙 id 值）', () => {
    const tableIds = new Set(Object.keys(table).map(Number));
    const ledgerIds = new Set(ledger.keys());
    expect([...tableIds].filter((id) => !ledgerIds.has(id)), '表内有、源码无的条目').toEqual([]);
    expect([...ledgerIds].filter((id) => !tableIds.has(id)), '源码有、表内漏的条目（放置静默无效根因）').toEqual([]);
    for (const [id, { wall }] of ledger) expect(table[String(id)].wall, `item ${id}`).toBe(wall);
  });

  it('A2. 条目数与墙覆盖量（2026-08-13 基线 292/292，表扩张须同步本断言）', () => {
    expect(Object.keys(table).length).toBeGreaterThanOrEqual(292);
    expect(new Set(Object.values(table).map((e) => e.wall)).size).toBe(Object.keys(table).length);
  });

  it('B. 表结构：wall 正整数 / key=vi_{id}_{slug(name)} / name 对齐 vanilla.json / line 指向赋值行', () => {
    const vanilla = JSON.parse(readFileSync(`${ROOT}/game/public/sprites/vanilla.json`, 'utf8')).items;
    const slug = (k: string) =>
      k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    for (const [idS, e] of Object.entries(table)) {
      const id = Number(idS);
      expect(Number.isInteger(e.wall) && e.wall > 0, `item ${id} wall 非法`).toBe(true);
      expect(e.key, `item ${id} key`).toBe(`vi_${id}_${slug(e.name)}`);
      expect(vanilla[idS]?.key, `item ${id} name 与 vanilla.json 不符`).toBe(e.name);
      expect(/\bcreateWall\s*=|DefaultToPlaceableWall\(/.test(itemLines[e.line - 1] ?? ''), `item ${id} line ${e.line} 不是赋值行`).toBe(true);
    }
  });

  it('C. WallID.cs 常量语义对账（墙 id 有专名，物品名/墙名规范化后相等或命中原版命名怪癖白名单）', () => {
    const consts = new Map<number, string>();
    for (const m of readFileSync(WALLID_CS, 'utf8').matchAll(/public const ushort (\w+) = (\d+);/g)) {
      consts.set(Number(m[2]), m[1]);
    }
    const slug = (k: string) =>
      k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    // 原版命名怪癖：地牢三色 Brick↔Dungeon、块墙省 Block、灰浆 Gray、原版拼写错
    // RichMaogany、RainbowStainedGlass、MetalFence、Gray/Grey、ArcaneRunes、Echo/Unsafe 族、
    // LihzahrdBrick、Shimmerfall 等（ItemID 名与 WallID 名不同字面但同物）
    const QUIRKS = new Set([
      '135', '138', '140', '618', '623', '768', '769', '770', '1272', '1378', '1379', '1380', '1381',
      '1382', '1383', '1448', '2008', '2271', '3238', '3273', '3340', '3341', '3342', '3343', '3344',
      '3345', '3346', '3348', '5365', '5366', '5367', '5368', '5369', '5370', '5371', '5372', '5373',
      '5374', '5375', '5376', '5397', '5418', '5420', '5422', '5494',
    ]);
    for (const [idS, e] of Object.entries(table)) {
      const wname = consts.get(e.wall);
      expect(wname, `item ${idS} 墙 id ${e.wall} 无 WallID.cs 常量`).toBeTruthy();
      // 去 `_wall` 词元后比较（StoneWall↔Stone、AmberGemsparkWallOff↔AmberGemsparkOff 都命中）
      const strip = (s: string) =>
        slug(s).replace(/(^|_)wall(?=_|$)/g, '$1').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const ok = strip(e.name) === strip(wname!) || QUIRKS.has(idS);
      expect(ok, `item ${idS}(${e.name}) → 墙 ${e.wall}(${wname}) 命名对不上且不在怪癖白名单`).toBe(true);
    }
  });

  it('D. 缺口清单 §2 十四件逐件定案：6 真墙物品入表、8 假阳性（扫表器误报）以源码行号证伪', () => {
    // 真：共享 case 段算式（:21113/:21402/:22064/:22344/:24059/:26624/:33303）
    expect(table['1957']?.wall).toBe(125); // Grinch Finger Wallpaper  :21113 116+type-1948
    expect(table['2014']?.wall).toBe(132); // Starlit Heaven Wallpaper  :21402 126+type-2008
    expect(table['2160']?.wall).toBe(135); // Ducky Wallpaper           :22064 133+type-2158
    expect(table['2213']?.wall).toBe(141); // Shadewood Fence           :22344 138+type-2210
    expect(table['2434']?.wall).toBe(148); // Sail                      :24059 146+type-2432
    expect(table['2791']?.wall).toBe(175); // Shroomite Plating Wall    :26624 173+type-2789
    expect(table['3762']?.wall).toBe(230); // Silly Green Balloon Wall  :33303 228+(type-3760)
    // 假阳性：源码侧无 createWall——放置链各自另有机制
    expect(table['2']).toBeUndefined();      // Dirt Block → createTile=0（:1390）
    expect(table['29']).toBeUndefined();     // Life Crystal（:1706 无放置）
    expect(table['206']).toBeUndefined();    // Water Bucket（:3960 倾倒液体非放置）
    expect(table['207']).toBeUndefined();    // Lava Bucket（:3969 同上）
    expect(table['215']).toBeUndefined();    // Whoopie Cushion（:4030 坐垫音效）
    expect(table['1124']).toBeUndefined();   // Hive = tileWand 消耗材（:13869 tileWand=1124）
    expect(table['1905']).toBeUndefined();   // Blue and Yellow Lights = 圣诞树顶饰
                                             //   （Player.cs:41055 PlaceThing_XMasTreeTops 1874-1905）
    expect(table['2262']).toBeUndefined();   // Blue Dynasty Shingles → createTile=313（:22752）
                                             //   墙是 2263/2264（:22768 区间段）
  });

  it('E. 三种写法锚点：直赋 / DefaultToPlaceableWall 辅助 / if 区间段 / 嵌套 switch 内层 case', () => {
    expect(table['26']?.wall).toBe(1);      // Stone Wall 直赋 :1675
    expect(table['5365']?.wall).toBe(7);    // Cursed Blue Brick Wall DefaultToPlaceableWall(7) :42537
    expect(table['2263']?.wall).toBe(142);  // White Dynasty Wall 区间段 :22764-22769
    expect(table['2264']?.wall).toBe(143);  // Blue Dynasty Wall  同段
    expect(table['4486']?.wall).toBe(246);  // Ebonstone Wall DefaultToPlaceableWall((ushort)(246+type-4486)) :37858
    expect(table['2678']?.wall).toBe(157);  // Offline Amber Gemspark Wall 嵌套 switch 内层 :25888
    expect(table['2690']?.wall).toBe(163);  // Offline Topaz Gemspark Wall   :25924
  });

  it('F. 消费端闭环：全表经 items.ts 注册后 wallId 逐条生效（放置链无需逐件接线）', { timeout: 120_000 }, async () => {
    const { ITEM_BY_KEY, ITEM_DEFS } = await import('../src/data/items');
    for (const [idS, e] of Object.entries(table)) {
      const idx = ITEM_BY_KEY[e.key];
      expect(idx, `items.ts 未注册 ${e.key}（JSON 扩条目未生效）`).toBeDefined();
      expect(ITEM_DEFS[idx].wallId, `item ${idS} wallId 未接`).toBe(e.wall);
    }
    // 新增条目代表（旧表 124 条之外）：键存在 + wallId 正确
    for (const idS of ['1948', '1957', '2213', '2434', '2791', '3762', '4486', '5365', '6133']) {
      expect(ITEM_DEFS[ITEM_BY_KEY[table[idS].key]].wallId, `item ${idS}`).toBe(table[idS].wall);
    }
  });
});
