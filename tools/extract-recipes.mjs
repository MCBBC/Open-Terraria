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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
// SW_TREE（★BJ183 2026-09-20 勘误:缺省已系 Terarria1457）。★BJ261 era guard①：白名单
// {1457,1458}（Recipe.cs/ItemID.cs/Item.cs 读域 1457↔1458 逐字节全等,md5 实证;1456
// 锚集随 BJ261 编码面重建退役——显式 1456 拒+指引,防旧基线重放洗 1457 终值）。
const TREE = process.env.SW_TREE || 'Terarria1457';
if (!/^(Terarria14(57|58))$/.test(TREE)) {
  console.error(`[extract-recipes] 拒绝运行：SW_TREE="${TREE}" 非法（白名单 Terarria1457/Terarria1458）。`);
  if (/^Terarria1456$/.test(TREE)) console.error('  1456 锚集已随 BJ261 编码面重建退役；1456 对拍读 BJ261 定谳或 /tmp 时代快照。');
  process.exit(1);
}
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
// ★BJ261 勘误：旧正则 `([^)]*)` 吃不了嵌套括号——Turtles 组首参是
//   Lang.GetNPCNameValue(616)（:508），整组被静默跳过 → 33 组缺 1 且后续 gid 全体
//   前移错位（live 库编号系 1456 时代枚举+手并,源码序=权威）。改平衡括号扫描。
const groupSrc = src.slice(src.indexOf('public static void SetupRecipeGroups'), src.indexOf('public static void SetupRecipes'));
const GROUP_ID = {};
const GROUP_ITEMS = {};
{
  let gid = 0;
  const re = /RecipeGroups\.(\w+)\s*=\s*new RecipeGroup\(/g;
  let gm;
  while ((gm = re.exec(groupSrc))) {
    // 平衡扫描到与 new RecipeGroup( 配对的 ')'
    let depth = 1, i = re.lastIndex;
    for (; i < groupSrc.length && depth > 0; i++) {
      if (groupSrc[i] === '(') depth++;
      else if (groupSrc[i] === ')') depth--;
    }
    const inner = groupSrc.slice(re.lastIndex, i - 1);
    const tail = groupSrc.slice(i).match(/^\s*\.Register\(\);/);
    if (!tail) throw new Error(`[extract-recipes] 锚点失配: RecipeGroups.${gm[1]} 无 .Register() 尾（形变,禁止静默跳组）`);
    GROUP_ID[gm[1]] = gid;
    GROUP_ITEMS[gid] = inner.split(',').slice(1).map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
    gid++;
  }
  if (gid < 30) throw new Error(`[extract-recipes] 锚点失配: 组基数 ${gid} < 30（SetupRecipeGroups 漏扫）`);
  if (GROUP_ID.Turtles === undefined) throw new Error('[extract-recipes] 锚点失配: RecipeGroups.Turtles 未命中（:508 GetNPCNameValue 嵌套括号形态,禁止静默缺组）');
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

/** 把一段 currentRecipe 语句序列折叠成一条配方（遇 AddRecipe() 结算）。
 *  ★BJ261：vars = 方法体局部 int 变量表（`int num = 5;`/`num2 = 1970;` 中途赋值）——
 *  SetupRecipes :? `int num = 5; int stack = 2;`（53 处 `.stack = num/stack` 引用）与
 *  `num2 = 1970; num3 = 2679; num4 = 2680;`（SetDefaults(numN) 引用）原被整吞：
 *  stack 变量=静默塌 1（伪造材料量）,SetDefaults(numN)=create 塌 0 → 整条配方静默蒸发。 */
function foldBlock(lines, recipe, vars, arrVals) {
  const intOf = (name, at) => {
    const v = vars?.get(name);
    if (v === undefined) throw new Error(`[extract-recipes] 未绑定变量 ${name}（禁静默塌缺省,源码形变）@ ${at.slice(0, 90)}`);
    return v;
  };
  // ★arrVals 由 parseLinear 持有（方法体作用域——源里 obj 数组可声明一次跨块复用,
  //  AddSpiderFurniture 等；C# 局部作用域=parseLinear 调用级,禁跨方法泄漏）
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    // ★BJ261：obj 数组三形态（AddLesionFurniture :15742-15746 / 模板 recipeN+objN 别名族）
    if ((m = l.match(/^int\[\] (obj\d*) = new int\[\d*\] \{([\d,\s]*)\};$/)) || (m = l.match(/^int\[\] (obj\d*) = \{([\d,\s]*)\};$/))) {
      arrVals[m[1]] = m[2].split(',').map((t) => t.trim()).map((t) => (/^-?\d+$/.test(t) ? parseInt(t, 10) : intOf(t, l)));
    } else if ((m = l.match(/^(obj\d*)\[(\d+)\] = ([\w.]+);$/))) {
      const arr = arrVals[m[1]];
      if (!arr) throw new Error(`[extract-recipes] obj 数组未声明即赋值: ${l}`);
      arr[+m[2]] = /^-?\d+$/.test(m[3]) ? parseInt(m[3], 10) : intOf(m[3], l);
    } else if ((m = l.match(/^currentRecipe\.SetIngredients\((obj\d*)\);$/))) {
      // 数组整体入料（原版 SetIngredients(params int[]) 直接收数组）
      const arr = arrVals[m[1]];
      if (!arr) throw new Error(`[extract-recipes] SetIngredients(${m[1]}) 数组未声明: ${l}`);
      if (arr.length === 1) recipe.items.push({ id: arr[0], stack: 1 });
      else {
        if (arr.length % 2 !== 0) throw new Error(`[extract-recipes] SetIngredients(${m[1]}) 奇数参数（原版 throw）: ${l}`);
        for (let k = 0; k + 1 < arr.length; k += 2) recipe.items.push({ id: arr[k], stack: arr[k + 1] });
      }
    } else if ((m = l.match(/^currentRecipe\.createItem\.SetDefaults\((\d+)\);$/))) {
      recipe.create = +m[1];
    } else if ((m = l.match(/^currentRecipe\.createItem\.SetDefaults\(([A-Za-z_]\w*)\);$/))) {
      recipe.create = intOf(m[1], l);
    } else if ((m = l.match(/^currentRecipe\.createItem\.stack\s*=\s*(\d+);$/))) {
      recipe.createStack = +m[1];
    } else if ((m = l.match(/^currentRecipe\.createItem\.stack\s*=\s*([A-Za-z_]\w*);$/))) {
      recipe.createStack = intOf(m[1], l);
    } else if ((m = l.match(/^currentRecipe\.requiredItem\[(\d+)\]\.SetDefaults\((\d+)\);$/))) {
      recipe.items[+m[1]] = { id: +m[2], stack: 1 };
    } else if ((m = l.match(/^currentRecipe\.requiredItem\[(\d+)\]\.SetDefaults\(([A-Za-z_]\w*)\);$/))) {
      recipe.items[+m[1]] = { id: intOf(m[2], l), stack: 1 };
    } else if ((m = l.match(/^currentRecipe\.requiredItem\[(\d+)\]\.stack\s*=\s*(\d+);$/))) {
      const it = recipe.items[+m[1]];
      if (it) it.stack = +m[2];
    } else if ((m = l.match(/^currentRecipe\.requiredItem\[(\d+)\]\.stack\s*=\s*([A-Za-z_]\w*);$/))) {
      const it = recipe.items[+m[1]];
      if (it) it.stack = intOf(m[2], l);
    } else if ((m = l.match(/^currentRecipe\.(?:requiredItem\[(\d+)\]\.stack|createItem\.stack)\s*=\s*\(int\)\(\(float\)([A-Za-z_]\w*) \* ([\d.]+)f\);$/))) {
      // 算式栈量（SetupRecipes 内唯一形态 (int)((float)num * 2.5f),整数截断=原版 (int) 语义）
      const v = Math.trunc(intOf(m[2], l) * parseFloat(m[3]));
      if (m[1] !== undefined) { const it = recipe.items[+m[1]]; if (it) it.stack = v; }
      else recipe.createStack = v;
    } else if ((m = l.match(/^currentRecipe\.SetIngredients\(([^)]*)\);$/))) {
      // ★BJ261 勘误：单参形态 SetIngredients(2121)（Recipe.cs:16768-16776 params int[]，
      //   Length==1 → [ingredients[0],1]）原被 pair 循环整吞 → items:[] 假配方 276+ 条
      //   （4031-4033 料理锅食物族等）。现按原版语义补 stack=1；奇数 >1 原版直接 throw
      //   （"Bad ingredients amount"），此处同样 fail-loud。★另：参数可为局部 int 变量
      //   （AddLesionFurniture :15731 `int num = 3955; SetIngredients(num, 10)`）——
      //   非数字 token 走 vars 解析,禁静默 NaN 丢料。
      const nums = m[1].split(',').map((x) => {
        const t = x.trim();
        return /^-?\d+$/.test(t) ? parseInt(t, 10) : intOf(t, l);
      });
      if (nums.length === 1) recipe.items.push({ id: nums[0], stack: 1 });
      else {
        if (nums.length % 2 !== 0) throw new Error(`[extract-recipes] SetIngredients 奇数参数（原版 throw）: ${l}`);
        for (let k = 0; k + 1 < nums.length; k += 2) {
          recipe.items.push({ id: nums[k], stack: nums[k + 1] });
        }
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
    // ★BJ261：火把神/德库斯娃娃世界门（Recipe.cs:349/:353;消费面 vanillaRecipes.ts:411-412）
    else if (/^currentRecipe\.needTorchGodsFavor\s*=\s*true;/.test(l)) recipe.torchGod = true;
    else if (/^currentRecipe\.needMechdusa\s*=\s*true;/.test(l)) recipe.mechdusa = true;
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
  // ★BJ261：方法体局部 int 变量表（`int num = 5;` / `num2 = 1970;` 中途赋值）——
  //  源序自上而下,赋值先于使用（foldBlock 在 flush 时以当下 vars 状态折叠=源语义）
  const vars = new Map();
  // ★BJ261：int[] obj 数组表=方法体作用域（源内 obj 声明一次多块复用,如 AddSpiderFurniture
  //  `int[] obj = new int[4] {0,8,22,2};` 顶置 → 每块 obj[0] = num 后 SetIngredients(obj)）
  const arrVals = {};
  let recipe = null;
  let buf = [];
  const flush = () => {
    if (!recipe) return;
    foldBlock(buf, recipe, vars, arrVals);
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
        // ★BJ261：torchGod/mechdusa 门（Recipe.cs:349/:353;消费面 vanillaRecipes.ts:411-412
        //   在,原提取器整缺 → 火把神/德库斯娃娃配方门静默丢失）
        ...(recipe.torchGod ? { torchGod: true } : {}),
        ...(recipe.mechdusa ? { mechdusa: true } : {}),
        ...(recipe.shimmer?.length ? { shimmer: recipe.shimmer } : {}),
      });
    }
    recipe = null; buf = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    // 局部 int 变量（int num = 5; / num2 = 1970;）——必须先于配方块收集
    let vm;
    if ((vm = l.match(/^int ([A-Za-z_]\w*) = (-?\d+);$/)) || (vm = l.match(/^([A-Za-z_]\w*) = (-?\d+);$/))) {
      if (!l.startsWith('currentRecipe')) { vars.set(vm[1], parseInt(vm[2], 10)); continue; }
    }
    if (l === 'AddRecipe();') { flush(); continue; }
    if (l.startsWith('currentRecipe.') || /^recipe\d*\./.test(l) || /^int\[\] obj/.test(l) || /^obj\d*\[/.test(l)) {
      if (!recipe) recipe = { items: [], groups: [], create: 0, createStack: 1, tile: undefined };
      // ★BJ261：`Recipe recipeN = currentRecipe;` 别名语句族（模板体 :16638 等）——
      //   前缀归一为 currentRecipe（别名声明行本身不匹配任何形态,静默忽略=安全）；
      //   int[] obj 声明/obj[K] 赋值行同入 buf（foldBlock 数组形态消费）
      buf.push(l.replace(/^recipe\d*\./, 'currentRecipe.'));
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
      // ★BJ261 fail-loud：生成器签名四拼写全失配=整族配方静默蒸发（原实现静默跳过）
      else throw new Error(`[extract-recipes] 生成器方法体未找到: ${name}（签名漂移,禁止静默漏族）`);
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
    // ★BJ261：recipeN.SetIngredients(objN) 别名行也要收集（前缀归一）
    if (l.startsWith('currentRecipe.') || /^int\[\] obj/.test(l) || /^obj\d*\[/.test(l) || /^recipe\d*\./.test(l)) {
      if (!recipe) recipe = { items: [], groups: [], create: 0, createStack: 1, tile: undefined };
      buf.push(l.replace(/^recipe\d*\./, 'currentRecipe.'));
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
    } else if (/^currentRecipe\.SetCraftingStation\(overrideStation\);$/.test(l)) {
      // ★BJ261：workbench 块形（Recipe.cs:16689-16694）——`if (overrideStation >= 0)
      //   { SetCraftingStation(overrideStation); }` 无 else：overrideStation<0 时该行不执行
      //   （tile 保持缺省 -1）。原提取器只认三元形态 → 石头/以太系列 workbench 全体 tile=-1。
      if (map.overrideStation >= 0) recipe.tile = map.overrideStation;
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
  // ★BJ261 勘误：原扫 Main.cs `Platforms[N] = true;`——该形态在 1456/1457/1458 全为
  //   0 命中（死扫描 → PLATFORM_TILES 恒空 → isPlatform 恒 false → 平台反转配方
  //   CreateReversePlatformRecipes(:16725 TileID.Sets.Platforms) 整族未产,现库同缺）。
  //   权威源=TileID.cs:243 `Platforms = Factory.CreateBoolSet(19, 427, 435..439)`。
  const tileSrc = readFileSync(`${ROOT}/${TREE}/Terraria.ID/TileID.cs`, 'utf8');
  const m3 = tileSrc.match(/Platforms = Factory\.CreateBoolSet\(([\d\s,]+)\);/);
  if (!m3) throw new Error('[extract-recipes] 锚点失配: TileID.Sets.Platforms CreateBoolSet 未找到（TileID.cs 漂移,禁止静默空集）');
  const s = new Set(m3[1].split(',').map((x) => parseInt(x.trim(), 10)));
  if (!s.has(19) || s.size < 6) throw new Error(`[extract-recipes] 锚点失配: Platforms 集 ${[...s]} 不含 19/基数异常（木平台反转必失）`);
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

// ---- ★BJ261 基数护栏（锚 fail-loud）：1457 实测 3431/34/9/27,地板防静默半表 ----
if (out.length < 3400) throw new Error(`[extract-recipes] 锚点失配: 配方基数 ${out.length} < 3400（解析面漂移/静默蒸发）`);
if (Object.keys(GROUP_ID).length < 34) throw new Error(`[extract-recipes] 锚点失配: 组基数 ${Object.keys(GROUP_ID).length} < 34（SetupRecipeGroups 漏扫）`);
if (Object.keys(TILE_COUNTS_AS).length < 9) throw new Error(`[extract-recipes] 锚点失配: 站点继承基数异常`);

if (process.argv.includes('--append-loops')) {
  // ---- 追加模式（2026-08-13 循环段补漏落表用,遗留通道）：只把差集条目追加进现存 json，
  //      既有条目原样保留。★BJ261：VER≠1457 拒（旧基线禁写真库）;与 --write-real 互斥。
  if (TREE !== 'Terarria1457') {
    console.error(`[extract-recipes] 拒绝 --append-loops：SW_TREE=${TREE}≠Terarria1457（旧基线禁写现库）。`);
    process.exit(1);
  }
  if (process.argv.includes('--write-real')) {
    console.error('[extract-recipes] 拒绝运行：--append-loops 与 --write-real 互斥（写盘通道必须唯一）。');
    process.exit(1);
  }
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
const FRESH = JSON.stringify(doc);
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const outIdx = process.argv.indexOf('--out');
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : null;
// ★g1 footgun：探测注入面（SW_RECIPES_JSON,读侧现库重定向）与 --write-real 混用拒
if (WRITE_REAL && process.env.SW_RECIPES_JSON !== undefined) {
  console.error('[extract-recipes] 拒绝运行：探测注入面（SW_RECIPES_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
if (OUT_PATH && WRITE_REAL) {
  console.error('[extract-recipes] 拒绝运行：--out 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 --out <path>；确认定谳后更新现库用 --write-real（且 SW_TREE=Terarria1457）。');
  process.exit(1);
}
if (WRITE_REAL && TREE !== 'Terarria1457') {
  console.error(`[extract-recipes] 拒绝写真库：SW_TREE=${TREE}≠Terarria1457（旧基线重放禁写现库）。`);
  process.exit(1);
}

/** 现库 vs 重产双向动态 diff（★G-1/S3 处方：live-only=洗库预警面,fresh-only=现库退化
 *  缺键型面,双向才算「重产盖住现库」）。组 gid 编号系自洽内部键（live 编号=1456 时代
 *  枚举+手并工件,源码序=权威）——配方 groups 与 groupItems 按组名归一后对拍。 */
function washOf(liveRaw) {
  let live;
  try { live = JSON.parse(liveRaw); } catch { return null; } // 坏损:不拦（让写盘流程自行报错）
  const wash = { liveOnly: [], freshOnly: [], groupsMissing: [], groupsExtra: [], groupItemsDrift: [], tileCountsDrift: [] };
  const lg = {}; for (const [k, v] of Object.entries(live.groups ?? {})) lg[v] = k;
  const fg = {}; for (const [k, v] of Object.entries(GROUP_ID)) fg[v] = k;
  for (const k of Object.keys(live.groups ?? {})) if (GROUP_ID[k] === undefined) wash.groupsMissing.push(k);
  for (const k of Object.keys(GROUP_ID)) if (live.groups?.[k] === undefined) wash.groupsExtra.push(k);
  const gi = (items, g) => JSON.stringify([...(items ?? [])].sort((a, b) => a - b));
  for (const [name, gid] of Object.entries(live.groups ?? {})) {
    const lItems = (live.groupItems ?? {})[String(gid)];
    const fGid = GROUP_ID[name];
    const fItems = fGid === undefined ? undefined : GROUP_ITEMS[fGid];
    if (fItems !== undefined && gi(lItems) !== gi(fItems)) wash.groupItemsDrift.push(name);
  }
  const ltc = live.tileCountsAs ?? {};
  for (const [k, v] of Object.entries(ltc)) if (TILE_COUNTS_AS[k] !== v) wash.tileCountsDrift.push(`${k}:${v}→${TILE_COUNTS_AS[k] ?? '缺'}`);
  const normS = (r, g) => {
    const o = {
      create: r.create, createStack: r.createStack ?? 1, tile: r.tile ?? -1,
      items: [...r.items].sort((a, b) => a.id - b.id),
      groups: (r.groups ?? []).map((x) => g[x] ?? `?${x}`).sort(),
    };
    for (const f of ['honey', 'water', 'lava', 'snow', 'graveyard', 'alchemy', 'notDecraftable', 'crimson', 'corruption', 'torchGod', 'mechdusa']) if (r[f] === true) o[f] = true;
    if (r.shimmer) o.shimmer = r.shimmer;
    return JSON.stringify(o);
  };
  const cnt = (arr, g) => { const m = new Map(); for (const r of arr) { const s = normS(r, g); m.set(s, (m.get(s) ?? 0) + 1); } return m; };
  const lc = cnt(live.recipes ?? [], lg);
  const fc = cnt(out, fg);
  for (const [s, n] of lc) { if (n > (fc.get(s) ?? 0)) wash.liveOnly.push(JSON.parse(s)); }
  for (const [s, n] of fc) { if (n > (lc.get(s) ?? 0)) wash.freshOnly.push(JSON.parse(s)); }
  return wash;
}
const washEmpty = (w) => !w || (w.liveOnly.length === 0 && w.freshOnly.length === 0 && w.groupsMissing.length === 0
  && w.groupsExtra.length === 0 && w.groupItemsDrift.length === 0 && w.tileCountsDrift.length === 0);
function washReport(w) {
  console.error('  物证：');
  if (w.liveOnly.length) console.error(`    [live-only] 现库独有条目（重产缺=提取器退化/洗库面）${w.liveOnly.length} 条: ${w.liveOnly.slice(0, 3).map((r) => JSON.stringify(r)).join(' | ')}`);
  if (w.freshOnly.length) console.error(`    [fresh-only] 重产独有条目（现库缺=源侧新增/现库退化）${w.freshOnly.length} 条: ${w.freshOnly.slice(0, 3).map((r) => JSON.stringify(r)).join(' | ')}`);
  if (w.groupsMissing.length) console.error(`    组现库独有: ${w.groupsMissing.join(', ')}`);
  if (w.groupsExtra.length) console.error(`    组重产独有: ${w.groupsExtra.join(', ')}`);
  if (w.groupItemsDrift.length) console.error(`    groupItems 值漂移: ${w.groupItemsDrift.join(', ')}`);
  if (w.tileCountsDrift.length) console.error(`    tileCountsAs 漂移: ${w.tileCountsDrift.join(', ')}`);
}
const liveRaw = existsSync(process.env.SW_RECIPES_JSON ?? JSON_PATH) ? readFileSync(process.env.SW_RECIPES_JSON ?? JSON_PATH, 'utf8') : null;
const wash = liveRaw === null ? null : washOf(liveRaw);
if (WRITE_REAL) {
  if (wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-recipes] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）；事后必须全绿消费面测试。');
    process.exit(1);
  }
  if (wash && !washEmpty(wash)) console.error('[extract-recipes] 双旗强推：静默覆盖预警已确认（责任在操作者定谳）。');
  writeFileSync(JSON_PATH, FRESH);
  console.error(`[extract-recipes] 已写 ${JSON_PATH}（--write-real 真库）`);
} else if (OUT_PATH) {
  writeFileSync(OUT_PATH, FRESH);
  console.error(`[extract-recipes] 已写 ${OUT_PATH}（--out 沙箱）`);
} else {
  // 缺省干跑对拍（零写盘）
  if (wash === null) {
    console.error('[extract-recipes] 干跑（零写盘）：现库缺 vanilla-recipes.json,跳过对拍。写盘须显式 --out <path> 或 --write-real。');
  } else if (!washEmpty(wash)) {
    console.error('[extract-recipes] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
    washReport(wash);
    console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 --out <path>。');
    process.exit(1);
  } else {
    console.error('[extract-recipes] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 --out <path> 或 --write-real。');
  }
}
console.error(`[${TREE}] 配方 ${out.length} 条 / 组 ${Object.keys(GROUP_ID).length} / 站点继承 ${Object.keys(TILE_COUNTS_AS).length}${wash ? ` / live-only ${wash.liveOnly.length} / fresh-only ${wash.freshOnly.length}` : ''}`);
console.error('样例:', JSON.stringify(out[0]), JSON.stringify(out[1] ?? null));
