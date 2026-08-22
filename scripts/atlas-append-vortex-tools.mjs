// 星旋三件（2772 VortexAxe / 2773 VortexChainsaw / 2775 VortexHammer）追加式集成：
// TEdit items.json 漏收这三件（Item.cs:26442/26460/26520 在 2774/2776 之间的 case 段，
// 提取源缺失）→ vanilla.json 无条目 = 无 def、无贴图、不可获得（2026-08-22 工具审计 F3）。
// 既有 vanilla.json 条目零改动（教训：全量重排会破坏 SW/索引缓存链，2026-08-21 贴图全错
// 事故）——新素材走新页 Item_Atlas_3.png（shelf-pack，与 vanilla-atlas.mjs 同机制：
// 2048²/2px gutter/按高度降序）+ items/itemNames 增键。
// TEdit items.json 三条目已另行补入（本脚本幂等，重跑全量 vanilla-atlas.mjs 亦不再漏）。
// 用法：node scripts/atlas-append-vortex-tools.mjs   （在 game/ 下；幂等：已存在的键跳过）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const ASSETS = join(ROOT, '..', 'terraria-assets', 'Images');
const TEDIT = join(ROOT, '..', 'Terraria-Map-Editor', 'src', 'TEdit.Terraria', 'Data');
const OUT_DIR = join(ROOT, 'public', 'sprites', 'vanilla');
const OUT_JSON = join(ROOT, 'public', 'sprites', 'vanilla.json');
const PAGE = 'Item_Atlas_3.png';

// TEdit 缺条目时的兜底元数据（name/key 与 ItemID/l10n ItemName.VortexAxe 权威键一致）
const FALLBACK_META = {
  2772: { name: 'Vortex Axe', key: 'VortexAxe' },
  2773: { name: 'Vortex Chainsaw', key: 'VortexChainsaw' },
  2775: { name: 'Vortex Hammer', key: 'VortexHammer' },
};
const IDS = [2772, 2773, 2775];

const before = readFileSync(OUT_JSON, 'utf8');
const v = JSON.parse(before);
const tedit = JSON.parse(readFileSync(join(TEDIT, 'items.json'), 'utf8'));
const metaById = new Map(tedit.map((i) => [i.id, i]));

function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const NEW_ITEMS = [];
for (const id of IDS) {
  if (v.items[String(id)]) continue; // 幂等
  const meta = metaById.get(id) ?? FALLBACK_META[id];
  const src = join(ASSETS, `Item_${id}.png`);
  if (!meta || !existsSync(src)) throw new Error(`Item_${id} 缺 ${!meta ? '元数据' : '源图'}`);
  NEW_ITEMS.push({ id, meta, src, ...pngSize(src) });
}

if (NEW_ITEMS.length) {
  NEW_ITEMS.sort((a, b) => b.h - a.h);
  const ATLAS_W = 2048, ATLAS_H = 2048, GUTTER = 2;
  const page = new PNG({ width: ATLAS_W, height: ATLAS_H });
  let x = GUTTER, y = GUTTER, shelfH = 0;
  for (const { id, meta, src, w: iw, h: ih } of NEW_ITEMS) {
    if (x + iw + GUTTER > ATLAS_W) { x = GUTTER; y += shelfH + GUTTER; shelfH = 0; }
    if (y + ih + GUTTER > ATLAS_H) throw new Error('溢出到第 5 页——三件 54px 级贴图不应触界');
    const png = PNG.sync.read(readFileSync(src));
    PNG.bitblt(png, page, 0, 0, iw, ih, x, y);
    v.items[String(id)] = {
      name: meta.name, key: meta.key, createTile: null,
      icon: `vanilla/${PAGE}`, ix: x, iy: y, iw, ih,
    };
    v.itemNames[String(id)] = meta.name;
    console.log(`items[${id}] ${meta.name} → ${PAGE} @(${x},${y}) ${iw}x${ih}`);
    x += iw + GUTTER;
    if (ih > shelfH) shelfH = ih;
  }
  writeFileSync(join(OUT_DIR, PAGE), PNG.sync.write(page));
  console.log(`${PAGE}: ${NEW_ITEMS.length} 件`);
} else {
  console.log('三件均已就位（幂等跳过）');
}

// ---- 写回 + 自验：既有键零改动 ----
const after = JSON.stringify(v);
const vAfter = JSON.parse(after);
let drift = 0;
for (const seg of ['tiles', 'items', 'walls', 'npcs', 'armorIndex', 'tileNames', 'itemNames']) {
  for (const k of Object.keys(v[seg] ?? {})) {
    if (JSON.stringify(v[seg][k]) !== JSON.stringify(vAfter[seg][k])) drift++;
  }
}
if (drift) throw new Error(`既有键被改动 ${drift} 处——中止写回`);
writeFileSync(OUT_JSON, after);
console.log(`vanilla.json: items ${Object.keys(v.items).length} / itemNames ${Object.keys(v.itemNames).length}`);
console.log('OK');
