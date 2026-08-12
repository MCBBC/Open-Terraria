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
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');
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

/** sellPrice/buyPrice(p, g, s[, c]) = p*1e6 + g*1e4 + s*100 + c（Item.cs 同名方法同式） */
function evalPrice(expr) {
  let out = expr
    .replace(/(?:sellPrice|buyPrice)\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0));
    })
    .replace(/\((?:int|double|float)\)\s*/g, '')  // (int)((double)x * 1.5) 族强转
    .trim();
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
//  DefaultToSeaShell :47579-47611 按 type 内层 switch；DefaultToSolution :47434；
//  DefaultToVanitypet :47560；DefaultToTorch :48094；DefaultToFood :48182；
//  DefaultToHealingPotion :48195；DefaultToMusicBox :48263。
//  DefaultToPlaceableTile/Wall / DefaultToCapturedCritter 不设 value（缺表=0 是对的）。
const FACTORY_VALUE = {
  DefaultToSeaShell: (id) => (id === 4071 ? 10000 : id === 4072 || id === 4073 ? 2000 : id === 2626 ? 1000 : 500),
  DefaultToSolution: () => 1500,        // buyPrice(0, 0, 15)
  DefaultToVanitypet: () => 20000,      // sellPrice(0, 2)
  DefaultToTorch: () => 60,
  DefaultToFood: () => 2000,            // buyPrice(0, 0, 20)
  DefaultToHealingPotion: () => 2000,   // buyPrice(0, 0, 20)
  DefaultToMusicBox: () => 100000,
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
        else if (e.kind === 'factory') val = FACTORY_VALUE[e.name](id);
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

writeFileSync(`${ROOT}/game/src/data/vanilla-itemrare.json`, JSON.stringify(RARE));
writeFileSync(`${ROOT}/game/src/data/vanilla-itemvalue.json`, JSON.stringify(VALUE));
console.error(`rare 条目: ${Object.keys(RARE).length} / value 条目: ${Object.keys(VALUE).length}`);
