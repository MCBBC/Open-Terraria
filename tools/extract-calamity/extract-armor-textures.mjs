#!/usr/bin/env node
// 盔甲贴图提取器(四百九十七刀):C# <Class>_Head/_Body/_Legs.png →
// mods/calamity/textures/armor/<key>_{Head,Body,Legs}.png(渲染链消费名)。
// 幂等:目标存在且 size 一致跳过。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.env.CALAMITY_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/CalamityModPublic';
const OUT = join(process.cwd(), 'mods/calamity/textures/armor');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));
mkdirSync(OUT, { recursive: true });

let copied = 0, skipped = 0, noContent = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!/\[AutoloadEquip\(EquipType\.(Head|Body|Legs)\)\]/.test(src)) continue;
  const cls = /class (\w+)/.exec(src)?.[1];
  if (!cls) continue;
  const key = snake(cls);
  const part = /AutoloadEquip\(EquipType\.(Head|Body|Legs)\)/.exec(src)[1];
  const texPath = join(f, '..', `${cls}_${part}.png`);
  if (!existsSync(texPath)) { skipped++; continue; }
  const contentPath = join(process.cwd(), 'mods/calamity/content/items', `${key}.json`);
  if (!existsSync(contentPath)) { noContent++; continue; }
  const bytes = readFileSync(texPath);
  const dst = join(OUT, `${key}_${part}.png`);
  if (existsSync(dst) && readFileSync(dst).equals(bytes)) continue;
  writeFileSync(dst, bytes);
  copied++;
}
console.log(`armor 贴图拷贝 ${copied} / 缺源 ${skipped} / content 缺件 ${noContent}`);
