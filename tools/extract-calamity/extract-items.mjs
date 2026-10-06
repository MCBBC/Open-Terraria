#!/usr/bin/env node
// 灾厄全量移植 B1:items 机械提取器。
// 源=CalamityModPublic(C# SetDefaults/SetStaticDefaults + hjson 显示名 + PNG 贴图);
// 目标=game/mods/calamity/content/items/*.json + textures/items/*.png(ModItemContent schema)。
// ★手批 105 件(已存在 content/items/<key>.json)保持权威,提取器跳过并记 curated。
// ★本提取器只做「数据面」:AI/OnHit/变形等代码面走 L2 钩(逐批移植,见 calamity GAPS.md)。
// 用法:node tools/extract-calamity/extract-items.mjs [--write](缺省=干跑报告)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'); // SandboxWorld/
const SRC = join(ROOT, 'CalamityModPublic');
const OUT = join(ROOT, 'game', 'mods', 'calamity');
const WRITE = process.argv.includes('--write');

// ---------- 1. 原版枚举表(反编译直读;数值=1457 终值) ----------
function parseIdEnums() {
  const tables = {};
  const files = {
    tile: join(ROOT, 'Terarria1457', 'Terraria.ID', 'TileID.cs'),
    buff: join(ROOT, 'Terarria1457', 'Terraria.ID', 'BuffID.cs'),
    proj: join(ROOT, 'Terarria1457', 'Terraria.ID', 'ProjectileID.cs'),
    item: join(ROOT, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'),
    useStyle: join(ROOT, 'Terarria1457', 'Terraria.ID', 'ItemUseStyleID.cs'),
    ammo: join(ROOT, 'Terarria1457', 'Terraria.ID', 'AmmoID.cs'),
  };
  for (const [k, f] of Object.entries(files)) {
    const map = {};
    if (existsSync(f)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/public const (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+)/g)) {
        if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
      }
      for (const m of text.matchAll(/public static (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+);/g)) {
        if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
      }
    }
    tables[k] = map;
  }
  return tables;
}
const ENUMS = parseIdEnums();

// 原版稀有度(vanilla 常量,decompile 无独立 ItemRarityID.cs;1.4 终值)+灾厄自定义
// (★映射口径:Turquoise=12/PureGreen=13 延用手批 P7;余 6 族按类名字母序续 14-19;
//  Calamity 运行时 RarityType<T> 动态编号,复刻域无此概念——记录口径于 GAPS.md)
const RARITY = {
  White: 0, Blue: 1, Green: 2, Orange: 3, LightRed: 4, Pink: 5, LightPurple: 6,
  Lime: 7, Yellow: 8, Cyan: 9, Red: 10, Purple: 11, Quest: -1, Expert: -12, Master: -13,
  Turquoise: 12, PureGreen: 13, BurnishedAuric: 14, CalamityRed: 15,
  CosmicPurple: 16, DarkOrange: 17, ExoticRainbow: 18, HotPink: 19,
};
// CalamityGlobalItem.cs:1481-1500 buyPrice 表(铜币)
const RARITY_BUY_PRICE = {
  White: 5000, Blue: 10000, Green: 20000, Orange: 50000, LightRed: 100000,
  Pink: 200000, LightPurple: 350000, Lime: 450000, Yellow: 600000, Cyan: 800000,
  Red: 1000000, Purple: 1200000, Turquoise: 1500000, PureGreen: 1750000,
  DarkBlue: 2000000, Violet: 2400000, HotPink: 2800000, CalamityRed: 3200000,
};

// ---------- 2. hjson 显示名表 ----------
function parseNames() {
  const dir = join(SRC, 'Localization', 'en-US');
  const names = {};
  for (const f of readdirSync(dir)) {
    if (!/^Mods\.CalamityMod\.Items\..+\.hjson$/.test(f)) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    // 形状:ClassName: {\n\tDisplayName: 名\n\tTooltip: ...}
    for (const m of text.matchAll(/^([A-Za-z0-9_]+): \{\n\s+DisplayName: (.+)$/gm)) {
      if (names[m[1]] === undefined) names[m[1]] = m[2].trim();
    }
  }
  return names;
}
const NAMES = parseNames();

// ---------- 3. 工具 ----------
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

/** 花括号配平截取方法体(自 `签名` 行起) */
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

// ---------- 4. 表达式求值 ----------
const unhandled = new Map(); // expr → count
function resolveExpr(raw, fileConsts) {
  if (raw === undefined || raw === null) return undefined;
  let e = String(raw).trim().replace(/;$/, '').trim();
  if (/^-?\d+(\.\d+)?f?$/.test(e)) return Number(e.replace(/f$/, ''));
  if (fileConsts && fileConsts[e] !== undefined) return fileConsts[e];
  if (e === 'true') return true;
  if (e === 'false') return false;
  const enumM = e.match(/^(ItemRarityID|ItemUseStyleID|TileID|BuffID|ProjectileID|ItemID|WallID|AmmoID)\.([A-Za-z0-9_]+)$/);
  if (enumM) {
    const tbl = { ItemRarityID: RARITY, ItemUseStyleID: ENUMS.useStyle, TileID: ENUMS.tile, BuffID: ENUMS.buff, ProjectileID: ENUMS.proj, ItemID: ENUMS.item, WallID: {}, AmmoID: ENUMS.ammo }[enumM[1]];
    if (tbl && tbl[enumM[2]] !== undefined) return tbl[enumM[2]];
    unhandled.set(e, (unhandled.get(e) ?? 0) + 1);
    return undefined;
  }
  const lastSeg = (q) => q.split('.').pop() ?? q;
  const projT = e.match(/^(?:ModContent\.)?ProjectileType<([A-Za-z0-9_.]+)>\(\)$/);
  if (projT) return { __proj: lastSeg(projT[1]) };
  const itemT = e.match(/^(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)$/);
  if (itemT) return { __item: lastSeg(itemT[1]) };
  const tileT = e.match(/^(?:ModContent\.)?TileType<([A-Za-z0-9_.]+)>\(\)$/);
  if (tileT) return { __tile: lastSeg(tileT[1]) };
  const buffT = e.match(/^(?:ModContent\.)?BuffType<([A-Za-z0-9_.]+)>\(\)$/);
  if (buffT) return { __buff: lastSeg(buffT[1]) };
  const rarityConst = e.match(/^CalamityGlobalItem\.Rarity([A-Za-z]+)BuyPrice$/);
  if (rarityConst) return RARITY_BUY_PRICE[rarityConst[1]];
  const rarityT = e.match(/^(?:ModContent\.)?RarityType<([A-Za-z0-9_.]+)>\(\)$/);
  if (rarityT) return RARITY[rarityT[1].split('.').pop() ?? ''];
  if (e === 'Item.CommonMaxStack') return 9999;   // Item.cs:85(1.4.4 改制)
  const buy = e.match(/^Item\.buyPrice\(([^)]*)\)$/);
  if (buy) {
    const a = { copper: 0, silver: 0, gold: 0, platinum: 0 };
    const pos = [a.copper, a.silver, a.gold, a.platinum];
    buy[1].split(',').forEach((part, i) => {
      const kv = part.split(':');
      if (kv.length === 2) a[kv[0].trim()] = Number(kv[1].trim());
      else if (part.trim() !== '') pos[i] = Number(part.trim());
    });
    return a.copper + a.silver * 100 + a.gold * 10000 + a.platinum * 1000000;
  }
  const sell = e.match(/^Item\.sellPrice\(([^)]*)\)$/);
  if (sell) {
    const a = { copper: 0, silver: 0, gold: 0, platinum: 0 };
    for (const part of sell[1].split(',')) {
      const kv = part.split(':');
      if (kv.length === 2) a[kv[0].trim()] = Number(kv[1].trim());
      else a.copper = Number(part.trim()); // sellPrice(0, 2) 形=按位 copper,silver
    }
    return (a.copper + a.silver * 100 + a.gold * 10000 + a.platinum * 1000000) * 5;
  }
  const add = e.match(/^(.+)\s*\+\s*(.+)$/);
  if (add && !e.includes('?')) {
    const l = resolveExpr(add[1], fileConsts);
    const r = resolveExpr(add[2], fileConsts);
    if (l !== undefined && r !== undefined && typeof l === 'number' && typeof r === 'number') return l + r;
  }
  unhandled.set(e, (unhandled.get(e) ?? 0) + 1);
  return undefined;
}

// ---------- 5. DefaultTo* 助手语义(Terrarria1457 Item.cs 直读终值) ----------
function applyHelper(name, argsRaw, out, itemLog, fileConsts) {
  const args = argsRaw.split(',').map((a) => a.trim()).filter(Boolean);
  const r = (s) => resolveExpr(s, fileConsts);
  if (name === 'DefaultToPlaceableTile') {
    out.func ||= {};
    out.func.useStyle = 1; out.func.useAnimation = 15; out.func.useTime = 10;
    out.func.useTurn = 1; out.func.autoReuse = 1; out.func.consumable = 1;
    const t = r(args[0]);
    if (t && t.__tile) { sidecar[out.key] ||= {}; sidecar[out.key].tileRef = t.__tile; itemLog.push(`tileRef:${t.__tile}`); }
    else if (typeof t === 'number') {
      const key = VANILLA_TILE_KEY[t];
      if (key) out.placeTile = key; else itemLog.push(`tileUnknown:${t}`);
    }
    return true;
  }
  if (name === 'DefaultToPlaceableWall') {
    out.func ||= {};
    out.func.useStyle = 1; out.func.useAnimation = 15; out.func.useTime = 7;
    out.func.useTurn = 1; out.func.autoReuse = 1; out.func.consumable = 1;
    itemLog.push('createWall');   // 引擎墙放置面=GAPS
    return true;
  }
  if (name === 'DefaultToFood') {
    out.func ||= {};
    out.func.useStyle = 2; out.func.useTurn = 1;
    out.func.useAnimation = r(args[5]) ?? 17; out.func.useTime = out.func.useAnimation;
    out.func.consumable = 1;
    const bt = r(args[2]);
    if (typeof bt === 'number') { out.func.buffType = bt; out.func.buffTime = r(args[3]) ?? 0; }
    else if (bt && bt.__buff) itemLog.push(`buffRef:${bt.__buff}`);
    return true;
  }
  if (name === 'DefaultToHealingPotion') {
    out.func ||= {};
    out.func.useStyle = 9; out.func.useTurn = 1;
    out.func.useAnimation = r(args[3]) ?? 17; out.func.useTime = out.func.useAnimation;
    out.func.consumable = 1; out.func.potion = 1;
    out.func.healLife = r(args[2]) ?? 0;
    return true;
  }
  if (name === 'DefaultToTorch') {
    out.func ||= {};
    out.func.useStyle = 1; out.func.useTurn = 1; out.func.useAnimation = 15; out.func.useTime = 10;
    out.func.autoReuse = 1; out.func.consumable = 1; out.func.createTile = 4;   // Torch TileID=4
    return true;
  }
  itemLog.push(`helper:${name}`);
  return false;
}

// 原版 tile sheet→键表(自 src/data/tiles.ts 提取 vanilla.sheet)
function loadVanillaTileKeys() {
  const text = readFileSync(join(ROOT, 'game', 'src', 'data', 'tiles.ts'), 'utf8');
  const map = {};
  for (const m of text.matchAll(/key: '([^']+)'.*?vanilla: \{ sheet: (\d+)/g)) map[Number(m[2])] = m[1];
  return map;
}
const VANILLA_TILE_KEY = loadVanillaTileKeys();

// 文件内命名常量(const/static readonly/表达式属性;SetDefaults 引用如 Item.damage = BaseDamage)
function loadFileConsts(text) {
  const map = {};
  for (const m of text.matchAll(/(?:const|static readonly)\s+(?:int|float|double|short|byte)\s+([A-Za-z0-9_]+)\s*=\s*([0-9.]+)f?\s*;/g)) {
    map[m[1]] = Number(m[2]);
  }
  for (const m of text.matchAll(/(?:int|float)\s+([A-Za-z0-9_]+)\s*(?:=>|=)\s*([0-9.]+)f?\s*;/g)) {
    if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
  }
  return map;
}

// ---------- 6. 逐文件解析 ----------
const itemCsFiles = walkFiles(join(SRC, 'Items'), '.cs').filter((f) => {
  const head = readFileSync(f, 'utf8').slice(0, 2000);
  // 基类宽化(B2 实证:TransformationAccessory/BaseBanner/BaseDye/RogueWeapon/
  //  HeldOnlyItem 等非 ModItem 直基类也是实内容)——只排除明确非物品基类
  const clsM = head.match(/class\s+\w+\s*:\s*([A-Za-z0-9_]+)/);
  if (!clsM) return false;
  if (/(GlobalItem|ModPlayer|ModSystem|ModProjectile|ModTile|ModBuff|ModDust|GlobalProjectile|GlobalTile)/.test(clsM[1])) return false;
  return !/abstract class/.test(head);
});
// 贴图 basename 索引(非 Highlight/Glow 变体)
const pngs = walkFiles(join(SRC, 'Items'), '.png').filter((p) => !/_Highlight|_Glow|_Color|_Alt/i.test(basename(p)));
const pngByBase = new Map();
for (const p of pngs) { const b = basename(p, '.png'); if (!pngByBase.has(b)) pngByBase.set(b, p); }

const stats = { total: 0, emitted: 0, curated: 0, noName: 0, noTexture: 0, unhandledItems: 0 };
const notes = new Map();   // itemLog 注记普查(前缀聚合)
const unhandledFields = new Map();
const sidecar = {};   // key → 延后引用(proj/tile/buff/rogue 等,B2+ 相期回填)
// ★精选权威清单(手批 P7 105 件,content/.curated-items.json 唯一真相源):
//  只有清单内键跳过重写;清单外的既有文件(上次提取输出)每次重发——提取器迭代可刷新。
const BUFF_KEYS = new Set(existsSync(join(OUT, 'content', 'buffs'))
  ? readdirSync(join(OUT, 'content', 'buffs')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : []);
const diskItemKeysBag = new Set(readdirSync(join(OUT, 'content', 'items')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
const PROJ_KEYS = new Set(existsSync(join(OUT, 'content', 'projectiles'))
  ? readdirSync(join(OUT, 'content', 'projectiles')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : []);
const normCuratedBag = new Map(JSON.parse(readFileSync(join(OUT, '.curated-items.json'), 'utf8')).map((k) => [k.replace(/_/g, ''), k]));
function resolveItemKeySafe(cls) {
  const key = pascalToSnake(cls);
  if (diskItemKeysBag.has(key)) return key;
  return normCuratedBag.get(key.replace(/_/g, '')) ?? null;
}
const ENUM_ITEM_ID2 = (() => {
  const map = {};
  try {
    const t2 = readFileSync(join(ROOT, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8');
    for (const m of t2.matchAll(/public const (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+)/g)) {
      if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
    }
  } catch { /* 表缺 */ }
  return map;
})();
let bagLootCount = 0;
const curatedKeys = new Set(
  JSON.parse(readFileSync(join(OUT, '.curated-items.json'), 'utf8')),
);
const curatedNorm = new Set([...curatedKeys].map((k) => k.replace(/_/g, '')));

for (const f of itemCsFiles) {
  const cls = basename(f, '.cs').trim();
  const key = pascalToSnake(cls);
  const itemLog = [];
  if (curatedKeys.has(key) || curatedNorm.has(cls.toLowerCase())) { stats.curated++; continue; }
  stats.total++;
  const text = readFileSync(f, 'utf8');

  const raw = {
    key,
    name: NAMES[cls] ?? cls,
    texture: `textures/items/${key}.png`,
  };
  if (NAMES[cls] === undefined) { stats.noName++; itemLog.push('noName'); }

  // --- SetStaticDefaults:ResearchUnlockCount ---
  const staticBody = extractMethodBody(text, 'public override void SetStaticDefaults()');
  if (staticBody) {
    const rm = staticBody.match(/Item\.ResearchUnlockCount\s*=\s*([^;]+);/);
    if (rm) { const n = resolveExpr(rm[1], loadFileConsts(text)); if (typeof n === 'number') raw.research = n; }
  }

  // --- SetDefaults ---
  const body = extractMethodBody(text, 'public override void SetDefaults()')
    ?? extractMethodBody(text, 'public override void SetDefaults(long type)')
    ?? extractMethodBody(text, 'public override void SetDefaults(Item item)');
  if (body === null) { itemLog.push('noSetDefaults'); }
  else {
    const fileConsts = loadFileConsts(text);
    const fields = {};
    const helperCalls = [];
    for (const line of body.split('\n')) {
      const t = line.trim();
      const hm = t.match(/^Item\.(DefaultTo[A-Za-z]+)\((.*)\);$/);
      if (hm) { helperCalls.push(hm); continue; }
      const chain = t.match(/^Item\.([A-Za-z0-9_]+)\s*=\s*Item\.([A-Za-z0-9_]+)\s*=\s*(.+);$/);
      if (chain) { fields[chain[1]] = chain[3]; fields[chain[2]] = chain[3]; continue; }
      const fm = t.match(/^Item\.([A-Za-z0-9_]+)\s*=\s*(.+);$/);
      if (fm) fields[fm[1]] = fm[2];
    }
    // helpers 先落底值,显式字段后覆写(C# 执行序同构)
    for (const [, name, args] of helperCalls) applyHelper(name, args, raw, itemLog, fileConsts);
    const num = (k) => (fields[k] !== undefined ? resolveExpr(fields[k], fileConsts) : undefined);
    const ref = (k) => {
      if (fields[k] === undefined) return undefined;
      const v = resolveExpr(fields[k], fileConsts);
      return (v !== undefined && typeof v === 'object') ? v : undefined;
    };
    // 顶层
    const value = num('value'); if (value !== undefined) raw.value = value;
    const rare = num('rare'); if (rare !== undefined) raw.rare = rare;
    const ms = num('maxStack'); if (ms !== undefined) raw.maxStack = ms;
    // combat
    const dmg = num('damage'); const kb = num('knockBack');
    const shoot = fields.shoot !== undefined ? resolveExpr(fields.shoot) : undefined;
    const ss = num('shootSpeed'); const mana = num('mana');
    const dc = fields.DamageType !== undefined ? String(fields.DamageType).trim() : undefined;
    const hasCombat = dmg !== undefined || kb !== undefined || shoot !== undefined || ss !== undefined || mana !== undefined || dc !== undefined || fields.noMelee !== undefined || fields.autoReuse !== undefined;
    if (hasCombat) {
      raw.combat = {};
      if (dmg !== undefined) raw.combat.damage = dmg;
      if (kb !== undefined) raw.combat.knockBack = kb;
      if (ss !== undefined) raw.combat.shootSpeed = ss;
      if (mana !== undefined) raw.combat.mana = mana;
      if (typeof shoot === 'number') raw.combat.shoot = shoot;
      else if (shoot && shoot.__proj) { sidecar[key] ||= {}; sidecar[key].shootProj = shoot.__proj; itemLog.push(`projRef:${shoot.__proj}`); }
      if (dc) {
        if (/MeleeNoSpeed|TrueMelee/.test(dc) || /DamageClass\.Melee\b/.test(dc)) { raw.combat.melee = true; if (/TrueMelee|NoSpeed/.test(dc)) itemLog.push(`dc:${dc}`); }
        else if (/Ranged/.test(dc)) raw.combat.ranged = true;
        else if (/Magic/.test(dc)) raw.combat.magic = true;
        else if (/Summon/.test(dc)) raw.combat.summon = true;
        else if (/Rogue/.test(dc)) { sidecar[key] ||= {}; sidecar[key].damageClass = 'rogue'; itemLog.push('dc:rogue'); }
        else itemLog.push(`dc:${dc}`);
      }
      if (fields.noMelee !== undefined) { const v = resolveExpr(fields.noMelee); if (v === true) raw.combat.noMelee = true; }
      if (fields.autoReuse !== undefined) { const v = resolveExpr(fields.autoReuse); if (v === true) raw.combat.autoReuse = true; }
      if (fields.useTime !== undefined) { const v = num('useTime'); if (v !== undefined) raw.combat.useTime = v; }
      if (fields.useAnimation !== undefined) { const v = num('useAnimation'); if (v !== undefined) raw.combat.useAnimation = v; }
    }
    // func
    const useStyle = num('useStyle');
    const pick = num('pickPower'); const axe = num('axe') !== undefined ? Math.round(num('axe') / 5) : undefined;
    const hammer = num('hammerPower');
    const consumable = fields.consumable !== undefined ? resolveExpr(fields.consumable) : undefined;
    const healLife = num('healLife'); const healMana = num('healMana');
    const buffType = fields.buffType !== undefined ? resolveExpr(fields.buffType) : undefined;
    const buffTime = num('buffTime');
    const ammo = fields.ammo !== undefined ? resolveExpr(fields.ammo) : undefined;
    const useAmmo = fields.useAmmo !== undefined ? resolveExpr(fields.useAmmo) : undefined;
    const hasFunc = useStyle !== undefined || pick !== undefined || axe !== undefined || hammer !== undefined || consumable !== undefined || healLife !== undefined || healMana !== undefined || buffType !== undefined || ammo !== undefined || useAmmo !== undefined || fields.useTurn !== undefined || fields.tileBoost !== undefined;
    if (hasFunc) {
      raw.func = {};
      if (useStyle !== undefined) raw.func.useStyle = useStyle;
      if (pick !== undefined) raw.func.pick = pick;
      if (axe !== undefined) raw.func.axe = axe;    // C# axe 单位=木力×5(Item.cs),引擎=木力
      if (hammer !== undefined) raw.func.hammer = hammer;
      if (consumable !== undefined) raw.func.consumable = consumable ? 1 : 0;
      if (healLife !== undefined) raw.func.healLife = healLife;
      if (healMana !== undefined) raw.func.healMana = healMana;
      if (typeof buffType === 'number') { raw.func.buffType = buffType; if (buffTime !== undefined) raw.func.buffTime = buffTime; }
      else if (buffType && buffType.__buff) { sidecar[key] ||= {}; sidecar[key].buffRef = buffType.__buff; itemLog.push(`buffRef:${buffType.__buff}`); }
      if (typeof ammo === 'number') raw.func.ammo = ammo;
      if (typeof useAmmo === 'number') raw.func.useAmmo = useAmmo;
      else if (useAmmo && useAmmo.__item) { itemLog.push(`useAmmoRef:${useAmmo.__item}`); }
      if (fields.useTurn !== undefined) { const v = resolveExpr(fields.useTurn); if (v === true) raw.func.useTurn = 1; }
      if (fields.tileBoost !== undefined) { const v = num('tileBoost'); if (v !== undefined) raw.func.tileBoost = v; }
    }
    // stats(甲/配饰)
    const def = num('defense');
    const acc = fields.accessory !== undefined ? resolveExpr(fields.accessory) : undefined;
    const van = fields.vanity !== undefined ? resolveExpr(fields.vanity) : undefined;
    const head = num('headSlot'); const bodyS = num('bodySlot'); const legs = num('legSlot');
    if (def !== undefined || acc !== undefined || van !== undefined || head !== undefined || bodyS !== undefined || legs !== undefined) {
      raw.stats = {};
      if (def !== undefined) raw.stats.def = def;
      if (acc === true) raw.stats.acc = 1;
      if (van === true) raw.stats.van = 1;
      if (head !== undefined) raw.stats.s = 'h';
      else if (bodyS !== undefined) raw.stats.s = 'b';
      else if (legs !== undefined) raw.stats.s = 'l';
    }
    // ★CalPlayer 基建(六十六刀):UpdateEquip/UpdateAccessory 数值形解析——
    //  lifeRegen += N → stats.life(hpPerSec 语义);GetDamage<X>() += v →
    //  stats.dmgMelee/Ranged/Magic(引擎 dmgX=加法 +0.05 形);crit/move/endurance 同构。
    //  常量名解引用=文件头 `const <int|float> NAME = value;`。加法基形(Player.cs:2386)。
    {
      const ueIdx = text.indexOf('public override void UpdateEquip');
      const uaIdx = text.indexOf('public override void UpdateAccessory');
      const at = ueIdx >= 0 && (uaIdx < 0 || ueIdx < uaIdx) ? ueIdx : uaIdx;
      if (at >= 0) {
        const uo = text.indexOf('{', at);
        let ud = 0, ue = -1;
        for (let i6 = uo; i6 < text.length; i6++) {
          if (text[i6] === '{') ud++;
          else if (text[i6] === '}') { ud--; if (ud === 0) { ue = i6; break; } }
        }
        if (ue > 0) {
          const ubody = text.slice(uo + 1, ue);
          const consts = new Map();
          for (const cm of text.matchAll(/\bconst\s+(?:int|float|double)\s+([A-Za-z0-9_]+)\s*=\s*([0-9.]+f?)\s*;/g)) {
            consts.set(cm[1], Number(cm[2].replace(/f$/, '')));
          }
          const val = (raw2) => {
            if (raw2 === undefined) return undefined;
            const v = Number(String(raw2).replace(/f$/, ''));
            return Number.isFinite(v) ? v : consts.get(String(raw2).trim());
          };
          const statFace = raw.stats ?? (raw.stats = {});
          const acc2 = (re, field) => {
            const m = ubody.match(re);
            if (m) {
              const v = val(m[1]);
              if (v !== undefined) statFace[field] = v;
            }
          };
          acc2(/lifeRegen\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'life');
          acc2(/GetDamage<\s*MeleeDamageClass\s*>\(\)\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'dmgMelee');
          acc2(/GetDamage<\s*RangedDamageClass\s*>\(\)\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'dmgRanged');
          acc2(/GetDamage<\s*MagicDamageClass\s*>\(\)\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'dmgMagic');
          acc2(/GetDamage<\s*(?:UniversalDamageClass|GenericDamageClass)\s*>\(\)\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'dmgAll');
          acc2(/meleeCrit\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'critMelee');
          acc2(/rangedCrit\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'critRanged');
          acc2(/magicCrit\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'critMagic');
          acc2(/moveSpeed\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'moveMult');
          acc2(/endurance\s*\+=\s*([A-Za-z0-9_.]+f?)/, 'endurance');
        }
      }
    }
    // 放置(显式 createTile;helper 版已处理)
    const ct = fields.createTile !== undefined ? resolveExpr(fields.createTile, fileConsts) : undefined;
    if (typeof ct === 'number') {
      const tk = VANILLA_TILE_KEY[ct];
      if (tk) raw.placeTile = tk; else itemLog.push(`tileUnknown:${ct}`);
    } else if (ct && ct.__tile) { sidecar[key] ||= {}; sidecar[key].tileRef = ct.__tile; itemLog.push(`tileRef:${ct.__tile}`); }
  }

  // 空面项(只有 name/texture)→ 仍发(材料/掉落物常只声明 value/rare)
  if (itemLog.length) {
    stats.unhandledItems++;
    for (const n of itemLog) notes.set(n.split(':')[0], (notes.get(n.split(':')[0]) ?? 0) + 1);
  }

  // —— OnHitNPC → combat.hitBuff(B6 数据面):AddBuff(ModContent.BuffType<X>(), T) ——
  // chance=紧邻 Main.rand.Next(n)==0 掷门(1/n);buff 键=content/buffs 声明面;T ticks→秒/60
  {
    const ohIdx = text.indexOf('public override void OnHitNPC');
    if (ohIdx >= 0) {
      const ohOpen = text.indexOf('{', ohIdx);
      let d2 = 0, ohEnd = -1;
      for (let i2 = ohOpen; i2 < text.length; i2++) {
        if (text[i2] === '{') d2++;
        else if (text[i2] === '}') { d2--; if (d2 === 0) { ohEnd = i2; break; } }
      }
      if (ohEnd > 0) {
        const ohBody = text.slice(ohOpen + 1, ohEnd);
        const bm = ohBody.match(/AddBuff\(\s*(?:ModContent\.)?BuffType<([A-Za-z0-9_.]+)>\(\)\s*,\s*([0-9]+)\s*(?:,|\))/);
        if (bm) {
          const buffKey = pascalToSnake(bm[1].split('.').pop());
          const gm = ohBody.match(/Main\.rand\.Next\((\d+)\)\s*==\s*0/);
          const chance = gm ? 1 / Number(gm[1]) : undefined;
          raw.combat = raw.combat ?? {};
          raw.combat.hitBuff = { buff: buffKey, duration: Number(bm[2]) / 60, ...(chance !== undefined && chance < 1 ? { chance } : {}) };
          if (!BUFF_KEYS.has(buffKey)) (raw.combat.hitBuff)._unresolved = buffKey;
        }
        // —— hitProj 数据面(B6):NewProjectile(source, target.Center, Vector2.Zero,
        //    ProjectileType<X>(), dmg, …) 形——命中点静置生成(爆裂/召唤系近战武器);
        //    dmg 仅收 Item.damage(='item'=武器基伤)与数字面;其余表达式保守跳过 ——
        const npRe = /NewProjectile\(/g;
        let nm2;
        while ((nm2 = npRe.exec(ohBody)) !== null) {
          let dep = 0, npEnd = -1;
          for (let i5 = nm2.index + 'NewProjectile'.length; i5 < ohBody.length; i5++) {
            if (ohBody[i5] === '(') dep++;
            else if (ohBody[i5] === ')') { dep--; if (dep === 0) { npEnd = i5; break; } }
          }
          if (npEnd < 0) break;
          npRe.lastIndex = npEnd + 1;
          const npArg = ohBody.slice(nm2.index + 'NewProjectile('.length, npEnd).trim();
          const hm = npArg.match(/^\s*(?:\w+(?:\.\w+)*\(\)|source)\s*,\s*\w+(?:\.\w+)*\.Center\s*,\s*Vector2\.Zero\s*,\s*(?:ModContent\.)?ProjectileType<([A-Za-z0-9_.]+)>\(\)\s*,\s*(Item\.damage|\d+)\s*,/);
          if (hm && raw.combat?.hitProj === undefined) {
            const projKey = pascalToSnake(hm[1].split('.').pop());
            raw.combat = raw.combat ?? {};
            raw.combat.hitProj = { proj: projKey, dmg: hm[2] === 'Item.damage' ? 'item' : Number(hm[2]) };
            if (!PROJ_KEYS.has(projKey)) (raw.combat.hitProj)._unresolved = projKey;
          }
        }
      }
    }
  }

  // —— ModifyItemLoot → func.bagLoot(B6 宝藏袋):CalamityStyle(AllOptionsAtOnce)+Common+NVEQ ——
  {
    const li = text.indexOf('public override void ModifyItemLoot');
    if (li >= 0) {
      const lOpen = text.indexOf('{', li);
      let d3 = 0, lEnd = -1;
      for (let i3 = lOpen; i3 < text.length; i3++) {
        if (text[i3] === '{') d3++;
        else if (text[i3] === '}') { d3--; if (d3 === 0) { lEnd = i3; break; } }
      }
      if (lEnd > 0) {
        const lBody = text.slice(lOpen + 1, lEnd);
        const loot = [];
        const push = (item, denom, min, max) => {
          if (item === null || item === undefined) return;
          const rec = { item };
          if (denom && denom > 1) rec.chance = 1 / denom;
          if ((min ?? 1) !== 1 || (max ?? 1) !== 1) { rec.min = min ?? 1; rec.max = max ?? min ?? 1; }
          loot.push(rec);
        };
        // 逐调用平衡括号走(npcLoot 同式;bag 用 itemLoot.Add)
        let idx3 = 0;
        for (;;) {
          const at = lBody.indexOf('itemLoot.Add(', idx3);
          if (at < 0) break;
          let dep = 0, end3 = -1;
          for (let i4 = at + 'itemLoot.Add'.length; i4 < lBody.length; i4++) {
            if (lBody[i4] === '(') dep++;
            else if (lBody[i4] === ')') { dep--; if (dep === 0) { end3 = i4; break; } }
          }
          if (end3 < 0) break;
          const arg = lBody.slice(at + 'itemLoot.Add('.length, end3).trim();
          idx3 = end3 + 1;
          const cal = arg.match(/^DropHelper\.CalamityStyle\([^,]+,\s*(?:true|false)\s*,\s*new int\[\]([\s\S]*?)\}\)\s*$/) 
            || arg.match(/^DropHelper\.CalamityStyle\([^,]+,\s*new int\[\]([\s\S]*?)\}\)\s*$/);
          const nveq = arg.match(/^DropHelper\.NormalVsExpertQuantity\(\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
          const common = arg.match(/^ItemDropRule\.Common\(\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?)?\)\s*$/);
          const simple = arg.match(/^(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*(?:,\s*(\d+))?\s*$/);
          const oneOf = arg.match(/^ItemDropRule\.OneFromOptions(?:WithLuckDelta)?\(\s*(\d+)\s*,\s*([\s\S]*)\)\s*$/);
          const coins = arg.match(/^ItemDropRule\.CoinsBasedOnNPCValue\(\s*(?:ModContent\.)?NPCType<([A-Za-z0-9_.]+)>\(\)\s*\)\s*$/);
          if (cal) {
            // CalamityStyle(1/n, ids[]) → 每项独立 1/n(AllOptionsAtOnce;保底=引擎侧)
            const rate = arg.match(/^DropHelper\.CalamityStyle\(\s*(?:DropHelper\.[A-Za-z]+|new\([^)]*\))\s*\(?\s*(\d+)\s*,\s*(\d+)/);
            const denom = rate ? Number(rate[2]) : 5;
            const idRe = /(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)|ItemID\.([A-Za-z0-9_]+)/g;
            let m5;
            while ((m5 = idRe.exec(cal[1])) !== null) {
              const key = m5[1] ? resolveItemKeySafe(m5[1].split('.').pop()) : (ENUM_ITEM_ID2[m5[2]] ?? null);
              push(key, denom, 1, 1);
            }
          } else if (nveq) {
            push(resolveItemKeySafe(nveq[1].split('.').pop()), Number(nveq[2]), Number(nveq[3]), Number(nveq[4]));
          } else if (common) {
            push(resolveItemKeySafe(common[1].split('.').pop()), common[2] ? Number(common[2]) : 1, common[3] ? Number(common[3]) : 1, common[4] ? Number(common[4]) : (common[3] ? Number(common[3]) : 1));
          } else if (oneOf) {
            const idRe = /(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)|ItemID\.([A-Za-z0-9_]+)/g;
            let m6;
            while ((m6 = idRe.exec(oneOf[2])) !== null) {
              const key = m6[1] ? resolveItemKeySafe(m6[1].split('.').pop()) : (ENUM_ITEM_ID2[m6[2]] ?? null);
              push(key, Number(oneOf[1]), 1, 1);
            }
          } else if (coins) {
            loot.push({ coins: pascalToSnake(coins[1].split('.').pop()) });
          } else if (simple) {
            push(resolveItemKeySafe(simple[1].split('.').pop()), simple[2] ? Number(simple[2]) : 1, 1, 1);
          }
        }
        if (loot.length) {
          raw.func = raw.func ?? {};
          raw.func.bagLoot = loot;
          bagLootCount += loot.length;
        }
      }
    }
  }

  // 贴图(灾厄仓存在错名非 PNG 文件——复制前魔数校验,非 PNG 视同缺贴图)
  const png = pngByBase.get(cls);
  if (!png) { stats.noTexture++; delete raw.texture; }
  else if (readFileSync(png).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) === false) {
    stats.noTexture++; delete raw.texture; itemLog.push('nonPngTexture');
  }

  if (WRITE) {
    writeFileSync(join(OUT, 'content', 'items', `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
    if (png) {
      mkdirSync(join(OUT, 'textures', 'items'), { recursive: true });
      copyFileSync(png, join(OUT, 'textures', 'items', `${key}.png`));
    }
  }
  stats.emitted++;
}

// ---------- 7. 报告 ----------
const report = {
  ...stats,
  concreteCs: itemCsFiles.length,
  curatedKeys: [...curatedKeys].length,
  unhandledExpr: Object.fromEntries([...unhandled.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)),
  notes: Object.fromEntries([...notes.entries()].sort((a, b) => b[1] - a[1])),
  sidecarCount: Object.keys(sidecar).length,
  bagLootEntries: bagLootCount,
};
if (WRITE) {
  writeFileSync(join(OUT, 'items-extract-report.json'), JSON.stringify({
    stats: report,
    sidecar,
  }, null, 2));
}
console.log(JSON.stringify(report, null, 2));
