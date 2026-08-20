// 从 Terarria1456 提取 ItemSorting 全 48 层分类表 → src/data/vanilla-itemsorting.json。
// 语义 = ItemSorting.SetupWhiteLists（Terraria.UI/ItemSorting.cs:1283-1352）：
// 逐层跑 SortingMethod 谓词，先到先得（谓词同时从 itemsToSort 移除已领物品）——
// 一个物品的层 = 首个命中层在 _layerList 的下标。_layerList 前四层由玩家四系
// 伤害倍率排序（AddSortingPrioritiesBasedOnPlayerDamage），SetupWhiteLists 在
// Main.cs:6593 加载期调用（玩家未载入 → 四倍率全 1 → 平序按 index：Melee0/
// Ranged1/Magic2/Minions3——固定序，:GetSortingLayerIndex :1553）。
//
// 数据源：
//  · ItemID.cs CreateIntSet/CreateBoolSet 行（SortingPriority* 全表 + IsFood/
//    IsFishingCrate/IsBasicFish）
//  · Item.cs SetDefaults1-5 case 段字段（melee/ranged/magic/summon/consumable/
//    ammo/pick/axe/hammer/fishingPole/bait/questItem/accessory/vanity/headSlot/
//    bodySlot/legSlot/mountType/mech/paint/damage/shoot/buffType/healLife/healMana/
//    createTile/createWall/notAmmo）——case 归属规则同 extract-equip-prefix.mjs
//    （最近一层 switch(type) + fall-through 组共享体）
//  · 既有产物复用：vanilla-itemfunc.json（fishingPole/bait 修补后值）、
//    vanilla-equip.json（dye/pet/light/mount/cart/hook——Equip* 层谓词的原版集合）、
//    vanilla-hairdyes.json（hairDye>=0）、vanilla-shimmer.json（itemMakeNPC）、
//    vanilla-itemrare.json（rare，缺省 0——Item.rare C# 默认）、Main.cs
//    tileFrameImportant[N]=true 行（LastTilesImportant）
//  · 食物（IsFood）：SetDefaults 主入口走 SetFoodDefaults → DefaultToFood
//    （consumable=true + buffType∈{26,206,207}）——统一补 consumable+buffType>0
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

const itemSrc = read('Terarria1456/Terraria/Item.cs');
const itemidSrc = read('Terarria1456/Terraria.ID/ItemID.cs');
const ammoSrc = read('Terarria1456/Terraria.ID/AmmoID.cs');
const mainSrc = read('Terarria1456/Terraria/Main.cs');

// AmmoID 常量（ammo = AmmoID.X 枚举赋值的数值解析——Item.cs 79 处枚举形，
// 字面量正则扫不到；AmmoID.cs:112-146 `public static int X = N;`）
const AMMO_ID = {};
{
  const re = /public static int (\w+) = (\d+);/g;
  let m;
  while ((m = re.exec(ammoSrc))) AMMO_ID[m[1]] = Number(m[2]);
}

// ---------- ItemID.Sets 数值表（CreateIntSet）与布尔表（CreateBoolSet） ----------
function parseIntSets(src) {
  const sets = {};
  const re = /public static int\[\] (\w+) = Factory\.CreateIntSet\((-?\d+)((?:,\s*-?\d+(?:\s*,\s*-?\d+)*)?)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1], def = Number(m[2]);
    const rest = m[3] ?? '';
    // ★Number('')===0（非 NaN）——rest 首元素是空串，须先剔空再转数（曾致键值对
    //  整体错位一格：Ropes 解析成 {0:965,1:3078}）
    const nums = rest.split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
    const map = new Map();
    for (let i = 0; i + 1 < nums.length; i += 2) map.set(nums[i], nums[i + 1]);
    sets[name] = { def, map };
  }
  return sets;
}
function parseBoolSets(src) {
  const sets = {};
  const re = /public static bool\[\] (\w+) = Factory\.CreateBoolSet\(((?:\s*\d+(?:\s*,\s*\d+)*))\)/g;
  let m;
  while ((m = re.exec(src))) {
    sets[m[1]] = new Set(m[2].split(',').map((x) => Number(x.trim())));
  }
  return sets;
}
const INT_SETS = parseIntSets(itemidSrc);
const BOOL_SETS = parseBoolSets(itemidSrc);
const intSetHas = (name, id) => {
  const s = INT_SETS[name];
  return s !== undefined && s.map.get(id) !== undefined;
};
// SortingPriority* > -1 判定（CreateIntSet 默认 -1 → map 命中即 >-1；表内显式值
// 全部 > -1，无 0 值哨兵——对照 ItemID.cs :1118-1156 逐行核验）
const prio = (name, id) => (INT_SETS[name] ? (INT_SETS[name].map.get(id) ?? -1) : -1);

// ---------- Item.cs case 段 ----------
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
/** case 段 → itemId: segment（最近一层 switch(type)；fall-through 组共享体；
 *  同 extract-equip-prefix.mjs 规则） */
function collectCaseSegments(body, out) {
  const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
  const stack = [];
  let depth = 0, m;
  while ((m = tokRe.exec(body))) {
    const t = m[0];
    if (t.startsWith('switch')) {
      stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, cur: null, segStart: 0 });
    } else if (t === '{') {
      depth++;
      const top = stack[stack.length - 1];
      if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
    } else if (t === '}') {
      const top = stack[stack.length - 1];
      if (top && top.opened && depth === top.bodyDepth) {
        if (top.isType && top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        stack.pop();
      }
      depth--;
    } else {
      const top = stack[stack.length - 1];
      if (top && top.opened && top.isType) {
        if (top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        top.cur = t === 'default:' ? null : +m[2];
        top.segStart = m.index + t.length;
      }
    }
  }
}
const SEGS = new Map();
for (let n = 1; n <= 5; n++) {
  const body = methodBodyOf(itemSrc, `public void SetDefaults${n}(int type)`)
    || methodBodyOf(itemSrc, `private void SetDefaults${n}(int type)`);
  if (body) collectCaseSegments(body, SEGS);
}

// ---------- 逐物品字段聚合 ----------
const func = JSON.parse(read('game/src/data/vanilla-itemfunc.json'));
const equip = JSON.parse(read('game/src/data/vanilla-equip.json'));
const hairDyeIds = new Set(Object.keys(JSON.parse(read('game/src/data/vanilla-hairdyes.json')).hairDyes ?? {}));
const shimmer = JSON.parse(read('game/src/data/vanilla-shimmer.json'));
const makeNPC = shimmer.itemMakeNPC ?? {};
const rareTable = JSON.parse(read('game/src/data/vanilla-itemrare.json'));
const IS_FOOD = BOOL_SETS.IsFood ?? new Set();

const FIELDS = [
  ['melee', /melee = true;/, 'b'], ['ranged', /ranged = true;/, 'b'],
  ['magic', /magic = true;/, 'b'], ['summon', /summon = true;/, 'b'],
  ['consumable', /consumable = true;/, 'b'], ['notAmmo', /notAmmo = true;/, 'b'],
  ['questItem', /questItem = true;/, 'b'], ['accessory', /accessory = true;/, 'b'],
  ['vanity', /vanity = true;/, 'b'], ['mech', /mech = true;/, 'b'],
  ['damage', /\bdamage = (\d+);/, 'n'], ['pick', /\bpick = (\d+);/, 'n'],
  ['axe', /\baxe = (\d+);/, 'n'], ['hammer', /\bhammer = (\d+);/, 'n'],
  ['ammo', /\bammo = (?:(\d+)|AmmoID\.(\w+));/, 'ammo'], ['shoot', /\bshoot = (-?\d+);/, 'n'],
  ['buffType', /\bbuffType = (-?\d+);/, 'n'], ['healLife', /\bhealLife = (\d+);/, 'n'],
  ['healMana', /\bhealMana = (\d+);/, 'n'], ['mountType', /\bmountType = (-?\d+);/, 'n'],
  ['headSlot', /\bheadSlot = (-?\d+);/, 'n'], ['bodySlot', /\bbodySlot = (-?\d+);/, 'n'],
  ['legSlot', /\blegSlot = (-?\d+);/, 'n'], ['paint', /\bpaint = (\d+);/, 'n'],
  ['createTile', /\bcreateTile = (-?\d+);/, 'n'], ['createWall', /\bcreateWall = (\d+);/, 'n'],
  ['makeNPC', /\bmakeNPC = (-?\d+);/, 'n'],
];

const ITEM_COUNT = 6147;   // ItemID.Count（Terrarria.ID/ItemID.cs:13833）
const items = [];
for (let id = 0; id < ITEM_COUNT; id++) {
  const f = func[String(id)] ?? {};
  const seg = SEGS.get(id);
  const it = {
    id,
    melee: !!f.melee, ranged: !!f.ranged, magic: !!f.magic, summon: !!f.summon,
    consumable: !!f.consumable, notAmmo: !!f.notAmmo, questItem: !!f.questItem,
    damage: f.damage ?? 0, pick: f.pick ?? 0, axe: f.axe ?? 0, hammer: f.hammer ?? 0,
    ammo: f.ammo ?? 0, shoot: f.shoot ?? 0, buffType: f.buffType ?? 0,
    healLife: f.healLife ?? 0, healMana: f.healMana ?? 0,
    fishingPole: f.fishingPole ?? 0, bait: f.bait ?? 0,
    createTile: f.createTile ?? -1, createWall: f.createWall ?? 0,
    accessory: false, vanity: false, mech: false, mountType: -1,
    headSlot: -1, bodySlot: -1, legSlot: -1, paint: 0,
    rare: rareTable[String(id)] ?? 0,
    hairDye: hairDyeIds.has(String(id)) ? 1 : -1,
    dye: equip.dye.includes(id) ? 1 : 0,
    isPet: equip.pet.includes(id), isLight: equip.light.includes(id),
    isMount: equip.mount.includes(id), isCart: equip.cart.includes(id), isHook: equip.hook.includes(id),
    makeNPC: makeNPC[String(id)] ?? 0,
    isFood: IS_FOOD.has(id),
  };
  if (seg) {
    // itemfunc 在档的键优先（其 2674/2676/2001/2422 等嵌套 switch/区间块已按源码
    // 校对修补——本提取器同款文本正则会重得同样的错值，只补缺不覆盖）
    for (const [name, re, type] of FIELDS) {
      const m = seg.match(re);
      if (!m) continue;
      const fKey = { melee: 'melee', ranged: 'ranged', magic: 'magic', summon: 'summon',
        consumable: 'consumable', notAmmo: 'notAmmo', questItem: 'questItem',
        damage: 'damage', pick: 'pick', axe: 'axe', hammer: 'hammer', shoot: 'shoot',
        buffType: 'buffType', healLife: 'healLife', healMana: 'healMana',
        createTile: 'createTile', createWall: 'createWall' }[name];
      if (type !== 'b' && fKey && f[fKey] !== undefined) continue;
      if (type === 'b') it[name] = true;
      else if (type === 'ammo') it[name] = m[1] !== undefined ? Number(m[1]) : (AMMO_ID[m[2]] ?? 0);
      else it[name] = Number(m[1]);
    }
  }
  // IsFood → SetFoodDefaults/DefaultToFood：consumable=true + buffType>0（层判定只需非零）
  if (it.isFood) { it.consumable = true; it.buffType = it.buffType > 0 ? it.buffType : 26; }
  items.push(it);
}

// ---------- tileFrameImportant（Main.cs 直赋行） ----------
const FRAME_IMPORTANT = new Set();
{
  const re = /tileFrameImportant\[(\d+)\] = true;/g;
  let m;
  while ((m = re.exec(mainSrc))) FRAME_IMPORTANT.add(Number(m[1]));
}

// ---------- 48 层谓词（SetupSortingPriorities :1379-1433 固定序） ----------
const layerOf = (it) => {
  // 前 4 层（玩家四系倍率全 1 平序 → Melee→Ranged→Magic→Minions）
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
  if (it.fishingPole > 0 || it.bait > 0 || it.questItem
    || (BOOL_SETS.IsFishingCrate?.has(it.id)) || (BOOL_SETS.IsBasicFish?.has(it.id))
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
  if (it.isHook) return 22;                                                                              // EquipGrapple（projHook[shoot]）
  if (it.mountType !== -1 && !it.isCart) return 23;                                                       // EquipMount
  if (it.mountType !== -1 && it.isCart) return 24;                                                       // EquipCart
  if (it.buffType > 0 && it.isLight) return 25;                                                          // EquipLightPet
  if (it.buffType > 0 && it.isPet) return 26;                                                            // EquipVanityPet
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

// ---------- 顺序消费（先到先得） ----------
const claimed = new Uint8Array(ITEM_COUNT);
const layerIndex = new Int16Array(ITEM_COUNT).fill(-1);
for (let L = 0; L < 52; L++) {
  for (const it of items) {
    if (claimed[it.id]) continue;
    if (layerOf(it) === L) { claimed[it.id] = 1; layerIndex[it.id] = L; }
  }
}
// 与原版一致的"逐层跑谓词"：物品按层序首个命中层归属（上面双循环等价——
// 谓词是纯函数，物品顺序不影响归属）。

const out = { meta: { source: 'Terraria.UI/ItemSorting.cs SetupWhiteLists', layerCount: 52 }, layers: {} };
for (let id = 0; id < ITEM_COUNT; id++) {
  if (layerIndex[id] >= 0) out.layers[String(id)] = layerIndex[id];
}
writeFileSync(`${ROOT}/game/src/data/vanilla-itemsorting.json`, JSON.stringify(out));

// 摘要（对照校验用）
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
console.log('=== 分层计数 ===');
for (let L = 0; L < 52; L++) console.log(`${String(L).padStart(2)} ${names[L].padEnd(26)} ${counts[L] ?? 0}`);
console.log('spot checks:',
  '1(IronPickaxe→', out.layers['1'], ')',
  '4(IronBroadsword→', out.layers['4'], ')',
  '71(CopperCoin→', out.layers['71'], ')',
  '2(DirtBlock→', out.layers['2'], ')');
