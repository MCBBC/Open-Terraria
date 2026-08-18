#!/usr/bin/env node
// 重建 public/hitbox-names.json —— 碰撞盒校准页(hitbox-lab.html)的名称搜索索引。
// 数据源:src/i18n/idNames.generated.ts(id→英文名,由 build-l10n 生成)+
//   public/l10n/zh-Hans.json(ProjectileName/NPCName/ItemName 组,官译)。
// ★改 l10n 或 idNames 后需重跑本脚本(l10n 重建不会自动带动本产物):
//   node scripts/build-hitbox-names.mjs
import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync('src/i18n/idNames.generated.ts', 'utf8');
const l10n = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));

function extractTable(name) {
  const start = src.indexOf(`export const ${name}`);
  const end = src.indexOf('export const', start + 10);
  const body = src.slice(start, end);
  const out = {};
  for (const m of body.matchAll(/'(\d+)':\s*'([^']+)'/g)) out[+m[1]] = m[2];
  return out;
}

function withZh(table, group) {
  const g = l10n[group] ?? {};
  const out = {};
  for (const [id, en] of Object.entries(table)) out[id] = { en, zh: g[en] ?? '' };
  return out;
}

const data = {
  projectile: withZh(extractTable('PROJECTILE_NAME_BY_ID'), 'ProjectileName'),
  npc: withZh(extractTable('NPC_NAME_BY_ID'), 'NPCName'),
  item: withZh(extractTable('ITEM_NAME_BY_ID'), 'ItemName'),
};
writeFileSync('public/hitbox-names.json', JSON.stringify(data));
console.log('hitbox-names.json:',
  Object.keys(data.projectile).length, 'projectile /',
  Object.keys(data.npc).length, 'npc /',
  Object.keys(data.item).length, 'item');
