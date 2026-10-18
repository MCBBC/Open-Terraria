#!/usr/bin/env node
// holdout 武器批提取(三百五十刀):Items C# UseItem/HoldItem 里
// NewProjectile(...ProjectileType<XxxHoldout>()...mouseWorld...) 模式
// → holdouts.json {item, proj, ownerMouse:true} → main.js 批注册
// sw.itemUse(朝鼠标生成 holdout 弹;106 holdout 弹声明已在册)。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const ITEMS = join(process.cwd(), 'mods/calamity/content/items');
const PROJS = join(process.cwd(), 'mods/calamity/content/projectiles');
const OUT = join(process.cwd(), 'mods/calamity/holdouts.json');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const rows = [];
let files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n);
  if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.cs')) files.push(p); } };
walk(join(SRC, 'Items'));

for (const p of files) {
  const src = readFileSync(p, 'utf8');
  const itemKey = snake(basename(p, '.cs'));
  const jp = join(ITEMS, `${itemKey}.json`);
  if (!existsSync(jp)) continue;
  // UseItem 或 HoldItem 里的 XxxHoldout 生成 + mouseWorld 瞄准
  const seg = /public override (bool\?? (UseItem|HoldItem)|void HoldItem)\(/.test(src) ? src : null;
  if (!seg) continue;
  for (const m of src.matchAll(/(?:NewProjectile(?:Direct)?)\([^;]*?ProjectileType<\s*(\w+Holdout)\s*>/g)) {
    const proj = snake(m[1]);
    if (!existsSync(join(PROJS, `${proj}.json`))) continue;
    const aimMouse = /mouseWorld/.test(src.slice(m.index, m.index + 400));
    rows.push({ item: itemKey, proj, aimMouse });
  }
}
writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('holdout 规则:', rows.length);
