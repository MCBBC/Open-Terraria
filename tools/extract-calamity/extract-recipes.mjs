#!/usr/bin/env node
// 灾厄全量移植 B2:recipes 机械提取器。
// 源=CalamityModPublic/Items/**(AddRecipes 内 CreateRecipe 链);
// 目标=game/mods/calamity/content/recipes.json(ModRecipeContent 数组,与手批 4 条合并——
// 手批 create 键=权威,同 create 的提取条跳过)。
// ★保守策略:引用 mod tile(B5 未声明)/配方组(AddRecipeGroup)/未识别 Condition 的
// 配方整条跳过并计数(缺条件=提前可合成,宁可少不可错)。
// 用法:node tools/extract-calamity/extract-recipes.mjs [--write]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'CalamityModPublic');
const OUT = join(ROOT, 'game', 'mods', 'calamity');
const WRITE = process.argv.includes('--write');

// ---------- 枚举 ----------
const TILE_IDS = {};
{
  const text = readFileSync(join(ROOT, 'Terarria1457', 'Terraria.ID', 'TileID.cs'), 'utf8');
  for (const m of text.matchAll(/public const (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+)/g)) {
    if (TILE_IDS[m[1]] === undefined) TILE_IDS[m[1]] = Number(m[2]);
  }
}
const ITEM_IDS = {};
{
  const text = readFileSync(join(ROOT, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8');
  for (const m of text.matchAll(/public const (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+)/g)) {
    if (ITEM_IDS[m[1]] === undefined) ITEM_IDS[m[1]] = Number(m[2]);
  }
}

const pascalToSnake = (s) => s
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/\s+/g, '')
  .toLowerCase();

function walkFiles(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

/** 花括号配平截取方法体 */
function extractMethodBody(text, signature) {
  const idx = text.indexOf(signature);
  if (idx < 0) return null;
  const open = text.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}

// 手批权威 create 键(.curated-items.json 与 curated recipes 的交集=4 件)
// 手批权威=.curated-recipes.json 固定 4 键(不再以整个 recipes.json 为"curated"——
// 上次输出混入 curated 集会让增量刷新失效)
// ★三百零一:mod 配方组提取(RecipeSystem.cs RegisterGroup 36 组;AnyFood=
// GetFoodItems() 函数形跳)→ recipe-groups.json(名称排序=引擎注册同序确定假 id)
const MOD_RECIPE_GROUPS_SRC = join(ROOT, 'CalamityModPublic', 'Systems', 'Mechanic', 'RecipeSystem.cs');
const MOD_GROUP_NAMES = [];
const MOD_GROUP_ITEMS = new Map();
{
  const rtext = readFileSync(MOD_RECIPE_GROUPS_SRC, 'utf8');
  for (const m of rtext.matchAll(/(\w+)\s*=\s*RecipeGroup\.RegisterGroup\("(\w+)",\s*group\)/g)) {
    const gname = m[2];
    // 组条目=RegisterGroup 调用前最近的 new int[] {...}(group 复用赋值模式)
    const before = rtext.slice(0, m.index);
    const arrAt = before.lastIndexOf('new int[]');
    if (arrAt < 0) continue;
    const open = rtext.indexOf('{', arrAt);
    const close = rtext.indexOf('}', open);
    if (open < 0 || close < 0) continue;
    const body2 = rtext.slice(open + 1, close);
    const items = [];
    for (const im of body2.matchAll(/ItemID\.([A-Za-z0-9_]+)/g)) {
      const vid = ITEM_IDS[im[1]];
      if (vid !== undefined) items.push(vid);
    }
    for (const im of body2.matchAll(/ModContent\.ItemType<([A-Za-z0-9_.]+)>\(\)/g)) {
      const k = pascalToSnake(im[1].split('.').pop());
      if (diskItemKeys.has(k)) items.push(k);   // mod item 键(string;引擎侧解析)
    }
    if (items.length) { MOD_GROUP_NAMES.push(gname); MOD_GROUP_ITEMS.set(gname, items); }
  }
  MOD_GROUP_NAMES.sort();
  const sorted = MOD_GROUP_NAMES.map((n) => ({ name: n, items: MOD_GROUP_ITEMS.get(n) }));
  writeFileSync(join(OUT, 'recipe-groups.json'), JSON.stringify(sorted, null, 2) + '\n');
}
const MOD_GROUP_FAKE = new Map(MOD_GROUP_NAMES.map((n, i) => [n, 1010000 + i]));
// vanilla 组名→假 id(vanilla doc groups)
const VANILLA_GROUP_FAKE = new Map(Object.entries(JSON.parse(readFileSync(join(OUT, '..', '..', 'src', 'data', 'vanilla-recipes.json'), 'utf8')).groups ?? {}).map(([n, g]) => [n, 1000000 + g]));

const CURATED_MANIFEST = new Set(JSON.parse(readFileSync(join(OUT, '.curated-recipes.json'), 'utf8')));
const CURATED_RECIPES = JSON.parse(readFileSync(join(OUT, 'content', 'recipes.json'), 'utf8')).filter((r) => CURATED_MANIFEST.has(r.create));
const curatedCreates = CURATED_MANIFEST;

// 键别名解析:提取键(类名 snake)盘面缺失时尝试 curated 手批键(去下划线归一;
// 实证 ShieldoftheOcean→shieldofthe_ocean ≠ 手批 shield_of_the_ocean)
const diskItemKeys = new Set(readdirSync(join(OUT, 'content', 'items')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
const curatedItemKeys = JSON.parse(readFileSync(join(OUT, '.curated-items.json'), 'utf8'));
const normToCurated = new Map(curatedItemKeys.map((k) => [k.replace(/_/g, ''), k]));
function resolveItemKey(key) {
  if (diskItemKeys.has(key)) return key;
  const alias = normToCurated.get(key.replace(/_/g, ''));
  return alias ?? null;
}
const missingIngredients = new Set();
const diskTileKeys = new Set(readdirSync(join(OUT, 'content', 'tiles')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));

// ---------- 链解析 ----------
function parseChain(chain) {
  // ★泛型修正(B5 实证):`AddIngredient<X>(8)`/`AddTile<CosmicAnvil>()` 泛型形
  //  此前静默漏捕 → AddTile 类=无站点错误数据落盘。扫描器支持 Name<T>(args) 两形。
  const calls = [];
  const re = /\.?([A-Z][A-Za-z0-9]*)(?:<([A-Za-z0-9_.]+)>)?\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let m;
  while ((m = re.exec(chain)) !== null) calls.push({ name: m[1], gen: m[2], args: m[3] ?? '' });
  return calls;
}

const stats = { files: 0, chains: 0, emitted: 0, skippedCurated: 0, skipModTile: 0, skipGroup: 0, skipCondition: 0, skipUnresolved: 0, skipNoCreate: 0 };
const skipSamples = new Map();
function noteSkip(tag) { skipSamples.set(tag, (skipSamples.get(tag) ?? 0) + 1); }
const recipes = [];
const itemCs = walkFiles(join(SRC, 'Items'), '.cs');
for (const f of itemCs) {
  const text = readFileSync(f, 'utf8');
  const body = extractMethodBody(text, 'public override void AddRecipes()');
  if (body === null) continue;
  stats.files++;
  // 按 CreateRecipe( 切链(每条链到 .Register() 为止)
  const parts = body.split(/(?=CreateRecipe)/);
  for (const part of parts) {
    const chainM = part.match(/^CreateRecipe\s*\(([^)]*)\)([\s\S]*?)Register\(\s*\)/);
    if (!chainM) continue;
    stats.chains++;
    const createStackNum = chainM[1].trim() === '' ? 1 : Number(chainM[1].trim());
    const calls = parseChain(chainM[2]);
    const items = []; const vanillaItems = [];
    let tile; let skip = null;
    let liquid = {};
    for (const c of calls) {
      if (skip) break;
      if (c.name === 'AddIngredient' || c.name === 'AddIngredient2') {
        const arg = c.gen ? `<${c.gen}>(${c.args.trim()})` : c.args.trim();
        // 合并形 `<X>(n)`/`<X>()`(方法泛参+值参同括号)+ 旧分形兜底
        const gen = arg.match(/^<([A-Za-z0-9_.]+)>\(\)\s*,\s*(\d+)$/);
        const genOnly = arg.match(/^<([A-Za-z0-9_.]+)>\(\)$|^<([A-Za-z0-9_.]+)>\((\d+)\)$/);
        const genN = arg.match(/^<([A-Za-z0-9_.]+)>\((\d+)\)$|^<([A-Za-z0-9_.]+)>\(\)\s*,\s*(\d+)/);
        const vidN = arg.match(/^ItemID\.([A-Za-z0-9_]+)\s*,\s*(\d+)\s*$/);
        const vidOnly = arg.match(/^ItemID\.([A-Za-z0-9_]+)\s*$/);
        const modGen = arg.match(/^(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*,\s*(\d+)$/);
        const modGenOnly = arg.match(/^(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)$/);
        const pushItem = (rawKey, stack) => {
          const rk = resolveItemKey(rawKey);
          if (rk === null) { missingIngredients.add(rawKey); skip = 'ingredient:' + rawKey; return; }
          items.push({ item: rk, stack });
        };
        // genN 命中两类形(组2=值参形 组1/组3=分形);genOnly 组1=无参形
        if (genN) {
          const cls = genN[1] ?? genN[3] ?? '';
          const n = Number(genN[2] ?? genN[4] ?? 1);
          pushItem(pascalToSnake(cls.split('.').pop()), n);
        } else if (genOnly) {
          const cls = genOnly[1] ?? genOnly[2] ?? '';
          pushItem(pascalToSnake(cls.split('.').pop()), Number(genOnly[3] ?? 1));
        }
        else if (modGen) pushItem(pascalToSnake(modGen[1].split('.').pop()), Number(modGen[2]));
        else if (modGenOnly) pushItem(pascalToSnake(modGenOnly[1].split('.').pop()), 1);
        else if (vidN) vanillaItems.push({ id: ITEM_IDS[vidN[1]], stack: Number(vidN[2]) });
        else if (vidOnly) vanillaItems.push({ id: ITEM_IDS[vidOnly[1]], stack: 1 });
        else { skip = 'ingredient:' + arg.slice(0, 40); noteSkip(skip); }
      } else if (c.name === 'AddTile') {
        const arg = (c.gen ? `<${c.gen}>` : '') + c.args.trim();
        const gen = arg.match(/^(?:ModContent\.TileType<)?([A-Za-z0-9_.]+)>?\(\)?$/);
        if (/^TileID\./.test(arg)) {
          const name = arg.replace('TileID.', '').trim();
          if (TILE_IDS[name] === undefined) skip = 'tile:' + name;
          else tile = TILE_IDS[name];
        } else if (c.gen || /TileType|^[A-Z]/.test(arg)) {
          // ★B5b:mod 站点=泛型类名 → mod tile 键;已落盘(content/tiles/)即接线
          const tileCls = c.gen ?? arg.replace(/^(?:ModContent\.TileType<)?([A-Za-z0-9_.]+)>?\(\)?$/, '$1');
          const tkey = pascalToSnake(String(tileCls).split('.').pop());
          if (diskTileKeys.has(tkey)) tile = `mod_calamity_${tkey}`;
          else skip = 'modTile';   // 未落盘站点家具=B5b 余段(保守跳过)
        } else skip = 'tile:' + arg.slice(0, 40);
      } else if (c.name === 'AddCondition') {
        if (/InWater/.test(c.args)) liquid.water = true;
        else if (/InHoney/.test(c.args)) liquid.honey = true;
        else if (/InLava/.test(c.args)) liquid.lava = true;
        else skip = 'condition';
      } else if (c.name === 'AddRecipeGroup') {
        // ★三百零一:组槽落地——名字串(vanilla 组/Calamity 组)或组字段引用
        const gm = c.args.match(/^\s*"?([A-Za-z0-9_]+)"?\s*(?:,\s*(\d+)\s*)?\)?\s*$/);
        if (gm) {
          const gname = gm[1];
          const stack = Number(gm[2] ?? 1);
          const fid = VANILLA_GROUP_FAKE.get(gname) ?? MOD_GROUP_FAKE.get(gname);
          if (fid !== undefined) vanillaItems.push({ id: fid, stack });
          else { skip = 'group'; }
        } else skip = 'group';
      } else if (c.name === 'Register' || c.name === 'CreateRecipe') {
        // 已处理
      } else if (c.name === 'DisableDecraft' || c.name === 'AddDecraftCondition') {
        // 我方 mod 配方恒 notDecraftable(P0 强制)——无操作
      } else if (c.name === 'SortBeforeFirstRecipesOf' || c.name === 'SortAfterFirstRecipesOf') {
        // 合成列表排序提示——复刻域无此消费面,无操作
      } else {
        // 其它链调用(如 SetResult?AddOnDrop?)——未识别保守跳过
        skip = 'call:' + c.name;
      }
    }
    if (skip === 'modTile' && tile === undefined) { stats.skipModTile++; noteSkip('modTile'); continue; }
    if (skip === 'modTile') skip = null;   // tile 已接线(仅 modTile 一个 skip 原因时放行)
    if (skip === 'group') { stats.skipGroup++; noteSkip('group'); continue; }
    if (skip === 'condition') { stats.skipCondition++; noteSkip('condition'); continue; }
    if (skip) { stats.skipUnresolved++; noteSkip(skip); continue; }
    // create 键 = 文件类名(本 AddRecipes 属该物品)
    const createRaw = pascalToSnake(basename(f, '.cs').trim());
    const createKey = resolveItemKey(createRaw) ?? createRaw;
    if (curatedCreates.has(createKey) || curatedCreates.has(createRaw)) { stats.skippedCurated++; continue; }
    if (!createKey) { stats.skipNoCreate++; continue; }
    const rec = { create: createKey };
    if (Number.isFinite(createStackNum) && createStackNum !== 1) rec.createStack = createStackNum;
    if (tile !== undefined) rec.tile = tile;
    if (items.length) rec.items = items;
    if (vanillaItems.length) rec.vanillaItems = vanillaItems;
    if (liquid.water) rec.water = true;
    if (liquid.honey) rec.honey = true;
    if (liquid.lava) rec.lava = true;
    if (!items.length && !vanillaItems.length) { stats.skipUnresolved++; continue; }
    recipes.push(rec);
    stats.emitted++;
  }
}

console.log(JSON.stringify({
  ...stats,
  extracted: recipes.length,
  curated: CURATED_RECIPES.length,
  topSkips: Object.fromEntries([...skipSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
}, null, 2));
if (WRITE) {
  writeFileSync(join(OUT, 'content', 'recipes.json'), JSON.stringify([...CURATED_RECIPES, ...recipes], null, 2) + '\n');
  console.log(`[write] recipes.json = ${CURATED_RECIPES.length} curated + ${recipes.length} extracted`);
}
