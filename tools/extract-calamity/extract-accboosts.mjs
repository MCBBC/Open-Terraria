#!/usr/bin/env node
// 配饰 stat 面批译提取器(三百三十八刀):扫 HEAD Items C# UpdateAccessory 体 →
// stat 增益模式(def/lifeMax/moveSpeed/crit/damage 字面) → acc-boosts.json
// (main.js 消费→sw.accEffect 批注册;equipStats 累加器即刻生效)。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const CONTENT = join(process.cwd(), 'mods/calamity/content/items');
const OUT = join(process.cwd(), 'mods/calamity/acc-boosts.json');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

function extractUA(src) {
  const m = /public override void UpdateAccessory\(/.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index), depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const rows = [];
let files = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));

let stat = 0, skipped = 0;
for (const p of files) {
  const src = readFileSync(p, 'utf8');
  const cls = /class (\w+)/.exec(src)?.[1] ?? basename(p, '.cs');
  const key = snake(cls);
  const jp = join(CONTENT, `${key}.json`);
  if (!existsSync(jp)) continue;
  const body = extractUA(src);
  if (!body) continue;
  const rule = { item: key };
  let hit = false;
  // statDefense += N / statDefense += Nf
  const dm = [...body.matchAll(/statDefense(?:2)? \+= (\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (dm.length) { rule.def = dm.reduce((a, b) => a + b, 0); hit = true; }
  // statLifeMax2 += N
  const lm = [...body.matchAll(/statLifeMax2 \+= (\d+)/g)].map(m => Number(m[1]));
  if (lm.length) { rule.lifeMax = lm.reduce((a, b) => a + b, 0); hit = true; }
  // statManaMax2 += N
  const mm = [...body.matchAll(/statManaMax2 \+= (\d+)/g)].map(m => Number(m[1]));
  if (mm.length) { rule.mana = mm.reduce((a, b) => a + b, 0); hit = true; }
  // moveSpeed += 0.Xf
  const mv = [...body.matchAll(/moveSpeed \+= (0?\.\d+)f/g)].map(m => Number(m[1]));
  if (mv.length) { rule.moveMult = mv.reduce((a, b) => a + b, 0); hit = true; }
  // 全系伤害 GetDamage<Generic> += 0.Xf
  const gd = [...body.matchAll(/GetDamage<GenericDamageClass>\(\) \+= (0?\.\d+)f/g)].map(m => Number(m[1]));
  if (gd.length) { rule.dmgAll = gd.reduce((a, b) => a + b, 0); hit = true; }
  // ★四百八十四:系别伤害 GetDamage<XxxDamageClass> += 0.Xf
  //  (Melee/Ranged/Magic;Throwing=Rogue 系=引擎无 rogue 伤害类,登记跳过)
  for (const [pat, fld] of [
    [/GetDamage<MeleeDamageClass>\(\) \+= (0?\.\d+)f/g, 'dmgMelee'],
    [/GetDamage<RangedDamageClass>\(\) \+= (0?\.\d+)f/g, 'dmgRanged'],
    [/GetDamage<MagicDamageClass>\(\) \+= (0?\.\d+)f/g, 'dmgMagic'],
  ]) {
    const xs = [...body.matchAll(pat)].map(m => Number(m[1]));
    if (xs.length) { rule[fld] = (rule[fld] ?? 0) + xs.reduce((a, b) => a + b, 0); hit = true; }
  }
  if (/GetDamage<ThrowingDamageClass>\(\)/.test(body)) skipped++;   // rogue 系=登记(不产行)
  // 系别暴击 GetCritChance<Xxx> += N
  for (const [pat, fld] of [
    [/GetCritChance<MeleeDamageClass>\(\) \+= (\d+)/g, 'critMelee'],
    [/GetCritChance<RangedDamageClass>\(\) \+= (\d+)/g, 'critRanged'],
    [/GetCritChance<MagicDamageClass>\(\) \+= (\d+)/g, 'critMagic'],
    [/GetCritChance<GenericDamageClass>\(\) \+= (\d+)/g, 'critAll'],
  ]) {
    const xs = [...body.matchAll(pat)].map(m => Number(m[1]));
    if (xs.length) { rule[fld] = (rule[fld] ?? 0) + xs.reduce((a, b) => a + b, 0); hit = true; }
  }
  // endurance += 0.Xf(减伤)
  const en = [...body.matchAll(/endurance \+= (0?\.\d+)f/g)].map(m => Number(m[1]));
  if (en.length) { rule.endurance = en.reduce((a, b) => a + b, 0); hit = true; }
  // 暴击 meleeCrit/rangedCrit/magicCrit/ThrowCrit += N
  for (const [crit, fld] of [['meleeCrit', 'critMelee'], ['rangedCrit', 'critRanged'], ['magicCrit', 'critMagic']]) {
    const cm = [...body.matchAll(new RegExp(`player\\\\.?.?${crit} \\+= (\\\\d+)`, 'g'))];
    void cm; void fld;
  }
  const cr = [...body.matchAll(/(?:meleeCrit|rangedCrit|magicCrit) \+= (\d+)/g)].map(m => Number(m[1]));
  if (cr.length) { rule.critAll = cr.reduce((a, b) => a + b, 0); hit = true; }
  // lifeRegen += N
  const lr = [...body.matchAll(/lifeRegen \+= (\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (lr.length) { rule.life = lr.reduce((a, b) => a + b, 0); hit = true; }
  if (!hit) { skipped++; continue; }
  rows.push(rule); stat++;
}
// ★四百八十四:手植字段反哺(percentMaxLifeIncrease 在 CalamityPlayer 非物品类,
//  提取器不可推导——重产时回填;四百七十八刀通道)。
//  HAND_OMIT=与 main.js 手注 accEffect 重复注册的项(fail-fast 面,行全并入手注)。
const HAND_OVERRIDES = {
  chalice_of_the_blood_god: { maxLifePct: 25 },
};
const HAND_OMIT = new Set(['shattered_community', 'flesh_totem', 'mana_polarizer', 'moonstone_crown']);
for (const r of rows) {
  const ov = HAND_OVERRIDES[r.item];
  if (ov) Object.assign(r, ov);
}
const kept = rows.filter((r) => !HAND_OMIT.has(r.item));
writeFileSync(OUT, JSON.stringify(kept, null, 1));
console.log(`acc-boosts: ${kept.length} 件规则(纯 stat 面;omit ${rows.length - kept.length} 手注重复)/skipped ${skipped}(非 stat 行为)`);
