// 合并 tools/l10n/zh-Hans* 为单文件 → game/public/l10n/zh-Hans.json
// 原版 JSON 带尾逗号，容错解析（参考 tools/build-id-maps.mjs）。
// 用法：node scripts/build-l10n.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const L10N = join(here, '..', '..', 'tools', 'l10n');
const OUT = join(here, '..', 'public', 'l10n', 'zh-Hans.json');

function parseLenient(file) {
  const raw = readFileSync(file, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
}

const parts = ['zh-Hans.json', 'zh-Hans.Game.json', 'zh-Hans.Items.json', 'zh-Hans.Legacy.json', 'zh-Hans.NPCs.json'];
const out = {};
for (const p of parts) {
  const name = p === 'zh-Hans.json' ? 'UI' : p.replace('zh-Hans.', '').replace('.json', '');
  out[name] = parseLenient(join(L10N, p));
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
const keys = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.keys(v).length]));
console.log('build-l10n:', JSON.stringify(keys), '→', OUT);
