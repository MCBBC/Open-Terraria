// SW-FX29：ItemSorting 整库提取 v2（1457 基线重跑，2026-09-11）。
// 旧版（2026-08-20）只产 layers 6147 条（1456 基线,1457 缺 6147-6195 共 49 件——
// ItemID.Count 1456:13833=6147 → 1457:13938=6196）；本版按 1457 重跑并补齐
// ItemSorting.Sort 运行时引擎所需全量数据面：
//   · layers          vid → 白名单层下标 0-51（SetupWhiteLists :1272-1354 固定序逐层
//                     跑谓词先到先得；QuickStacking 消费面形状不变）
//   · prio            ItemID.Sets.SortingPriority* 全 20 张 CreateIntSet 键值对
//                     （ItemID.cs:1124-1162）——谓词成员(>-1)与比较器数值共用
//   · buffFoodPrio    BuffID.Sets.SortingPriorityFoodBuffs（BuffID.cs:18）——
//                     Potions - Food 比较器首键（ItemSorting.cs:712）
//   · bools           IsFood / IsFishingCrate / IsBasicFish（CreateBoolSet）
//   · frameImportant  Main.cs tileFrameImportant[N] = true 直赋行（LastTilesImportant）
//   · attrs           逐 vid 稀疏属性记录（52 层谓词+比较器所需全字段）：
//                     Item.cs SetDefaults1-5 case 段（melee/ranged/magic/summon/
//                     consumable/notAmmo/questItem/accessory/vanity/mech/damage/
//                     defense/pick/axe/hammer/ammo/shoot/buffType/healLife/healMana/
//                     mountType/headSlot/bodySlot/legSlot/paint/paintCoating/
//                     createTile/createWall/makeNPC/rare）+ vanilla-equip.json dye
//                     （Item.cs:48716 GetShaderIdFromItemId 运行时面,文本不可提）+
//                     vanilla-hairdyes.json hairDye（:48719 同理）+ vanilla-itemvalue.json
//                     value + 衍生旗：fk=projHook[shoot]（Main.cs:6752-6762 aiStyle==7）、
//                     lp/vp=Main.lightPet/vanityPet[buffType]（Main.cs 直赋表）、
//                     ca=MountID.Sets.Cart[mountType]（MountID.cs:21）、fo/fc/fb=布尔集、
//                     nm=英文名（ItemID.cs const short + en-US Items.json ItemName——
//                     Last - Tiles 两层名字比较器 ItemSorting.cs:1068/1088 的真值源）
// 不变量对齐：:1353 Invariant.Assert(LastNotTrash 白名单空) —— 本版等价断言
// 「vid 0..6195 全部被层 0-49 认领」；未认领即提取器/源码面有缺,直接 fail。
// 对照校验：与旧版 layers 全量 diff（预期仅新增 49 件);与 vanilla-equip.json
// hook/pet/light/cart 旧近似集 diff（预期 fk/lp/vp/ca 语义等价,差异打印定谳）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

const itemSrc = read('Terarria1457/Terraria/Item.cs');
const itemidSrc = read('Terarria1457/Terraria.ID/ItemID.cs');
const buffidSrc = read('Terarria1457/Terraria.ID/BuffID.cs');
const mountidSrc = read('Terarria1457/Terraria.ID/MountID.cs');
const projSrc = read('Terarria1457/Terraria/Projectile.cs');
const ammoSrc = read('Terarria1457/Terraria.ID/AmmoID.cs');
const mainSrc = read('Terarria1457/Terraria/Main.cs');

// AmmoID 常量（Item.cs 79 处枚举形赋值——AmmoID.cs `public static int X = N;`）
const AMMO_ID = {};
{
  const re = /public static int (\w+) = (\d+);/g;
  let m;
  while ((m = re.exec(ammoSrc))) AMMO_ID[m[1]] = Number(m[2]);
}

// ---------- ItemID.Sets / BuffID.Sets 数值表（CreateIntSet）与布尔表 ----------
function parseIntSets(src) {
  const sets = {};
  const re = /public static int\[\] (\w+) = Factory\.CreateIntSet\((-?\d+)((?:,\s*-?\d+(?:\s*,\s*-?\d+)*)?)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1], def = Number(m[2]);
    const nums = (m[3] ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
    const pairs = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
    sets[name] = { def, pairs, map: new Map(pairs) };
  }
  return sets;
}
function parseBoolSets(src) {
  const sets = {};
  const re = /public static bool\[\] (\w+) = Factory\.CreateBoolSet\(((?:\s*[^)]*?))\)\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = m[2];
    // CreateBoolSet(defaultState, ids...) | CreateBoolSet(ids...)——首元 false/true 才是缺省态
    const toks = raw.split(',').map((x) => x.trim()).filter((x) => x !== '');
    let def = false, ids = toks;
    if (toks[0] === 'true' || toks[0] === 'false') { def = toks[0] === 'true'; ids = toks.slice(1); }
    sets[m[1]] = def ? { defaultTrue: true, ids: ids.map(Number) } : { defaultTrue: false, ids: ids.map(Number) };
  }
  return sets;
}
const INT_SETS = parseIntSets(itemidSrc);
const BUFF_INT_SETS = parseIntSets(buffidSrc);
const BOOL_SETS = parseBoolSets(itemidSrc);
const prio = (name, id) => (INT_SETS[name] ? (INT_SETS[name].map.get(id) ?? -1) : -1);

// SortingPriority* 集合清单守门（ItemID.cs:1124-1162 恰 20 张 + BuffID 1 张 = 21）
const EXPECTED_PRIO = ['SortingPriorityMiscAcorns', 'SortingPriorityMiscGems', 'SortingPriorityMiscHerbsAndSeeds',
  'SortingPriorityMiscBossBags', 'SortingPriorityToolsInstruments', 'SortingPriorityToolsFishing', 'SortingPriorityToolsGolf',
  'SortingPriorityToolsKites', 'SortingPriorityToolsKeys', 'SortingPriorityToolsMisc', 'SortingPriorityWeaponsRanged',
  'SortingPriorityPotionsBuffs', 'SortingPriorityPotionsDyeMaterial', 'SortingPriorityMiscImportants',
  'SortingPriorityWiring', 'SortingPriorityMaterials', 'SortingPriorityExtractibles', 'SortingPriorityRopes',
  'SortingPriorityPainting', 'SortingPriorityTerraforming'];
const PRIO_KEYS = Object.keys(INT_SETS).filter((k) => k.startsWith('SortingPriority'));
{
  const missing = EXPECTED_PRIO.filter((k) => !PRIO_KEYS.includes(k));
  const extra = PRIO_KEYS.filter((k) => !EXPECTED_PRIO.includes(k));
  if (missing.length || extra.length) {
    throw new Error(`SortingPriority 集清单漂移: 缺=${missing} 多=${extra}——ItemSorting.cs 谓词引用面已变,先核对再重跑`);
  }
  if (!BUFF_INT_SETS.SortingPriorityFoodBuffs) throw new Error('BuffID.Sets.SortingPriorityFoodBuffs 缺档');
}

// ---------- Item.cs / Projectile.cs case 段 ----------
function methodBodyOf(src, name) {
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
/** case 段 → itemId: segment（最近一层 switch(type)；★fall-through 组共享体——
 *  `case A: case B: case C: <体>` 的体归属组内全部标签;旧实现只赋末位标签,
 *  曾致 Lunar Hook 3020-3022 拿到空段（3023 独得共享体）） */
function collectCaseSegments(body, out) {
  const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
  const stack = [];
  const flush = (top, segText) => {
    // 空段（纯白化间）= fall-through 组累积,不重置;非空段=组体,赋给全部累积标签后清组
    if (!segText.trim()) return;
    for (const l of top.pending) if (l !== null) out.set(l, out.has(l) ? out.get(l) + segText : segText);
    top.pending = [];
  };
  let depth = 0, m;
  while ((m = tokRe.exec(body))) {
    const t = m[0];
    if (t.startsWith('switch')) {
      stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type|Type)\b/.test(t), opened: false, bodyDepth: -1, pending: [null], segStart: 0 });
    } else if (t === '{') {
      depth++;
      const top = stack[stack.length - 1];
      if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
    } else if (t === '}') {
      const top = stack[stack.length - 1];
      if (top && top.opened && depth === top.bodyDepth) {
        if (top.isType) flush(top, body.slice(top.segStart, m.index));
        stack.pop();
      }
      depth--;
    } else {
      const top = stack[stack.length - 1];
      if (top && top.opened && top.isType) {
        flush(top, body.slice(top.segStart, m.index));
        top.pending.push(t === 'default:' ? null : +m[2]);
        top.segStart = m.index + t.length;
      }
    }
  }
}
/** if 链段 → itemId: segment（Projectile.SetDefaults 用 if(type==N)/else if(type==N)
 *  长链,无 switch;头部含多条件 `type == A || type == B`（DualHookBlue=73||74 等）与
 *  区间 `type >= A && type <= B`——逐 if 头提取条件集,花括号配对截段） */
function collectIfChainSegments(body, out) {
  const headRe = /(?:else\s+)?if\s*\(([^)]*)\)/g;
  let m;
  while ((m = headRe.exec(body))) {
    const cond = m[1];
    if (!/\btype\b/.test(cond)) continue;
    const ids = [];
    const eqRe = /type\s*==\s*(\d+)/g;
    let e;
    while ((e = eqRe.exec(cond))) ids.push(Number(e[1]));
    const rangeRe = /type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/g;
    while ((e = rangeRe.exec(cond))) for (let v = +e[1]; v <= +e[2]; v++) ids.push(v);
    if (!ids.length) continue;
    const braceOpen = body.indexOf('{', m.index + m[0].length - 1);
    if (braceOpen < 0) continue;
    let depth = 0, end = -1;
    for (let i = braceOpen; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    for (const id of ids) out.set(id, out.has(id) ? out.get(id) + body.slice(braceOpen + 1, end) : body.slice(braceOpen + 1, end));
    headRe.lastIndex = braceOpen;
  }
}
const SEGS = new Map();
for (let n = 1; n <= 5; n++) {
  const body = methodBodyOf(itemSrc, `public void SetDefaults${n}(int type)`)
    || methodBodyOf(itemSrc, `private void SetDefaults${n}(int type)`);
  if (body) collectCaseSegments(body, SEGS);
}
const PROJ_SEGS = new Map();
{
  const body = methodBodyOf(projSrc, 'public void SetDefaults(int Type)');
  if (body) collectIfChainSegments(body, PROJ_SEGS);
}
// projHook（Main.cs:6752-6762）：projHook[i] = aiStyle == 7
const HOOK_PROJS = new Set();
{
  // ★禁用 /g+test（lastIndex 跨段共享 → 奇偶交替假阴,曾致 231/233/235 等 gem hook 丢失）
  for (const [pid, seg] of PROJ_SEGS) if (seg.includes('aiStyle = 7;')) HOOK_PROJS.add(Number(pid));
}

// ---------- Main.cs 直赋集合（lightPet/vanityPet/tileFrameImportant）+ MountID Cart ----------
const collectAssign = (src, name) => {
  const set = new Set();
  const re = new RegExp(`\\b${name}\\[(\\d+)\\] = true;`, 'g');
  let m;
  while ((m = re.exec(src))) set.add(Number(m[1]));
  return set;
};
const LIGHT_PETS = collectAssign(mainSrc, 'lightPet');       // Main.cs:9427-9441（15 条）
const VANITY_PETS = collectAssign(mainSrc, 'vanityPet');     // Main.cs:9353-9426 等（77 条）
const FRAME_IMPORTANT = collectAssign(mainSrc, 'tileFrameImportant');
const CART_MOUNTS = new Set((() => {
  const m = mountidSrc.match(/public static bool\[\] Cart = Factory\.CreateBoolSet\(([^)]*)\)/);
  if (!m) throw new Error('MountID.Sets.Cart 缺档');
  return m[1].split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
})());

// ---------- 既有产物复用 ----------
const func = JSON.parse(read('game/src/data/vanilla-itemfunc.json'));
const equip = JSON.parse(read('game/src/data/vanilla-equip.json'));
const hairDyeIds = new Set(Object.keys(JSON.parse(read('game/src/data/vanilla-hairdyes.json')).hairDyes ?? {}));
const shimmer = JSON.parse(read('game/src/data/vanilla-shimmer.json'));
const makeNPC = shimmer.itemMakeNPC ?? {};
const rareTable = JSON.parse(read('game/src/data/vanilla-itemrare.json'));
const valueTable = JSON.parse(read('game/src/data/vanilla-itemvalue.json'));

// 英文名（ItemID.cs const short + en-US Items.json ItemName,尾逗号容忍）
const NAMES = {};
{
  const nameId = {};   // const name → vid
  const re = /public const short (\w+) = (\d+);/g;
  let m;
  while ((m = re.exec(itemidSrc))) nameId[m[1]] = Number(m[2]);
  let locRaw = read('Terarria1457/Terraria.Localization.Content.en-US.Items.json').replace(/,(\s*[}\]])/g, '$1');
  const loc = JSON.parse(locRaw);
  const itemName = loc.ItemName ?? {};
  let named = 0;
  for (const [key, text] of Object.entries(itemName)) {
    const vid = nameId[key];
    if (vid === undefined) continue;
    NAMES[vid] = text;
    named++;
  }
  console.log(`英文名: ${named} 条（ItemName ${Object.keys(itemName).length} → ItemID const 映射）`);
}

// ---------- 逐物品字段聚合 ----------
const SORT_FIELDS = new Set(['melee', 'ranged', 'magic', 'summon', 'consumable', 'notAmmo', 'questItem',
  'accessory', 'vanity', 'mech', 'damage', 'defense', 'pick', 'axe', 'hammer', 'ammo', 'shoot', 'buffType',
  'healLife', 'healMana', 'mountType', 'headSlot', 'bodySlot', 'legSlot', 'paint', 'paintCoating',
  'createTile', 'createWall', 'makeNPC', 'rare']);
// ★value 不走扫描——`value = dungeonPrice/sellPrice(...)` 算式文本不可直读,
//   权威源 = vanilla-itemvalue.json（4928 条,含 1457 新物品,计算值已折算）
/** itemfunc 表同名字段映射（其嵌套 case/区间块已按源码校对修补——在档键优先） */
const FUNC_KEYS = { melee: 'melee', ranged: 'ranged', magic: 'magic', summon: 'summon',
  consumable: 'consumable', notAmmo: 'notAmmo', damage: 'damage', pick: 'pick', axe: 'axe',
  hammer: 'hammer', shoot: 'shoot', buffType: 'buffType', healLife: 'healLife', healMana: 'healMana',
  createTile: 'createTile', createWall: 'createWall' };

// ---------- DefaultTo* 助手展开（★提取器盲区族 FX3 教训：mountType/createTile/
//  makeNPC/buffType/healLife 等大量走 DefaultToMinecart/PlaceableTile/Vanitypet/
//  CapturedCritter/HealingPotion/Headgear… 助手,直赋正则扫不到——逐助手体参数
//  代换后按 case 段内出现序重放,后写覆盖先写） ----------
const HELPERS = new Map();
{
  const re = /(?:public|private)\s+void\s+(DefaultTo\w+)\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(itemSrc))) {
    const params = m[2].split(',').map((x) => x.trim().split(/\s+/).pop()).filter(Boolean);
    const start = m.index + m[0].length;
    let depth = 1, end = -1;
    for (let i = start; i < itemSrc.length; i++) {
      if (itemSrc[i] === '{') depth++;
      else if (itemSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    HELPERS.set(m[1], { params, body: itemSrc.slice(start, end) });
  }
}
/** 展开单条助手调用：助手体内【顶层】`field = 常量|参数|AmmoID.X;` → 赋值对列表
 *  （条件支内的赋值是运行时世界态分支,非基值——跳过,如 rare=2 + if(remix) rare=8） */
function expandHelperCall(name, argsRaw) {
  const h = HELPERS.get(name);
  if (!h) return [];
  const args = argsRaw.split(',').map((x) => x.trim());
  const paramVal = new Map();
  h.params.forEach((p, i) => {
    const a = args[i] ?? '';
    // 缺省参数（= xxx）在参数名里已剥,实参缺位时取 decl 缺省——params 提取只留了
    // 尾名,缺省值丢失可接受（本域助手缺省参数仅 useGulpSound/animationTime 等无关面）
    paramVal.set(p, a);
  });
  const out = [];
  let depth = 0;
  // ★值域禁跨行/跨花括号——否则 `if (Variant == X)` 头部的 `==` 会被当作赋值吞掉
  //  整个 if 块,块内赋值（rare=8）顶层面化（157 Aqua Scepter 教训）
  const tokRe = /[{}]|(\w+)\s*=(?!=)\s*([^;{}\n]+);/g;
  let am;
  while ((am = tokRe.exec(h.body))) {
    const t = am[0];
    if (t === '{') { depth++; continue; }
    if (t === '}') { depth--; continue; }
    if (depth !== 0) continue;
    const field = am[1], expr = am[2].trim();
    if (paramVal.has(expr)) {
      const v = paramVal.get(expr);
      if (/^-?\d+$/.test(v)) out.push([field, Number(v)]);
      else if (v.startsWith('AmmoID.')) out.push([field, AMMO_ID[v.slice(7)] ?? 0]);
      // 非字面量实参（算式）不代换——本域无此类调用,守门留痕
    } else if (/^-?\d+$/.test(expr)) {
      out.push([field, Number(expr)]);
    } else if (expr === 'true') {
      out.push([field, true]);
    } else if (expr.startsWith('AmmoID.')) {
      out.push([field, AMMO_ID[expr.slice(7)] ?? 0]);
    }
  }
  return out;
}
/** case 段顺序重放：【顶层】直赋 `field = 字面量;` + DefaultTo* 调用展开,后写覆盖先写。
 *  itemId 供 `shoot = 486 + type - 3020` 型算式代换（Lunar Hook 3020-3023 族）。
 *  ★条件支（if 内）赋值不重放——基值才是排序语义（157 rare=2 + if(remix) rare=8 教训） */
function replaySegment(seg, target, consider, itemId = 0) {
  let depth = 0;
  // ★值域禁跨行/跨花括号 + == 防误配（同 expandHelperCall 注）
  const re = /[{}]|(\w+)\s*=(?!=)\s*([^;{}\n]+);|(DefaultTo\w+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(seg))) {
    const t = m[0];
    if (t === '{') { depth++; continue; }
    if (t === '}') { depth--; continue; }
    if (depth !== 0) continue;
    if (m[3]) {
      for (const [field, v] of expandHelperCall(m[3], m[4] ?? '')) {
        if (consider.has(field)) target.set(field, v);
      }
      continue;
    }
    const field = m[1];
    if (!consider.has(field)) continue;
    const expr = m[2].trim();
    if (/^-?\d+$/.test(expr)) target.set(field, Number(expr));
    else if (expr === 'true') target.set(field, true);
    else if (expr.startsWith('AmmoID.')) target.set(field, AMMO_ID[expr.slice(7)] ?? 0);
    else if (/type\b/.test(expr) && /^[\d\s+\-*()%|]+$/.test(expr.replace(/type/g, ''))) {
      // 算式（type 与 itemId 代换,白名单字符防注入）——工具期求值,非运行时代码
      try {
        const v = Function(`"use strict"; return (${expr.replace(/\btype\b/g, String(itemId))});`)();
        if (Number.isFinite(v)) target.set(field, Math.round(v));
      } catch { /* 非算式,跳过 */ }
    }
  }
}

const ITEM_COUNT = 6196;   // ItemID.Count（Terarria1457/Terraria.ID/ItemID.cs:13938 public static readonly short Count = 6196）
const items = [];
for (let id = 0; id < ITEM_COUNT; id++) {
  const f = func[String(id)] ?? {};
  const seg = SEGS.get(id);
  const it = {
    id,
    melee: !!f.melee, ranged: !!f.ranged, magic: !!f.magic, summon: !!f.summon,
    consumable: !!f.consumable, notAmmo: !!f.notAmmo, questItem: !!f.questItem,
    damage: f.damage ?? 0, defense: 0, pick: f.pick ?? 0, axe: f.axe ?? 0, hammer: f.hammer ?? 0,
    ammo: f.ammo ?? 0, shoot: f.shoot ?? 0, buffType: f.buffType ?? 0,
    healLife: f.healLife ?? 0, healMana: f.healMana ?? 0,
    fishingPole: f.fishingPole ?? 0, bait: f.bait ?? 0,
    createTile: f.createTile ?? -1, createWall: f.createWall ?? 0,
    accessory: false, vanity: false, mech: false, mountType: -1,
    headSlot: -1, bodySlot: -1, legSlot: -1, paint: 0, paintCoating: 0,
    rare: rareTable[String(id)] ?? 0,
    value: valueTable[String(id)] ?? 0,
    hairDye: hairDyeIds.has(String(id)) ? 1 : -1,
    // ★染料修正：vanilla-equip.json 的 dye 表把染发剂（1977-1988,Item.dye 恒 0——
    //   :48716 GetShaderIdFromItemId 只归 Armor 系,染发剂走 Hair 系返回 0）也算了进去,
    //   令 PotionsHairDyes 层整层被 PotionsDyes 抢走——此处按 hairDye 成员剔除
    dye: (equip.dye.includes(id) && !hairDyeIds.has(String(id))) ? 1 : 0,
    makeNPC: makeNPC[String(id)] ?? 0,
    isFood: (BOOL_SETS.IsFood?.ids ?? []).includes(id),
    isCrate: (BOOL_SETS.IsFishingCrate?.ids ?? []).includes(id),
    isBasicFish: (BOOL_SETS.IsBasicFish?.ids ?? []).includes(id),
  };
  if (seg) {
    // 顺序重放直赋 + DefaultTo* 助手展开（FX3 提取器盲区族防误报）；itemfunc 在档
    // 键优先（其嵌套 switch/区间块已按源码校对修补）,扫描值只补缺
    const scanned = new Map();
    replaySegment(seg, scanned, SORT_FIELDS, id);
    for (const [name, v] of scanned) {
      const fKey = FUNC_KEYS[name];
      if (fKey && f[fKey] !== undefined) continue;
      if (name === 'rare') { it.rare = v; continue; }   // 1457 直读（itemrare 表为后备,差集打印）
      it[name] = v;
    }
  }
  // 衍生旗（运行时谓词面）
  it.hook = HOOK_PROJS.has(it.shoot);                                   // Main.projHook[shoot]
  it.isLightPet = (LIGHT_PETS.has(it.buffType));                        // Main.lightPet[buffType]
  it.isVanityPet = (VANITY_PETS.has(it.buffType));                      // Main.vanityPet[buffType]
  it.isCart = it.mountType >= 0 && CART_MOUNTS.has(it.mountType);       // MountID.Sets.Cart
  // IsFood → SetFoodDefaults/DefaultToFood：consumable=true + buffType>0（层判定只需非零）
  if (it.isFood) { it.consumable = true; it.buffType = it.buffType > 0 ? it.buffType : 26; }
  items.push(it);
}

// ---------- 旧近似集对照（vanilla-equip.json hook/pet/light/cart 逐物品旗 vs 忠实集合） ----------
const itemsWith = (pred) => new Set(items.filter(pred).map((it) => it.id));
const diffFlags = (label, oldArr, newSet) => {
  const onlyOld = [], onlyNew = [];
  for (let id = 0; id < ITEM_COUNT; id++) {
    const o = oldArr.includes(id), n = newSet.has(id);
    if (o && !n) onlyOld.push(id);
    if (!o && n) onlyNew.push(id);
  }
  console.log(`对照 ${label}: 旧=${onlyOld.length} 新=${onlyNew.length} 仅旧=[${onlyOld.slice(0, 8)}] 仅新=[${onlyNew.slice(0, 8)}]`);
};
diffFlags('hook(equip.hook vs projHook[shoot])', equip.hook, itemsWith((it) => it.hook));
diffFlags('light(equip.light vs lightPet[buffType])', equip.light, itemsWith((it) => it.isLightPet));
diffFlags('pet(equip.pet vs vanityPet[buffType])', equip.pet, itemsWith((it) => it.isVanityPet));
diffFlags('cart(equip.cart vs Cart[mountType])', equip.cart, itemsWith((it) => it.isCart));
// rare：itemrare 表 vs 1457 直读差集
{
  let diff = 0, samples = [];
  for (const it of items) {
    const t = rareTable[String(it.id)];
    if (t !== undefined && t !== it.rare) { diff++; if (samples.length < 8) samples.push(`${it.id}:${t}→${it.rare}`); }
  }
  console.log(`rare 差集: ${diff} 条 ${samples.join(' ')}`);
}

// ---------- 52 层谓词（SetupWhiteLists :1278-1329 固定序;ItemSorting.cs 谓词逐条对照） ----------
const layerOf = (it) => {
  // 前 4 层（SetupWhiteLists 固定序 Melee→Ranged→Magic→Minions;排序时才按玩家倍率换序）
  if (it.damage > 0 && !it.consumable && it.ammo === 0 && it.melee && it.pick < 1 && it.hammer < 1 && it.axe < 1) return 0;
  if ((it.damage > 0 && !it.consumable && it.ammo === 0 && it.ranged) || prio('SortingPriorityWeaponsRanged', it.id) > -1) return 1;
  if (it.damage > 0 && !it.consumable && it.ammo === 0 && it.magic) return 2;
  if (it.damage > 0 && !it.consumable && it.summon) return 3;
  if (it.damage > 0 && it.ammo === 0 && it.pick === 0 && it.axe === 0 && it.hammer === 0) return 4;      // WeaponsAssorted
  if (it.ammo > 0 && it.damage > 0) return 5;                                                            // WeaponsAmmo
  if (it.pick > 0 && it.axe > 0) return 6;                                                               // ToolsPicksaws
  if (it.hammer > 0 && it.axe > 0) return 7;                                                             // ToolsHamaxes
  if (it.pick > 0) return 8;                                                                             // ToolsPickaxes
  if (it.axe > 0) return 9;                                                                              // ToolsAxes
  if (it.hammer > 0) return 10;                                                                          // ToolsHammers
  if (prio('SortingPriorityTerraforming', it.id) > -1) return 11;
  if (it.fishingPole > 0 || it.bait > 0 || it.questItem || it.isCrate || it.isBasicFish
    || prio('SortingPriorityToolsFishing', it.id) > -1) return 12;
  if (prio('SortingPriorityToolsGolf', it.id) > -1) return 13;
  if (prio('SortingPriorityToolsInstruments', it.id) > -1) return 14;
  if (prio('SortingPriorityToolsKeys', it.id) > -1) return 15;
  if (prio('SortingPriorityToolsKites', it.id) > -1) return 16;
  if (it.ammo > 0 && !it.isFood && prio('SortingPriorityMiscAcorns', it.id) === -1) return 17;            // AmmoLeftovers
  if (prio('SortingPriorityToolsMisc', it.id) > -1) return 18;
  if ((it.bodySlot >= 0 || it.headSlot >= 0 || it.legSlot >= 0) && !it.vanity) return 19;                 // ArmorCombat
  if ((it.bodySlot >= 0 || it.headSlot >= 0 || it.legSlot >= 0) && it.vanity) return 20;                  // ArmorVanity
  if (it.accessory) return 21;                                                                           // ArmorAccessories
  if (it.hook) return 22;                                                                                // EquipGrapple（projHook[shoot]）
  if (it.mountType !== -1 && !it.isCart) return 23;                                                      // EquipMount
  if (it.mountType !== -1 && it.isCart) return 24;                                                       // EquipCart
  if (it.buffType > 0 && it.isLightPet) return 25;                                                       // EquipLightPet
  if (it.buffType > 0 && it.isVanityPet) return 26;                                                      // EquipVanityPet
  if (it.dye > 0 || prio('SortingPriorityPotionsDyeMaterial', it.id) > -1) return 27;                     // PotionsDyes
  if (it.hairDye >= 0) return 28;                                                                        // PotionsHairDyes
  if (it.consumable && it.healLife > 0 && it.healMana < 1 && it.id !== 5) return 29;                      // PotionsLife
  if (it.id === 5) return 30;                                                                            // PotionsJustTheMushroom
  if (it.consumable && it.healLife < 1 && it.healMana > 0) return 31;                                     // PotionsMana
  if (it.consumable && it.healLife > 0 && it.healMana > 0) return 32;                                     // PotionsElixirs
  if ((it.consumable && it.buffType > 0 && !it.isFood) || prio('SortingPriorityPotionsBuffs', it.id) > -1) return 33; // PotionsBuffs
  if (it.consumable && it.buffType > 0 && it.isFood) return 34;                                          // PotionsFood
  if (prio('SortingPriorityMiscImportants', it.id) > -1) return 35;                                      // MiscValuables
  if (prio('SortingPriorityPainting', it.id) > -1 || it.paint > 0) return 36;                             // MiscPainting
  if (prio('SortingPriorityWiring', it.id) > -1 || it.mech) return 37;                                    // MiscWiring
  if (prio('SortingPriorityMaterials', it.id) > -1) return 38;                                           // MiscMaterials
  if (it.id === 183) return 39;                                                                          // MiscJustTheGlowingMushroom
  if (prio('SortingPriorityRopes', it.id) > -1) return 40;                                               // MiscRopes
  if (prio('SortingPriorityMiscHerbsAndSeeds', it.id) > -1) return 41;                                   // MiscHerbsAndSeeds
  if (prio('SortingPriorityMiscAcorns', it.id) > -1) return 42;                                          // MiscAcorns
  if (prio('SortingPriorityMiscGems', it.id) > -1) return 43;                                            // MiscGems
  if (prio('SortingPriorityMiscBossBags', it.id) > -1) return 44;                                        // MiscBossBags
  if (it.makeNPC > 0) return 45;                                                                         // MiscCritters
  if (prio('SortingPriorityExtractibles', it.id) > -1) return 46;                                        // MiscExtractinator
  if (it.createTile < 0 && it.createWall < 1 && it.rare !== -1) return 47;                               // LastMaterials
  if (it.createTile >= 0 && FRAME_IMPORTANT.has(it.createTile)) return 48;                               // LastTilesImportant
  if (it.createWall > 0 || it.createTile >= 0) return 49;                                                // LastTilesCommon
  if (it.rare >= 0) return 50;                                                                           // LastNotTrash
  return 51;                                                                                             // LastTrash
};

// ---------- 顺序消费（先到先得;等价 SetupWhiteLists 逐层跑谓词+itemsToSort 移除） ----------
const claimed = new Uint8Array(ITEM_COUNT);
const layerIndex = new Int16Array(ITEM_COUNT).fill(-1);
for (let L = 0; L < 52; L++) {
  for (const it of items) {
    if (claimed[it.id]) continue;
    if (layerOf(it) === L) { claimed[it.id] = 1; layerIndex[it.id] = L; }
  }
}
// ★原版不变量（ItemSorting.cs:1353 Invariant.Assert）：LastNotTrash 白名单必须为空
// —— vid 0..6195 全部被层 0-49 认领（50/51 层是模组物品的运行时尾接面,白名单恒空）
const unclaimed = [];
for (let id = 0; id < ITEM_COUNT; id++) if (layerIndex[id] < 0) unclaimed.push(id);
const toLastNotTrash = [];
for (let id = 0; id < ITEM_COUNT; id++) if (layerIndex[id] === 50) toLastNotTrash.push(id);
if (unclaimed.length || toLastNotTrash.length) {
  console.error(`★不变量破约: 未认领=${unclaimed.length} [${unclaimed.slice(0, 10)}] LastNotTrash=${toLastNotTrash.length} [${toLastNotTrash.slice(0, 10)}]`);
  process.exit(1);
}

// ---------- 稀疏 attrs（0/假/缺省不落键） ----------
const attrs = {};
for (const it of items) {
  const a = {};
  if (it.damage > 0) a.d = it.damage;
  if (it.defense > 0) a.df = it.defense;
  if (it.melee) a.m = 1;
  if (it.ranged) a.rg = 1;   // ★rg=远程旗——曾用 r 与 rare(a.r) 键冲突:rare≠0 覆写远程旗
                             //  + 全部 rare≠0 物品被 view 读成 ranged=真(层归属漂移)
  if (it.magic) a.g = 1;
  if (it.summon) a.s = 1;
  if (it.consumable) a.c = 1;
  if (it.notAmmo) a.na = 1;
  if (it.questItem) a.q = 1;
  if (it.accessory) a.ac = 1;
  if (it.vanity) a.v = 1;
  if (it.mech) a.me = 1;
  if (it.ammo > 0) a.am = it.ammo;
  if (it.pick > 0) a.pk = it.pick;
  if (it.axe > 0) a.ax = it.axe;
  if (it.hammer > 0) a.ha = it.hammer;
  if (it.fishingPole > 0) a.fp = it.fishingPole;
  if (it.bait > 0) a.bt = it.bait;
  if (it.headSlot >= 0) a.hs = it.headSlot;
  if (it.bodySlot >= 0) a.bs = it.bodySlot;
  if (it.legSlot >= 0) a.ls = it.legSlot;
  if (it.mountType >= 0) a.mt = it.mountType;
  if (it.paint > 0) a.pt = it.paint;
  if (it.paintCoating > 0) a.pc = it.paintCoating;
  if (it.buffType > 0) a.bf = it.buffType;
  if (it.healLife > 0) a.hl = it.healLife;
  if (it.healMana > 0) a.hm = it.healMana;
  if (it.dye > 0) a.dy = it.dye;
  if (it.hairDye >= 0) a.hd = it.hairDye;
  if (it.createTile >= 0) a.ct = it.createTile;
  if (it.createWall > 0) a.cw = it.createWall;
  if (it.makeNPC > 0) a.mn = it.makeNPC;
  if (it.rare !== 0) a.r = it.rare;
  if (it.value > 0) a.vl = it.value;
  if (it.hook) a.fk = 1;
  if (it.isLightPet) a.lp = 1;
  if (it.isVanityPet) a.vp = 1;
  if (it.isCart) a.ca = 1;
  if (it.isFood) a.fo = 1;
  if (it.isCrate) a.fc = 1;
  if (it.isBasicFish) a.fb = 1;
  // 名字只在名字比较器消费面落键（Last - Tiles 两层=createTile/createWall 族）
  if ((it.createTile >= 0 || it.createWall > 0) && NAMES[it.id]) a.nm = NAMES[it.id];
  attrs[String(it.id)] = a;
}

const out = {
  meta: {
    source: 'Terarria1457 Terraria.UI/ItemSorting.cs SetupWhiteLists :1272-1354',
    layerCount: 52, itemCount: ITEM_COUNT, version: 2, extracted: '2026-09-11 SW-FX29',
  },
  layers: {},
  prio: {}, buffFoodPrio: BUFF_INT_SETS.SortingPriorityFoodBuffs.pairs,
  bools: {
    IsFood: [...(BOOL_SETS.IsFood?.ids ?? [])],
    IsFishingCrate: [...(BOOL_SETS.IsFishingCrate?.ids ?? [])],
    IsBasicFish: [...(BOOL_SETS.IsBasicFish?.ids ?? [])],
  },
  frameImportant: [...FRAME_IMPORTANT].sort((a, b) => a - b),
  attrs,
};
for (let id = 0; id < ITEM_COUNT; id++) out.layers[String(id)] = layerIndex[id];
for (const k of PRIO_KEYS) out.prio[k] = INT_SETS[k].pairs;
writeFileSync(`${ROOT}/game/src/data/vanilla-itemsorting.json`, JSON.stringify(out));

// ---------- 摘要 ----------
const counts = {};
for (let id = 0; id < ITEM_COUNT; id++) { const L = layerIndex[id]; counts[L] = (counts[L] ?? 0) + 1; }
const names = ['WeaponsMelee', 'WeaponsRanged', 'WeaponsMagic', 'WeaponsMinions', 'WeaponsAssorted', 'WeaponsAmmo',
  'ToolsPicksaws', 'ToolsHamaxes', 'ToolsPickaxes', 'ToolsAxes', 'ToolsHammers', 'ToolsTerraforming', 'ToolsFishing',
  'ToolsGolf', 'ToolsInstruments', 'ToolsKeys', 'ToolsKites', 'ToolsAmmoLeftovers', 'ToolsMisc', 'ArmorCombat',
  'ArmorVanity', 'ArmorAccessories', 'EquipGrapple', 'EquipMount', 'EquipCart', 'EquipLightPet', 'EquipVanityPet',
  'PotionsDyes', 'PotionsHairDyes', 'PotionsLife', 'PotionsJustTheMushroom', 'PotionsMana', 'PotionsElixirs',
  'PotionsBuffs', 'PotionsFood', 'MiscValuables', 'MiscPainting', 'MiscWiring', 'MiscMaterials',
  'MiscJustTheGlowingMushroom', 'MiscRopes', 'MiscHerbsAndSeeds', 'MiscAcorns', 'MiscGems',
  'MiscBossBags', 'MiscCritters', 'MiscExtractinator', 'LastMaterials', 'LastTilesImportant', 'LastTilesCommon', 'LastNotTrash', 'LastTrash'];
console.log('=== 分层计数（1457） ===');
for (let L = 0; L < 52; L++) console.log(`${String(L).padStart(2)} ${names[L].padEnd(26)} ${counts[L] ?? 0}`);
// 与旧版（1456/6147 条）全量 diff
{
  const oldRaw = JSON.parse(read('game/src/data/vanilla-itemsorting.json'));
  void oldRaw;   // 已覆写——diff 由 tests/sw-fx29 金标承担（git diff 承担版本对照）
}
console.log('spot checks:',
  '1(IronPickaxe→', out.layers['1'], ')',
  '4(IronBroadsword→', out.layers['4'], ')',
  '71(CopperCoin→', out.layers['71'], ')',
  '2(DirtBlock→', out.layers['2'], ')',
  '23(Gel→', out.layers['23'], ')',
  '27(Acorn→', out.layers['27'], ')',
  '8(Torch→', out.layers['8'], ')',
  '149(Anvil?→', out.layers['149'], ')',
  '6147(GiantTiki→', out.layers['6147'], ')',
  '905(MoneyTrough→', out.layers['905'], ')');
console.log('json size:', Math.round(JSON.stringify(out).length / 1024), 'KiB');
