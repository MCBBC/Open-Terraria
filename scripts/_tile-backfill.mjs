#!/usr/bin/env node
// 一次性生产脚本(2026-10-12):灾厄 golden-oracle unmatched 114 种 tile 内容回填。
// 产出 mods/calamity/content/tiles/<key>.json + mods/calamity/textures/tiles/<key>.png。
//
// 数据权威(先定谳再动刀):
//   · 清单   = mods/calamity/golden-oracle/oracle.json `unmatched`(name=C# 类名,n=实跑格数)
//   · 几何/旗/色/掉落 = CalamityModPublic/Tiles/**.cs(SetStaticDefaults/SetupStatic 体;
//     基类链回溯:GlowMaskTile/PirateCrateExplosive 等钩族体在基类)——读不到的字段宁缺勿猜
//   · 贴图   = CalamityModPublic/Tiles/**.png 字节拷贝(与既有 689 张同源惯例,
//     sulphurous_sand.png md5=repo 原图已证);缺 PNG 回退 /tmp/calamity-unpack rawimg
//     ([i32 ver][i32 w][i32 h][RGBA] 行主序,AerialiteBrick 逐字节验证)→ 最小 PNG 编码
//   · 键名   = pascalToSnake(C# 类名);例外=gen pass 逐字引用键(gen-crag.ts:416-422
//     crag_stalactite/stalagmite_{giant,large,small}_N / lava_lily_N——带数字前下划线,
//     与正名 snake 差异=gen-crag 引用面,键必须与其逐字相等否则 TID[k]??-1 恒失明)。
//     gen-crag.ts:1268 'vernals_soil' 与 C# 正名(VernalSoil→vernal_soil)拼写差异=该
//     文件内部笔误,消费面仅 Roxcalibur 回避臂(-1 时优雅降级),按正名发键,报告备注。
//
// 消费面(写文件前已核对):
//   · src/mods/plan.ts parseTile:key 正则 /^[a-z][a-z0-9_]{0,47}$/
//   · src/mods/register.ts:dropItem 必须能解析到已注册 mod 物品键(解析失败整 mod 拒载)
//     → 本脚本只发「C# 有明确掉落声明且 content/items/<key>.json 存在」的 dropItem
//   · src/mods/assets.ts buildModTileMeta:grid=[w*16,h*16],cols/rows 由位图+styles 推
//   · 渲染 src/render/VanillaTiler.ts mod 直取支:vframe(0,0) 起 16px 切片
//
// 用法: node scripts/_tile-backfill.mjs [--write]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = dirname(HERE);
const ROOT = dirname(GAME_ROOT);                       // SandboxWorld/
const SRC = join(ROOT, 'CalamityModPublic');
const OUT = join(GAME_ROOT, 'mods', 'calamity');
const UNPACK = '/tmp/calamity-unpack';
const WRITE = process.argv.includes('--write');

// ---------- 键名 ----------
const pascalToSnake = (s) => s
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/\s+/g, '')
  .toLowerCase();

/** gen pass 逐字引用键覆盖表(证据=mods/calamity/src/gen-crag.ts:416-422 amb() 调用;
 *  其余 114-18 键与 pascalToSnake 逐字吻合,已对 gen-abyss FOOT 表/gen-sea/gen-crag 全量
 *  字面普查核对——见脚本输出 keyAudit)。 */
const KEY_OVERRIDES = new Map();
for (const size of ['giant', 'large', 'small']) {
  for (const kind of ['stalactite', 'stalagmite']) {
    for (const n of [1, 2, 3]) {
      const cls = `Crag${kind[0].toUpperCase()}${kind.slice(1)}${size[0].toUpperCase()}${size.slice(1)}${n}`;
      KEY_OVERRIDES.set(cls, `crag_${kind}_${size}_${n}`);
    }
  }
}
for (const n of [1, 2, 3, 4, 5, 6]) KEY_OVERRIDES.set(`LavaLily${n}`, `lava_lily_${n}`);
const keyOf = (cls) => KEY_OVERRIDES.get(cls) ?? pascalToSnake(cls);

// ---------- 通用文件遍历 ----------
function walkFiles(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, ext, out);
    else if (name.toLowerCase().endsWith(ext)) out.push(p);
  }
  return out;
}
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

// ---------- C# 类索引(Tiles 全域;多类一文件+文件名≠类名双容错) ----------
const csFiles = walkFiles(join(SRC, 'Tiles'), '.cs');
const classIndex = new Map();   // className -> { file, bases: string[], pos }
for (const f of csFiles) {
  const text = readFileSync(f, 'utf8');
  // C# 12 空体分号形(: Base;继承零覆写,如 AbyssGiantKelp2 : AbyssGiantKelp1;)与常规花括号形双容错
  for (const m of text.matchAll(/\bclass\s+(\w+)\s*(?::\s*([\w.\s,<>]+?))?[\s{;]*?[\{;]/g)) {
    const name = m[1];
    const bases = (m[2] ?? '').split(',').map((x) => x.trim().split('.').pop()).filter(Boolean);
    if (!classIndex.has(name)) classIndex.set(name, { file: f, bases, pos: m.index });
  }
}

/** 花括号配平取体(from: 方法头起点);表达式体(=> ...;)兜底 */
function methodBody(text, headerIdx) {
  if (headerIdx < 0) return null;
  const probe = text.slice(headerIdx, headerIdx + 700);
  const arrow = probe.indexOf('=>');
  const open0 = probe.indexOf('{');
  if (arrow >= 0 && (open0 < 0 || arrow < open0)) {
    const semi = text.indexOf(';', headerIdx + arrow);
    return text.slice(headerIdx + arrow + 2, semi > 0 ? semi : headerIdx + arrow + 680);
  }
  const open = text.indexOf('{', headerIdx);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}
/** 类声明文本(该类起点→下一个同级 class 或文件尾——多类一文件切片) */
function classSlice(text, pos) {
  let end = text.length;
  for (const m of text.slice(pos + 10).matchAll(/\bclass\s+\w+/g)) { end = pos + 10 + m.index; break; }
  return text.slice(pos, end);
}
/** 基类链(child→parent)合并体:SetStaticDefaults + SetupStatic */
function collectChain(clsName) {
  const chain = [];
  let cur = classIndex.get(clsName);
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    const base = cur.bases[0];
    cur = base && base !== 'ModTile' ? classIndex.get(base) : undefined;
  }
  const out = { bodies: [], textureOverride: null, files: chain.map((c) => c.file), fullText: [] };
  for (const c of chain) {
    const raw = readFileSync(c.file, 'utf8');
    const slice = classSlice(raw, c.pos);
    out.fullText.push(slice);
    const clean = stripComments(slice);
    for (const hook of ['SetStaticDefaults', 'SetupStatic']) {
      const idx = clean.indexOf(`public override void ${hook}()`);
      if (idx >= 0) {
        const b = methodBody(clean, idx);
        if (b) out.bodies.push(b);
      }
    }
    if (out.textureOverride === null) {
      const tm = clean.match(/override\s+string\s+Texture\s*=>\s*"([^"]+)"/);
      if (tm) out.textureOverride = tm[1];
    }
  }
  return out;
}

// ---------- 字段提取 ----------
const XNA_COLORS = {
  OrangeRed: '#ff4500', White: '#ffffff', Black: '#000000', Red: '#ff0000', Green: '#008000',
  Blue: '#0000ff', Yellow: '#ffff00', Orange: '#ffa500', Gray: '#808080', DarkGray: '#a9a9a9',
  LightGray: '#d3d3d3', Brown: '#a52a2a', Tan: '#d2b48c', Purple: '#800080', Teal: '#008080',
  Cyan: '#00ffff', Magenta: '#ff00ff', Khaki: '#f0e68c', Olive: '#808000', Gold: '#ffd700',
  DarkRed: '#8b0000', DarkGreen: '#006400', DarkBlue: '#00008b', Pink: '#ffc0cb', Salmon: '#fa8072',
};
function addMapEntryHex(body) {
  const m = body.match(/AddMapEntry\(\s*new\s+Color\(([^)]*)\)/);
  if (m) {
    const args = m[1].split(',').map((x) => x.trim());
    if (args.length >= 3) {
      const f = args.some((a) => a.includes('.'));
      const c = args.slice(0, 3).map((a) => f ? Math.round(parseFloat(a) * 255) : parseInt(a, 10));
      if (c.every((v) => v >= 0 && v <= 255)) return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    }
    return null;
  }
  const named = body.match(/AddMapEntry\(\s*Color\.(\w+)/);
  if (named && XNA_COLORS[named[1]]) return XNA_COLORS[named[1]];
  return null;
}

// ---------- 掉落解析(items 同源;必须命中 content/items 键才发——register fail-fast) ----------
const diskItemKeys = new Set(readdirSync(join(OUT, 'content', 'items')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
const curatedItemKeys = JSON.parse(readFileSync(join(OUT, '.curated-items.json'), 'utf8'));
const normToCurated = new Map(curatedItemKeys.map((k) => [k.replace(/_/g, ''), k]));
function resolveItemKey(cls) {
  const key = pascalToSnake(cls);
  if (diskItemKeys.has(key)) return key;
  return normToCurated.get(key.replace(/_/g, '')) ?? null;
}
const sidecar = JSON.parse(readFileSync(join(OUT, 'items-extract-report.json'), 'utf8')).sidecar ?? {};
const tileDropByClass = new Map();
for (const [itemKey, sc] of Object.entries(sidecar)) {
  if (sc.tileRef !== undefined && !tileDropByClass.has(sc.tileRef)) tileDropByClass.set(sc.tileRef, itemKey);
}
function resolveDrop(cls, fullTextArr) {
  // ① C# 显式声明(RegisterItemDrop/ItemDrop=/GetItemDrops yield)
  for (const t of fullTextArr) {
    const m = t.match(/(?:RegisterItemDrop\s*\(\s*|ItemDrop\s*=\s*)ModContent\.ItemType<([\w.]+)>\(\)/);
    if (m) { const k = resolveItemKey(m[1].split('.').pop()); if (k) return { key: k, src: 'cs-decl' }; }
    const y = t.match(/yield\s+return\s+new\s+Item\((?:ModContent\.)?ItemType<([\w.]+)>\(\)/);
    if (y) { const k = resolveItemKey(y[1].split('.').pop()); if (k) return { key: k, src: 'cs-getitemdrops' }; }
  }
  // ② items sidecar tileRef 反查(与 extract-tiles.mjs 同源)
  const s = tileDropByClass.get(cls);
  if (s && diskItemKeys.has(s)) return { key: s, src: 'sidecar' };
  return null;
}

// ---------- 贴图源 ----------
const repoPngs = walkFiles(join(SRC, 'Tiles'), '.png');
const pngByBase = new Map();
for (const p of repoPngs) {
  const b = basename(p).replace(/\.png$/i, '').toLowerCase();
  // 主图优先:_Highlight/_Glow/_Alt 变体靠后(与 extract-tiles.mjs 过滤面一致)
  const rank = /_highlight|_glow|_alt/i.test(basename(p)) ? 1 : 0;
  if (!pngByBase.has(b) || rank < pngByBase.get(b).rank) pngByBase.set(b, { path: p, rank });
}
const rawimgs = walkFiles(join(UNPACK, 'Tiles'), '.rawimg');
const rawByBase = new Map();
for (const p of rawimgs) rawByBase.set(basename(p).replace(/\.rawimg$/i, '').toLowerCase(), p);

/** 最小 PNG 编码(RGBA8,filter 0,zlib deflate) */
function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
function decodeRawimg(p) {
  const d = readFileSync(p);
  if (d.length < 12) return null;
  const ver = d.readInt32LE(0), w = d.readInt32LE(4), h = d.readInt32LE(8);
  if (ver !== 1 || w <= 0 || h <= 0 || d.length < 12 + w * h * 4) return null;
  return { w, h, rgba: d.subarray(12, 12 + w * h * 4) };
}
function resolveTexture(cls, texOverride, key) {
  // ① repo PNG(字节拷贝=既有 689 张同源)
  const candidates = [];
  if (texOverride) candidates.push(texOverride.replace(/^CalamityMod\//, ''));
  candidates.push(null);   // basename=<cls> 兜底(walk 表)
  for (const c of candidates) {
    let hit = null;
    if (c) {
      const p = join(SRC, c + '.png');
      if (existsSync(p)) hit = p;
      else {
        const b = basename(c).toLowerCase();
        if (pngByBase.has(b)) hit = pngByBase.get(b).path;
      }
    } else {
      const e = pngByBase.get(cls.toLowerCase());
      if (e) hit = e.path;
    }
    if (hit) {
      const head = readFileSync(hit).subarray(0, 4);
      if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { path: hit, kind: 'repo-png' };
    }
  }
  // ② unpack rawimg 回退(最小 PNG 编码)
  const rawName = texOverride ? basename(texOverride) : cls;
  const rp = rawByBase.get(rawName.toLowerCase());
  if (rp) {
    const dec = decodeRawimg(rp);
    if (dec) return { path: rp, kind: 'rawimg', png: encodePng(dec.w, dec.h, dec.rgba), w: dec.w, h: dec.h };
  }
  return null;
}

// ---------- gen pass 引用键普查面(校验用,零消费) ----------
const GEN_EXPECT = {
  hardened_sulphurous_sandstone: true, brimstone_slab: true, sea_prism_crystals: true,
  abyssal_pots: true, sulphurous_column: true, sulphurous_vines: true, viper_vines: true,
  abyss_coral: true, sunken_stalactites: true, sunken_stalagmites: true, fan_coral: true,
  small_brain_coral: true, brain_coral: true, small_sunken_stalagmites: true, sea_anemone: true,
  sulphuric_fossil1: true, sulphuric_fossil2: true, sulphuric_fossil3: true,
  scorched_bone: true, small_sunken_stalactites: true, table_coral: true,
  medium_coral: true, medium_coral2: true, small_wide_coral: true, small_tube_coral: true,
  lava_lily_1: true, lava_lily_2: true, lava_lily_3: true, lava_lily_4: true, lava_lily_5: true, lava_lily_6: true,
  crag_stalactite_giant_1: true, crag_stalactite_giant_2: true, crag_stalactite_giant_3: true,
  crag_stalactite_large_1: true, crag_stalactite_large_2: true, crag_stalactite_large_3: true,
  crag_stalactite_small_1: true, crag_stalactite_small_2: true, crag_stalactite_small_3: true,
  crag_stalagmite_giant_1: true, crag_stalagmite_giant_2: true, crag_stalagmite_giant_3: true,
  crag_stalagmite_large_1: true, crag_stalagmite_large_2: true, crag_stalagmite_large_3: true,
  crag_stalagmite_small_1: true, crag_stalagmite_small_2: true, crag_stalagmite_small_3: true,
  pirate_crate1: true, pirate_crate2: true, pirate_crate3: true, pirate_crate4: true,
  pirate_crate5: true, pirate_crate6: true, bulb_tree1: true, bulb_tree2: true, bulb_tree3: true,
  planty_mush_pile1: true, planty_mush_pile2: true, planty_mush_pile3: true,
  shale_pile1: true, shale_pile2: true, shale_pile3: true,
  gravel_pile1: true, gravel_pile2: true, gravel_pile3: true,
  sulphurous_stalactite1: true, sulphurous_stalactite2: true, sulphurous_stalactite3: true,
  sulphurous_stalactite4: true, sulphurous_stalactite5: true, sulphurous_stalactite6: true,
  sulphurous_stalacmite1: true, sulphurous_stalacmite2: true, sulphurous_stalacmite3: true,
  sulphurous_stalacmite4: true, sulphurous_stalacmite5: true, sulphurous_stalacmite6: true,
  abyss_giant_kelp1: true, abyss_giant_kelp2: true, abyss_giant_kelp3: true, abyss_giant_kelp4: true,
  abyss_vent1: true, abyss_vent2: true, abyss_vent3: true,
  thermal_vent1: true, thermal_vent2: true, thermal_vent3: true,
  steam_geyser1: true, steam_geyser2: true, steam_geyser3: true,
  spider_coral1: true, spider_coral2: true, spider_coral3: true, spider_coral4: true, spider_coral5: true,
  sulphur_pire_coral1: true, sulphur_pire_coral2: true, sulphur_pire_coral3: true,
  sulphur_tube_coral: true, sulphurous_rib1: true, sulphurous_rib2: true, sulphurous_rib3: true,
  sulphurous_rib4: true, sulphurous_rib5: true, coral_pile_large: true, tube_coral: true,
  massive_rare_pearl: true, crags_pylon_broken_tile: true, cinder_blossom_tall_plants: true, small_corals: true,
};
/** gen-abyss.ts FOOT 占格抽查表(手工直读 C# 的既有面;几何=本脚本 C# 直读,交叉验证) */
const FOOT_CHECK = {
  abyss_giant_kelp1: [2, 5], abyss_giant_kelp2: [2, 5], abyss_giant_kelp3: [2, 4], abyss_giant_kelp4: [2, 3],
  bulb_tree1: [3, 3], bulb_tree2: [3, 3], bulb_tree3: [3, 3],
  thermal_vent1: [2, 3], thermal_vent2: [2, 3], thermal_vent3: [2, 3],
  abyss_vent1: [2, 2], abyss_vent2: [2, 2], abyss_vent3: [2, 2],
  pirate_crate1: [2, 2], pirate_crate2: [2, 2], pirate_crate3: [2, 2],
  pirate_crate4: [2, 2], pirate_crate5: [2, 2], pirate_crate6: [2, 2],
  shale_pile1: [3, 2], shale_pile2: [3, 2], shale_pile3: [3, 2],
  gravel_pile1: [3, 2], gravel_pile2: [3, 2], gravel_pile3: [3, 2],
  planty_mush_pile1: [3, 2], planty_mush_pile2: [3, 2], planty_mush_pile3: [3, 2],
  massive_rare_pearl: [2, 1],
  spider_coral1: [2, 2], spider_coral2: [2, 2], spider_coral3: [2, 2], spider_coral4: [2, 2], spider_coral5: [2, 2],
  sulphur_pire_coral1: [3, 3], sulphur_pire_coral2: [3, 3], sulphur_pire_coral3: [3, 3],
  sulphur_tube_coral: [3, 3],
  sulphuric_fossil1: [3, 2], sulphuric_fossil2: [3, 2], sulphuric_fossil3: [3, 2],
  sulphurous_rib1: [1, 4], sulphurous_rib2: [1, 4], sulphurous_rib3: [1, 4], sulphurous_rib4: [1, 4], sulphurous_rib5: [1, 4],
  abyssal_pots: [2, 2],
  sulphurous_stalactite1: [1, 2], sulphurous_stalactite2: [1, 2], sulphurous_stalactite3: [1, 3],
  sulphurous_stalactite4: [1, 3], sulphurous_stalactite5: [1, 4], sulphurous_stalactite6: [1, 4],
  sulphurous_stalacmite1: [1, 2], sulphurous_stalacmite2: [1, 2], sulphurous_stalacmite3: [1, 3],
  sulphurous_stalacmite4: [1, 3], sulphurous_stalacmite5: [1, 4], sulphurous_stalacmite6: [1, 4],
  steam_geyser1: [2, 2], steam_geyser2: [2, 2], steam_geyser3: [2, 2],
  brain_coral: [3, 2], small_brain_coral: [2, 2], fan_coral: [3, 3], tube_coral: [2, 3],
  small_tube_coral: [2, 2], sea_anemone: [2, 2], medium_coral: [2, 2], medium_coral2: [2, 2],
  small_wide_coral: [2, 1], coral_pile_large: [3, 2], table_coral: [3, 2],
  sunken_stalactites: [1, 2], sunken_stalagmites: [1, 2],
  small_sunken_stalactites: [1, 1], small_sunken_stalagmites: [1, 1],
};

// ================================ 主流程 ================================
const oracle = JSON.parse(readFileSync(join(OUT, 'golden-oracle', 'oracle.json'), 'utf8'));
const unmatched = oracle.unmatched;
const existingKeys = new Set(readdirSync(join(OUT, 'content', 'tiles')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));

const outDir = join(OUT, 'content', 'tiles');
const texDir = join(OUT, 'textures', 'tiles');
const emitted = [], skipped = [], footMismatch = [], notInGen = [];
for (const u of unmatched) {
  const cls = u.name;
  const key = keyOf(cls);
  const rec = { cls, key, n: u.n };
  if (existingKeys.has(key)) { skipped.push({ ...rec, why: 'key-exists' }); continue; }
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(key)) { skipped.push({ ...rec, why: 'key-invalid' }); continue; }
  if (!classIndex.has(cls)) { skipped.push({ ...rec, why: 'no-class' }); continue; }

  const chain = collectChain(cls);
  const body = chain.bodies.join('\n');
  if (!body) { skipped.push({ ...rec, why: 'no-static-body' }); continue; }

  // —— 字段(C# 直读;读不到=缺省,宁缺勿猜) ——
  const solid = /Main\.tileSolid\[Type\]\s*=\s*true/.test(body);
  const solidExplicitFalse = /Main\.tileSolid\[Type\]\s*=\s*false/.test(body);
  const decor = /Main\.tileCut\[Type\]\s*=\s*true/.test(body);
  const frameImportant = /Main\.tileFrameImportant\[Type\]\s*=\s*true/.test(body) || /TileObjectData\.addTile\(Type\)/.test(body);
  const hasTOD = /TileObjectData\.newTile/.test(body) || /TileObjectData\.addTile\(Type\)/.test(body);
  const pickM = body.match(/MinPick\s*=\s*(\d+)/);
  const pick = pickM ? Number(pickM[1]) : 0;
  const mapColor = addMapEntryHex(body);
  const drop = resolveDrop(cls, chain.fullText);

  // —— 几何(CopyFrom StyleWxH + Width/Height 覆写;与 extract-tiles.mjs B5c 同式) ——
  //   StyleNxX(TubeCoral.cs:15 2xX=宽度定高可变)=Width=N,高度交给 Height= 覆写
  const styleM = body.match(/CopyFrom\(TileObjectData\.Style(\d+)x(\d+|[A-Z])/);
  let w = styleM ? Number(styleM[1]) : 1;
  let h = styleM ? (/[A-Z]/.test(styleM[2]) ? 1 : Number(styleM[2])) : 1;
  const wm = body.match(/TileObjectData\.newTile\.Width\s*=\s*(\d+)/);
  const hm = body.match(/TileObjectData\.newTile\.Height\s*=\s*(\d+)/);
  if (wm) w = Number(wm[1]);
  if (hm) h = Number(hm[1]);
  const framed = hasTOD && (w > 1 || h > 1 || styleM || /CoordinateHeights/.test(body) || frameImportant);

  // —— 贴图 ——
  const tex = resolveTexture(cls, chain.textureOverride, key);
  if (!tex) { skipped.push({ ...rec, why: 'no-texture', textureOverride: chain.textureOverride }); continue; }
  let tw, th;
  if (tex.kind === 'repo-png') {
    const b = readFileSync(tex.path);
    tw = b.readUInt32BE(16); th = b.readUInt32BE(20);
  } else { tw = tex.w; th = tex.h; }

  // —— styles(与 extract-tiles.mjs 各支同式:位图反推) ——
  const horizontal = /StyleHorizontal\s*=\s*true/.test(body);
  let styles = 1;
  if (framed) styles = Math.max(1, Math.floor((horizontal ? tw : th) / (horizontal ? w * 16 : h * 16)));
  else if (frameImportant) styles = Math.max(1, Math.floor(th / 16));

  // —— 组包(schema 与既有 content/tiles 逐字段同构) ——
  const raw = framed
    ? { key, framed: true, w, h, solid, decor, pick, frame: 'style', frameWidth: 16, frameHeight: 16, styles, texture: `textures/tiles/${key}.png` }
    : { key, solid, decor, pick, frame: 'style', frameWidth: 16, frameHeight: 16, styles, texture: `textures/tiles/${key}.png` };
  if (mapColor) raw.mapColor = mapColor;
  if (drop) raw.dropItem = drop.key;

  // —— 校验/记录 ——
  rec.geo = framed ? `${w}x${h}` : '1x1';
  rec.solid = solid || undefined; rec.decor = decor || undefined;
  rec.pick = pick || undefined; rec.styles = styles;
  rec.mapColor = mapColor; rec.dropItem = drop ? `${drop.key}(${drop.src})` : undefined;
  rec.tex = tex.kind === 'repo-png' ? `${tex.path.replace(SRC + '/', '')} ${tw}x${th}` : `rawimg ${tw}x${th}`;
  if (framed && FOOT_CHECK[key] && (FOOT_CHECK[key][0] !== w || FOOT_CHECK[key][1] !== h)) {
    footMismatch.push({ key, cs: `${w}x${h}`, foot: FOOT_CHECK[key].join('x') });
  }
  if (!GEN_EXPECT[key]) notInGen.push(key);

  if (WRITE) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
    mkdirSync(texDir, { recursive: true });
    if (tex.kind === 'repo-png') copyFileSync(tex.path, join(texDir, `${key}.png`));
    else writeFileSync(join(texDir, `${key}.png`), tex.png);
  }
  emitted.push(rec);
}

console.log(JSON.stringify({
  mode: WRITE ? 'WRITE' : 'dry-run',
  emitted: emitted.length,
  skipped: skipped,
  footMismatch,
  notInGen: notInGen.length ? { count: notInGen.length, keys: notInGen } : [],
  emittedList: emitted,
}, null, 1));
