// 从 Terarria1456 Recipe.cs SetupRecipes 提取全量配方 → src/data/vanilla-recipes.json。
// 默认全量重生成；`--append-loops` 只把差集追加进现存 json（不动既有条目）。
// 注册形态（Recipe.cs:600-15029）：单例 currentRecipe + 字段赋值 + AddRecipe()。
//   currentRecipe.createItem.SetDefaults(N); .stack = N;
//   currentRecipe.requiredItem[K].SetDefaults(N); .stack = N;   （stack 缺省=1）
//   currentRecipe.SetIngredients(a,nA,b,nB,...);                  （成对字面量）
//   currentRecipe.requiredTile = N; / SetCraftingStation(N);      （-1/缺省=徒手）
//   currentRecipe.RequireGroup(RecipeGroups.X);                   （组 id 由 RecipeGroups.cs 映射）
//   needHoney/needWater/needLava/needSnowBiome/needGraveyardBiome = true;
// 辅助生成器方法（AddXXXFurniture 等 15129-16569）与反向配方生成器（CreateReverse*）：
//   生成器内部同样操作 currentRecipe——按调用点【内联展开】太重，此处对生成器调用
//   单独解析（AddStandardFurnitureSetRecipes 等 22 件套模板逐参展开）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// SW_TREE（2026-08-22 增量对拍用）：缺省 Terarria1456 不变；`SW_TREE=Terarria1457` 换树
// 只读对比。配 `--out <path>` 落 /tmp，禁止直接覆盖现库（现库含手工修复，全量重跑=回滚）。
// R14-B5②：默认树切 1457（2026-08-23 基准）——曾缺省 1456,裸重跑即静默回退
// （drops 提取器有 apply1457DropPatches 防回退,本文件以默认树对齐）
const TREE = process.env.SW_TREE || 'Terarria1457';
if (!/^(Terarria14(56|57))$/.test(TREE)) throw new Error(`SW_TREE 非法: ${TREE}`);
const src = readFileSync(`${ROOT}/${TREE}/Terraria/Recipe.cs`, 'utf8');

// ---- 循环生成段（2026-08-13 补：SetupRecipes 内 7 处 `for` 循环 AddRecipe 段） ----
// Recipe.cs 循环体里的 SetDefaults 参数是算式（2178+n / num5-4327+4334 / array[j,0] /
// ItemID.Sets.TextureCopyLoad[i]），foldBlock 的纯数字正则全不命中 → 整段蒸发。
// 展开策略：flattenLoops 把循环体按变量取值逐份内联成纯字面量行，再走既有折叠链。
// ItemID.Sets.TextureCopyLoad = Factory.CreateIntSet(-1, k,v,...)（ItemID.cs:1090）：
// 缺省 -1，其余键值对查表。
const TEXTURE_COPY_LOAD = (() => {
  const idSrc = readFileSync(`${ROOT}/${TREE}/Terraria.ID/ItemID.cs`, 'utf8');
  const m = idSrc.match(/TextureCopyLoad\s*=\s*Factory\.CreateIntSet\((-?[\d\s,]+)\);/);
  if (!m) throw new Error('ItemID.Sets.TextureCopyLoad 提取失败');
  const nums = m[1].split(',').map((x) => parseInt(x.trim(), 10));
  const table = { __default: nums[0] };
  for (let i = 1; i + 1 < nums.length; i += 2) table[nums[i]] = nums[i + 1];
  return table;
})();

/** 算式求值（只认 数字 / 加减乘除 / 括号 / 已绑定循环变量；整数除法取整） */
function evalExpr(expr, vars) {
  const tokens = expr.match(/\d+|[A-Za-z_]\w*|[()+\-*/]/g);
  if (!tokens) throw new Error(`算式无法 tokenize: ${expr}`);
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const outQ = [], opSt = [];
  let prev = '';
  for (const tk of tokens) {
    if (/^\d+$/.test(tk)) outQ.push(+tk);
    else if (/^[A-Za-z_]/.test(tk)) {
      if (!(tk in vars)) throw new Error(`算式未绑定变量 ${tk}: ${expr}`);
      outQ.push(vars[tk]);
    } else if (tk === '(') opSt.push(tk);
    else if (tk === ')') {
      while (opSt.length && opSt[opSt.length - 1] !== '(') outQ.push(opSt.pop());
      if (!opSt.length) throw new Error(`算式括号失配: ${expr}`);
      opSt.pop();
    } else {
      // 一元负号（前一个 token 是运算符/开括号/空）
      if (tk === '-' && (prev === '' || prev === '(' || prec[prev])) outQ.push(0);
      while (opSt.length && prec[opSt[opSt.length - 1]] >= prec[tk]) outQ.push(opSt.pop());
      opSt.push(tk);
    }
    prev = tk;
  }
  while (opSt.length) {
    const op = opSt.pop();
    if (op === '(') throw new Error(`算式括号失配: ${expr}`);
    outQ.push(op);
  }
  const st = [];
  for (const tk of outQ) {
    if (typeof tk === 'number') { st.push(tk); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) throw new Error(`算式操作数不足: ${expr}`);
    st.push(tk === '+' ? a + b : tk === '-' ? a - b : tk === '*' ? a * b : Math.trunc(a / b));
  }
  if (st.length !== 1) throw new Error(`算式求值异常: ${expr}`);
  return st[0];
}

/** 循环体一行按变量取值替换成字面量（先查表索引，再兜底算式求值） */
function substLine(line, v, val, env) {
  let out = line;
  out = out.replace(/ItemID\.Sets\.(\w+)\[([^\]]+)\]/g, (whole, setName, idx) => {
    if (setName !== 'TextureCopyLoad') return whole;
    const key = evalExpr(idx, { [v]: val });
    const hit = TEXTURE_COPY_LOAD[key] ?? TEXTURE_COPY_LOAD.__default;
    if (hit < 0) throw new Error(`TextureCopyLoad[${key}] 缺映射`);
    return String(hit);
  });
  out = out.replace(/\b(\w+)\[([^\]]+)\]/g, (whole, name, idx) => {
    const arr = env.arrays[name];
    if (!arr) return whole;
    const p = idx.split(',').map((x) => evalExpr(x, { [v]: val }));
    const hit = arr[p[0]]?.[p[1]];
    if (hit === undefined) throw new Error(`${name}[${p}] 缺映射`);
    return String(hit);
  });
  // 余下的变量算式只出现在 SetDefaults 参数位
  out = out.replace(/SetDefaults\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (whole, e) => {
    if (!/\b[A-Za-z_]\w*\b/.test(e.replace(/ItemID|Sets/g, ''))) return whole;
    return `SetDefaults(${evalExpr(e, { [v]: val })})`;
  });
  return out;
}

/** for 循环 + int[,] 数组声明预处理：循环体逐值内联展开；数组声明收录进 env 并摘除 */
function flattenLoops(lines, env) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    // int[,] 二维数组声明（可跨行，`{ a, b },` 逐行）——只收 int[,]，不碰模板的 int[] obj
    if (/^int\[\,]\s*(\w+)\s*=\s*new int\[\d+, \d+\]$/.test(l)) {
      const name = l.match(/^int\[\,]\s*(\w+)/)[1];
      const cells = [];
      let j = i;
      for (; j < lines.length; j++) {
        for (const m of lines[j].matchAll(/\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/g)) {
          cells.push([+m[1], +m[2]]);
        }
        if (lines[j].includes('};')) break;
      }
      env.arrays[name] = cells;
      i = j + 1;
      continue;
    }
    // 上界两种形态：字面量（n <= 8）/ 一维长度（j < array.GetLength(0)，env.arrays 收录过）
    const m = l.match(/^for \(int (\w+) = (-?\d+); \1 (<=|<|>=|>) (-?\d+|(\w+)\.GetLength\(0\)); \1\+\+\)$/);
    if (!m) {
      // 不支持的循环形态若体内含配方语句 → 大声警告（本缺口的原始故障模式就是静默蒸发）
      if (/^for \(/.test(l)) {
        let j = i, d2 = 0, started2 = false;
        for (; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') { d2++; started2 = true; } else if (ch === '}') d2--;
          }
          if (started2 && d2 === 0) break;
        }
        const seg = lines.slice(i, j + 1).join('\n');
        if (/currentRecipe|AddRecipe\(\)/.test(seg)) {
          console.error(`[extract-recipes] 未支持的循环形态（体内含配方语句，可能漏条）: ${l}`);
        }
      }
      out.push(lines[i]); i++; continue;
    }
    const [, v, loS, op, hiS, arrName] = m;
    const hi = arrName ? (env.arrays[arrName]?.length ?? -1) : +hiS;
    // 收集循环体（`{` 起始行到括号配平行）
    let j = i, depth = 0, started = false;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--;
      }
      if (started && depth === 0) break;
    }
    const body = flattenLoops(lines.slice(i + 1, j), env);
    const lo = +loS;
    const step = op === '<=' || op === '<' ? 1 : -1;
    const n = op === '<=' ? hi - lo + 1
      : op === '<' ? hi - lo
        : op === '>=' ? lo - hi + 1 : lo - hi;
    for (let k = 0; k < n; k++) {
      const val = lo + step * k;
      for (const bl of body) out.push(substLine(bl, v, val, env));
    }
    i = j + 1;
  }
  return out;
}

// ---- RecipeGroups 名 → 注册号 + 组内物品（SetupRecipeGroups :495-529：new RecipeGroup(name, ids...).Register()） ----
const groupSrc = src.slice(src.indexOf('public static void SetupRecipeGroups'), src.indexOf('public static void SetupRecipes'));
const GROUP_ID = {};
const GROUP_ITEMS = {};
let gid = 0;
for (const m of groupSrc.matchAll(/RecipeGroups\.(\w+)\s*=\s*new RecipeGroup\(([^)]*)\)\.Register\(\);/g)) {
  GROUP_ID[m[1]] = gid;
  GROUP_ITEMS[gid] = m[2].split(',').slice(1).map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
  gid++;
}

// ---- 站点继承表 TileCountsAs（SetupTileInheritance :555-567：AddTileCountsAs(a, b)） ----
const TILE_COUNTS_AS = {};
{
  const seg = src.slice(src.indexOf('SetupTileInheritance'), src.indexOf('SetupTileInheritance') + 1600);
  for (const m of seg.matchAll(/AddTileCountsAs\((\d+),\s*(\d+)\);/g)) TILE_COUNTS_AS[m[1]] = +m[2];
}

// ---- 解析主体：SetupRecipes 方法体 + 各生成器方法体 ----
function methodBody(name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}

/** 把一段 currentRecipe 语句序列折叠成一条配方（遇 AddRecipe() 结算） */
function foldBlock(lines, recipe) {
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^currentRecipe\.createItem\.SetDefaults\((\d+)\);$/))) {
      recipe.create = +m[1];
    } else if ((m = l.match(/^currentRecipe\.createItem\.stack\s*=\s*(\d+);$/))) {
      recipe.createStack = +m[1];
    } else if ((m = l.match(/^currentRecipe\.requiredItem\[(\d+)\]\.SetDefaults\((\d+)\);$/))) {
      recipe.items[+m[1]] = { id: +m[2], stack: 1 };
    } else if ((m = l.match(/^currentRecipe\.requiredItem\[(\d+)\]\.stack\s*=\s*(\d+);$/))) {
      const it = recipe.items[+m[1]];
      if (it) it.stack = +m[2];
    } else if ((m = l.match(/^currentRecipe\.SetIngredients\(([^)]*)\);$/))) {
      const nums = m[1].split(',').map((x) => parseInt(x.trim(), 10));
      for (let k = 0; k + 1 < nums.length; k += 2) {
        recipe.items.push({ id: nums[k], stack: nums[k + 1] });
      }
    } else if ((m = l.match(/^currentRecipe\.requiredTile\s*=\s*(-?\d+);$/))) {
      recipe.tile = +m[1];
    } else if ((m = l.match(/^currentRecipe\.SetCraftingStation\((\d+)\);$/))) {
      recipe.tile = +m[1];
    } else if ((m = l.match(/^currentRecipe\.RequireGroup\(RecipeGroups\.(\w+)\);$/))) {
      recipe.groups.push(GROUP_ID[m[1]]);
    } else if (/^currentRecipe\.(needHoney)\s*=\s*true;/.test(l)) recipe.honey = true;
    else if (/^currentRecipe\.(needWater)\s*=\s*true;/.test(l)) recipe.water = true;
    else if (/^currentRecipe\.(needLava)\s*=\s*true;/.test(l)) recipe.lava = true;
    else if (/^currentRecipe\.needSnowBiome\s*=\s*true;/.test(l)) recipe.snow = true;
    else if (/^currentRecipe\.needGraveyardBiome\s*=\s*true;/.test(l)) recipe.graveyard = true;
    // decraft 族(decraft 移植 2026-08-13):UpdateWhichItemsAreCrafted(:15110-15127)消费
    else if (/^currentRecipe\.notDecraftable\s*=\s*true;/.test(l)) recipe.notDecraftable = true;
    else if (/^currentRecipe\.crimson\s*=\s*true;/.test(l)) recipe.crimson = true;
    else if (/^currentRecipe\.corruption\s*=\s*true;/.test(l)) recipe.corruption = true;
    else if ((m = l.match(/^currentRecipe\.AddCustomShimmerResult\((\d+)(?:,\s*(\d+))?\);$/))) {
      (recipe.shimmer ??= []).push([+m[1], +(m[2] ?? 1)]);
    }
  }
}

const out = [];

/** 解析 SetupRecipes 主体（线性段） */
function parseLinear(body) {
  // for 循环生成段先内联展开（2026-08-13：蝴蝶罐/蜻蜓罐/架子/字母雕像/假箱/平衡锤 108 条）
  const lines = flattenLoops(body.split('\n'), { arrays: {} });
  let recipe = null;
  let buf = [];
  const flush = () => {
    if (!recipe) return;
    foldBlock(buf, recipe);
    if (recipe.create > 0) {
      out.push({
        create: recipe.create,
        createStack: recipe.createStack ?? 1,
        tile: recipe.tile ?? -1,
        items: recipe.items.filter((x) => x && x.id > 0),
        groups: recipe.groups,
        ...(recipe.honey ? { honey: true } : {}),
        ...(recipe.water ? { water: true } : {}),
        ...(recipe.lava ? { lava: true } : {}),
        ...(recipe.snow ? { snow: true } : {}),
        ...(recipe.graveyard ? { graveyard: true } : {}),
        // 炼金配方（AddRecipe 时 requiredTile==13 自动置位，Recipe.cs:16666-16669）
        ...((recipe.tile ?? -1) === 13 ? { alchemy: true } : {}),
        ...(recipe.notDecraftable ? { notDecraftable: true } : {}),
        ...(recipe.crimson ? { crimson: true } : {}),
        ...(recipe.corruption ? { corruption: true } : {}),
        ...(recipe.shimmer?.length ? { shimmer: recipe.shimmer } : {}),
      });
    }
    recipe = null; buf = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (l === 'AddRecipe();') { flush(); continue; }
    if (l.startsWith('currentRecipe.')) {
      if (!recipe) recipe = { items: [], groups: [], create: 0, createStack: 1, tile: undefined };
      buf.push(l);
    } else if (/^Add\w+\(/.test(l)) {
      const name = l.match(/^(Add\w+)\(/)[1];
      // 参数化模板：调用语句字面量直接展开（优先于块体解析——块体内参数是变量名 foldBlock 必丢）
      if (name === 'AddCritterStatueRecipe') { expandCritterStatue(l); continue; }
      if (name === 'AddStandardFurnitureSetRecipes') { expandFromCall(l); continue; }
      // 生成器调用：块体递归解析（生成器内也是 currentRecipe 序列，末尾自带 AddRecipe）；
      // 表达体转发（=> AddStandardFurnitureSetRecipes）在 gen 为空时按调用语句级联展开
      const gen = methodBody(`void ${name}(`) || methodBody(`private void ${name}(`)
        || methodBody(`public void ${name}(`) || methodBody(`private static void ${name}(`);
      if (gen) parseLinear(gen);
      else if (/^AddStandardFurnitureSetRecipes\(/.test(l)) expandFromCall(l);
    }
  }
  flush();
}

// ---- 22 件套模板展开（AddStandardFurnitureSetRecipes :16452-16569）----
// 模板体含两类材料形态：SetIngredients(primaryMaterial, N) 直排 与
// `int[] obj = {a,b,c,d}; obj[K] = primaryMaterial; SetIngredients(obj)`（K 号位替换主材）
const STD_PARAMS = ['primaryMaterial', 'bathtub', 'bed', 'bookcase', 'candelabra', 'candle',
  'chair', 'chandelier', 'chest', 'clock', 'door', 'dresser', 'lamp', 'lantern', 'piano',
  'sink', 'sofa', 'table', 'toilet', 'workbench', 'fake_chest', 'overrideStation'];
/** 从一条调用语句展开模板：AddStandardFurnitureSetRecipes(a, b, ...) 或带 gen 参数前缀 */
function expandFromCall(line) {
  const m = line.match(/AddStandardFurnitureSetRecipes\(([^)]*)\)/);
  if (!m) return;
  const args = m[1].split(',').map((x) => x.trim());
  while (args.length < 22) args.push('-1');
  expandStandardSet(args);
}
function expandStandardSet(args) {
  const map = {};
  STD_PARAMS.forEach((name, k) => { map[name] = args[k] !== undefined ? +args[k] : (name === 'overrideStation' ? -1 : 0); });
  const body = methodBody('void AddStandardFurnitureSetRecipes(');
  if (!body) return;
  parseLinearTemplate(body, map);
}
function parseLinearTemplate(body, map) {
  const lines = body.split('\n');
  let recipe = null, buf = [];
  const flush = () => {
    if (!recipe) return;
    foldBlockTemplate(buf, recipe, map);
    if (recipe.create > 0) out.push({
      create: recipe.create, createStack: recipe.createStack ?? 1,
      tile: recipe.tile ?? -1,
      items: recipe.items.filter((x) => x && x.id > 0),
      groups: recipe.groups,
      ...((recipe.tile ?? -1) === 13 ? { alchemy: true } : {}),
    });
    recipe = null; buf = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (l === 'AddRecipe();') { flush(); continue; }
    // 模板体要完整收集：currentRecipe 语句 + obj 数组声明/赋值行都进 buf
    if (l.startsWith('currentRecipe.') || /^int\[\] obj/.test(l) || /^obj\d*\[/.test(l)) {
      if (!recipe) recipe = { items: [], groups: [], create: 0, createStack: 1, tile: undefined };
      buf.push(l);
    }
  }
  flush();
}
function foldBlockTemplate(lines, recipe, map) {
  // obj 数组：`int[] obj = {a,b,c,d}; obj[K] = primaryMaterial; SetIngredients(obj)`
  const arrVals = {};
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^int\[\] (obj\d*) = new int\[\d+\] \{([\d,\s]+)\};$/))
      || (m = l.match(/^int\[\] (obj\d*) = \{([\d,\s]+)\};$/))) {
      arrVals[m[1]] = m[2].split(',').map((x) => parseInt(x.trim(), 10));
    } else if ((m = l.match(/^(obj\d*)\[(\d+)\] = (primaryMaterial|overrideStation);$/))) {
      const arr = arrVals[m[1]];
      if (arr) arr[+m[2]] = map[m[3]] ?? -1;
    }
  }
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^currentRecipe\.createItem\.SetDefaults\((\w+)\);$/))) {
      recipe.create = map[m[1]] ?? +m[1];
    } else if ((m = l.match(/^currentRecipe\.SetIngredients\((primaryMaterial|\w+), (\d+)\);$/))) {
      recipe.items.push({ id: map[m[1]] ?? +m[1], stack: +m[2] });
    } else if ((m = l.match(/^currentRecipe\.SetIngredients\((obj\d*)\);$/))) {
      const arr = arrVals[m[1]] ?? [];
      for (let k = 0; k + 1 < arr.length; k += 2) recipe.items.push({ id: arr[k], stack: arr[k + 1] });
    } else if ((m = l.match(/^currentRecipe\.SetCraftingStation\(\(overrideStation >= 0\) \? overrideStation : (\d+)\);$/))) {
      recipe.tile = map.overrideStation >= 0 ? map.overrideStation : +m[1];
    } else if ((m = l.match(/^currentRecipe\.SetCraftingStation\((\d+)\);$/))) {
      recipe.tile = +m[1];
    } else if ((m = l.match(/^currentRecipe\.RequireGroup\(RecipeGroups\.(\w+)\);$/))) {
      recipe.groups.push(GROUP_ID[m[1]]);
    } else if ((m = l.match(/^currentRecipe\.createItem\.stack\s*=\s*(\d+);$/))) {
      recipe.createStack = +m[1];
    }
  }
}

// ---- AddCritterStatueRecipe（:16571-16587：50 石头+5 小动物(或组) @重型工作台283+墓地）----
// 调用形 AddCritterStatueRecipe(statueItem, critterItem=0[, RecipeGroups.X])——
// 组形第三个参取组占位物（GetPlaceholderItemType = 组内首个 id）并 RequireGroup
function expandCritterStatue(line) {
  const m = line.match(/AddCritterStatueRecipe\((\d+),\s*(\d+)(?:,\s*RecipeGroups\.(\w+))?\)/);
  if (!m) return;
  const statue = +m[1];
  let critter = +m[2];
  const groups = [];
  if (m[3]) {
    const gname = m[3];
    const gid2 = GROUP_ID[gname];
    if (gid2 === undefined) return;
    critter = (GROUP_ITEMS[gid2] ?? [0])[0]; // GetPlaceholderItemType = 组内首个
    groups.push(gid2);
  }
  if (critter <= 0 && !groups.length) return;
  out.push({
    create: statue, createStack: 1, tile: 283,
    items: [{ id: 3, stack: 50 }, { id: critter || 1000000 + (groups[0] ?? 0), stack: 5 }],
    groups, graveyard: true,
  });
}

const main = methodBody('public static void SetupRecipes()');
parseLinear(main);
// main 里的直调 AddStandardFurnitureSetRecipes(...) 展开（缺省参补 -1）
{
  const re = /AddStandardFurnitureSetRecipes\(([^)]*)\);/g;
  let m;
  while ((m = re.exec(main))) {
    const args = m[1].split(',').map((x) => x.trim());
    while (args.length < 22) args.push('-1');
    expandStandardSet(args);
  }
}

// ---- 反向配方（CreateReversePlatformRecipes :16589 / CreateReverseWallRecipes :16613）----
// 条件：单材料配方（items[1] 不存在）且 成品是平台（createTile∈Platforms）或墙（createWall>0）
//      且材料本身不是墙（墙反做时不重复反转）。产物 = 材料作成品、原成品作材料、站点同原配方。
// createTile/createWall 需 ItemID → Item.cs SetDefaults 的 createTile/createWall 字段：
// 从 itemcombat json 无此字段——直接从 Item.cs 提取（正则取 `createTile = N;`/`createWall = N;`）

// Item.cs createTile/createWall 扫描（SetDefaults1..5 分段 switch 内）
const itemSrc = readFileSync(`${ROOT}/${TREE}/Terraria/Item.cs`, 'utf8');
const CREATE_TILE = {};
const CREATE_WALL = {};
{
  // 分段方法体逐 case 提取：case N: ... createTile = M;
  const caseRe = /case (\d+):([\s\S]*?)(?=case \d+:|default:|\n\t\tbreak;)/g;
  let m2;
  while ((m2 = caseRe.exec(itemSrc))) {
    const id = +m2[1];
    const body = m2[2].slice(0, 800);
    const t = body.match(/createTile\s*=\s*(\d+);/);
    if (t) CREATE_TILE[id] = +t[1];
    const w = body.match(/createWall\s*=\s*(\d+);/);
    if (w) CREATE_WALL[id] = +w[1];
  }
}
// 平台 tile 集（TileID.Sets.Platforms——Main 静态初始化；用 TEdit tiles.json isPlatform 无，
// 近似：墙/平台由 Item.cs case 中 createTile 指向的 tile 属于平台族。权威源：Item.cs
// 中 `createTile = 19`（木平台）外的平台由 tile 表判断——此处用 TileID.Sets 初始化源：
// Terraria.ID/TileID.Sets.Platforms 在 1456 由 Main.cs 静态块填充）
const PLATFORM_TILES = (() => {
  const s = new Set();
  // Main.cs 静态 Platforms[19]=true 等初始化
  const mainSrc = readFileSync(`${ROOT}/${TREE}/Terraria/Main.cs`, 'utf8');
  for (const m3 of mainSrc.matchAll(/Platforms\[(\d+)\]\s*=\s*true;/g)) s.add(+m3[1]);
  return s;
})();

const reverseOut = [];
const baseCount = out.length;
for (let i = 0; i < baseCount; i++) {
  const r = out[i];
  if (r.items.length !== 1) continue;
  const mat = r.items[0];
  const isPlatform = CREATE_TILE[r.create] !== undefined && PLATFORM_TILES.has(CREATE_TILE[r.create]);
  const isWall = (CREATE_WALL[r.create] ?? 0) > 0 && (CREATE_WALL[mat.id] ?? -1) === -1;
  if (!isPlatform && !isWall) continue;
  reverseOut.push({
    create: mat.id,
    createStack: mat.stack,
    tile: r.tile,
    items: [{ id: r.create, stack: r.createStack }],
    groups: [],
    // 原版反向配方注册后立即置 notDecraftable（Recipe.cs:16608/16632）——
    // 平台/墙反转配方不进 IsCrafted，微光 decraft 不反它们
    notDecraftable: true,
  });
}
out.push(...reverseOut);

// ---- 输出端去重（同 create+tile+材料序列 视为同一条——原版源码本身有重复注册，如
//      4022 Seafood Dinner@烹饪锅 重复 14 次；运行时 list 重复渲染无意义）----
function dedupKey(r) {
  return `${r.create}|${r.tile}|${r.items.map((i) => `${i.id}x${i.stack}`).sort().join(',')}`;
}
{
  const seen = new Set();
  const unique = [];
  for (const r of out) {
    const key = dedupKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  out.length = 0;
  out.push(...unique);
}

const JSON_PATH = `${ROOT}/game/src/data/vanilla-recipes.json`;

if (process.argv.includes('--append-loops')) {
  // ---- 追加模式（2026-08-13 循环段补漏落表用）：只把差集条目追加进现存 json，
  //      既有条目原样保留（配方数据高频在途，禁止整文件重生成覆盖他人增量）。
  //      同时剔除一条历史循环残影：create 5547 @114 仅 [3306x1]——旧提取器漏掉
  //      `SetDefaults(l)` 的配重材料后折出的半截配方，原版无此配方。 ----
  const existing = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const have = new Set(existing.recipes.map(dedupKey));
  const ARTIFACT = dedupKey({ create: 5547, tile: 114, items: [{ id: 3306, stack: 1 }] });
  const before = existing.recipes.length;
  existing.recipes = existing.recipes.filter((r) => dedupKey(r) !== ARTIFACT);
  const removed = before - existing.recipes.length;
  let added = 0;
  for (const r of out) {
    if (have.has(dedupKey(r))) continue;
    existing.recipes.push(r);
    have.add(dedupKey(r));
    added++;
  }
  existing.count = existing.recipes.length;
  writeFileSync(JSON_PATH, JSON.stringify(existing));
  console.error(`追加 ${added} 条 / 剔除循环残影 ${removed} 条 / 终态 ${existing.count} 条`);
  process.exit(0);
}

const doc = {
  count: out.length,
  src: TREE,
  groups: GROUP_ID,
  groupItems: GROUP_ITEMS,
  tileCountsAs: TILE_COUNTS_AS,
  recipes: out,
};
// --out <path>（2026-08-22）：对拍产物落 /tmp，缺省仍写现库路径（保持原行为）
const outIdx = process.argv.indexOf('--out');
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : JSON_PATH;
writeFileSync(OUT_PATH, JSON.stringify(doc));
console.error(`[${TREE}] 配方 ${out.length} 条 / 组 ${Object.keys(GROUP_ID).length} / 站点继承 ${Object.keys(TILE_COUNTS_AS).length} → ${OUT_PATH}`);
console.error('样例:', JSON.stringify(out[0]), JSON.stringify(out[1] ?? null));
