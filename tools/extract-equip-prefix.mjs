// 从 1456 反编译源码提取两套数据：
//  1) src/data/vanilla-equip.json —— 物品装备分类（染料/宠物/光源/矿车/坐骑/钩爪）
//     判定规则（ItemSlot.PickItemMovementAction :1197-1248 原版语义）：
//       dye   = GameShaders.Armor.GetShaderIdFromItemId(id)>0（DyeInitializer BindShader 全表）
//       pet   = buffType>0 && Main.vanityPet[buffType] && !lightPet
//       light = buffType>0 && Main.lightPet[buffType]
//       mount = mountType!=-1 && !MountID.Sets.Cart[mountType]
//       cart  = mountType!=-1 && MountID.Sets.Cart[mountType]
//       hook  = mountType==-1 && Main.projHook[shoot]（projHook = Projectile aiStyle==7）
//  2) src/data/vanilla-prefix.json —— 重铸词缀系统（Item.Prefix :489-602）：
//     词缀名（PrefixID.cs 常量 1-97）+ 属性修正（TryGetPrefixStatMultipliersForItem :691-1061
//     switch）+ 传奇档 value 加成（:1043-1060）+ 各武器类可掷池（PrefixLegacy.Prefixes）+
//     物品类集合（PrefixLegacy.ItemSets / ItemID.Sets.CanGetPrefixes）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
const itemSrc = read('Terarria1456/Terraria/Item.cs');

// ---- Item.cs case 块逐 id 字段扫描（SetDefaults1-5 段）----
// 按花括号深度过滤：仅取物品外层 switch 的 case 段（嵌套 switch(type) 的 case 标签
// 深度更深，必须排除——否则内层标签会冒充外层 id 污染条目，见 extract-itemcombat 教训）。
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
/** case 段 → itemId: segmentSource 映射。
 *  关键：case 标签归属【最近一层 switch(type)】——SetDefaults1-5 内有嵌套
 *  switch(type)（如矿车 2343 块），内层标签才是物品 id；switch(其他变量) 的
 *  标签一律不归属（否则会冒充物品 id，见 extract-itemcombat 坑 2）。 */
function outerCaseSegments(src) {
  const out = new Map();
  const collect = (body) => {
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = []; // { isType, opened, bodyDepth, cur, segStart }
    let depth = 0;
    let m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*type\b/.test(t), opened: false, bodyDepth: -1, cur: null, segStart: 0 });
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
        // case / default
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          if (top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
          top.cur = t === 'default:' ? null : +m[2];
          top.segStart = m.index + t.length;
        }
      }
    }
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collect(body);
  }
  return out;
}
const CASE_SEGMENTS = outerCaseSegments(itemSrc);
/** 扫描字段赋值（field = N;）与辅助方法调用（DefaultToMinecart(N)） */
function scanCaseFields(src, patterns) {
  const out = new Map(); // itemId -> 值
  for (const [id, seg] of CASE_SEGMENTS) {
    for (const p of patterns) {
      const f = seg.match(new RegExp(p));
      if (f) { out.set(id, +f[1]); break; }
    }
  }
  return out;
}
const BUFF_TYPE = scanCaseFields(itemSrc, [
  '\\bbuffType\\s*=\\s*(\\d+);',
  // DefaultToVanitypet(projId, buffID)（Item.cs:47549：buffType 赋值在辅助方法内）
  'DefaultToVanitypet\\(\\d+,\\s*(\\d+)\\);',
]);
const MOUNT_TYPE = scanCaseFields(itemSrc, ['\\bmountType\\s*=\\s*(-?\\d+);', 'DefaultToMinecart\\((\\d+)\\);']);

// ---- vanityPet / lightPet 初始化表（Main.cs 9100-9290 静态初始化段） ----
const mainSrc = read('Terarria1456/Terraria/Main.cs');
const mainLines = mainSrc.split('\n');
const initSeg = mainLines.slice(9050, 9350).join('\n');
const vanityPet = new Set();
const lightPet = new Set();
for (const mm of initSeg.matchAll(/vanityPet\[(\d+)\] = true;/g)) vanityPet.add(+mm[1]);
for (const mm of initSeg.matchAll(/lightPet\[(\d+)\] = true;/g)) lightPet.add(+mm[1]);

// ---- 染料：DyeInitializer BindShader(itemId, ...) 全表（多行调用） ----
// 基础色染料经 LoadBasicColorDye(base) 辅助注册（每基色绑 4 件：base 黑=+12 亮=+31 银=+44，
// DyeInitializer.cs:13-27）；4 参重载直接给 4 个 id（:29 如 2874-2877）。
const dyeSrc = read('Terarria1456/Terraria.Initializers/DyeInitializer.cs');
const dyeIds = new Set();
for (const mm of dyeSrc.matchAll(/BindShader\(\s*(\d+)\s*,/g)) dyeIds.add(+mm[1]);
for (const mm of dyeSrc.matchAll(/LoadBasicColorDye\((\d+),\s*([\d.]+)f/g)) {
  // 单参重载（基色 id）：base / base+12 / base+31 / base+44
  const base = +mm[1];
  for (const id of [base, base + 12, base + 31, base + 44]) dyeIds.add(id);
}
for (const mm of dyeSrc.matchAll(/LoadBasicColorDye\((\d+),\s*(\d+),\s*(\d+),\s*(\d+),/g)) {
  for (const id of [+mm[1], +mm[2], +mm[3], +mm[4]]) dyeIds.add(id);
}

// ---- 矿车 mount id（MountID.Sets.Cart :21） ----
const MOUNT_CART = new Set([6, 13, 11, 15, 16, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 51, 53]);

// ---- 钩爪投射物（projHook = aiStyle==7，Projectile.SetDefaults 扫描产物） ----
const projs = JSON.parse(read('game/src/data/vanilla-projectiles.json'));
const hookProjs = new Set(Object.entries(projs)
  .filter(([, p]) => p.aiStyle === 7).map(([k]) => +k));
// ---- 物品 shoot 表（vanilla-itemcombat.json 提取期已有） ----
const combat = JSON.parse(read('game/src/data/vanilla-itemcombat.json'));

const equip = { dye: [], pet: [], light: [], mount: [], cart: [], hook: [] };
for (const id of dyeIds) equip.dye.push(id);
for (const [itemId, buff] of BUFF_TYPE) {
  if (vanityPet.has(buff) && !lightPet.has(buff)) equip.pet.push(itemId);
  else if (lightPet.has(buff)) equip.light.push(itemId);
}
for (const [itemId, mount] of MOUNT_TYPE) {
  if (mount < 0) continue;
  (MOUNT_CART.has(mount) ? equip.cart : equip.mount).push(itemId);
}
for (const [itemIdStr, c] of Object.entries(combat)) {
  const itemId = +itemIdStr;
  if (MOUNT_TYPE.get(itemId) !== undefined && MOUNT_TYPE.get(itemId) >= 0) continue; // mountType==-1 门
  if (c.shoot !== undefined && hookProjs.has(c.shoot)) equip.hook.push(itemId);
}
for (const k of Object.keys(equip)) equip[k].sort((a, b) => a - b);
writeFileSync(`${ROOT}/game/src/data/vanilla-equip.json`, JSON.stringify(equip));
console.error(`equip: dye ${equip.dye.length} pet ${equip.pet.length} light ${equip.light.length} ` +
  `mount ${equip.mount.length} cart ${equip.cart.length} hook ${equip.hook.length}`);

// ================= 词缀 =================
const prefixSrc = read('Terarria1456/Terraria.ID/PrefixID.cs');
// 常量名（→ l10n 键 Prefix.<Name>，1-97）
const PREFIX_NAMES = {};
for (const mm of prefixSrc.matchAll(/public const int (\w+) = (\d+);/g)) PREFIX_NAMES[+mm[2]] = mm[1];
// ReducedNaturalChance（:7）
const reduced = (prefixSrc.match(/ReducedNaturalChance = Factory\.CreateBoolSet\(([^)]*)\)/)?.[1] ?? '')
  .split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));

// 属性修正 switch（Item.cs:691-1061）：case 标签组共享体
function methodBody(src, name) {
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
const PREFIX_STATS = {};
{
  const body = methodBody(itemSrc, 'public bool TryGetPrefixStatMultipliersForItem');
  // switch (rolledPrefix) { case N: case M: <赋值>; break; ... }
  const swStart = body.indexOf('switch (rolledPrefix)');
  let depth = 0, i = body.indexOf('{', swStart);
  let end = i;
  for (; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const sw = body.slice(body.indexOf('{', swStart) + 1, end);
  // 按 case 标签切段
  const parts = sw.split(/(?=case \d+:)/);
  const F = { dmg: 1, kb: 1, spd: 1, size: 1, shtspd: 1, mcst: 1 };
  for (const part of parts) {
    const labels = [...part.matchAll(/^case (\d+):/gm)].map((mm) => +mm[1]);
    if (!labels.length) continue;
    const st = { dmg: 1, kb: 1, spd: 1, size: 1, shtspd: 1, mcst: 1, crt: 0, tagdmg: 0, arpen: 0 };
    for (const [fname] of Object.entries(F)) {
      const mm = part.match(new RegExp(`\\b${fname} = ([\\d.]+)f?;`));
      if (mm) st[fname] = parseFloat(mm[1]);
    }
    for (const fname of ['crt', 'tagdmg', 'arpen']) {
      const mm = part.match(new RegExp(`\\b${fname} = (\\d+);`));
      if (mm) st[fname] = +mm[1];
    }
    // 无任何修正的 case（纯 1 档）也登记——保持与原版 switch 全集一致
    for (const id of labels) PREFIX_STATS[id] = st;
  }
}
// 传奇档 value 乘档（:1043-1060：固定四组 id）。62-80（配饰词缀）在属性 switch 中无 case
// （纯 value 档位），此处统一补全一档条目。
const TIER = {};
for (const id of [62, 69, 73, 77]) TIER[id] = 1.05;
for (const id of [63, 70, 74, 78, 67]) TIER[id] = 1.1;
for (const id of [64, 71, 75, 79, 66]) TIER[id] = 1.15;
for (const id of [65, 72, 76, 80, 68]) TIER[id] = 1.2;
for (const id of Object.keys(TIER)) {
  PREFIX_STATS[id] = PREFIX_STATS[id]
    ?? { dmg: 1, kb: 1, spd: 1, size: 1, shtspd: 1, mcst: 1, crt: 0, tagdmg: 0, arpen: 0 };
  PREFIX_STATS[id].tier = TIER[id];
}

// ---- 各武器类可掷池 + 物品集合（PrefixLegacy.cs 全量字面量） ----
const legacySrc = read('Terarria1456/Terraria.GameContent.Prefixes/PrefixLegacy.cs');
const POOLS = {};
for (const mm of legacySrc.matchAll(/public static int\[\] (\w+) = new int\[\d+\]\s*\{([\d,\s]+)\};/g)) {
  POOLS[mm[1]] = mm[2].split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
}
const SETS = {};
for (const mm of legacySrc.matchAll(/public static bool\[\] (\w+) = Factory\.CreateBoolSet\(([^)]*)\);/g)) {
  SETS[mm[1]] = mm[2].split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
}
// ItemID.Sets.CanGetPrefixes = CreateBoolSet(true, <排除表>)（ItemID.cs:175）
const itemidSrc = read('Terarria1456/Terraria.ID/ItemID.cs');
const cgp = itemidSrc.match(/CanGetPrefixes = Factory\.CreateBoolSet\(([^)]*)\)/)?.[1] ?? '';
const cgpTrue = /^\s*true\b/.test(cgp);
const cgpExcluded = cgp.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));

const doc = {
  names: PREFIX_NAMES,
  stats: PREFIX_STATS,
  reduced,
  pools: POOLS,
  itemSets: SETS,
  canGetPrefixesDefault: cgpTrue,
  canGetPrefixesExcluded: cgpExcluded,
};
writeFileSync(`${ROOT}/game/src/data/vanilla-prefix.json`, JSON.stringify(doc));
console.error(`prefix: ${Object.keys(PREFIX_STATS).length} 条属性 / ${Object.keys(PREFIX_NAMES).length} 名 / 池 ${Object.keys(POOLS).length} / 集合 ${Object.keys(SETS).length}`);
