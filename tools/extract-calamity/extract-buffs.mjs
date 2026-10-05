#!/usr/bin/env node
// 灾厄全量移植 B6:buffs 声明面机械提取器。
// 源=CalamityModPublic/Buffs(ModBuff SetStaticDefaults 声明面 + hjson 名 + PNG 图标);
// 目标=game/mods/calamity/content/buffs/*.json + textures/buffs/*.png(ModBuffContent)。
// ★Update 逻辑=代码钩(B6 OnHit/弹幕 debuff 连锁后续);本批=名称/图标/声明位。
// 用法:node tools/extract-calamity/extract-buffs.mjs [--write]
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

// 名字表(Items.* 同构三形:点分/块/扁平;Buffs.hjson)
function parseNames() {
  const names = {};
  const text = readFileSync(join(SRC, 'Localization', 'en-US', 'Mods.CalamityMod.Buffs.hjson'), 'utf8');
  for (const m of text.matchAll(/^([A-Za-z0-9_]+)\.DisplayName: (.+)$/gm)) names[m[1]] = m[2].trim();
  for (const m of text.matchAll(/^([A-Za-z0-9_]+): \{\n\s+DisplayName: (.+)$/gm)) names[m[1]] ??= m[2].trim();
  for (const m of text.matchAll(/^([A-Za-z0-9_]+): ([^{\n]+)$/gm)) names[m[1]] ??= m[2].trim();
  return names;
}
const NAMES = parseNames();

const csFiles = walkFiles(join(SRC, 'Buffs'), '.cs').filter((f) => {
  const head = readFileSync(f, 'utf8').slice(0, 2500);
  if (!/class\s+\w+\s*:\s*ModBuff/.test(head)) return false;
  return !/abstract class/.test(head);
});
const pngs = walkFiles(join(SRC, 'Buffs'), '.png').filter((p) => !/_Highlight|_Glow|_Alt/i.test(basename(p)));
const pngByBase = new Map();
for (const p of pngs) { const b = basename(p, '.png'); if (!pngByBase.has(b)) pngByBase.set(b, p); }

const stats = { total: 0, emitted: 0, noName: 0, noTexture: 0, dedupKey: 0 };
const seenKeys = new Set();
const outDir = join(OUT, 'content', 'buffs');
const texDir = join(OUT, 'textures', 'buffs');

for (const f of csFiles) {
  const cls = basename(f, '.cs').trim();
  const key = pascalToSnake(cls);
  if (seenKeys.has(key)) { stats.dedupKey++; continue; }
  seenKeys.add(key);
  stats.total++;
  const raw = { key, name: NAMES[cls] ?? cls, texture: `textures/buffs/${key}.png` };
  if (NAMES[cls] === undefined) stats.noName++;
  const png = pngByBase.get(cls);
  let hasPng = false;
  if (png && readFileSync(png).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) hasPng = true;
  if (!hasPng) stats.noTexture++;
  if (WRITE) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
    if (hasPng) { mkdirSync(texDir, { recursive: true }); copyFileSync(png, join(texDir, `${key}.png`)); }
  }
  stats.emitted++;
}
console.log(JSON.stringify(stats, null, 2));
