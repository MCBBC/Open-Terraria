#!/usr/bin/env node
// canUse 谓词批译提取器(三百三十四刀):扫 HEAD Items C# CanUseItem 体 →
// ownedProjectileCounts 召唤共存量门规则提取 → canuse-rules.json
// (根域数据 json=loader __calamityModData 装载;main.js 消费生成闭包)。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const OUT = join(process.cwd(), 'mods/calamity/canuse-rules.json');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** CanUseItem 体提取 */
function extractCanUse(src) {
  const m = /public override bool\?? CanUseItem\(/.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index);
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const rows = [];
let files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));

for (const p of files) {
  const src = readFileSync(p, 'utf8');
  const cls = /class (\w+)/.exec(src)?.[1] ?? basename(p, '.cs');
  const key = snake(cls);
  const body = extractCanUse(src);
  if (!body) continue;
  // 召唤共存量门:泛型/字符串 ProjectileType 双形+三门(零共存 <1/>0/maxMinions 上限)
  const projs = [...body.matchAll(/ownedProjectileCounts\[\s*(?:mod\.)?ProjectileType(?:<\s*(\w+)\s*>\(\)|\(\s*"(\w+)"\s*\))\s*\]/g)]
    .map((m) => snake(m[1] ?? m[2]));
  if (projs.length === 0) continue;
  let op = 'zero', n = 1;
  if (/maxMinions/.test(body)) { op = 'maxMinions'; }
  else {
    const mm = /<\s*(\d+)/.exec(body);
    if (mm && Number(mm[1]) > 0) { op = 'lt'; n = Number(mm[1]); }
  }
  // bossGate 支:NPC.AnyNPCs(ModContent.NPCType<X>()) → noBoss 规则(召唤期
  //  boss 存活禁用;2019 恶魔海螺/深海掠夺者类)
  if (projs.length === 0 || true) {
    const bosses = [...body.matchAll(/AnyNPCs\(\s*(?:ModContent\.)?NPCType(?:<\s*(\w+)\s*>\(\)|\(\s*"(\w+)"\s*\))\s*\)/g)]
      .map((m) => snake(m[1] ?? m[2]));
    if (bosses.length > 0 && !/maxMinions/.test(body)) {
      rows.push({ item: key, noBoss: bosses });
      continue;
    }
  }
  rows.push({ item: key, projs, op, n });
}
writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('canuse 规则:', rows.length, '(maxMinions', rows.filter(r => r.op === 'maxMinions').length,
  '/ zero', rows.filter(r => r.op === 'zero').length, '/ lt', rows.filter(r => r.op === 'lt').length, ')');
