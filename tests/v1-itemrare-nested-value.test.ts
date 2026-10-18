// ★清偿刀 V1 守卫测试（2026-10-01,case 体嵌套 per-type if 值域全域普查+落刀;U1 终态为基线）:
//   ① 26 v1 id 终值=钉表（json 面 + --dump 提取面双断言;19 错值修正+7 新增纯加——重产 diff 实证）;
//   ② ch 通道对拍锚（112 id 值由 S1③value/T4/U1 既有通道承载,抽锚;ch-post 鱼链由 S1④ 承载）;
//   ③ 三版同构:1456/1458 --dump 的 26 面≡1457（普查脚本三版 IDENTICAL 的常驻化）;
//   ④ liveness 锚:2290 无覆写块基值 2500 存活/2320 死标签面=守卫 75000（链 if(2320) 块死）/
//     2432·2433 缺键（value=0 重置默认,组内仅 2434 有面）;
//   ⑤ 兑现锚（S1b 2026-10-01 落刀）:2203/2204=100000（V1 走栈翻案已由 S1b 专刀兑现——
//     SD3 尾段可达集=[2192,2198]∪{2203,2204},case 2203/2204 裸 break 穿出卫块落尾段
//     value=buyPrice(0,10)=100000;rare 面零变更;BJ69 尾支落穿锚 useStyle/createTile 同流互证）;
//   ⑥ 消费面:26 id 不属任何 RecipeGroup（decraft 组代表零变更,机械核+组 31 代表锚）+
//     SellChain 卖价归真（2843=20000 铜/2242=400 铜/5266=20000 铜,÷5 口径）;
//   ⑦ 变异（判别力,T4/era-guard 判例同法）:源变异六发（2242 面值漂移/5253 面摘除→清单门/
//     4698 else 面值漂移/5218 组新面现形→清单门/★S1b 二发:2203/2204 break→return 与插
//     case 2202→S1② break-exit 集门 fail-loud）+脚本变异一发（V1 v1 apply 摘除→26 id 回落
//     区域扫描基值 20/300/5000）。cp 变异副本,原文件 sha256 前后全等=零接触（禁 git checkout）。
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import valueJson from '../src/data/vanilla-itemvalue.json';
import rareJson from '../src/data/vanilla-itemrare.json';
import { groupDecraftItemId } from '../src/stats/Shimmer';
import { itemStoreValue, computeSellValue } from '../src/stats/SellChain';
import recipeDoc from '../src/data/vanilla-recipes.json';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const VALUE = valueJson as Record<string, number>;
const RARE = rareJson as Record<string, number>;
const SCRIPT = join(dirname(__dirname), 'tools', 'extract-itemrare.mjs');
// ★C档可移植:extract-itemrare ROOT 已转 import.meta 相对——mutant 置 OS tmp 须前置重锚(era-guard ④ 习语)
const ROOT_LINE = "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)";
const PROJ = join(dirname(__dirname), '..');
const relocateRoot = (s: string) => s.replace(ROOT_LINE, `const ROOT = ${JSON.stringify(PROJ)};`);

const SRC = () => readFileSync(SCRIPT, 'utf8');
const ITEM_CS = join(dirname(__dirname), '..', 'Terarria1457', 'Terraria', 'Item.cs');
const TMP = realpathSync(tmpdir());

// ---- V1 定谳钉表（1457 Item.cs 亲读+普查脚本三版对拍;at=1457 行号锚） ----
const V1: Array<{ id: number; v: number; at: string }> = [
  { id: 2242, v: 2000, at: ':22647 buyPrice(0,0,20)' },
  { id: 2258, v: 5000, at: ':22756 buyPrice(0,0,50)' },
  { id: 2434, v: 50, at: ':24091 buyPrice(0,0,0,50)' },
  { id: 2843, v: 100000, at: ':27103 buyPrice(0,10)' },
  { id: 4695, v: 1000, at: ':38634' },
  { id: 4696, v: 1000, at: ':38634' },
  { id: 4697, v: 1000, at: ':38634' },
  { id: 4698, v: 40000, at: ':38638 else' },
  { id: 4699, v: 40000, at: ':38638 else' },
  { id: 4700, v: 40000, at: ':38638 else' },
  { id: 5231, v: 10000, at: ':41641 sellPrice(0,0,20)' },
  { id: 5228, v: 100000, at: ':41645 sellPrice(0,2)' },
  { id: 5222, v: 100000, at: ':41649 sellPrice(0,2)' },
  { id: 5243, v: 30000, at: ':41677 sellPrice(0,0,60)' },
  { id: 5245, v: 10000, at: ':41681 sellPrice(0,0,20)' },
  { id: 5235, v: 25000, at: ':41685 sellPrice(0,0,50)' },
  { id: 5251, v: 10000, at: ':41737 sellPrice(0,0,20)' },
  { id: 5253, v: 10000, at: ':41741 sellPrice(0,0,20)' },
  { id: 5257, v: 10000, at: ':41745 sellPrice(0,0,20)' },
  { id: 5252, v: 25000, at: ':41749 sellPrice(0,0,50)' },
  { id: 5256, v: 25000, at: ':41753 sellPrice(0,0,50)' },
  { id: 5266, v: 100000, at: ':41785 sellPrice(0,2)' },
  { id: 5259, v: 25000, at: ':41789 sellPrice(0,0,50)' },
  { id: 5265, v: 25000, at: ':41793 sellPrice(0,0,50)' },
  { id: 5264, v: 25000, at: ':41797 sellPrice(0,0,50)' },
  { id: 5263, v: 25000, at: ':41801 sellPrice(0,0,50)' },
];
const V1_IDS = new Set(V1.map((p) => p.id));
const v1Of = (id: number) => V1.find((p) => p.id === id)!;

const dumpOf = (ver: string) => {
  const r = spawnSync('node', [SCRIPT, '--dump'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    env: { ...process.env, SW_ITEM_VER: ver },
  });
  expect(r.status).toBe(0);
  return JSON.parse(String(r.stdout)) as { RARE: Record<string, number>; VALUE: Record<string, number> };
};

describe.skipIf(EXT_MISSING)('V1 case 体嵌套 per-type if 值域（U1 登债兑现+SD5 旗帜墙组落刀）', () => {
  it('① 26 v1 id json 终值=钉表（19 错值修正+7 新增纯加;重产 diff 实证）', () => {
    for (const p of V1) {
      expect(VALUE[String(p.id)], `value[${p.id}] (${p.at})`).toBe(p.v);
    }
    // rare 面零变更（V1 只落 value;26 id rare 恒缺键=0）
    for (const p of V1) expect(RARE[String(p.id)], `rare[${p.id}] 恒缺键`).toBeUndefined();
  });

  it('①b --dump 提取面≡json 面（26 id 重产不回退;fx3 判例:钉值随提取器走）', () => {
    const d = dumpOf('1457');
    for (const p of V1) expect(d.VALUE[String(p.id)], `dump[${p.id}]`).toBe(p.v);
  });

  it('② ch/ch-post 通道对拍锚（112 id 值由既有通道承载,V1 只锁形态;抽锚防双源漂移）', () => {
    expect(VALUE['2214']).toBe(100000);  // S1③value/T4（default 体内范围守卫面）
    expect(VALUE['2379']).toBe(100000);  // U1 over 面
    expect(VALUE['2397']).toBe(300);     // U1 base 面（2405 由 S1⑤ 或块终值覆写 100000）
    expect(VALUE['2405']).toBe(100000);  // S1⑤ D_PINS 行源序终值
    expect(VALUE['2320']).toBe(75000);   // S1③value 单件守卫（死标签污染修正）
    expect(VALUE['2308']).toBe(500000);  // S1④ 鱼链 ch-post
    expect(VALUE['2421']).toBe(156000);  // S1③value if-else 守卫
  });

  it('③ 三版同构:1456/1458 --dump 的 26 面≡1457（普查脚本 IDENTICAL 的常驻化）', () => {
    for (const ver of ['1456', '1458']) {
      const d = dumpOf(ver);
      for (const p of V1) expect(d.VALUE[String(p.id)], `${ver} v1[${p.id}]`).toBe(p.v);
    }
  });

  it('④ liveness 锚:2290 基值存活/2320 死标签面归守卫/2432·2433 缺键（组内仅 2434 有面）', () => {
    expect(VALUE['2290']).toBe(2500);      // 鱼链无覆写块:运行基值 sellPrice(0,0,5) 存活
    expect(VALUE['2297']).toBe(2500);
    expect(VALUE['2320']).toBe(75000);     // 链 if(2320) 块死（守卫提前 return）→ 守卫面
    expect(VALUE['2432']).toBeUndefined(); // case 2432-2434 组:仅 2434 有嵌套面,余者 value=0
    expect(VALUE['2433']).toBeUndefined();
    expect(VALUE['2243']).toBe(20);        // 2242/2243 组:基值 20 对 2243 仍正确（只有 2242 被覆写）
    expect(VALUE['2257']).toBe(20);
  });

  it('⑤ 兑现锚（S1b 2026-10-01）:2203/2204=100000（json+--dump 双断言,重产不回退）', () => {
    // V1 走栈实证→S1b 兑现:SD3 尾卫块唯一 return 在 switch A default 体尾(:27618),case
    // 2203/2204 裸 break(:22295) 穿出卫块落尾段 value=buyPrice(0,10)(:27641)→100000
    // （10 金买价,Steampunker(178) 商店两格 price=100000 同价对齐;2203=SteampunkBoiler/
    // 2204=HoneyDispenser,tile 307/308）。S1②「尾内 case 2203/2204=死码」已翻正。
    expect(VALUE['2203']).toBe(100000);
    expect(VALUE['2204']).toBe(100000);
    // rare 面零变更（尾段不写 rare）
    expect(RARE['2203']).toBeUndefined();
    expect(RARE['2204']).toBeUndefined();
    // --dump 提取面（fx3 判例:钉值随提取器走,重产不回退）
    const d = dumpOf('1457');
    expect(d.VALUE['2203']).toBe(100000);
    expect(d.VALUE['2204']).toBe(100000);
    // 消费面双表口径:卖回链 itemStoreValue←shopstock values（2203/2204=100000 既有,本刀
    // 不改其运行时行为——可放置物块不可重铸,Game.ts reforgeCost ITEM_VALUE 唯一消费点
    // 亦不受累;本刀=vanilla-itemvalue.json 权威面与货架/卖回表同值对齐,消数据缺键债）。
    // 卖回=100000/5=20000 铜=2 金（原版 5:1 口径,Steampunker 货架 buy 100000 同源）。
    expect(itemStoreValue(2203)).toBe(100000);
    expect(computeSellValue(2203, 1).perUnit).toBe(20000);
    expect(itemStoreValue(2204)).toBe(100000);
    expect(computeSellValue(2204, 1).perUnit).toBe(20000);
  });

  it('⑥ 消费面:26 id 不属任何 RecipeGroup（decraft 代表零变更）+SellChain 卖价归真', () => {
    const groupItems = (recipeDoc as { groupItems: Record<string, number[]> }).groupItems;
    const hits: Array<[string, number[]]> = [];
    for (const [gid, items] of Object.entries(groupItems)) {
      const inG = (items as number[]).filter((x) => V1_IDS.has(x));
      if (inG.length) hits.push([gid, inG]);
    }
    expect(hits).toEqual([]);
    expect(groupDecraftItemId(31)).toBe(3458); // 组 31 代表锚（T4 面,不因 V1 漂移）
    // 卖价 = value/5（Item.cs:49426-49429 ×5 口径的反向）
    expect(itemStoreValue(2843)).toBe(100000);
    expect(computeSellValue(2843, 1).perUnit).toBe(20000);   // 10 金买价 → 2 金卖
    expect(computeSellValue(2242, 1).perUnit).toBe(400);     // 2000/5（旧 20 → 4 铜,卖价错 100 倍）
    expect(computeSellValue(5266, 1).perUnit).toBe(20000);   // 旗帜墙组覆写面
    expect(computeSellValue(4698, 1).perUnit).toBe(8000);    // 40000/5（新增面,旧缺键 0 不可卖）
  });

  it('⑦ 源锚:4695 组 if-else 与 SD5 四组 per-type 链文本在位（亲读锚,防漂移）', () => {
    const src = readFileSync(ITEM_CS, 'utf8');
    expect(src).toContain('if (type >= 4695 && type <= 4697)\n\t\t\t{\n\t\t\t\tvalue = 1000;\n\t\t\t}\n\t\t\telse\n\t\t\t{\n\t\t\t\tvalue = 40000;\n\t\t\t}');
    expect(src).toContain('if (type == 5231)\n\t\t\t{\n\t\t\t\tvalue = sellPrice(0, 0, 20);\n\t\t\t}');
    expect(src).toContain('if (type == 5266)\n\t\t\t{\n\t\t\t\tvalue = sellPrice(0, 2);\n\t\t\t}');
    expect(src).toContain('if (type == 2843)\n\t\t\t\t\t{\n\t\t\t\t\t\tvalue = buyPrice(0, 10);\n\t\t\t\t\t}');
  });

  // ---- 变异（判别力）:源变异四发+脚本变异一发;cp 变异副本,原文件 sha256 前后全等=零接触 ----
  const shaOf = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  /** 源变异:cp Item.cs/ItemID.cs 到沙箱→变异副本;mutant 脚本读沙箱副本;原树零接触 */
  const runSrcMutant = (itemMutation: (s: string) => string) => {
    const dir = mkdtempSync(join(TMP, 'v1-srcmut-'));
    const itemCopy = join(dir, 'Item.cs');
    const itemidCopy = join(dir, 'ItemID.cs');
    writeFileSync(itemCopy, itemMutation(readFileSync(ITEM_CS, 'utf8')));
    writeFileSync(itemidCopy, readFileSync(join(dirname(__dirname), '..', 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8'));
    const mutant = join(dir, 'extract-mutant.mjs');
    // mutant 脚本 = 原脚本换读沙箱副本（★ROOT 硬编码路径改注入;其余逐字节原样）
    const mutatedScript = 'const ITEM_COPY = ' + JSON.stringify(itemCopy) + ';\nconst ITEMID_COPY = ' + JSON.stringify(itemidCopy) + ';\n' + relocateRoot(SRC())
      .replace("readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8')", "readFileSync(ITEM_COPY, 'utf8')")
      .replace("readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria.ID/ItemID.cs`, 'utf8')", "readFileSync(ITEMID_COPY, 'utf8')");
    writeFileSync(mutant, mutatedScript);
    const r = spawnSync('node', [mutant, '--dump'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1457' },
    });
    return { r, stderr: String(r.stderr), stdout: String(r.stdout) };
  };
  const scriptMutant = (scriptMutation: (s: string) => string) => {
    const dir = mkdtempSync(join(TMP, 'v1-scriptmut-'));
    const mutant = join(dir, 'extract-mutant.mjs');
    writeFileSync(mutant, scriptMutation(relocateRoot(SRC())));
    const r = spawnSync('node', [mutant, '--dump'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1457' },
    });
    const out = String(r.stdout);
    return { r, stderr: String(r.stderr), parsed: out ? (JSON.parse(out) as { RARE: Record<string, number>; VALUE: Record<string, number> }) : null };
  };

  it('变异①源:2242 覆写值 buyPrice(0,0,20)→(0,0,21) → V1 face 值门 fail-loud exit≠0（新面值漂移必被拦）', () => {
    const before = shaOf(ITEM_CS);
    const a = '\t\t\t\t\tif (type == 2242)\n\t\t\t\t\t{\n\t\t\t\t\t\tvalue = buyPrice(0, 0, 20);\n\t\t\t\t\t}';
    const { r, stderr } = runSrcMutant((s) => s.replace(a, a.replace('buyPrice(0, 0, 20)', 'buyPrice(0, 0, 21)')));
    expect(r.status).not.toBe(0);
    expect(stderr).toContain('V1 face 值漂移');
    expect(stderr).toContain('2242');
    expect(shaOf(ITEM_CS)).toBe(before); // 原树逐字节零接触
  });

  it('变异②源:摘 if(5253) 覆写块 → V1 清单门 fail-loud（面消失=pins 独有,逃逸必被拦）', () => {
    const before = shaOf(ITEM_CS);
    const a = '\t\t\tif (type == 5253)\n\t\t\t{\n\t\t\t\tvalue = sellPrice(0, 0, 20);\n\t\t\t}\n';
    const { r, stderr } = runSrcMutant((s) => s.replace(a, ''));
    expect(r.status).not.toBe(0);
    expect(stderr).toContain('V1 嵌套面清单漂移');
    expect(stderr).toContain('5253');
    expect(shaOf(ITEM_CS)).toBe(before);
  });

  it('变异③源:4698 else 面 40000→40001 → V1 face 值门 fail-loud（else 支同受值门）', () => {
    const before = shaOf(ITEM_CS);
    const a = '\t\t\telse\n\t\t\t{\n\t\t\t\tvalue = 40000;\n\t\t\t}';
    const { r, stderr } = runSrcMutant((s) => s.replace(a, a.replace('40000', '40001')));
    expect(r.status).not.toBe(0);
    expect(stderr).toContain('V1 face 值漂移');
    expect(stderr).toContain('4698');
    expect(shaOf(ITEM_CS)).toBe(before);
  });

  it('变异④源:5218 组插新 if(5223) 覆写块 → V1 清单门 fail-loud（新面现形逼定谳）', () => {
    const before = shaOf(ITEM_CS);
    const a = '\t\t\tif (type == 5222)\n\t\t\t{\n\t\t\t\tvalue = sellPrice(0, 2);\n\t\t\t}\n';
    const ins = '\t\t\tif (type == 5223)\n\t\t\t{\n\t\t\t\tvalue = sellPrice(0, 0, 11);\n\t\t\t}\n';
    const { r, stderr } = runSrcMutant((s) => s.replace(a, a + ins));
    expect(r.status).not.toBe(0);
    expect(stderr).toContain('V1 嵌套面清单漂移');
    expect(stderr).toContain('5223');
    expect(shaOf(ITEM_CS)).toBe(before);
  });

  it('变异⑤脚本:V1 v1 apply 摘除 → 26 id 回落区域扫描基值（2242=20/2843=300/5231=5000;证明落值由 V1 apply 唯一承载）', () => {
    const before = shaOf(SCRIPT);
    const { r, parsed } = scriptMutant((s) => s.replace(
      "    if (pin.own === 'v1') {",
      "    if (false) { // ★变异:V1 v1 apply 摘除",
    ));
    expect(r.status).toBe(0); // 摘 apply 后门②仍在（键集/id 集/ch 对拍全过）,dump 照常
    expect(parsed!.VALUE['2242']).toBe(20);    // 区域扫描 case 体顶层基值回落
    expect(parsed!.VALUE['2843']).toBe(300);
    expect(parsed!.VALUE['5231']).toBe(5000);
    expect(parsed!.VALUE['4695']).toBeUndefined(); // 新增面回落缺键（无基值行）
    expect(parsed!.VALUE['2214']).toBe(100000);    // ch 面不受影响（既有通道承载）
    expect(shaOf(SCRIPT)).toBe(before);
  });

  // ---- ★S1b 变异二发（源,判别翻案逻辑核心;break-exit 集门 fail-loud）----
  it('变异⑥源（S1b 判别）:case 2203/2204 裸 break→return → S1② break-exit 集门 fail-loud exit≠0（break/return 之差=可达集之差,漂移必被拦）', () => {
    const before = shaOf(ITEM_CS);
    const a = '\t\t\tcase 2203:\n\t\t\tcase 2204:\n\t\t\t\tbreak;';
    const { r, stderr } = runSrcMutant((s) => s.replace(a, a.replace('break;', 'return;')));
    expect(r.status).not.toBe(0);
    expect(stderr).toContain('S1② break-exit 集漂移');
    expect(stderr).toContain('2203');
    expect(shaOf(ITEM_CS)).toBe(before); // 原树逐字节零接触
  });

  it('变异⑦源（S1b 判别）:插 case 2202 入裸 break 段 → S1② break-exit 集门 fail-loud（新 break-exit 成员现形逼定谳）', () => {
    const before = shaOf(ITEM_CS);
    const a = '\t\t\tcase 2203:\n\t\t\tcase 2204:\n\t\t\t\tbreak;';
    const { r, stderr } = runSrcMutant((s) => s.replace(a, `\t\t\tcase 2202:\n${a}`));
    expect(r.status).not.toBe(0);
    expect(stderr).toContain('S1② break-exit 集漂移');
    expect(stderr).toContain('2202');
    expect(shaOf(ITEM_CS)).toBe(before);
  });
});
