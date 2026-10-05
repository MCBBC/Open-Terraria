#!/usr/bin/env node
// 灾厄全量移植 B5a:tiles 机械提取器(核心族:矿石/锭块/直声明实心块)。
// 源=CalamityModPublic/Tiles(ModTile SetStaticDefaults + FurnitureCommon SetUp* 助手);
// 目标=game/mods/calamity/content/tiles/*.json + textures/tiles/*.png(ModTileContent)。
// ★B5a 范围= SetUpOre / SetUpBar / RegisterItemDrop+tileSolid 直声明(可挖/可放/图鉴色)。
//   家具族(SetUpChair/Chest/Bed/... TileObjectData 多格几何)=B5b 保守跳过。
// 站点类(CosmicAnvil 等)亦 B5b——recipes 的 modTile 跳过面等 B5b 解锁。
// 用法:node tools/extract-calamity/extract-tiles.mjs [--write]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'CalamityModPublic');
const OUT = join(ROOT, 'game', 'mods', 'calamity');
const WRITE = process.argv.includes('--write');

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

// ★B5b:配方引用的站点类集合(Items 源码 AddTile<Generic> 全集)——只对这些类做
// 多格站点提取(其余 TileObjectData 家具仍跳过)
const stationClasses = new Set();
{
  const itemCs = walkFiles(join(SRC, 'Items'), '.cs');
  for (const f of itemCs) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/AddTile<([A-Za-z0-9_.]+)>\(\)/g)) {
      stationClasses.add(m[1].split('.').pop());
    }
  }
}

const TILE_ID_NUM = (() => {
  const map = {};
  try {
    const t2 = readFileSync(join(ROOT, 'Terarria1457', 'Terraria.ID', 'TileID.cs'), 'utf8');
    for (const m of t2.matchAll(/public const (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+)/g)) {
      if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
    }
  } catch { /* 表缺 */ }
  return map;
})();
const NumericTileId = (name) => TILE_ID_NUM[name];

// 项目内物品键别名(提取键→手批键;与 extract-recipes resolveItemKey 同式)
const diskItemKeys = new Set(readdirSync(join(OUT, 'content', 'items')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
const curatedItemKeys = JSON.parse(readFileSync(join(OUT, '.curated-items.json'), 'utf8'));
const normToCurated = new Map(curatedItemKeys.map((k) => [k.replace(/_/g, ''), k]));
function resolveItemKey(cls) {
  const key = pascalToSnake(cls);
  if (diskItemKeys.has(key)) return key;
  return normToCurated.get(key.replace(/_/g, '')) ?? null;
}

// 色→hex(Color(r, g, b) 字面)
function colorHex(arg) {
  const m = arg.match(/new Color\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return null;
  const h = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

const tileDir = join(SRC, 'Tiles');
const csFiles = walkFiles(tileDir, '.cs').filter((f) => {
  const head = readFileSync(f, 'utf8').slice(0, 2500);
  const clsM = head.match(/class\s+\w+\s*:\s*([A-Za-z0-9_]+)/);
  if (!clsM) return false;
  if (/(GlobalTile|ModSystem|ModPlayer|ModProjectile|ModBuff|ModDust|ModWater|Plants|ModTree)/.test(clsM[1])) return false;
  return !/abstract class/.test(head);
});
const pngs = walkFiles(tileDir, '.png').filter((p) => !/_Highlight|_Glow|_Alt/i.test(basename(p)));
const pngByBase = new Map();
for (const p of pngs) { const b = basename(p, '.png'); if (!pngByBase.has(b)) pngByBase.set(b, p); }

// items 提取 sidecar 的 tileRef 反查:tile 类名 → 掉落物品键(tML 缺省掉落=放置物品)
const tileDropByClass = new Map();
const tileDropByPrefix = [];   // 前缀族反查(实证:AltarOfTheAccursedItem 放 SCalAltarLarge,配方站点=SCalAltar)
{
  const reportPath = join(OUT, 'items-extract-report.json');
  if (existsSync(reportPath)) {
    const sidecar = JSON.parse(readFileSync(reportPath, 'utf8')).sidecar ?? {};
    for (const [itemKey, sc] of Object.entries(sidecar)) {
      if (sc.tileRef === undefined) continue;
      tileDropByClass.set(sc.tileRef, itemKey);
      tileDropByPrefix.push([sc.tileRef, itemKey]);
    }
    tileDropByPrefix.sort((a, b) => a[0].length - b[0].length);   // 最短前缀优先=最具体物品
  }
}
function resolveTileDrop(cls) {
  const exact = tileDropByClass.get(cls) ?? tileDropByClass.get(cls.replace(/\s+/g, ''));
  if (exact) return exact;
  for (const [ref, itemKey] of tileDropByPrefix) {
    if (ref.startsWith(cls) || cls.startsWith(ref)) return itemKey;
  }
  return null;
}
const stats = { total: 0, emitted: 0, ore: 0, bar: 0, direct: 0, furniture: 0, station: 0, skipFurniture: 0, noTexture: 0, noDrop: 0, curated: 0, placeTileWired: 0 };
const emittedTileKeys = new Set();
const skips = new Map();
const outDir = join(OUT, 'content', 'tiles');
const texDir = join(OUT, 'textures', 'tiles');
// 手批 tile=0(.curated-tiles.json 空表,结构位)
const curatedTileKeys = new Set(existsSync(join(OUT, '.curated-tiles.json'))
  ? JSON.parse(readFileSync(join(OUT, '.curated-tiles.json'), 'utf8'))
  : []);

for (const f of csFiles) {
  const cls = basename(f, '.cs').trim();
  const key = pascalToSnake(cls);
  if (curatedTileKeys.has(key)) { stats.curated++; continue; }
  stats.total++;
  const text = readFileSync(f, 'utf8');
  // SetStaticDefaults 体(SetUp* 助手都在此)
  const idx = text.indexOf('public override void SetStaticDefaults()');
  const body = (() => {
    if (idx < 0) return null;
    const open = text.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open + 1, i); }
    }
    return null;
  })();
  if (body === null) { stats.skipFurniture++; skips.set('noStatic', (skips.get('noStatic') ?? 0) + 1); continue; }

  // 家具族=TileObjectData 直接newTile/CopyFrom 非平凡几何 → B5b(粗判:助手名表)
  const furnitureRe = /this\.SetUp(Bathtub|Bed|Bookcase|Candelabra|Candle|Chair|Chandelier|Chest|Clock|DoorClosed|DoorOpen|Dresser|Furnace|Anvil|Lamp|Lantern|Piano|Platform|Sink|Table|Table2x1|Toilet|Torch|Workbench|WaterFaucet|WineGlass|Armchair|Barstool|Bench|Bowl|ClockPendulum|Painting\d+x\d|Pillar|Trampoline|Wrench|CookingPot|Cauldron|Loom|Keg|BoneWelder|FleshCloningVat|GlassKiln|HellForge|IceMachine|LivingLoom|SkyMill|SlimeExtractor|StaticButcherKnife|Teapot|WaterFilter)/;
  const isStation = stationClasses.has(cls);
  if (!isStation && furnitureRe.test(body)) { stats.skipFurniture++; skips.set('furniture', (skips.get('furniture') ?? 0) + 1); continue; }

  let drop; let mapColor; let kind = null;
  let rawEmittedOverride = null;   // B5c 泛家具支的整包覆写(几何/贴图/样式)
  // ★B5a 定谳:掉落=items sidecar tileRef 反查(灾厄矿石不在 tile 声明 ItemDrop——
  //  tML 缺省掉落=放置它的物品;setUpBar 显式 drop 优先)
  const dropItemFromSidecar = resolveTileDrop(cls);
  let solid = true;
  // ★B5b 站点支:多格 framed(几何=Style 名 WxH 解析;直设 Width/Height 覆写)
  if (isStation) {
    const styleM = body.match(/CopyFrom\(TileObjectData\.Style(\d+)x(\d+)\)/);
    let w = styleM ? Number(styleM[1]) : 1;
    let h = styleM ? Number(styleM[2]) : 1;
    const wm = body.match(/TileObjectData\.newTile\.Width\s*=\s*(\d+)/);
    const hm = body.match(/TileObjectData\.newTile\.Height\s*=\s*(\d+)/);
    if (wm) w = Number(wm[1]);
    if (hm) h = Number(hm[1]);
    const itemDropM = body.match(/(?:RegisterItemDrop|ItemDrop\s*=)\s*(?:ModContent\.ItemType<([A-Za-z0-9_.]+)>\(\)|(\d+))/);
    drop = itemDropM
      ? (itemDropM[1] ? resolveItemKey(itemDropM[1].split('.').pop()) : Number(itemDropM[2]))
      : (dropItemFromSidecar ?? null);
    if (drop === null || drop === undefined) {
      stats.skipFurniture++; skips.set('dropMissing', (skips.get('dropMissing') ?? 0) + 1); continue;
    }
    const me = body.match(/AddMapEntry\(\s*new Color\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (me) mapColor = `#${[me[1], me[2], me[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    const png = pngByBase.get(cls);
    let hasPng = png && readFileSync(png).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (!hasPng) stats.noTexture++;
    // styles:StyleHorizontal=横向槽(贴图宽÷格宽);竖向=高÷格高
    const horizontal = /StyleHorizontal\s*=\s*true/.test(body);
    let styles = 1;
    if (hasPng) {
      const b = readFileSync(png);
      const tw = b.readUInt32BE(16), th = b.readUInt32BE(20);
      styles = Math.max(1, Math.floor((horizontal ? tw : th) / (horizontal ? w * 16 : h * 16)));
    }
    const raw = {
      key,
      framed: true, w, h,
      solid: false, decor: false, pick: 0,
      ...(mapColor ? { mapColor } : {}),
      frame: 'style',
      frameWidth: 16, frameHeight: 18,
      styles,
      texture: `textures/tiles/${key}.png`,
    };
    if (typeof drop === 'string') raw.dropItem = drop;
    stats.emitted++;
    stats.station++;
    emittedTileKeys.add(key);
    if (WRITE) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
      if (hasPng) { mkdirSync(texDir, { recursive: true }); copyFileSync(png, join(texDir, `${key}.png`)); }
    }
    continue;
  }
  const barM = body.match(/this\.SetUpBar\(\s*(?:ModContent\.ItemType<([A-Za-z0-9_.]+)>\(\)|(\d+))\s*,\s*new Color\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (barM) {
    kind = 'bar';
    drop = barM[1] ? resolveItemKey(barM[1].split('.').pop()) : Number(barM[2]);
    mapColor = `#${[barM[3], barM[4], barM[5]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  } else if (/TileObjectData\.newTile/.test(body)) {
    // ★B5c 泛家具支:TileObjectData 几何(StyleWxH 名/Width/Height 直设)——
    //  渲染走 drawVanillaCell mod 直取支(16px 切片,与站体同链,真机已证)
    const styleM2 = body.match(/CopyFrom\(TileObjectData\.Style(\d+)x(\d+)\)/);
    let w2 = styleM2 ? Number(styleM2[1]) : 1;
    let h2 = styleM2 ? Number(styleM2[2]) : 1;
    const wm2 = body.match(/TileObjectData\.newTile\.Width\s*=\s*(\d+)/);
    const hm2 = body.match(/TileObjectData\.newTile\.Height\s*=\s*(\d+)/);
    if (wm2) w2 = Number(wm2[1]);
    if (hm2) h2 = Number(hm2[1]);
    const dropM2 = body.match(/(?:RegisterItemDrop|ItemDrop\s*=)\s*(?:ModContent\.ItemType<([A-Za-z0-9_.]+)>\(\)|(\d+))/);
    drop = dropM2
      ? (dropM2[1] ? resolveItemKey(dropM2[1].split('.').pop()) : Number(dropM2[2]))
      : (dropItemFromSidecar ?? null);
    if (drop === null || drop === undefined) {
      stats.skipFurniture++; skips.set('dropMissing', (skips.get('dropMissing') ?? 0) + 1); continue;
    }
    const me2 = body.match(/AddMapEntry\(\s*new Color\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (me2) mapColor = `#${[me2[1], me2[2], me2[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    const horizontal2 = /StyleHorizontal\s*=\s*true/.test(body);
    let styles2 = 1;
    const pngF = pngByBase.get(cls);
    if (pngF && readFileSync(pngF).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
      const b5 = readFileSync(pngF);
      const tw5 = b5.readUInt32BE(16), th5 = b5.readUInt32BE(20);
      styles2 = Math.max(1, Math.floor((horizontal2 ? tw5 : th5) / (horizontal2 ? w2 * 16 : h2 * 16)));
    }
    const raw2 = {
      key,
      framed: true, w: w2, h: h2,
      solid: false, decor: false, pick: 0,
      ...(mapColor ? { mapColor } : {}),
      frame: 'style',
      frameWidth: 16,
      frameHeight: 16,
      styles: styles2,
      texture: `textures/tiles/${key}.png`,
    };
    if (typeof drop === 'string') raw2.dropItem = drop;
    kind = 'furniture';
    mapColor = mapColor; // 保持
    // 复用主流的落盘/贴图段:借用 raw 覆写
    rawEmittedOverride = raw2;
  } else {
    // 直声明族:Main.tileSolid[Type]=true 且无 TileObjectData(矿石/砖块/ slag 族)
    if (!/Main\.tileSolid\[Type\]\s*=\s*true/.test(body)) {
      stats.skipFurniture++; skips.set('other', (skips.get('other') ?? 0) + 1); continue;
    }
    kind = /TileID\.Sets\.Ore\[Type\]\s*=\s*true/.test(body) ? 'ore' : 'direct';
    drop = dropItemFromSidecar ?? null;
  }
  if (drop === null || drop === undefined) {
    stats.skipFurniture++; skips.set('dropMissing', (skips.get('dropMissing') ?? 0) + 1); continue;
  }
  if (mapColor === undefined) {
    const me = body.match(/AddMapEntry\(\s*new Color\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (me) mapColor = `#${[me[1], me[2], me[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  }

  const raw = {
    key,
    solid,
    decor: false,
    pick: 0,
    ...(mapColor ? { mapColor } : {}),
    // ★首帧渲染语义:style 单槽 16×16=贴图左上首帧(静态块;动画条/8 向融合表=B6 渲染相)
    frame: 'style',
    frameWidth: 16,
    frameHeight: 16,
    styles: 1,
    texture: `textures/tiles/${key}.png`,
  };
  if (rawEmittedOverride) Object.assign(raw, rawEmittedOverride);
  // ★B6 AdjTiles 兼用站点(body 通用解析;两支共享)
  {
    const adjM = body.match(/AdjTiles\s*=\s*new int\[\]\s*\{([^}]*)\}/);
    if (adjM) {
      const ids = [];
      for (const part of adjM[1].split(',')) {
        const nm = part.trim().match(/^TileID\.([A-Za-z0-9_]+)$/);
        if (nm && NumericTileId(nm[1]) !== undefined) {
          ids.push(NumericTileId(nm[1]));
        } else if (/^\d+$/.test(part.trim())) {
          ids.push(Number(part.trim()));
        }
      }
      if (ids.length) raw.adjTiles = ids;
    }
  }
  if (typeof drop === 'string') raw.dropItem = drop;
  if (kind === 'ore') stats.ore++; else if (kind === 'bar') stats.bar++; else if (kind === 'furniture') stats.furniture = (stats.furniture ?? 0) + 1; else stats.direct++;

  const png = pngByBase.get(cls);
  let hasPng = false;
  if (png) {
    const head = readFileSync(png).subarray(0, 4);
    if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) hasPng = true;
  }
  if (!hasPng) { stats.noTexture++; continue; }   // ★tile 贴图=硬依赖(icons/烘焙/validate),无图不声明
  emittedTileKeys.add(key);                        // ★信任面=实际落盘键(B4 判例同源:add 必须在闸后)

  if (WRITE) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
    if (hasPng) { mkdirSync(texDir, { recursive: true }); copyFileSync(png, join(texDir, `${key}.png`)); }
  }
  stats.emitted++;
}

// ★placeTile 反向接线:tileRef 指向已落盘 tile 的物品 → placeTile='mod_calamity_<tileKey>'
// (plan 校验 mod_ 前缀全键 ∈ allocation.tiles;B5a 只接矿石/锭/实心块族)
if (WRITE) {
  const reportPath2 = join(OUT, 'items-extract-report.json');
  if (existsSync(reportPath2)) {
    const sidecar2 = JSON.parse(readFileSync(reportPath2, 'utf8')).sidecar ?? {};
    for (const [itemKey, sc] of Object.entries(sidecar2)) {
      if (sc.tileRef === undefined) continue;
      const tileKey = pascalToSnake(sc.tileRef);
      if (!emittedTileKeys.has(tileKey)) continue;
      const itemPath = join(OUT, 'content', 'items', `${itemKey}.json`);
      if (!existsSync(itemPath)) continue;
      const spec = JSON.parse(readFileSync(itemPath, 'utf8'));
      if (spec.placeTile === `mod_calamity_${tileKey}`) continue;
      spec.placeTile = `mod_calamity_${tileKey}`;
      writeFileSync(itemPath, JSON.stringify(spec, null, 2) + '\n');
      stats.placeTileWired++;
    }
  }
}
console.log(JSON.stringify({
  ...stats,
  stationClassesSize: stationClasses.size,
  emittedKeys: [...emittedTileKeys].slice(0, 50),
  topSkips: Object.fromEntries([...skips.entries()].sort((a, b) => b[1] - a[1])),
}, null, 2));
