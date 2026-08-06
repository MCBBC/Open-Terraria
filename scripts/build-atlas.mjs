// 素材管线：解析 Unity .meta 精灵切片 → 拷贝 PNG 到 public/sprites → 生成 atlas.json
// 用法: node scripts/build-atlas.mjs [源Assets目录] [目标目录]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const SRC = process.argv[2] || '../Terraia_Maples/Assets/Sprites';
const DST = process.argv[3] || 'public/sprites';
const RES = process.argv[4] || '../Terraia_Maples/Assets/Resources';

// ---------- .meta 解析 ----------
function parseMeta(text) {
  const guid = (text.match(/^guid: (\w+)/m) || [])[1];
  const sprites = [];
  const blocks = text.split('- serializedVersion: 2\n      name: ').slice(1);
  for (const b of blocks) {
    const name = b.split('\n')[0].trim();
    const rect = b.match(/rect:\n\s+serializedVersion: 2\n\s+x: (-?\d+)\n\s+y: (-?\d+)\n\s+width: (\d+)\n\s+height: (\d+)/);
    if (rect) {
      sprites.push({ name, x: +rect[1], y: +rect[2], w: +rect[3], h: +rect[4] });
    }
  }
  // internalIDToNameTable：fileID(213) → 切片名（RuleTile 的精灵引用靠它解析）
  const idToName = {};
  const idRe = /- first:\n      213: (-?\d+)\n    second: (.+)/g;
  let m;
  while ((m = idRe.exec(text))) idToName[m[1]] = m[2].trim();
  // spriteSheet 精灵块兜底：部分精灵只在这里有 name + internalID
  const sbRe = /^      name: (.+)$\n[\s\S]*?^      internalID: (-?\d+)$/gm;
  while ((m = sbRe.exec(text))) {
    if (!(m[2] in idToName)) idToName[m[2]] = m[1].trim();
  }
  return { guid, sprites, idToName };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------- 主流程 ----------
mkdirSync(DST, { recursive: true });
const atlas = { files: {}, guidToFile: {} };
let totalSprites = 0;

const pngs = walk(SRC).filter((p) => p.endsWith('.png'));
for (const png of pngs) {
  const metaPath = png + '.meta';
  if (!existsSync(metaPath)) continue;
  const { guid, sprites, idToName } = parseMeta(readFileSync(metaPath, 'utf8'));
  const rel = relative(SRC, png);
  const outPath = join(DST, rel);
  mkdirSync(join(outPath, '..'), { recursive: true });
  copyFileSync(png, outPath);
  atlas.files[rel] = { guid, sprites, idToName };
  if (guid) atlas.guidToFile[guid] = rel;
  totalSprites += sprites.length;
  if (sprites.length) console.log(`${rel}: ${sprites.length} sprites`);
}

// ---------- Resources 数据表（物品/药水/配饰/瓦片 .asset YAML）----------
// YAML 双引号字符串里的 \uXXXX 转义需要解码（Unity 对非 ASCII 名字的存储方式）
function yamlUnescape(s) {
  return (s || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseAsset(text) {
  const out = { fields: {} };
  out.name = yamlUnescape((text.match(/m_Name: "?([^"\n]+)"?/) || [])[1]);
  for (const line of text.split('\n')) {
    const m = line.match(/^  (\w+): ?(.*)$/);
    if (m && !['m_Name', 'm_ObjectHideFlags', 'm_EditorClassIdentifier'].includes(m[1])) {
      out.fields[m[1]] = m[2].trim();
    }
  }
  return out;
}

const data = { items: [], tiles: [], potions: [], accessories: [], buffs: [], anims: {} };
if (existsSync(RES)) {
  const assets = walk(RES).filter((p) => p.endsWith('.asset'));
  for (const a of assets) {
    const text = readFileSync(a, 'utf8');
    if (a.includes('/Items/Potions/')) {
      const d = parseAsset(text);
      const iconGuid = (text.match(/icon: \{fileID: \d+, guid: (\w+)/) || [])[1];
      data.potions.push({
        name: d.name, type: d.fields.type, iconGuid,
        buffType: d.fields.buffType ? +d.fields.buffType : null,
        duration: d.fields.duration ? +d.fields.duration : null,
        isHealType: d.fields.isHealType,
      });
    } else if (a.includes('/Items/Accessories/')) {
      const d = parseAsset(text);
      const iconGuid = (text.match(/icon: \{fileID: \d+, guid: (\w+)/) || [])[1];
      data.accessories.push({ name: d.name, type: d.fields.type, iconGuid });
    } else if (a.includes('/Items/')) {
      const d = parseAsset(text);
      const iconGuid = (text.match(/icon: \{fileID: \d+, guid: (\w+)/) || [])[1];
      const placeTile = (text.match(/placeTile: \{fileID: \d+, guid: (\w+)/) || [])[1];
      const funcList = (text.match(/funcList: ?(.*)/) || [])[1];
      data.items.push({
        name: d.name, type: d.fields.type, iconGuid, placeTile, funcList,
        file: relative(RES, a),
      });
    } else if (a.includes('/Tiles/')) {
      const d = parseAsset(text);
      const dropItem = (text.match(/dropItem: \{fileID: \d+, guid: (\w+)/) || [])[1];
      const tile = (text.match(/tile: \{fileID: \d+, guid: (\w+)/) || [])[1];
      data.tiles.push({
        name: d.name, tileGuid: tile, layer: d.fields.layer,
        isDestructible: d.fields.isDestructible, digList: d.fields.digList,
        digTime: d.fields.digTime, dropItemGuid: dropItem, dropCount: d.fields.dropCount,
        file: relative(RES, a),
      });
    }
  }
}

// ---------- Buff 预制体图标（Prefabs/Buff/*.prefab → icon guid）----------
const BUFF_DIR = join(SRC, '..', 'Prefabs', 'Buff');
if (existsSync(BUFF_DIR)) {
  for (const f of readdirSync(BUFF_DIR).filter((x) => x.endsWith('.prefab'))) {
    const text = readFileSync(join(BUFF_DIR, f), 'utf8');
    const name = yamlUnescape((text.match(/m_Name: "?([^"\n]+)"?/) || [])[1]);
    const iconGuid = (text.match(/icon: \{fileID: \d+, guid: (\w+)/) || [])[1];
    data.buffs.push({ name, iconGuid });
  }
}

// ---------- 动画帧序列（Animations/**/*.anim → 按时间排序的精灵帧）----------
const ANIM_DIR = join(SRC, '..', 'Animations');
if (existsSync(ANIM_DIR)) {
  for (const a of walk(ANIM_DIR).filter((p) => p.endsWith('.anim'))) {
    const text = readFileSync(a, 'utf8');
    // 关键帧: time + value{fileID,guid}
    const keys = [];
    const kRe = /- time: ([\d.e-]+)\n\s+value: \{fileID: (-?\d+), guid: (\w+), type: 3\}/g;
    let m;
    while ((m = kRe.exec(text))) keys.push({ t: +m[1], fileID: m[2], guid: m[3] });
    if (!keys.length) continue;
    keys.sort((p, q) => p.t - q.t);
    const frames = keys.map((k) => {
      const file = atlas.guidToFile[k.guid];
      const sprite = file ? atlas.files[file].idToName?.[k.fileID] : null;
      return { file, sprite };
    }).filter((f) => f.sprite);
    if (frames.length) {
      const relAnim = relative(ANIM_DIR, a).replace(/\.anim$/, '');
      data.anims[relAnim] = frames;
    }
  }
}

writeFileSync(join(DST, 'atlas.json'), JSON.stringify(atlas));

// ---------- RuleTile 规则（Assets/Tiles/Rules/*.asset）----------
// 邻居语义（按其脚本惯例）：3=同类 5=异类 6=同类(宽松)，NeighborPositions 为四邻偏移
const RULES_DIR = join(SRC, '..', 'Tiles', 'Rules');
const rules = {};
if (existsSync(RULES_DIR)) {
  for (const f of readdirSync(RULES_DIR).filter((x) => x.endsWith('.asset'))) {
    const text = readFileSync(join(RULES_DIR, f), 'utf8');
    const name = yamlUnescape((text.match(/m_Name: (.+)/) || [])[1]?.trim());
    const resolve = (ref) => {
      const gm = ref.match(/guid: (\w+)/);
      const fm = ref.match(/fileID: (-?\d+)/);
      if (!gm || !fm || fm[1] === '0') return null;
      const file = atlas.guidToFile[gm[1]];
      if (!file) return null;
      const spriteName = atlas.files[file].idToName?.[fm[1]];
      return spriteName ? { file, sprite: spriteName } : null;
    };
    const defaultSprite = resolve(text.match(/m_DefaultSprite: \{[^}]+\}/)?.[0] || '');
    const ruleBlocks = text.split('- m_Id: ').slice(1).map((b) => '- m_Id: ' + b);
    const tilingRules = [];
    for (const rb of ruleBlocks) {
      const id = +rb.match(/- m_Id: (\d+)/)[1];
      const spriteRefs = [...rb.matchAll(/\{fileID: -?\d+, guid: \w+, type: 3\}/g)].map((x) => resolve(x[0]));
      const neighbors = (rb.match(/m_Neighbors: ([0-9a-f]+)\n/) || [])[1] || '';
      // m_Neighbors 是每邻居 4 字节的小端 int32 数组（05 00 00 00 = 5），取每组的低字节
      const nbBytes = neighbors.match(/.{8}/g)?.map((h) => parseInt(h.slice(0, 2), 16)) ?? [];
      const positions = [...rb.matchAll(/- \{x: (-?\d+), y: (-?\d+), z: \d+\}/g)].map((p) => [ +p[1], +p[2] ]);
      const transform = +((rb.match(/m_RuleTransform: (\d+)/) || [])[1] ?? 0);
      const output = +((rb.match(/m_Output: (\d+)/) || [])[1] ?? 0);
      tilingRules.push({ id, sprites: spriteRefs.filter(Boolean), neighbors: nbBytes, positions, transform, output });
    }
    rules[name] = { defaultSprite, tilingRules };
  }
}
data.rules = rules;

writeFileSync(join(DST, 'resources.json'), JSON.stringify(data, null, 1));
console.log(`\nDONE: ${pngs.length} PNGs, ${totalSprites} sprites, ${data.items.length} items, ${data.tiles.length} tiles, ${Object.keys(rules).length} ruleTiles → ${DST}`);
