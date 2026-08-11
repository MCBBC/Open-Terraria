// 从 Terarria1456 Recipe.cs SetupRecipes 提取全量配方（2732 条）→ src/data/vanilla-recipes.json。
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
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Recipe.cs`, 'utf8');

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
  }
}

const out = [];

/** 解析 SetupRecipes 主体（线性段） */
function parseLinear(body) {
  const lines = body.split('\n');
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
    } else if (/^Add\w+Furniture|^AddCritterStatueRecipe|^AddAetheriumFurniture|^AddFallenStarFurniture|^AddFeywoodFurniture/.test(l)) {
      // 生成器调用：逐个解析（生成器内也是 currentRecipe 序列，末尾自带 AddRecipe）
      const name = l.match(/^(Add\w+)\(/)[1];
      const gen = methodBody(`void ${name}(`) || methodBody(`private void ${name}(`) || methodBody(`public void ${name}(`);
      if (gen) parseLinear(gen);
    }
  }
  flush();
}

const main = methodBody('public static void SetupRecipes()');
parseLinear(main);

// ---- 反向配方（CreateReversePlatformRecipes :16589 / CreateReverseWallRecipes :16613）----
// 条件：单材料配方（items[1] 不存在）且 成品是平台（createTile∈Platforms）或墙（createWall>0）
//      且材料本身不是墙（墙反做时不重复反转）。产物 = 材料作成品、原成品作材料、站点同原配方。
// createTile/createWall 需 ItemID → Item.cs SetDefaults 的 createTile/createWall 字段：
// 从 itemcombat json 无此字段——直接从 Item.cs 提取（正则取 `createTile = N;`/`createWall = N;`）

// Item.cs createTile/createWall 扫描（SetDefaults1..5 分段 switch 内）
const itemSrc = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');
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
  const mainSrc = readFileSync(`${ROOT}/Terarria1456/Terraria/Main.cs`, 'utf8');
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
  });
}
out.push(...reverseOut);

const doc = {
  count: out.length,
  groups: GROUP_ID,
  groupItems: GROUP_ITEMS,
  tileCountsAs: TILE_COUNTS_AS,
  recipes: out,
};
writeFileSync(`${ROOT}/game/src/data/vanilla-recipes.json`, JSON.stringify(doc));
console.error(`配方 ${out.length} 条 / 组 ${Object.keys(GROUP_ID).length} / 站点继承 ${Object.keys(TILE_COUNTS_AS).length}`);
console.error('样例:', JSON.stringify(out[0]), JSON.stringify(out[1] ?? null));
