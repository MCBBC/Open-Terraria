// ★清偿刀 U1（2026-10-01,方法级【无 rare】value 守卫 34 族,T4 census 主面落刀）守卫:
//   S1/T4 终态为基线,本刀落「守卫块内无 rare 行」的 value 面（与 S1③④有 rare 守卫对偶）:
//   ① 34 census 族+census 外 else 面（1479-1480,1479-1494 父守卫 if-else else 支）逐件=钉表;
//   ② 形态分类:字面 base/sellPrice·buyPrice 表达式 base/per-type if 覆写（2379/2389=100000）/
//     if-else 双支（1481-1494 if=10000·else 支 1479-1480=5000）——每形态独立断言;
//   ③ 4695-4697 死码排除（★T4 定谳翻案:=case 4695-4700 体【内】嵌套 if-else 活面
//     1000/40000,非方法级域——本刀不写值,登债待 case 体 per-type if 值域专刀）;
//   ④ 消费面:groupDecraftItemId 组代表零变更（U1 全 217 id 不属任何 RecipeGroup,机械核）+
//     SellChain 卖价链喂点（itemStoreValue 直查→÷5 卖价归真）;
//   ⑤ 三版同构:1456/1458 --dump U1 面≡1457（recon 双实例同口径前提）;
//   ⑥ 行源序:族内 10 id（1710 等）被 S1⑤ 派发后或块终值覆写 100000（U1 基值 200 不可见）。
// 变异（判别力,T4/era-guard 判例同法）:六发——U1 apply 摘除/钉值漂移 fail-loud/钉表键漂移
//   fail-loud/liveness 旁路（caseHitOf 恒 0→4695-4697 混入 live 面→门⑤键集爆红）/
//   单件清单漂移 fail-loud/S1⑤ 或块摘除（1710 回落 U1 基值 200=行源序判别面）。
//   原文件 sha256 前后全等=零接触（cp 变异副本,禁 git checkout）。
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import valueJson from '../src/data/vanilla-itemvalue.json';
import rareJson from '../src/data/vanilla-itemrare.json';
import { groupDecraftItemId } from '../src/stats/Shimmer';
import { itemStoreValue, computeSellValue } from '../src/stats/SellChain';
import recipeDoc from '../src/data/vanilla-recipes.json';

const VALUE = valueJson as Record<string, number>;
const RARE = rareJson as Record<string, number>;
const SCRIPT = join(dirname(__dirname), 'tools', 'extract-itemrare.mjs');
const SRC = () => readFileSync(SCRIPT, 'utf8');
const TMP = realpathSync(tmpdir());

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// ---- U1 定谳钉表（1457 Item.cs 亲读,独立于提取器;at=1457 行号锚） ----
const U1: Array<{ lo: number; hi: number; base: number; over?: Record<number, number>; at: string }> = [
  { lo: 1479, hi: 1480, base: 5000, at: ':18317 else sellPrice(0,0,10)' },            // census 外同形
  { lo: 1481, hi: 1494, base: 10000, at: ':18313 buyPrice(0,1)' },
  { lo: 1500, hi: 1502, base: 5000, at: ':18365 sellPrice(0,0,10)' },
  { lo: 1528, hi: 1532, base: 2500, at: ':18556 字面' },
  { lo: 1538, hi: 1540, base: 5000, at: ':18577 sellPrice(0,0,10)' },
  { lo: 1541, hi: 1542, base: 5000, at: ':18592 sellPrice(0,0,10)' },
  { lo: 1543, hi: 1545, base: 300000, at: ':18605 sellPrice(0,6)' },
  { lo: 1709, hi: 1712, base: 200, at: ':19282 字面' },
  { lo: 1713, hi: 1718, base: 300, at: ':19297 字面' },
  { lo: 1719, hi: 1722, base: 2000, at: ':19311 字面' },
  { lo: 2055, hi: 2065, base: 3000, at: ':21811 字面' },
  { lo: 2066, hi: 2071, base: 2000, at: ':21826 字面' },
  { lo: 2072, hi: 2081, base: 300, at: ':21841 字面' },
  { lo: 2082, hi: 2091, base: 500, at: ':21856 字面' },
  { lo: 2092, hi: 2103, base: 1500, at: ':21871 字面' },
  { lo: 2114, hi: 2118, base: 2500, at: ':21895 sellPrice(0,0,5)' },
  { lo: 2129, hi: 2134, base: 500, at: ':21962 字面' },
  { lo: 2135, hi: 2138, base: 300, at: ':21976 字面' },
  { lo: 2145, hi: 2148, base: 150, at: ':22037 字面' },
  { lo: 2149, hi: 2152, base: 1500, at: ':22052 字面' },
  { lo: 2153, hi: 2155, base: 300, at: ':22067 sellPrice(0,0,0,60)' },
  { lo: 2254, hi: 2256, base: 300, at: ':22736（SD3 尾卫大块内 d4）' },
  { lo: 2376, hi: 2385, base: 300, over: { 2379: 100000 }, at: ':23933+:23936 buyPrice(0,10)' },
  { lo: 2386, hi: 2396, base: 300, over: { 2389: 100000 }, at: ':23952+:23955 buyPrice(0,10)' },
  { lo: 2397, hi: 2416, base: 300, at: ':23971' },
  { lo: 2442, hi: 2449, base: 25000, at: ':24149 sellPrice(0,0,50)' },
  { lo: 2631, hi: 2633, base: 150, at: ':25657' },
  { lo: 2634, hi: 2636, base: 300, at: ':25672' },
  { lo: 2648, hi: 2651, base: 300, at: ':25771 sellPrice(0,0,0,60)' },
  { lo: 2652, hi: 2657, base: 3000, at: ':25787' },
  { lo: 2658, hi: 2663, base: 300, at: ':25802' },
  { lo: 2664, hi: 2668, base: 1500, at: ':25817' },
  { lo: 3651, hi: 3662, base: 300, at: ':32846' },
  { lo: 3739, hi: 3741, base: 50, at: ':33116 buyPrice(0,0,0,50)' },
  { lo: 3915, hi: 3916, base: 300, at: ':34611' },
];
const U1_IDS = new Set<number>();
for (const g of U1) for (const id of range(g.lo, g.hi)) U1_IDS.add(id);
const U1_OR_BLOCK_IDS = [1710, 1716, 1720, 2133, 2137, 2147, 2151, 2155, 2405, 2663]; // S1⑤ 或块终值覆写面

describe('U1 方法级【无 rare】value 守卫 34 族（T4 census 主面落刀）', () => {
  it('①35 面逐件=钉表（217 ids:34 census 族+1479-1480 else 面;per-type 覆写 2379/2389=100000;族内 10 id 终值=S1⑤ 或块覆写 100000）', () => {
    const OR_BLOCK = new Set(U1_OR_BLOCK_IDS);
    for (const g of U1) {
      for (const id of range(g.lo, g.hi)) {
        const expected = OR_BLOCK.has(id) ? 100000 : (g.over?.[id] ?? g.base);
        expect(VALUE[String(id)], `value[${id}]@${g.at}`).toBe(expected);
      }
    }
    expect(U1_IDS.size).toBe(217);
    expect(VALUE['2379']).toBe(100000);
    expect(VALUE['2389']).toBe(100000);
  });

  it('②if-else 双支形态:父守卫 1479-1494 if 支=10000（1481-1494）/else 支=5000（1479-1480）;源锚=嵌套 if+else 结构', () => {
    expect(VALUE['1479']).toBe(5000);
    expect(VALUE['1480']).toBe(5000);
    expect(VALUE['1481']).toBe(10000);
    expect(VALUE['1494']).toBe(10000);
    const src = readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    // 父守卫+嵌套 if-else 结构锚（if 支 buyPrice(0,1)/else 支 sellPrice(0,0,10)）
    expect(src).toContain('if (type >= 1479 && type <= 1494)');
    expect(src).toContain('if (type >= 1481 && type <= 1494)\n\t\t\t{\n\t\t\t\tvalue = buyPrice(0, 1);\n\t\t\t}\n\t\t\telse\n\t\t\t{\n\t\t\t\tvalue = sellPrice(0, 0, 10);\n\t\t\t}');
  });

  it('③per-type if 覆写形态:2376-2385/2386-2396 base=300,2379/2389 覆写=100000;源锚=嵌套 if 块', () => {
    expect(VALUE['2376']).toBe(300);
    expect(VALUE['2385']).toBe(300);
    expect(VALUE['2386']).toBe(300);
    expect(VALUE['2396']).toBe(300);
    const src = readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    expect(src).toContain('if (type >= 2376 && type <= 2385)');
    expect(src).toContain('if (type == 2379)\n\t\t\t\t\t{\n\t\t\t\t\t\tvalue = buyPrice(0, 10);\n\t\t\t\t\t}');
    expect(src).toContain('if (type == 2389)\n\t\t\t\t\t{\n\t\t\t\t\t\tvalue = buyPrice(0, 10);\n\t\t\t\t\t}');
  });

  it('④4695-4700 case 体嵌套 if-else 活面已由 V1 落值（U1 登债兑现:1000/40000;★清偿刀 V1 2026-10-01）', () => {
    for (const id of [4695, 4696, 4697]) {
      expect(VALUE[String(id)], `value[${id}] V1 落值`).toBe(1000);
    }
    for (const id of [4698, 4699, 4700]) {
      expect(VALUE[String(id)], `value[${id}] V1 落值(else 支)`).toBe(40000);
    }
    const src = readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    // 翻案结构锚:case 标签连体【内】的 if-else（非方法级遮蔽,T4「先捕获=死码」定性有误）
    expect(src).toContain('case 4695:\n\t\tcase 4696:\n\t\tcase 4697:\n\t\tcase 4698:');
    expect(src).toContain('if (type >= 4695 && type <= 4697)\n\t\t\t{\n\t\t\t\tvalue = 1000;\n\t\t\t}\n\t\t\telse\n\t\t\t{\n\t\t\t\tvalue = 40000;\n\t\t\t}');
  });

  it('⑤liveness 源锚:1479/1480 无 case 标签（else 面 live 的结构前提）;守卫行在位', () => {
    const src = readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    expect(src).not.toMatch(/^\t*case 1479:$/m);
    expect(src).not.toMatch(/^\t*case 1480:$/m);
    for (const anchor of ['if (type >= 1500 && type <= 1502)', 'if (type >= 1528 && type <= 1532)', 'if (type >= 1543 && type <= 1545)', 'if (type >= 2442 && type <= 2449)', 'if (type >= 3739 && type <= 3741)']) {
      expect(src).toContain(anchor);
    }
  });

  it('⑥rare 域零变更面:U1 id 不新增 rare 键（无 rare 语义的 json 对偶面）', () => {
    for (const id of [1479, 1480, 1500, 1528, 1543, 2055, 2114, 2254, 2379, 2389, 2442, 2648, 3739, 3915]) {
      expect(RARE[String(id)], `rare[${id}] 不由 U1 写入`).toBeUndefined();
    }
  });

  it('⑦行源序:族内 10 id 终值=S1⑤ 或块 100000（U1 基值 200/300/3000/500/150/1500 被覆写,与运行时覆写序 1:1）;2413=300 死标签同值', () => {
    for (const id of U1_OR_BLOCK_IDS) expect(VALUE[String(id)], `value[${id}]`).toBe(100000);
    expect(VALUE['2413']).toBe(300); // case :24880 死标签值≡守卫 :23959-23973 面值（提前 return=死码）
  });

  it('⑧消费面:U1 全 217 id 不属任何 RecipeGroup（decraft 组代表零变更,机械核）+SellChain 卖价链喂点归真', () => {
    // 机械核:vanilla-recipes.json groupItems 全组 ∩ U1 id 集 = 空
    const groupItems = (recipeDoc as { groupItems: Record<string, number[]> }).groupItems;
    const hits: Array<[string, number[]]> = [];
    for (const [gid, items] of Object.entries(groupItems)) {
      const inG = (items as number[]).filter((x) => U1_IDS.has(x));
      if (inG.length) hits.push([gid, inG]);
    }
    expect(hits).toEqual([]);
    // 组代表不变锚（T4 面;零命中已使 U1 新键在机械上不可能改变任何组代表）
    expect(groupDecraftItemId(31)).toBe(3458);
    // SellChain:itemStoreValue 直查（Game reforgeCost/商店链同源）→ 卖价=value/5
    expect(itemStoreValue(1500)).toBe(5000);   // 旧:缺表 0 → 不可卖;真值 5000
    expect(itemStoreValue(3739)).toBe(50);
    expect(computeSellValue(1500, 1).perUnit).toBe(1000); // 5000/5=10 银
    expect(computeSellValue(1543, 1).perUnit).toBe(60000); // 300000/5=6 金（sellPrice(0,6) 口径）
    expect(computeSellValue(1479, 1).perUnit).toBe(1000);  // else 面 5000/5
  });

  it('⑨三版同构:1456/1458 --dump U1 面≡1457（跨版对拍;recon 双实例同口径前提）', () => {
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
      const OR_BLOCK = new Set(U1_OR_BLOCK_IDS);
      for (const g of U1) {
        for (const id of range(g.lo, g.hi)) {
          const expected = OR_BLOCK.has(id) ? 100000 : (g.over?.[id] ?? g.base);
          expect(d.VALUE[String(id)], `${ver} u1[${id}]`).toBe(expected);
        }
      }
      expect(d.VALUE['4695'], `${ver} 嵌套面(V1 兑现,三版同构)`).toBe(1000);
      expect(d.VALUE['4698'], `${ver} 嵌套 else 面(V1 兑现,三版同构)`).toBe(40000);
      for (const id of U1_OR_BLOCK_IDS) expect(d.VALUE[String(id)], `${ver} or-block[${id}]`).toBe(100000);
    }
  });

  // ---- 变异（判别力）:六发。cp 变异副本→--dump/重产判别;原文件 sha256 前后全等=零接触。 ----
  const shaOf = () => createHash('sha256').update(readFileSync(SCRIPT)).digest('hex');
  const runMutant = (srcMutation: (s: string) => string) => {
    const mutant = join(TMP, `u1-mutant-${createHash('md5').update(String(Math.random())).digest('hex').slice(0, 8)}.mjs`);
    writeFileSync(mutant, srcMutation(SRC()));
    const r = spawnSync('node', [mutant, '--dump'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1457' },
    });
    const out = String(r.stdout);
    return { r, parsed: out ? (JSON.parse(out) as { RARE: Record<string, number>; VALUE: Record<string, number> }) : null };
  };

  it('变异①摘 U1 apply→1479/1481/1500/2379 缺键（证明 35 面 value 由 U1_PINS apply 唯一承载;S1⑤ 或块面独立存活）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '    if (pin.base !== null) for (let id = pin.lo; id <= pin.hi; id++) VALUE[id] = pin.base;\n    for (const [id, v] of Object.entries(pin.over)) VALUE[+id] = v;',
      '    // ★变异:U1 apply 摘除',
    ).replace(
      // ★V1 同步:V1 ch 对拍(先于 dump 的 fail-loud)一并摘除=隔离本变异的受试面(U1 apply)
      "} else if (pin.own === 'ch') {",
      "} else if (false) { // ★变异:V1 ch 对拍摘除",
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['1479']).toBeUndefined();
    expect(parsed!.VALUE['1481']).toBeUndefined();
    expect(parsed!.VALUE['1500']).toBeUndefined();
    expect(parsed!.VALUE['2379']).toBeUndefined();
    expect(parsed!.VALUE['1710']).toBe(100000);  // S1⑤ 或块面独立承载
    expect(parsed!.VALUE['2320']).toBe(75000);   // S1③ 单件守卫面独立承载
    expect(shaOf()).toBe(before);
  });

  it('变异②钉值漂移→sweep≡钉表 fail-loud exit≠0（1500-1502 base 5000→5001;新面现形必被拦）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      "  { lo: 1500, hi: 1502, base: 5000, over: {}, at: ':18365 sellPrice(0,0,10)' },",
      "  { lo: 1500, hi: 1502, base: 5001, over: {}, at: ':18365 sellPrice(0,0,10)' },",
    ));
    expect(r.status).not.toBe(0);
    expect(parsed).toBeNull();
    expect(r.stderr).toContain('U1 守卫 1500-1502 base 漂移');
    expect(shaOf()).toBe(before);
  });

  it('变异③钉表键漂移（摘 3915-3916 条目）→键集对账 fail-loud exit≠0（守卫面漏钉必被拦）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      "  { lo: 3915, hi: 3916, base: 300, over: {}, at: ':34611' },\n",
      '',
    ));
    expect(r.status).not.toBe(0);
    expect(parsed).toBeNull();
    expect(r.stderr).toContain('U1 sweep 面≠钉表(键)');
    expect(r.stderr).toContain('3915-3916');
    expect(shaOf()).toBe(before);
  });

  it('变异④liveness 旁路（caseHitOf 恒 0）→4695-4697 逃出嵌套桶→门②清单漂移爆红（证明死码/嵌套分类由 liveness 机械驱动）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '  const caseHitOf = (lo, hi, from, gi) => {\n    let n = 0;',
      '  const caseHitOf = (lo, hi, from, gi) => {\n    return 0; // ★变异:liveness 旁路\n    let n = 0;',
    ));
    expect(r.status).not.toBe(0);
    expect(parsed).toBeNull();
    expect(r.stderr).toContain('U1 case 体嵌套 value 守卫清单漂移');
    expect(r.stderr).toContain('expected 4695-4697');
    expect(shaOf()).toBe(before);
  });

  it('变异⑤单件清单漂移（U1_SINGLE_INV 摘 2194）→门④ fail-loud exit≠0（单件域变异守卫在位）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      "const U1_SINGLE_INV = ['1980', '1984', '1985', '2194', '2196', '2379', '2389'];",
      "const U1_SINGLE_INV = ['1980', '1984', '1985', '2196', '2379', '2389'];",
    ));
    expect(r.status).not.toBe(0);
    expect(parsed).toBeNull();
    expect(r.stderr).toContain('U1 单件守卫清单漂移');
    expect(shaOf()).toBe(before);
  });

  it('变异⑥摘 S1⑤ 或块 apply→1710 回落 U1 基值 200（证明或块终值权威+U1 行源序在其前）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '    if (v === null) throw new Error(`[extract-itemrare] S1⑤ 或块值不可解:${expr}`);\n    VALUE[id] = v;',
      '    if (v === null) throw new Error(`[extract-itemrare] S1⑤ 或块值不可解:${expr}`);\n    // ★变异:或块 apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['1710']).toBe(200);     // U1 基值复活=行源序判别面（或块在后覆写）
    expect(parsed!.VALUE['2663']).toBe(300);
    expect(parsed!.VALUE['1500']).toBe(5000);    // 非或块 id 不受影响
    expect(shaOf()).toBe(before);
  });
});
