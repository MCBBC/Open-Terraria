#!/usr/bin/env node
// 物品行为分型分类器(物品行为战役首刀,2026-10-08;三百二十八弹分类器同构):
// 扫 CalamityModPublic HEAD Items/**/*.cs → 行为覆写特征(UseItem/HoldItem/
// PreShoot/ModifyHitNPC/CanUseItem/PostUpdate…) → itemProfile 标注 →
// 报告 + 声明面回填(--write)。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = process.env.CALAMITY_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/CalamityModPublic';
const CONTENT = join(process.cwd(), 'mods/calamity/content/items');
const OUT = '/tmp/item-classify.json';
const WRITE = process.argv.includes('--write');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

function classify(src) {
  const feats = [];
  // 覆写方法普查
  const hooks = [
    ['useItem', /public override bool\? UseItem\b|public override void UseItem\b/],
    ['holdItem', /public override void HoldItem\b/],
    ['preShoot', /public override (bool|void) PreShoot\b|\bPreShoot\(/],
    ['modifyHitNpc', /public override void ModifyHitNPC\b/],
    ['canUseItem', /public override bool CanUseItem\b/],
    ['useStyle', /public override void UseStyle\b/],
    ['safeQuickUseItem', /SafeQuickUseItem/],
    ['postUpdate', /public override void PostUpdate\b/],
    ['updateInventory', /public override void UpdateInventory\b/],
    ['updateAccessory', /public override void UpdateAccessory\b/],
    ['onHitNPC', /public override void OnHitNPC\b/],
    ['getWeaponDamage', /GetWeaponDamage|ModifyWeaponDamage/],
  ];
  for (const [k, re] of hooks) if (re.test(src)) feats.push(k);
  return feats;
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
  const feats = classify(src);
  rows.push({ cls, key: snake(cls), file: p.slice(SRC.length + 1), lines: src.split('\n').length, feats });
}

// 声明键对齐+回填
const matched = [];
for (const r of rows) {
  if (r.feats.length === 0) continue;
  const jp = join(CONTENT, `${r.key}.json`);
  if (!existsSync(jp)) continue;
  const d = JSON.parse(readFileSync(jp, 'utf8'));
  const spec = Array.isArray(d) ? d[0] : d;
  matched.push({ key: r.key, lines: r.lines, feats: r.feats });
  if (WRITE && !spec.itemProfile) {
    spec.itemProfile = r.feats;
    writeFileSync(jp, JSON.stringify(d, null, 2) + '\n');
  }
}

// 报告
const dist = {};
for (const m of matched) for (const f of m.feats) dist[f] = (dist[f] ?? 0) + 1;
const summary = {
  scanned: rows.length,
  withHooks: rows.filter((r) => r.feats.length > 0).length,
  matched: matched.length,
  dist,
  heavy: matched.filter((m) => m.lines > 300).length,
};
writeFileSync(OUT, JSON.stringify({ summary, matched }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log('报告:', OUT, WRITE ? '(已回填)' : '(dry-run)');
