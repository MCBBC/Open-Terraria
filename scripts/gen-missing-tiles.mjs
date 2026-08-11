// 全量补齐缺失 tile：对照 TEdit tiles.json(753) 生成我们注册表缺的 def，
// 追加到 tiles.ts「TILE_DEFS.forEach 构建行」之前（id 顺序铁律）。
import { readFileSync, writeFileSync } from 'node:fs';

const TEDIT = '/Users/vinlic/Project/GLM/SandboxWorld/Terraria-Map-Editor/src/TEdit.Terraria/Data/tiles.json';
const TARGET = '/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/tiles.ts';
const WL = '/Users/vinlic/Project/GLM/SandboxWorld/game/scripts/vanilla-whitelist.json';

const tedit = JSON.parse(readFileSync(TEDIT, 'utf8'));
const src = readFileSync(TARGET, 'utf8');

// 我方已注册 sheet（两种写法都算）
const ours = new Set();
for (const m of src.matchAll(/sheet:\s*(\d+)/g)) ours.add(Number(m[1]));
for (const m of src.matchAll(/VAN\((\d+)\s*,/g)) ours.add(Number(m[1]));

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const hex6 = (c) => (c || '#808080').replace('#', '').slice(0, 6);

const lines = [];
const wlAdd = [];
let n = 0;
for (const t of tedit) {
  if (ours.has(t.id)) continue;
  const key = `v_${t.id}_${slug(t.name)}`;
  const color = hex6(t.color);
  const [fw, fh] = t.frameSize?.[0] ?? [1, 1];
  let body;
  if (t.isFramed || fw > 1 || fh > 1) {
    body = `solid: ${!!t.isSolid}, framed: true, opacity: ${t.isSolid ? 1 : 0.05}, pick: 0, w: ${fw}, h: ${fh},`
      + ` mapColor: '#${color}', drop: null, vanilla: { sheet: ${t.id}, frame: 'style', fw: ${fw}, fh: ${fh} }`;
  } else if (t.isSolid) {
    body = `solid: true, opacity: 1, pick: 0, mapColor: '#${color}', blend: true, drop: null,`
      + ` vanilla: { sheet: ${t.id}, frame: 'auto' }`;
  } else {
    body = `decor: true, opacity: 0, pick: 0, mapColor: '#${color}', drop: null,`
      + ` vanilla: { sheet: ${t.id}, frame: 'auto' }`;
  }
  lines.push(`def({ key: '${key}', name: '', ${body} });`);
  wlAdd.push(t.id);
  n++;
}
console.log('生成缺失 def:', n);

// 追加到构建行之前
const anchor = 'TILE_DEFS.forEach((d, i) => (TILE_BY_KEY[d.key] = i));';
if (!src.includes(anchor)) throw new Error('anchor 不存在');
const block = `\n// ===================== TEdit 全量补齐（缺失 sheet 程序生成，勿手改） =====================\n`
  + lines.join('\n') + '\n';
writeFileSync(TARGET, src.replace(anchor, block + anchor));

// 白名单补 sheet
const wl = JSON.parse(readFileSync(WL, 'utf8'));
const before = wl.tiles.length;
for (const id of wlAdd) if (!wl.tiles.includes(id)) wl.tiles.push(id);
wl.tiles.sort((a, b) => a - b);
writeFileSync(WL, JSON.stringify(wl, null, 2) + '\n');
console.log('白名单 tiles:', before, '→', wl.tiles.length);
