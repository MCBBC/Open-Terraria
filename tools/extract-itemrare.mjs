// 从 Terarria1456 Item.cs 提取 rare/value → src/data/{vanilla-itemrare,vanilla-itemvalue}.json。
// 未列出的物品 rare=0 / value=0（ResetStats :48542/:48628 默认）。供 Tooltip 稀有度
// 着色（GetItemNameColor 15 档）、重铸费用 value×stack÷3、商店定价与 decraft 组代表
// （RecipeGroup.DecraftItemId OrderBy(value)）。
//
// 2026-08-13 工厂方法盲区修复（本批散项）：旧实现单正则扫全文件，五类失真——
//   ① value = buyPrice(...) 不求值（427 处，致 1250/1251/1252 读 0 抢占
//      Cloud/Blizzard/SandstormBalloon 三组 decraft 组代表，实测错位）；
//   ② SetShopValues(rarity, price) 双字段工厂（1139 处）完全不可见；
//   ③ case 标签列（case A: case B: 共体）只有末标签拿到值（水母饵 2436-2438、
//      宝石小动物 4831-4844、食物大列表）；
//   ④ 扫描越界：体终止锚 `\n\t\tbreak;` 匹配不到 3-tab 深的体 → 贯穿到后续
//      case 偷 value（case 2630 幻影 150）；工厂方法体内 case（4071/4072/4073/2626）
//      也被当物品混入；
//   ⑤ 工厂方法体内的 value（DefaultToSeaShell/DefaultToFood/DefaultToTorch…）不可见。
// 现策略：仅扫 SetDefaults1..5 + SetFoodDefaults（IsFood 分派 :48295 → 食物走后者），
//   按行解析（case 标签列合并 / 体终止 = 同深度 case|default|break|return|goto /
//   只认 case 体顶层(depth 3)无条件赋值——变体 if 块内赋值属 WeakerVariant 等变体，
//   本表建模基础变体，取顶层赋值序列的**最后一个**（工厂调用与显式赋值按源序覆盖，
//   DefaultToFood→SetShopValues 即此模式）），嵌套 if/switch 内赋值忽略。
//
// 2026-08-23 sellPrice 系统性漏乘 ×5 修复：sellPrice(p,g,s,c) = buyPrice(…)×5
//   （1457 Item.cs:49426-49429 尾乘 5；1456 :49019-49022 同式；extract-shops.mjs
//   同名分支早已带 ×5，本件是漏网者）。旧 evalPrice 把 sellPrice 与 buyPrice 同式
//   求值 → 全表 sellPrice 系条目统一 ÷5（case 757 实证 200000，应为 1000000）。
//   FACTORY_VALUE 同病同修：SeaShell/Vanitypet 手算常量按无 ×5 口径，改存源码
//   表达式串经修后 evalPrice 求值（Solution/Food/HealingPotion 本就是 buyPrice 不变，
//   Torch/MusicBox 字面量不变）。2026-08-23 二批（只读价格字段 + 自赋值伪影）：
//   ⑥ `value = shadowOrbPrice/dungeonPrice/queenBeePrice/hellPrice/eclipse*` 只读
//      字段引用不可求值 → FIELD_PRICE 映射表（字段 → 初始化器 sellPrice 表达式，
//      1457 Item.cs:71-83 / 1456 :52-64，经 evalPrice 自动 ×5 与 sellPrice 系同口径）；
//   ⑦ 反编译器自赋值伪影 `value = (value = 250000);`（1456:6323 case 425 /
//      :10417 case 774）→ evalPrice 剥 `(value = X)` 壳。
//   变体分支内字段引用不收（case 2623 影杖 WeakerVariant `value = dungeonPrice`
//   :25670，基础变体已有顶层 sellPrice(0,5)，按既有"建模基础变体"口径忽略）。
import { readFileSync, writeFileSync, writeSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// 源版本可选(recon-item-1456-1457.mjs 双实例分别取 1456/1457;缺省 1456 = 既有产物基线)
export const SRC_VER = process.env.SW_ITEM_VER ?? '1456';

/** 提取库:Item.cs 全文 → { RARE, VALUE }（id → 档位/价值,铜币,原版 value 字段终值——
 *  sellPrice 系含 ×5 尾乘,2026-08-23 修正） */
export function extractRareValue(src) {
  const LINES = src.split('\n');

// ============ 区域：SetDefaults1..5 + SetFoodDefaults 方法体 ============

/** 方法体切片（从签名行到配平的闭括号，含尾行） */
function methodRange(name) {
  const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let depth = 0;
  for (let i = sig; i < LINES.length; i++) {
    depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
    if (depth === 0 && i > sig) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}

const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']
  .map((n) => methodRange(n));

// ============ 表达式求值 ============

/** 只读价格字段 → 初始化器 sellPrice 表达式（Item.cs 顶部 private readonly 字段，
 *  静态扫描只见 `value = shadowOrbPrice;` 引用名 → 先展开为表达式再走 sellPrice
 *  求值（自动 ×5，与 sellPrice 系条目同口径）。出处行号：1457 Item.cs:71-83 /
 *  1456 :52-64，两版初始化器同式。 */
const FIELD_PRICE = {
  shadowOrbPrice: 'sellPrice(0, 1, 50)',        // 1457:71 / 1456:52 → 75000（卖 1金50银）
  dungeonPrice: 'sellPrice(0, 1, 75)',          // 1457:73 / 1456:54 → 87500（卖 1金75银）
  queenBeePrice: 'sellPrice(0, 2)',             // 1457:75 / 1456:56 → 100000（卖 2金）
  hellPrice: 'sellPrice(0, 2, 50)',             // 1457:77 / 1456:58 → 125000（卖 2金50银）
  eclipsePrice: 'sellPrice(0, 7, 50)',          // 1457:79 / 1456:60 → 375000（卖 7金50银）
  eclipsePostPlanteraPrice: 'sellPrice(0, 10)', // 1457:81 / 1456:62 → 500000（卖 10金）
  eclipseMothronPrice: 'sellPrice(0, 12, 50)',  // 1457:83 / 1456:64 → 625000（卖 12金50银）
};

/** buyPrice(p, g, s[, c]) = p*1e6 + g*1e4 + s*100 + c（Item.cs:49421-49424，铜币直和）。
 *  sellPrice(p, g, s[, c]) = buyPrice(…) × 5（Item.cs:49426-49429 尾乘 5；1456
 *  :49019-49022 同式）——参数语义 = 玩家卖出价（币面额），value 字段存 NPC 买入价
 *  = 卖价×5（原版商店 5:1 买卖差）。★2026-08-23 系统性漏乘修复：旧实现把两者
 *  同式求值，全表 sellPrice 系条目统一 ÷5（case 757 实证 200000，应为 1000000）。 */
function evalPrice(expr) {
  let out = expr
    .replace(new RegExp(`\\b(${Object.keys(FIELD_PRICE).join('|')})\\b`, 'g'), (n) => `(${FIELD_PRICE[n]})`)
    .replace(/sellPrice\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String(((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0)) * 5);
    })
    .replace(/buyPrice\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0));
    })
    .replace(/\((?:int|double|float)\)\s*/g, '')  // (int)((double)x * 1.5) 族强转
    .trim();
  // 反编译器自赋值伪影：`value = (value = 250000);`（1456:6323 case 425 /
  // :10417 case 774）→ 剥壳取内层表达式（C# 赋值表达式值为右操作数）
  while (/\(value = ([^()]*)\)/.test(out)) out = out.replace(/\(value = ([^()]*)\)/g, '$1').trim();
  if (!/^[\d+\-*/(). ]+$/.test(out)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function(`"use strict";return (${out});`)();
    return Number.isFinite(v) ? Math.trunc(v) : null;
  } catch {
    return null;
  }
}

/** ItemRarityColor（Terraria.Enums/ItemRarityColor.cs）→ rare 档 */
const RARITY_COLOR = {
  AmberMinus11: -11, TrashMinus1: -1, White0: 0, Blue1: 1, Green2: 2, Orange3: 3,
  LightRed4: 4, Pink5: 5, LightPurple6: 6, Lime7: 7, Yellow8: 8, Cyan9: 9,
  StrongRed10: 10, Purple11: 11,
};

// ============ 工厂方法 value 表（方法体内赋值，静态扫描不可见） ============
//  行号锚 = 1457：DefaultToSeaShell :47967-47993 按 type 内层 switch；DefaultToSolution
//  :47800-47808；DefaultToVanitypet :47937-47952；DefaultToTorch :48471-48482；
//  DefaultToFood :48544-48570；DefaultToHealingPotion :48573-48615；DefaultToMusicBox
//  :48638-48648。表值一律存源码表达式字符串、经上方 evalPrice 求值（sellPrice 自动
//  ×5）——★旧表存手算常量（按无 ×5 口径），SeaShell/Vanitypet 六族随之 ÷5。
//  DefaultToPlaceableTile/Wall / DefaultToCapturedCritter 不设 value（缺表=0 是对的）。
const FACTORY_VALUE = {
  DefaultToSeaShell: (id) => (id === 4071 ? 'sellPrice(0, 1)' : id === 4072 || id === 4073 ? 'sellPrice(0, 0, 20)' : id === 2626 ? 'sellPrice(0, 0, 10)' : 'sellPrice(0, 0, 5)'),
  DefaultToSolution: () => 'buyPrice(0, 0, 15)',
  DefaultToVanitypet: () => 'sellPrice(0, 2)',
  DefaultToTorch: () => '60',             // value = 60 字面量
  DefaultToFood: () => 'buyPrice(0, 0, 20)',
  DefaultToHealingPotion: () => 'buyPrice(0, 0, 20)',
  DefaultToMusicBox: () => '100000',      // value = 100000 字面量
};

const RARE = {};
const VALUE = {};

// 深度栈解析：switch 关键字 depth d → case 标签 d+1 → 体语句/终止符 d+2。
// SetDefaults 各段嵌套异构（顶层 case depth 2；SetDefaults2/3 内还有 depth 4 的
// 内层 switch case，如水母饵 2436-2438 :24082、贝壳 2625/2626 :25598）——
// 按标签深度分组建栈，语句归属 depth-1 的最内层组，终止符弹同深度组；
// 内层 per-type 赋值随内层组独立成段（变体分支，不污染外层基础值）。
for (const [from, to] of REGIONS) {
  const groups = []; // { ids: number[], depth, entries: [] }
  const groupAt = (d) => {
    for (let i = groups.length - 1; i >= 0; i--) if (groups[i].depth === d) return groups[i];
    return null;
  };
  const flush = (g) => {
    if (!g) return;
    // 顶层序列最后一个生效（DefaultToFood → SetShopValues 覆盖模式）；
    // 工厂调用按标签逐个求值（DefaultToSeaShell 2625=500 / 2626=1000 per-type）。
    // **先写为准**：反编译 SetDefaults 是多个顺序独立 switch(type) 链，命中即 return
    // ——后置 switch 里的重叠标签是死代码（如 2291 鱼竿 :22989 先于 :23107 的
    // 死标签组 value=500），不覆盖
    for (const id of g.ids) {
      let val;
      let rar;
      for (const e of g.entries) {
        if (e.kind === 'value') val = e.v;
        else if (e.kind === 'rare') rar = e.v;
        else if (e.kind === 'factory') { const fv = evalPrice(FACTORY_VALUE[e.name](id)); if (fv !== null) val = fv; }
      }
      if (val !== undefined && VALUE[id] === undefined) VALUE[id] = val;
      if (rar !== undefined && RARE[id] === undefined) RARE[id] = rar;
    }
    groups.splice(groups.indexOf(g), 1);
  };
  for (let i = from; i <= to; i++) {
    const line = LINES[i];
    const depth = (line.match(/^\t*/) ?? [''])[0].length;
    const cm = line.match(/^\t*case (\d+):\s*$/);
    if (cm) {
      const id = parseInt(cm[1], 10);
      const top = groups[groups.length - 1];
      if (top && top.depth === depth) top.ids.push(id);
      else groups.push({ ids: [id], depth, entries: [] });
      continue;
    }
    const s = line.trim();
    if (/^(break;|return\b|goto )/.test(s)) { flush(groupAt(depth - 1)); continue; }
    if (/^default:/.test(s)) { flush(groupAt(depth)); continue; }
    const g = groupAt(depth - 1);
    if (!g || depth !== g.depth + 1) continue;   // 只认 case 体顶层无条件语句
    let m;
    if ((m = s.match(/^SetShopValues\(ItemRarityColor\.(\w+),\s*([^;]+)\);$/))) {
      const v = evalPrice(m[2]);
      const r = RARITY_COLOR[m[1]];
      if (r !== undefined) g.entries.push({ kind: 'rare', v: r });
      if (v !== null) g.entries.push({ kind: 'value', v });
      continue;
    }
    if ((m = s.match(/^(DefaultTo(?:SeaShell|Solution|Vanitypet|Torch|Food|HealingPotion|MusicBox))\(/))) {
      g.entries.push({ kind: 'factory', name: m[1] });
      continue;
    }
    if ((m = s.match(/^value = ([^;]+);$/))) {
      const v = evalPrice(m[1]);
      if (v !== null) g.entries.push({ kind: 'value', v });
      continue;
    }
    if ((m = s.match(/^rare = (-?\d+);$/))) {
      g.entries.push({ kind: 'rare', v: +m[1] });
    }
  }
  while (groups.length) flush(groups[0]);
}

  return { RARE, VALUE };
}

const { RARE, VALUE } = extractRareValue(readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8'));
export { RARE, VALUE };
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  // --dump:全量表出 stdout 不落盘(recon-item-1456-1457.mjs 双版本对账用)
  if (process.argv.includes('--dump')) {
    writeSync(1, JSON.stringify({ src: SRC_VER, RARE, VALUE }));
  } else {
    writeFileSync(`${ROOT}/game/src/data/vanilla-itemrare.json`, JSON.stringify(RARE));
    writeFileSync(`${ROOT}/game/src/data/vanilla-itemvalue.json`, JSON.stringify(VALUE));
    console.error(`rare 条目: ${Object.keys(RARE).length} / value 条目: ${Object.keys(VALUE).length}（源 Terarria${SRC_VER}）`);
  }
}
