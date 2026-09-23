// SW-FX53（2026-09-13）提取器算式盲区教正则——重产 dry-run 对拍守卫（防未来重产回退）。
//
// 债的形态（四具提取器,FX48 报告点名三具 + itemfunc 四形态）：
//   ① extract-itemfunc.mjs：placeStyle 共享 case 算式（`placeStyle = 1 + type - 3046`
//      篝火三段式,BJ50;FX3 邻族普查 545 件同病）/ 区间 if-ifelse 覆写（宝箱 2612-2620
//      倍增档 `35 + (type-2612)*2`;气球 453 绑定档 3743-3745 反序三连 if `if (N == type)`)
//      / SetDefaults3(N) 委托继承（channel 六件 2778/2783/3463/2779/2784/3464 + 挥砍
//      九件,r33 蓝队手补面）/ 嵌套 if·派生局部（蠕虫笼 `int num = type - 1994` bait
//      八档,Item.cs:21343-21388）。
//   ② extract-pets.mjs：DefaultToVanitypet 共享算式块 `DefaultToVanitypet(881 + type -
//      4797, 284 + type - 4797)`（Item.cs 1456:39399-39422 / 1458:39417-39440 同值）——
//      正则只吃字面量参数 → boss 宠 21 件整批漏提（FX48 手补 vanilla-pets.json）;
//      附带 DD2 三宠嵌套 switch(type) 伪值（3855 曾被打成 201/702,真值 200/703）。
//   ③ extract-equip-prefix.mjs：DefaultToVanitypet 算式第二参（equip pet/light 21 件
//      同根因）+ mountType 算式（:39364/:39414,马鞍 4785-4787/大师坐骑 4792-4796）。
//   ④ extract-journey-browser.mjs：placeStyle 算式 + DefaultToVanitypet（dmg:0/shoot,
//      FX48 手补面）。
// 教学后重产 dry-run 与盘上/手补数据对账（本测试全矩阵钉死,变异证红=教学任一刀回退
// 即对应断言红）：
//   · itemfunc：手补面 663 行（items.ts PLACE_STYLE_BACKFILL_1458 620 + SHARED_GROUP
//     43）→ 622 解析同值 / 41 沉默（fakecontainers 3666-3706 `(type>N).ToInt()` 布尔
//     计数式=登记债,手补仍权威）/ 0 冲突;盘面零缺失,既有条目仅 2413.placeStyle
//     23→17 一处值变更（FX3 定谳的伪值纠偏,区间 return 死码判据）。
//   · pets：dry ≡ 盘上 83 行全等（FX48 21 行转解析直出）。
//   · equip：pet/light ≡ 盘上全等;itemstats/prefix/wingstats/accfx 零漂移。
//   · journey：boss 宠 21 行 dmg:0/shoot 解析直出;盘面行零缺失（30 件字面实参
//     vanity pet 的 dmg/shoot 为反编译真值新增）。
//   · ★BJ292（2026-09-23）D2 定谳补钉：D2 单向守卫（盘⊆dry）曾放过盘面陈旧漂移——
//     盘上 vanilla-journeycat.json 缺 48 mat（94/631-634/913/1384-1389/…/3957,
//     全员∈配方素材∪已用 RecipeGroup 成员并集 1186,Recipe.cs:15205-15240
//     UpdateWhichItemsAreMaterials 亲读）+31 acc（6156-6194,1457 新配饰,
//     vanilla-itemstats acc 面在而 journey 盘面未随）→ 研究浏览器 Material 组
//     （JourneyBrowser:360）/materials·accessories 过滤（:439/:425）错桶。重产
//     盘面清偿后以 D4 把 mat/acc 两通道改双向全等（提取器回退由 D2 兜,盘面
//     再陈旧由 D4 兜）。
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, 'tools');

const WORK = mkdtempSync(join(tmpdir(), 'sw-fx53-'));
const P = (f: string) => JSON.parse(readFileSync(join(WORK, f), 'utf8')) as unknown;
const diskItemfunc = () => JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemfunc.json'), 'utf8')) as Record<string, Record<string, number>>;
const diskPets = () => JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-pets.json'), 'utf8')) as Record<string, { buff: number; proj: number; light: number }>;
const diskEquip = () => JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-equip.json'), 'utf8')) as Record<string, number[]>;
const diskJourney = () => JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-journeycat.json'), 'utf8')) as { items: Record<string, Record<string, number>> };

let itemfuncDry: Record<string, Record<string, number>>;
let petsDry: Record<string, { buff: number; proj: number; light: number }>;
let equipDry: Record<string, unknown>;
let journeyDry: { items: Record<string, Record<string, number>> };

beforeAll(() => {
  const run = (script: string, env: Record<string, string>) => {
    const r = spawnSync(process.execPath, [join(TOOLS, script)], {
      cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120_000,
    });
    if (r.status !== 0) throw new Error(`${script} dry-run 失败（status ${r.status}）:\n${r.stderr}`);
  };
  run('extract-itemfunc.mjs', { ITEMFUNC_OUT: join(WORK, 'itemfunc.json') });
  run('extract-pets.mjs', { PETS_OUT: join(WORK, 'pets.json') });
  run('extract-equip-prefix.mjs', { SW_FX53_OUT: WORK });
  run('extract-journey-browser.mjs', { SW_FX53_OUT: WORK });
  itemfuncDry = P('itemfunc.json') as Record<string, Record<string, number>>;
  petsDry = P('pets.json') as Record<string, { buff: number; proj: number; light: number }>;
  equipDry = P('vanilla-equip.json') as Record<string, unknown>;
  journeyDry = P('vanilla-journeycat.json') as { items: Record<string, Record<string, number>> };
}, 300_000);

// ─── items.ts 手补面解析（表内为纯字面量,格式漂移会显式红=提示更新本测试） ───
function parseItemsTsTables(): { rows: [number, string, number][]; shared: [number, number][] } {
  const src = readFileSync(join(ROOT, 'src/data/items.ts'), 'utf8');
  const s1 = src.slice(
    src.indexOf('const PLACE_STYLE_BACKFILL_1458'),
    src.indexOf('for (const [vid, tk, ps] of PLACE_STYLE_BACKFILL_1458)'),
  );
  const rows3 = [...s1.matchAll(/\[(\d+),\s*'([a-z0-9_]+)',\s*(\d+)\]/g)]
    .map((m) => [Number(m[1]), m[2], Number(m[3])] as [number, string, number]);
  const seen = new Set(rows3.map((r) => r[0]));
  // 门族 spread 行（`[vid, 'door_closed', st] as const` 前的 [[vid, st], …] 二元组）
  const spread = [...s1.matchAll(/\[(\d+),\s*(\d+)\]/g)]
    .map((m) => [Number(m[1]), 'door_closed', Number(m[2])] as [number, string, number])
    .filter((r) => !seen.has(r[0]));
  const s2 = src.slice(
    src.indexOf('const SHARED_GROUP_PLACE_STYLE_1457'),
    src.indexOf('for (const [vid, ps] of SHARED_GROUP_PLACE_STYLE_1457)'),
  );
  const shared = [...s2.matchAll(/\[(\d+),\s*(\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  return { rows: [...rows3, ...spread], shared };
}

// ==================== A. extract-itemfunc：dry-run 对拍 ====================
describe('A. itemfunc dry-run：四形态教学 + 零回退', () => {
  it('A1 盘面零缺失零值变（唯一例外=2413.placeStyle 23→17 FX3 伪值纠偏）', () => {
    const disk = diskItemfunc();
    const diffs: string[] = [];
    for (const [vid, entry] of Object.entries(disk)) {
      const dry = itemfuncDry[vid];
      if (!dry) { diffs.push(`${vid} 整条缺失`); continue; }
      for (const [k, v] of Object.entries(entry)) {
        if (dry[k] !== v) diffs.push(`${vid}.${k}: ${v} -> ${dry[k]}`);
      }
    }
    expect(diffs).toEqual(['2413.placeStyle: 23 -> 17']);
  });

  it('A2 手补面 663 行逐键对账：622 解析同值 / 41 沉默 / 0 冲突（沉默集=fakecontainers 登记债）', () => {
    const { rows, shared } = parseItemsTsTables();
    const conflicts: string[] = [];
    const silents: number[] = [];
    let match = 0;
    for (const [vid, , ps] of rows) {
      const got = itemfuncDry[String(vid)]?.placeStyle;
      if (got === undefined) silents.push(vid);
      else if (got !== ps) conflicts.push(`${vid}: manual=${ps} dry=${got}`);
      else match++;
    }
    for (const [vid, ps] of shared) {
      const got = itemfuncDry[String(vid)]?.placeStyle;
      if (got === undefined) silents.push(vid);
      else if (got !== ps) conflicts.push(`${vid}: manual=${ps} dry=${got}`);
      else match++;
    }
    expect(conflicts, '值冲突（哪侧对须逐键定谳）').toEqual([]);
    expect(match, '解析同值行数').toBe(622);
    expect(silents.sort((a, b) => a - b), '沉默集 = fakecontainers 布尔计数式登记债')
      .toEqual(Array.from({ length: 41 }, (_, i) => 3666 + i));
  });

  it('A3 篝火三段式 16 档矩阵（BJ50 金标,Item.cs:28193/:33011/:38612）', () => {
    const GOLD: Readonly<Record<number, number>> = {
      966: 0, 3046: 1, 3047: 2, 3048: 3, 3049: 4, 3050: 5,
      3723: 6, 3724: 7, 4689: 8, 4690: 9, 4691: 10, 4692: 11, 4693: 12, 4694: 13,
      5299: 14, 5357: 15,
    };
    for (const [vid, ps] of Object.entries(GOLD)) {
      expect(itemfuncDry[vid]?.placeStyle ?? 0, `vid ${vid}`).toBe(ps);
    }
  });

  it('A4 气球 453 绑定档三连 if（3743-3745 反序 `if (N == type)`;Item.cs:33129-33144）', () => {
    expect(itemfuncDry['3743']?.placeStyle).toBe(4);
    expect(itemfuncDry['3744']?.placeStyle).toBe(0);
    expect(itemfuncDry['3745']?.placeStyle).toBe(2);
  });

  it('A5 宝箱倍增档 if/else（2612-2620,`35+(type-2612)*2` / else `41+type-2615`）', () => {
    const GOLD: Readonly<Record<number, number>> = {
      2612: 35, 2613: 37, 2614: 39, 2615: 41, 2616: 42, 2617: 43,
      2618: 44, 2619: 45, 2620: 46,
    };
    for (const [vid, ps] of Object.entries(GOLD)) {
      expect(itemfuncDry[vid]?.placeStyle, `vid ${vid}`).toBe(ps);
    }
  });

  it('A6 SetDefaults3 委托继承 15 件：r33 手补金标逐键全等 + noUseGraphic 六键纠偏', () => {
    // 值源 = extract-itemfunc.mjs DELEGATE_EXPANSION（r33 蓝队定谳）;
    // noUseGraphic = 基底 case 2773/2774 体首段（Item.cs:26483/:26502）应被继承——
    // 手补表漏载,解析面为准（反编译为准修正手补行）。
    const GOLD: Readonly<Record<number, Record<string, number>>> = {
      2778: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 429 },
      2783: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 431 },
      3463: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 610 },
      2779: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 430 },
      2784: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 432 },
      3464: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 609 },
      2777: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
      2782: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
      3462: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
      2780: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
      2785: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
      3465: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
      2781: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
      2786: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
      3466: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
    };
    const SIX = new Set([2778, 2783, 3463, 2779, 2784, 3464]);
    for (const [idStr, gold] of Object.entries(GOLD)) {
      const dry = itemfuncDry[idStr] ?? {};
      for (const [k, v] of Object.entries(gold)) {
        expect(dry[k], `${idStr}.${k}`).toBe(v);
      }
      if (SIX.has(Number(idStr))) expect(dry.noUseGraphic, `${idStr}.noUseGraphic（委托继承）`).toBe(1);
    }
  });

  it('A7 蠕虫笼派生局部 bait 八档（`int num = type - 1994` + `if (num == N)`;:21343-21388）', () => {
    const GOLD: Readonly<Record<number, number>> = {
      1994: 5, 1995: 35, 1996: 30, 1997: 20, 1998: 10, 1999: 50, 2000: 15, 2001: 25,
    };
    for (const [vid, bait] of Object.entries(GOLD)) {
      expect(itemfuncDry[vid]?.bait, `vid ${vid}`).toBe(bait);
    }
    // 2001 bait 25 与手补表 {2001: bait 25} 同值（手补转 no-op,重产不再依赖）
  });
});

// ==================== B. extract-pets：dry-run ≡ 盘上全等 ====================
describe('B. pets dry-run：FX48 boss 宠 21 件转解析直出（零回退）', () => {
  it('B1 dry 输出与盘上 vanilla-pets.json 全等（83 行,含手补 21 行）', () => {
    expect(petsDry).toEqual(diskPets());
  });

  it('B2 boss 宠 21 件算式矩阵（881+type-4797 / 284+type-4797;light 3 只）', () => {
    const LIGHT = new Set([4807, 4811, 4812]);
    for (let vid = 4797; vid <= 4817; vid++) {
      const r = petsDry[String(vid)];
      expect(r, `vid ${vid}`).toEqual({
        buff: 284 + vid - 4797,
        proj: 881 + vid - 4797,
        light: LIGHT.has(vid) ? 1 : 0,
      });
    }
  });

  it('B3 DD2 三宠嵌套 switch(type) per-id（3855 真值 200/703,非嵌套 case 201/702）', () => {
    expect(petsDry['3855']).toEqual({ buff: 200, proj: 703, light: 0 });
    expect(petsDry['3856']).toEqual({ buff: 201, proj: 702, light: 1 });
    expect(petsDry['3857']).toEqual({ buff: 202, proj: 701, light: 0 });
  });
});

// ==================== C. extract-equip-prefix：dry-run 对拍 ====================
describe('C. equip dry-run：pet/light 转解析直出 + 其余面零漂移', () => {
  it('C1 pet/light 列表与盘上全等（FX48 21 件算式通道;A5 分类面同源）', () => {
    const disk = diskEquip();
    expect(equipDry.pet).toEqual(disk.pet);
    expect(equipDry.light).toEqual(disk.light);
  });

  it('C2 prefix/wingstats 与盘上全等（无手补重叠=提取直出面零漂移）', () => {
    const rd = (f: string) => JSON.parse(readFileSync(join(WORK, f), 'utf8')) as unknown;
    const diskPrefix = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-prefix.json'), 'utf8')) as unknown;
    const diskWing = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-wingstats.json'), 'utf8')) as unknown;
    expect(rd('vanilla-prefix.json')).toEqual(diskPrefix);
    expect(rd('vanilla-wingstats.json')).toEqual(diskWing);
  });

  it('C3 itemstats/accfx 无 id 缺失（盘上含后处理与手补,例外集显式登记）', () => {
    const ids = (f: string) => new Set(Object.keys(JSON.parse(readFileSync(join(WORK, f), 'utf8')) as object));
    const diskIds = (f: string) => new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, `src/data/${f}`), 'utf8')) as object));
    // 盘上有而提取器 dry 无 = 盘面后处理/手补增量（非提取器回退,逐 id 登记）：
    //  · itemstats：2104-2113 = patch-vanity-stats.mjs 区间块 Boss 面具 headSlot;
    //    6177/6183/6188/6189 = 1458 新物品手补。
    //  · accfx：23 件 = 蓝队批手工补齐面（tests/accfx-armor-mainstats 钉值）。
    const EXEMPT: Record<string, Set<number>> = {
      'vanilla-itemstats.json': new Set([2104, 2105, 2106, 2107, 2108, 2109, 2110, 2111, 2112, 2113, 6177, 6183, 6188, 6189]),
      // ★BJ183 补登记 410/411/5589/5590:pickSpeed+0.1 手补面(提取器无 pickSpeed
      //  模式面,Player.cs 无 `pickSpeed += 0.1f` 直字面量——C3 本就红,一并收口)
      'vanilla-accfx.json': new Set([410, 411, 938, 953, 975, 1253, 1322, 1323, 1923, 2373, 2374, 2375, 3090, 3223, 3224, 3619, 3624, 3721, 3997, 3998, 4881, 5064, 5107, 5589, 5590, 6188, 6189]),
    };
    for (const f of ['vanilla-itemstats.json', 'vanilla-accfx.json']) {
      for (const id of diskIds(f)) {
        if (EXEMPT[f]?.has(Number(id))) continue;
        expect(ids(f).has(id), `${f} id ${id} 在盘有而 dry 无=回退`).toBe(true);
      }
    }
  });

  it('C4 mountType 算式通道：马鞍 4785-4787 / 大师坐骑 4792-4796 解析直出（数据面落表另批）', () => {
    const disk = new Set(diskEquip().mount);
    const dry = new Set(equipDry.mount as number[]);
    for (const id of disk) expect(dry.has(id), `既有 mount ${id} 不回退`).toBe(true);
    for (const id of [4785, 4786, 4787, 4792, 4793, 4794, 4795, 4796]) {
      expect(dry.has(id), `mountType 算式件 ${id}`).toBe(true);
    }
  });
});

// ==================== D. extract-journey-browser：dry-run 对拍 ====================
describe('D. journey dry-run：boss 宠 dmg/shoot 直出 + 盘面零缺失', () => {
  it('D1 boss 宠 21 件 dmg:0 + shoot 算式（FX48 手补面转解析直出）', () => {
    for (let vid = 4797; vid <= 4817; vid++) {
      const row = journeyDry.items[String(vid)];
      expect(row?.dmg, `vid ${vid} dmg`).toBe(0);
      expect(row?.shoot, `vid ${vid} shoot`).toBe(881 + vid - 4797);
      expect(row?.bt, `vid ${vid} buffType`).toBe(284 + vid - 4797);
    }
  });

  it('D2 盘面逐行零缺失（dry 行 ⊇ 盘行,同键同值;新增键=算式通道解析面）', () => {
    for (const [vid, diskRow] of Object.entries(diskJourney().items)) {
      const dryRow = journeyDry.items[vid];
      expect(dryRow, `vid ${vid} 整行缺失=回退`).toBeDefined();
      for (const [k, v] of Object.entries(diskRow)) {
        expect(dryRow[k], `vid ${vid}.${k}`).toBe(v);
      }
    }
  });

  it('D3 placeStyle 算式通道（篝火/逻辑门字面 0 档不入表=原 `if (ps)` 门口径）', () => {
    expect(journeyDry.items['3046']?.ps).toBe(1);
    expect(journeyDry.items['4694']?.ps).toBe(13);
    expect(journeyDry.items['3608']?.ps).toBe(5);
    expect(journeyDry.items['3215']?.ps, 'ps=0 缺省档不落表（falsy 门,原口径）').toBeUndefined();
  });

  it('D4 mat/acc 通道盘面双向全等（BJ292 清偿 BJ153：D2 单向守卫曾放过盘面陈旧——48 mat+31 acc 缺键=研究浏览器错桶）', () => {
    const disk = diskJourney().items;
    const lagged: string[] = [];
    for (const [vid, dryRow] of Object.entries(journeyDry.items)) {
      for (const k of ['mat', 'acc'] as const) {
        if (k in dryRow && dryRow[k] !== disk[vid]?.[k]) {
          lagged.push(`${vid}.${k}: dry=${dryRow[k]} disk=${disk[vid]?.[k]}`);
        }
      }
    }
    // 盘面缺键/值漂/提取器多出该通道键,任一形态即红（通道全等,无豁免集）
    expect(lagged).toEqual([]);
  });
});
