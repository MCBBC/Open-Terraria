// ★清偿刀 T4（2026-10-01,itemrare/value 面续刀,S1 五段终态为基线）守卫:S1 登记债三件落刀——
//   ① S1③ 守卫/单件/if-else 守卫的 value 面:S1_GUARD_VALUE_PINS 10 族 sweep≡钉表
//     （1977-86=50000(1980=100000/1984=75000/1985=150000)/2104-13=37500/2214-17=100000/
//     2284-87=50000/3309-14=50000/3390-3452=1000/3456-59=10000/3638-42=100;1522-1527/
//     1533-1537 缺行也钉=缺省 0）+单件 2320=75000/if-else 2421=156000/2422=500000。
//     ★S1 头注勘误:2104-13 真值=37500 非 3750（`value = sellPrice(0, 0, 75);` 1457:21880/
//     1456:21854/1458:21880 三版同式;boss 面具卖价 75 银×5 口径）。
//   ② S1④ 鱼链 value 面:S1_FISH_VALUE_PINS 22 ids（运行基值 2500 仅 2290/2297 存活——
//     2291-2296 鱼竿组提前 return/2320 走 :23100 守卫提前 return=死标签;2314 独立 case 既有）。
//   ③ 2320 死标签污染修正:现库 value 2500→75000（守卫 sellPrice(0,1,50)）。
//   ④ S1⑥ 新段:SetDefaults 派发后递归 `if (type >= 1803 && type <= 1807) { SetDefaults(1533
//     + type - 1803); }`（:48922;1456:48525/1458:48922 同锚）——终值=目标面 1533-1537:
//     RARE[1803-1807]=8、VALUE 缺键（=0 重置默认）。
// 消费面:Game.ts:48799 reforgeCost 权威值查表 / Shimmer.ts groupDecraftItemId（组 31 碎片
//   四件同切 10000=均匀平移,OrderBy 稳定序代表 3458 不变）/tooltip rare（1803-1807 新增 8）。
// 变异（判别力,era-guard/S1 判例同法）:五发——S1③value apply/S1③value 单件守卫/鱼链
//   value apply/S1⑥ apply 各一发（摘除→判别值翻转）+value 钉面漂移一发（fail-loud exit≠0）。
//   原文件 sha256 前后全等=零接触。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import rareJson from '../src/data/vanilla-itemrare.json';
import valueJson from '../src/data/vanilla-itemvalue.json';
import { groupDecraftItemId } from '../src/stats/Shimmer';

const RARE = rareJson as Record<string, number>;
const VALUE = valueJson as Record<string, number>;
const SCRIPT = join(dirname(__dirname), 'tools', 'extract-itemrare.mjs');
const SRC = () => readFileSync(SCRIPT, 'utf8');
const TMP = realpathSync(tmpdir());

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// ---- T4 定谳钉表（1457 Item.cs 亲读,独立于提取器;行号=1457 锚） ----

/** S1③ 范围守卫 value 面（base+per-type 覆写;null=守卫无 value 行=缺省 0 缺键） */
const GUARD_VALUE: Array<{ lo: number; hi: number; base: number | null; over?: Record<number, number>; at: string }> = [
  { lo: 1522, hi: 1527, base: null, at: ':18537' },
  { lo: 1533, hi: 1537, base: null, at: ':18559' },   // =S1⑥ 递归目标面
  { lo: 1977, hi: 1986, base: 50000, over: { 1980: 100000, 1984: 75000, 1985: 150000 }, at: ':21236' },
  { lo: 2104, hi: 2113, base: 37500, at: ':21874' },  // ★S1 头注「3750」笔误勘误,源锚 sellPrice(0,0,75)
  { lo: 2214, hi: 2217, base: 100000, at: ':22375' },
  { lo: 2284, hi: 2287, base: 50000, at: ':22988' },
  { lo: 3309, hi: 3314, base: 50000, at: ':30258' },
  { lo: 3390, hi: 3452, base: 1000, at: ':30986' },
  { lo: 3456, hi: 3459, base: 10000, at: ':31021' },
  { lo: 3638, hi: 3642, base: 100, at: ':32793' },
];

/** S1④ 鱼链 value 面 22 ids（:23165-23270 per-type if 双写支;基值 2500 存活件另断言） */
const FISH_VALUE: Record<number, number> = {
  2298: 3750, 2299: 3750, 2300: 3750, 2301: 3750, 2302: 7500,
  2303: 7500, 2304: 15000, 2305: 3750, 2306: 7500, 2307: 12500,
  2308: 500000, 2309: 3750, 2310: 50000, 2311: 7500, 2312: 25000,
  2313: 7500, 2315: 7500, 2316: 7500, 2317: 150000, 2318: 7500,
  2319: 7500, 2321: 12500,
};

/** S1⑥ 递归面:1803-1807（KeyMold 五件）终值=1533-1537 面 */
const RECUR_IDS = range(1803, 1807);
const RECUR_TARGET_IDS = range(1533, 1537);

describe('T4 value 面续刀（S1 登记债三件:守卫/链 value 面+递归+2320 污染修正）', () => {
  it('①守卫 value 面:10 族 base+覆写逐件=钉表（2104-13=37500 勘误面;1522/1533 缺键）', () => {
    for (const g of GUARD_VALUE) {
      for (const id of range(g.lo, g.hi)) {
        const over = g.over?.[id];
        const expected = over ?? g.base;
        if (expected === null) {
          expect(VALUE[String(id)], `value[${id}] 缺键@${g.at}`).toBeUndefined();
        } else {
          expect(VALUE[String(id)], `value[${id}]@${g.at}`).toBe(expected);
        }
      }
    }
    // 覆写件逐点（1977-1986 的 base 与覆写分档）
    expect(VALUE['1977']).toBe(50000);
    expect(VALUE['1980']).toBe(100000);
    expect(VALUE['1984']).toBe(75000);
    expect(VALUE['1985']).toBe(150000);
    expect(VALUE['1986']).toBe(50000);
  });

  it('②2320 死标签污染修正=75000（守卫 sellPrice(0,1,50);鱼链基值 2500 死标签不再现）;2421/2422=156000/500000', () => {
    expect(VALUE['2320']).toBe(75000);
    expect(VALUE['2421']).toBe(156000);   // sellPrice(0,3,12)
    expect(VALUE['2422']).toBe(500000);   // sellPrice(0,10)
    // 源锚在位（2320 守卫在鱼链 switch 之前=标签死码的结构前提）
    const src = readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    expect(src).toContain('if (type == 2320)\n\t\t\t\t{\n\t\t\t\t\tautoReuse = true;');
    expect(src).toContain('value = sellPrice(0, 1, 50);\n\t\t\t\t\tuseStyle = 1;');
  });

  it('③鱼链 value 面:22 件=钉表;基值存活件 2290/2297=2500;2314 独立 case=7500', () => {
    for (const [id, v] of Object.entries(FISH_VALUE)) expect(VALUE[id], `value[${id}]`).toBe(v);
    expect(Object.keys(FISH_VALUE).length).toBe(22);
    expect(VALUE['2290']).toBe(2500);   // 无覆写块,运行基值存活（sellPrice(0,0,5)）
    expect(VALUE['2297']).toBe(2500);
    expect(VALUE['2314']).toBe(7500);   // 独立 case :23120（提取器 case 级既有）
    // 2291-2296 鱼竿组=体前提前 return,保留各自鱼竿值（不被鱼链基值污染）
    expect(VALUE['2292']).toBe(50000);
    expect(VALUE['2294']).toBe(1000000);
  });

  it('④S1⑥ 递归面:RARE[1803-1807]=8（终值=1533-1537 面）;VALUE 缺键;源锚=派发器唯一 SetDefaults( 调用', () => {
    for (const id of RECUR_IDS) expect(RARE[String(id)], `rare[${id}]`).toBe(8);
    for (const id of RECUR_TARGET_IDS) expect(RARE[String(id)], `rare[${id}] 目标面`).toBe(8);
    for (const id of RECUR_IDS) expect(VALUE[String(id)], `value[${id}] 缺键`).toBeUndefined();
    for (const id of RECUR_TARGET_IDS) expect(VALUE[String(id)], `value[${id}] 目标面缺键`).toBeUndefined();
    const src = readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    expect(src).toContain('if (type >= 1803 && type <= 1807)\n\t\t{\n\t\t\tSetDefaults(1533 + type - 1803);\n\t\t}');
  });

  it('消费面:reforgeCost 权威值查表喂点（Game.ts:48799 vid→ITEM_VALUE 直查面）+decraft 组代表不变（组 31 碎片均匀平移）', () => {
    // Game.ts reforgeCost = value×stack 阶序链的 value 源头:json 值即喂点（vid 直查）
    expect(VALUE['2104']).toBe(37500);   // boss 面具重铸费由 0→37500 铜
    expect(VALUE['2320']).toBe(75000);   // Rockfish
    // Shimmer groupDecraftItemId:组 31=碎片 [3458,3456,3457,3459]（注册序）——
    // 四件同切 10000（等值并列,if (v < bestV) 严格小于=首件胜）→ 代表 3458 与刀前一致
    expect(groupDecraftItemId(31)).toBe(3458);
    for (const id of [3456, 3457, 3458, 3459]) expect(VALUE[String(id)]).toBe(10000);
  });

  it('三版同构:1456/1458 --dump T4 面≡1457（跨版对拍;recon 双实例同口径前提）', () => {
    const dumpOf = (ver: string) => {
      const r = spawnSync('node', [SCRIPT, '--dump'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: ver },
      });
      expect(r.status).toBe(0);
      return JSON.parse(String(r.stdout)) as { RARE: Record<string, number>; VALUE: Record<string, number> };
    };
    for (const ver of ['1456', '1458']) {
      const d = dumpOf(ver);
      for (const g of GUARD_VALUE) {
        for (const id of range(g.lo, g.hi)) {
          const expected = g.over?.[id] ?? g.base;
          if (expected === null) expect(d.VALUE[String(id)], `${ver} guard[${id}] 缺键`).toBeUndefined();
          else expect(d.VALUE[String(id)], `${ver} guard[${id}]`).toBe(expected);
        }
      }
      for (const [id, v] of Object.entries(FISH_VALUE)) expect(d.VALUE[String(id)], `${ver} fish[${id}]`).toBe(v);
      for (const id of [2320, 2421, 2422]) expect(d.VALUE[String(id)], `${ver} single[${id}]`).toBe(VALUE[String(id)]);
      for (const id of RECUR_IDS) expect(d.RARE[String(id)], `${ver} recur[${id}]`).toBe(8);
      for (const id of RECUR_IDS) expect(d.VALUE[String(id)], `${ver} recur[${id}] 缺键`).toBeUndefined();
    }
  });

  // ---- 变异（判别力）:五发。cp 变异副本→--dump 判别值翻转=该段是唯一来源;
  //      原文件 sha256 前后全等=零接触。 ----
  const shaOf = () => createHash('sha256').update(readFileSync(SCRIPT)).digest('hex');
  const runMutant = (srcMutation: (s: string) => string) => {
    const mutant = join(TMP, `t4-mutant-${createHash('md5').update(String(Math.random())).digest('hex').slice(0, 8)}.mjs`);
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(mutant, srcMutation(SRC()));
    const r = spawnSync('node', [mutant, '--dump'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1457' },
    });
    const out = String(r.stdout);
    return { r, parsed: out ? (JSON.parse(out) as { RARE: Record<string, number>; VALUE: Record<string, number> }) : null };
  };

  it('变异①摘 S1③value apply→value[2214]/value[3390] 缺键（证明 10 族 value 面由 S1_GUARD_VALUE_PINS apply 唯一承载）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '    if (baseV !== null) for (let id = pin.lo; id <= pin.hi; id++) VALUE[id] = baseV;\n    for (const [idS, v] of Object.entries(parsedOver)) VALUE[+idS] = v;',
      '    // ★变异:S1③value apply 摘除',
    ).replace(
      // ★V1 同步:V1 ch 对拍(先于 dump 的 fail-loud)一并摘除=隔离本变异的受试面(S1③value apply)
      "} else if (pin.own === 'ch') {",
      "} else if (false) { // ★变异:V1 ch 对拍摘除",
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['2214']).toBeUndefined();
    expect(parsed!.VALUE['3390']).toBeUndefined();
    expect(parsed!.VALUE['1980']).toBeUndefined();
    expect(parsed!.VALUE['2320']).toBe(75000);   // 单件守卫面独立承载,不随族 apply 摘除丢失
    expect(shaOf()).toBe(before);
  });

  it('变异②摘 2320 污染修正 apply→value[2320] 回落 2500 死标签（证明修正由 S1③value 单件守卫段唯一承载）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '  VALUE[2320] = 75000; // 死标签污染修正:鱼链运行基值 2500 经死标签写入现库,真值=守卫面',
      '  // ★变异:2320 修正 apply 摘除',
    ).replace(
      // ★V1 同步:V1 ch 对拍(先于 dump 的 fail-loud)一并摘除=隔离本变异的受试面(2320 修正 apply)
      "} else if (pin.own === 'ch') {",
      "} else if (false) { // ★变异:V1 ch 对拍摘除",
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['2320']).toBe(2500);    // 区域扫描死标签面复活=修正的判别面
    expect(parsed!.VALUE['2421']).toBe(156000);
    expect(shaOf()).toBe(before);
  });

  it('变异③摘鱼链 value apply→value[2308] 回落 2500 死基值（证明 22 件 value 面由 S1④ value apply 唯一承载）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '  for (const [id, v] of Object.entries(parsedValue)) VALUE[id] = v;',
      '  // ★变异:鱼链 value apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['2308']).toBe(2500);    // 区域扫描死基值面复活
    expect(parsed!.VALUE['2317']).toBe(2500);
    expect(parsed!.RARE['2308']).toBe(3);        // rare 面不随 value apply 摘除丢失
    expect(shaOf()).toBe(before);
  });

  it('变异④摘 S1⑥ apply→rare[1803] 缺键（证明递归面由 S1⑥ 唯一承载）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '    RARE[rec.A + k] = RARE[rec.C + k];  // 递归覆写:rare=目标面',
      '    // ★变异:S1⑥ apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.RARE['1803']).toBeUndefined();
    expect(parsed!.RARE['1807']).toBeUndefined();
    expect(shaOf()).toBe(before);
  });

  it('变异⑤守卫 value 钉值漂移→sweep≡pins fail-loud exit≠0（证明新 value 面现形必被拦）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      "{ lo: 3456, hi: 3459, base: 10000, over: {}, at: ':31021' }, // sellPrice(0,0,20)",
      "{ lo: 3456, hi: 3459, base: 20000, over: {}, at: ':31021' }, // sellPrice(0,0,20)",
    ));
    expect(r.status).not.toBe(0);                          // fail-loud 拒产
    expect(parsed).toBeNull();                             // 零输出（不落盘不 dump）
    expect(r.stderr).toContain('S1③value 守卫 3456-3459 base 漂移');
    expect(shaOf()).toBe(before);
  });
});
