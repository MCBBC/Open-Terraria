#!/usr/bin/env node
// holdout spec 批回填(三百五十二刀):Projectiles/**/*Holdout.cs →
// ManaConsumeRate/CheckMana 提取 → 声明面 holdout{manaRate,manaCost} 回填。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const SRC = process.env.CALAMITY_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/CalamityModPublic';
const PROJS = join(process.cwd(), 'mods/calamity/content/projectiles');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const rows = [];
let files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n);
  if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.cs')) files.push(p); } };
walk(join(SRC, 'Projectiles'));

let filled = 0, skippedNoJson = 0, skippedNoSpec = 0;
for (const p of files) {
  if (!/Holdout|holdout/.test(p)) continue;
  const src = readFileSync(p, 'utf8');
  const key = snake(p.split('/').pop());
  const jp = join(PROJS, `${key}.json`);
  let d;
  try { d = JSON.parse(readFileSync(jp, 'utf8')); } catch { skippedNoJson++; continue; }
  const spec = Array.isArray(d) ? d[0] : d;
  if (spec.holdout) continue;   // 幂等
  // ManaConsumeRate = N 常量
  const rc = /ManaConsumeRate\s*=\s*(\d+)/.exec(src);
  // CheckMana(HeldItem, -N, ...) 显式魔耗
  const cm = /CheckMana\([^)]*?,\s*-(\d+)\s*,/.exec(src);
  if (!rc && !cm) { skippedNoSpec++; continue; }
  spec.holdout = {};
  if (rc) spec.holdout.manaRate = Number(rc[1]);
  if (cm) spec.holdout.manaCost = Number(cm[1]);
  writeFileSync(jp, JSON.stringify(d, null, 2) + '\n');
  filled++;
}
console.log(`holdout spec 回填 ${filled} 件 / 无 C# 魔耗锚跳过 ${skippedNoSpec} / 声明缺 ${skippedNoJson}`);
