// ★清偿刀 S1（2026-09-30）守卫:extract-itemrare.mjs 五段方法级域续刀（R2 census 登记的
// 同域残留,R2 基线=DEFAULT_TO_BODY_RV+HAND+FACTORY_VALUE）。金标=Terarria1457 Item.cs
// 亲读定谳锚（1456/1458 三版同构跨版对拍实证,见提取器 S1 头注）:
//   ① SetFoodDefaults 尾段 rare=(int)(num/4f)（:48395;1456:48007/1458 同式）——
//     num=(buffType==207?12:buffType==206?8:3)+buffTime/14400(C# 整除);rare=trunc(num/4)。
//     48 件错值漂移（4022=6/1919=3/4011=4/Eggnog1912=0/无 case 的 4010=0）。
//   ② SetDefaults3 方法尾笼件段 value=buyPrice(0,10)（:27641）——可达集=尾卫
//     `if (type < 2192 || type > 2198)`（:22289）补集 [2192,2198]（R2 census「2192-2208」
//     过宽:2199+ 落卫内提前 return）。★S1b 2026-10-01 翻正:原「块尾无条件 return :27618→
//     尾内 case 2203/2204 死码」不成立——卫块内唯一 return 在内层 switch default 段体尾
//     （:27618,default@:22374）,case 2203/2204 体=裸 break(:22295)=唯一 break-exit 集,穿出
//     卫块落尾段→可达集=[2192,2198]∪{2203,2204},两 id 同值 100000（V1 走栈翻案兑现）。
//   ③ 方法级 if 范围守卫 rare 10 族（8 注册+3 census 外同形扫获:3390-3452 事件旗=1、
//     3456-3459 四碎片=9、3638-3642 队块=1）+单件守卫 2320=3（census 外同形）+
//     if-else 守卫 2421/2422=1/3（census 误记 2420,实际 [2421,2422]）。
//   ④ 鱼链 2303-2321（共享 case 2290-2321 无 2314;链 if 双写 value+rare,本刀取 rare 面）
//     16 ids;:30189 内层 switch default rare=2=死码定谳（可达集全有内层 case,零 id 命中）。
//   ⑤ SetDefaults 派发后方法级块:value if 链 30 ids+1994-2001 num 块+14-id 或块（同族补面,
//     census 行号域只圈到 :48836）+bait 块（>=50→3/>=30→2/>=15→1,1-14 档不写）。
// 消费面:tooltip 稀有色（UI rarityColor 档位）、Game.ts 权威 value/商店/重铸/decraft 组代表。
// 变异（判别力,era-guard 判例同法）:七发——五段各一发（compiler 摘除→dump 判别值翻转）
//   +钉面漂移一发（sweep≡pins 守卫 fail-loud exit≠0）+S1b break-exit apply 摘除一发
//   （2203/2204 面唯一承载判别;源变异二发在 tests/v1-itemrare-nested-value.test.ts 变异⑥⑦）。
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
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const RARE = rareJson as Record<string, number>;
const VALUE = valueJson as Record<string, number>;
const ROOT = join(dirname(__dirname), '..');
const SCRIPT = join(dirname(__dirname), 'tools', 'extract-itemrare.mjs');
const SRC = () => readFileSync(SCRIPT, 'utf8');
const TMP = realpathSync(tmpdir());

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// ---- 定谳钉表（亲读/census 双实现交叉实证,独立于提取器） ----

/** S1① IsFood 86 件食物尾式终值（ItemID.cs CreateBoolSet 集逐件;锚例 4022=6/1919=3/
 *  4011=4/1912=0/4010=0/353=0(Sake buff25)/357=2/4030=2/5275=0 亲算核） */
const FOOD_RARE: Record<number, number> = {
  353: 0, 357: 2, 1787: 1, 1911: 3, 1912: 0, 1919: 3, 1920: 3, 2266: 1, 2267: 2, 2268: 2, 2425: 1,
  2426: 2, 2427: 2, 3195: 2, 3532: 4, 4009: 1, 4010: 0, 4011: 4, 4012: 2, 4013: 4, 4014: 1,
  4015: 3, 4016: 2, 4017: 3, 4018: 3, 4019: 2, 4020: 2, 4021: 2, 4022: 6, 4023: 3, 4024: 1,
  4025: 3, 4026: 2, 4027: 4, 4028: 3, 4029: 3, 4030: 2, 4031: 1, 4032: 2, 4033: 1, 4034: 2,
  4035: 3, 4036: 3, 4037: 4, 967: 0, 969: 1, 4282: 1, 4283: 1, 4284: 1, 4285: 1, 4286: 1, 4287: 1,
  4288: 2, 4289: 1, 4290: 1, 4291: 1, 4292: 1, 4293: 1, 4294: 1, 4295: 1, 4296: 1, 4297: 2,
  4403: 2, 4411: 1, 4614: 1, 4615: 4, 4616: 1, 4617: 1, 4618: 1, 4619: 2, 4620: 2, 4621: 2,
  4622: 2, 4623: 3, 4624: 1, 4625: 2, 5009: 1, 5042: 2, 5041: 2, 5092: 2, 5093: 2, 5275: 0,
  5277: 1, 5278: 1, 5537: 1, 5645: 1,
};

/** S1② 笼件尾段 value（2194→buyPrice(0,2,70)=27000;2196→200;余 buyPrice(0,10)=100000。
 *  ★S1b 2026-10-01:可达集=[2192,2198]∪{2203,2204}——case 2203/2204 裸 break 穿出卫块
 *  落尾段（V1 走栈翻案兑现）,2203=SteampunkBoiler/2204=HoneyDispenser 同值 100000 */
const CAGE_VALUE: Record<number, number> = { 2192: 100000, 2193: 100000, 2194: 27000, 2195: 100000, 2196: 200, 2197: 100000, 2198: 100000, 2203: 100000, 2204: 100000 };

/** S1③ 守卫 rare 面（10 范围族+单件 2320+if-else 2421/2422;行号=1457 锚） */
const GUARD_RARE: Array<{ ids: number[]; rare: number; at: string }> = [
  { ids: range(1522, 1527), rare: 1, at: ':18537' },
  { ids: range(1533, 1537), rare: 8, at: ':18559' },
  { ids: range(1977, 1986), rare: 2, at: ':21236' },
  { ids: range(2104, 2113), rare: 1, at: ':21874' },
  { ids: range(2214, 2217), rare: 3, at: ':22375' },
  { ids: range(2284, 2287), rare: 5, at: ':22988' },
  { ids: [2421], rare: 1, at: ':23075 if-branch :23088' },
  { ids: [2422], rare: 3, at: ':23075 else-branch :23095' },
  { ids: [2320], rare: 3, at: ':23100(单件守卫,census 外同形)' },
  { ids: range(3309, 3314), rare: 2, at: ':30258' },
  { ids: range(3390, 3452), rare: 1, at: ':30986(census 外同形,事件旗)' },
  { ids: range(3456, 3459), rare: 9, at: ':31021(census 外同形,四碎片)' },
  { ids: range(3638, 3642), rare: 1, at: ':32793(census 外同形,队块平台)' },
];

/** S1④ 鱼链 rare 面（链 :23165-23270 per-type if;2290-2296 鱼竿组/2314 独立 case/2320 独立
 *  守卫提前返回=链外;鱼非 bait=派发后 bait 块不覆写,链值即终值） */
const FISH_RARE: Record<number, number> = {
  2303: 1, 2304: 1, 2305: 1, 2306: 1, 2307: 2, 2308: 3, 2309: 1, 2310: 3,
  2311: 1, 2312: 2, 2313: 1, 2315: 2, 2317: 4, 2318: 1, 2319: 1, 2321: 1,
};

/** S1⑤ value if 链 30 ids（:48721-48836;sellPrice ×5 求值后铜币终值） */
const CHAIN_VALUE: Record<number, number> = {
  2015: 2500, 2016: 3750, 2017: 3750, 5212: 3750, 5300: 3750, 5311: 3750, 5312: 3750, 5313: 3750,
  2019: 2500, 2018: 2500, 3563: 2500, 261: 3750, 2205: 6250, 2123: 3750, 2122: 3750,
  2003: 5000, 2156: 7500, 2157: 7500, 2121: 5000, 1992: 1500, 2004: 2500, 2002: 2500,
  2740: 1250, 2006: 5000, 3191: 10000, 3192: 1250, 3193: 2500, 3194: 5000, 2007: 25000, 2673: 500000,
};
/** S1⑤ (c) 1994-2001 num 块 value（num==K→1994+K;:48856-48890） */
const NUMBLOCK_VALUE: Record<number, number> = {
  1994: 2500, 1995: 37500, 1996: 20000, 1997: 10000, 1998: 5000, 1999: 50000, 2000: 7500, 2001: 15000,
};
/** S1⑤ (d) 14-id 或块 value（sellPrice(0,2)=100000;:48892-48894） */
const ORBLOCK_IDS = [2663, 1720, 2137, 2155, 2151, 1704, 2143, 1710, 2238, 2133, 2147, 2405, 1716, 1705];
/** S1⑤ bait rare 面（37 赋值行→45 id;1-14 档不写=keeps;≥15→1/≥30→2/≥50→3） */
const BAIT_RARE: Record<number, number> = {
  1992: 1, 1995: 2, 1996: 2, 1997: 1, 1999: 3, 2000: 1, 2001: 1,
  2002: 1, 2004: 2, 2007: 1,
  2156: 1,
  2436: 1, 2437: 1, 2438: 1,
  2673: 3, 2674: 1, 2675: 2, 2676: 3,
  3191: 2, 3192: 1, 3193: 1, 3194: 2,
  4334: 1, 4335: 1, 4336: 1, 4337: 1, 4338: 1, 4339: 1,
  4340: 3, 4361: 1, 4362: 3, 4363: 1, 4418: 1, 4419: 3,
  4845: 1, 4847: 1, 4849: 2,
};
/** bait 1-14 档:不写 rare（bait 块不覆写）。无 case 级 rare 者=缺键（0 兜底,原版同款）;
 *  5132 有 case 级 SSV(White0)=0（:41098）→ 保持 0 非缺键 */
const BAIT_KEEP_ABSENT = [1994, 1998, 2006, 2157];
const BAIT_KEEP_CASE0 = [5132];

describe('S1 五段方法级 rare/value 面（extract-itemrare 五段续刀）', () => {
  it('①食物尾式:86 件逐件=钉表（尾式覆写 case SSV 死码;4022=6/1912=0/4010=0）', () => {
    const ids = Object.keys(FOOD_RARE).map(Number).sort((a, b) => a - b);
    expect(ids.length).toBe(86);
    for (const id of ids) expect(RARE[String(id)], `rare[${id}]`).toBe(FOOD_RARE[id]);
  });

  it('②笼件尾段:2192-2198+2203/2204 value 钉表（2194/2196 覆写;可达集=[2192,2198]∪{2203,2204},SD3 零 case 2192-2198）', () => {
    for (const [id, v] of Object.entries(CAGE_VALUE)) expect(VALUE[id], `value[${id}]`).toBe(v);
    // 结构锁:尾卫存在+尾段锚（buyPrice(0,10) 与 2194 覆写相邻=唯一性）、SD3 无 2192-2198
    // case 标签（可达集前提;2199+ 落卫内提前 return=census「2192-2208」过宽的证伪面）
    const src = readFileSync(join(ROOT, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    expect(src).toContain('if (type < 2192 || type > 2198)');
    expect(src).toContain('value = buyPrice(0, 10);\n\t\tif (type == 2194)');
    for (let id = 2192; id <= 2198; id++) {
      expect(src.match(new RegExp(`case ${id}:`)), `SD3 零 case ${id}`).toBeFalsy();
    }
    // ★S1b 结构锚:case 2203/2204 裸 break 段（唯一 break-exit,穿出卫块落尾段的通路本体;
    //   卫块内唯一 return :27618 在 default 段体尾,不经此段）+尾段 createTile 307/308 落穿面
    //   （BJ69 尾支落穿锚同流互证）
    expect(src).toContain('case 2203:\n\t\t\tcase 2204:\n\t\t\t\tbreak;');
    expect(src).toContain('case 2203:\n\t\t\tcreateTile = 307;');
    expect(src).toContain('case 2204:\n\t\t\tcreateTile = 308;');
  });

  it('③守卫 rare:12 面逐 id=钉表（含 census 外同形 3 族+单件 2320+if-else 2421/2422）', () => {
    for (const g of GUARD_RARE) {
      for (const id of g.ids) expect(RARE[String(id)], `rare[${id}]@${g.at}`).toBe(g.rare);
    }
    expect(GUARD_RARE.reduce((s, g) => s + g.ids.length, 0)).toBe(120);
    // sweep≡pins 结构锁:提取器 fail-loud 守卫锚在位（新守卫现形即 throw 逼定谳）
    const src = SRC();
    expect(src).toContain('S1③ 范围守卫 sweep≠钉表');
    expect(src).toContain('S1_GUARD_PINS');
  });

  it('④鱼链:16 件=钉表;2314 独立 case=1/2320 守卫=3 保持;链外 2297-2302/2316/2320 无 rare 键漂移', () => {
    for (const [id, r] of Object.entries(FISH_RARE)) expect(RARE[id], `rare[${id}]`).toBe(r);
    expect(Object.keys(FISH_RARE).length).toBe(16);
    expect(RARE['2314']).toBe(1);   // 独立 case :23120（提取器 case 级既有,链不触）
    // :30189 内层 switch default=死码定谳:可达集 {3262,3278-3292,3315-3317} 全有内层 case,
    // 零 id 命中 default——结构性验证:外层 default 的 goto case 3262 与内层 case 全集互锁
    const src = readFileSync(join(ROOT, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    expect(src).toContain('goto case 3262;');
    // 鱼链前置返回构造锚（liveness 定谳锚在位）
    expect(src).toContain('if (type >= 2421 && type <= 2422)');
    expect(src).toContain('if (type == 2320)');
  });

  it('⑤派发后块:value 链 30+num 块 8+或块 14+bait rare 面 38 逐 id=钉表;1-14 档缺键', () => {
    for (const [id, v] of Object.entries(CHAIN_VALUE)) expect(VALUE[id], `value[${id}]`).toBe(v);
    expect(Object.keys(CHAIN_VALUE).length).toBe(30);
    for (const [id, v] of Object.entries(NUMBLOCK_VALUE)) expect(VALUE[id], `value[${id}]`).toBe(v);
    for (const id of ORBLOCK_IDS) expect(VALUE[String(id)], `value[${id}]`).toBe(100000);
    for (const [id, r] of Object.entries(BAIT_RARE)) expect(RARE[id], `rare[${id}]`).toBe(r);
    expect(Object.keys(BAIT_RARE).length).toBe(37);
    for (const id of BAIT_KEEP_ABSENT) expect(RARE[String(id)], `rare[${id}] 缺键`).toBeUndefined();
    for (const id of BAIT_KEEP_CASE0) expect(RARE[String(id)], `rare[${id}] case 级 0 保持`).toBe(0);
    // (d) 或块对既有 case 值的覆写锚（死标签污染清除:1704/1705/2143/2238 旧 case 值→100000）
    expect(VALUE['1704']).toBe(100000);
    expect(VALUE['2143']).toBe(100000);
  });

  it('消费面:tooltip 稀有色基表=vanilla-itemrare.json 直查（UI.tooltipRareOf 基表路径;任务鱼 2450=-11 回归）', () => {
    // UI.ts tooltipRareOf:① 基表值=vi_ 物品查 vanilla-itemrare.json（vid 直查,桥接 def 无关）
    for (const [vid, rare] of [[4022, 6], [2214, 3], [2450, -11], [4334, 1], [2676, 3], [3456, 9], [3390, 1]] as const) {
      expect(RARE[String(vid)], `基表 rare[${vid}]`).toBe(rare);
    }
    // def.rare 自描述面（自动注册件随 json 带入;桥接批蛇键件 2214 走基表路径,不在此断言）
    for (const [vid, rare] of [[4022, 6], [2450, -11], [4334, 1], [2676, 3], [3456, 9], [3390, 1]] as const) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vi_${vid} 注册键`).toBeTruthy();
      const def = ITEM_DEFS[ITEM_BY_KEY[key as string] as number];
      expect(def, `def ${key}`).toBeTruthy();
      expect(def.rare, `${key}.rare`).toBe(rare);
    }
  });

  it('三版同构:1456/1458 --dump 五面值≡1457（跨版对拍;recon 双实例同口径前提）', () => {
    const dumpOf = (ver: string) => {
      const r = spawnSync('node', [SCRIPT, '--dump'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: ver },
      });
      expect(r.status).toBe(0);
      return JSON.parse(String(r.stdout)) as { RARE: Record<string, number>; VALUE: Record<string, number> };
    };
    const d57 = dumpOf('1457');
    for (const ver of ['1456', '1458']) {
      const d = dumpOf(ver);
      for (const [id, r] of Object.entries(FOOD_RARE)) expect(d.RARE[String(id)], `${ver} food[${id}]`).toBe(r);
      for (const [id, v] of Object.entries(CAGE_VALUE)) expect(d.VALUE[String(id)], `${ver} cage[${id}]`).toBe(v);
      for (const g of GUARD_RARE) for (const id of g.ids) expect(d.RARE[String(id)], `${ver} guard[${id}]`).toBe(g.rare);
      for (const [id, r] of Object.entries(FISH_RARE)) expect(d.RARE[String(id)], `${ver} fish[${id}]`).toBe(r);
      for (const [id, v] of Object.entries(CHAIN_VALUE)) expect(d.VALUE[String(id)], `${ver} chain[${id}]`).toBe(v);
      for (const [id, r] of Object.entries(BAIT_RARE)) expect(d.RARE[String(id)], `${ver} bait[${id}]`).toBe(r);
      expect(d.RARE['1293']).toBe(ver === '1456' ? undefined : 8);   // 1293 rare 档=1457 新增,1458 同（era guard 物证）
      expect(d57.RARE['1293']).toBe(8);
    }
  });

  // ---- 变异（判别力）:六发。cp 变异副本→--dump 判别值翻转=该段 compiler 是唯一来源;
  //      原文件 sha256 前后全等=零接触。 ----
  const shaOf = () => createHash('sha256').update(readFileSync(SCRIPT)).digest('hex');
  const runMutant = (srcMutation: (s: string) => string) => {
    const mutant = join(TMP, `s1-mutant-${createHash('md5').update(String(Math.random())).digest('hex').slice(0, 8)}.mjs`);
    readFileSync(SCRIPT); // touch
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(mutant, srcMutation(SRC()));
    const r = spawnSync('node', [mutant, '--dump'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1457' },
    });
    const out = String(r.stdout);
    return { r, parsed: out ? (JSON.parse(out) as { RARE: Record<string, number>; VALUE: Record<string, number> }) : null };
  };

  it('变异①摘食物尾式 compiler→rare[4022] 回落 1（证明 86 件面由尾式编译器唯一承载）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      'rare[id] = Math.trunc((base + Math.trunc(time / 14400)) / 4);',
      'rare[id] = 1; // ★变异:尾式摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.RARE['4022']).toBe(1);
    expect(parsed!.RARE['1912']).toBe(1);
    expect(shaOf()).toBe(before);   // 原文件逐字节零接触
  });

  it('变异②摘笼件补集 apply→value[2192] 缺键而 value[2203]=100000 不动（证明补集面由补集 apply 唯一承载,且 S1b break-exit 面独立）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      'for (let id = guard.lo; id <= guard.hi; id++) VALUE[id] = baseVal;',
      '// ★变异:笼件补集 apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['2192']).toBeUndefined();
    expect(parsed!.VALUE['2203']).toBe(100000);   // S1b break-exit 面独立承载
    expect(shaOf()).toBe(before);
  });

  it('变异⑦摘 S1b break-exit apply→value[2203/2204] 缺键而 value[2192]=100000 不动（证明 2203/2204 面由 S1b apply 唯一承载;V1 测⑤缺键锚翻正的提取器侧判别）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      'for (const id of breakExit) VALUE[id] = baseVal; // ★S1b:2203/2204 裸 break 落尾段,同值面 100000',
      '// ★变异:S1b break-exit apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.VALUE['2203']).toBeUndefined();
    expect(parsed!.VALUE['2204']).toBeUndefined();
    expect(parsed!.VALUE['2192']).toBe(100000);   // 补集面不受累
    expect(shaOf()).toBe(before);
  });

  it('变异③摘守卫 apply→S1⑥ 目标面 rare 均匀性破约 fail-loud exit≠0（证明 120 件面由 S1③ 唯一承载,且为 S1⑥ 结构前提;★T4:摘除后不再静默缺键而是 throw——era 纪律静默兜底禁令）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      'for (const g of S1_GUARD_PINS) for (let id = g.lo; id <= g.hi; id++) RARE[id] = g.rare;',
      '// ★变异:守卫 apply 摘除',
    ));
    expect(r.status).not.toBe(0);
    expect(parsed).toBeNull();
    expect(r.stderr).toContain('S1⑥ 目标面');
    expect(shaOf()).toBe(before);
  });

  it('变异④摘鱼链 rare apply→rare[2308]/rare[2303] 缺键（证明 16 件 rare 面由 S1④ 唯一承载;value apply 不动=value 面不受累）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '  for (const [id, r] of Object.entries(parsed)) RARE[id] = r;',
      '  // ★变异:鱼链 rare apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.RARE['2308']).toBeUndefined();
    expect(parsed!.RARE['2303']).toBeUndefined();
    expect(parsed!.VALUE['2308']).toBe(500000);   // ★T4:value 面独立承载,不随 rare apply 摘除丢失
    expect(shaOf()).toBe(before);
  });

  it('变异⑤摘 bait rare apply→rare[2676] 缺键/rare[4334] 回落 case 0（证明 bait 覆写 0→1 由 S1⑤ 唯一承载）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      '      for (const id of ids) RARE[id] = rare;',
      '      // ★变异:bait rare apply 摘除',
    ));
    expect(r.status).toBe(0);
    expect(parsed!.RARE['2676']).toBeUndefined();   // Master Bait 无 case 级 rare=纯 bait 面
    expect(parsed!.RARE['4334']).toBe(0);           // 捕虫笼 case SSV(White0)=0,bait 覆写 1 被摘
    expect(shaOf()).toBe(before);
  });

  it('变异⑥守卫钉值漂移→sweep≡pins fail-loud exit≠0（证明新守卫现形必被拦）', () => {
    const before = shaOf();
    const { r, parsed } = runMutant((s) => s.replace(
      "rare: 9, at: ':31021' }",
      "rare: 8, at: ':31021' }",
    ));
    expect(r.status).not.toBe(0);                       // fail-loud 拒产
    expect(parsed).toBeNull();                          // 零输出（不落盘不 dump）
    expect(r.stderr).toContain('S1③ 范围守卫 sweep≠钉表');
    expect(shaOf()).toBe(before);
  });
});
