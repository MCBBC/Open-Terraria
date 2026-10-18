#!/usr/bin/env node
// ★五百八十六:配饰 face 全量提取器(2026-10-11)——扫全 227 C# 配饰的
// UpdateAccessory/UpdateEquip 体,补此前未覆盖的非 stat 行为族:
//   buffImmune[] → acc-immunes.json(immuneVanilla=BuffID 名→id / immuneMod=mod buff 键)
//   AddBuff(ModContent.BuffType) → acc-buffs.json(mod buff 键;vanilla AddBuff=登记)
//   van-bag 族(noFallDmg/extraFall/jumpBoost/waterWalk/fireWalk/accFlipper/
//     noKnockback/lavaMax/breath) → acc-dash.json van 键形(consumer 已挂)
//   wingTimeMax += N / maxMinions++ → acc-boosts.json(wingTime/minionSlots 通道)
// 纪律:只补缺口(已覆盖键跳过);HAND_OMIT 与手注闭包冲突面沿用;产出后
// 跑 node mods/calamity/build.ts + mod 套件验证。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const GAME = process.cwd();
const CONTENT = join(GAME, 'mods/calamity/content/items');
const BUFFID = JSON.parse(readFileSync('/tmp/buffid-map.json', 'utf8'));   // vanilla BuffID 名→id
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// —— 已覆盖键全集(数据行 + 手写闭包;与普查脚本同径) ——
const have = new Set();
const seenRows = new Map();   // file → Set(item)
for (const f of ['acc-immunes', 'acc-buffs', 'acc-buffs2', 'acc-dash', 'acc-boosts', 'acc-lights']) {
  const p = join(GAME, `mods/calamity/${f}.json`);
  if (!existsSync(p)) { seenRows.set(f, new Set()); continue; }
  const d = JSON.parse(readFileSync(p, 'utf8'));
  const rows = Array.isArray(d) ? d : d.rows ?? [];
  const s = new Set();
  for (const r of rows) if (r.item) s.add(r.item);
  seenRows.set(f, s);
}
for (const f of ['monolith', 'misc', 'boss-ai', 'acc-extra', 'psc-guardians', 'shared']) {
  const p = join(GAME, `mods/calamity/src/${f}.ts`);
  if (!existsSync(p)) continue;
  const t = readFileSync(p, 'utf8');
  for (const m of t.matchAll(/accEffect(?:Append)?\(\s*["']([a-z0-9_]+)["']/g)) have.add(m[1]);
}
// 未知 npc/item 键手动维护面
const omitLog = new Set();   // ★消费面缺支的键=登记不产行(防静默丢弃)
const OMIT = new Set([
  // 抽象基类/材料/非配饰
  'base_wings', 'base_floating_tube', 'base_triple_wing',
]);

function extractFn(src, fn) {
  const m = new RegExp(`public override void ${fn}\\(`).exec(src);
  if (!m) return '';
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

// —— 收集 C# 文件 ——
const files = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));

const out = {
  immunes: [], buffs: [], van: [], boosts: [],
};
let cov = 0, noUA = 0, stat = 0, cond = 0;
const condList = [];
for (const p of files) {
  const cls = /class (\w+)/.exec(readFileSync(p, 'utf8'))?.[1] ?? basename(p, '.cs');
  const src = readFileSync(p, 'utf8');
  const key = snake(cls);
  if (OMIT.has(key)) continue;
  if (!existsSync(join(CONTENT, `${key}.json`))) continue;   // 非配饰内容件=非本域
  if (have.has(key) || [...seenRows.values()].some((s) => s.has(key))) { cov++; continue; }
  const body = extractFn(src, 'UpdateAccessory') || extractFn(src, 'UpdateEquip');
  if (!body) { noUA++; continue; }

  let hit = false;
  // —— buffImmune[X] = true ——
  const immV = [];
  const immM = [];
  for (const m of body.matchAll(/buffImmune\[([^\]]+)\]\s*=\s*true/g)) {
    const expr = m[1];
    const bv = /BuffID\.(\w+)/.exec(expr);
    const mv = /BuffType<(\w+)>\(\)/.exec(expr);
    if (bv && BUFFID[bv[1]] !== undefined) immV.push(BUFFID[bv[1]]);
    else if (mv) immM.push(snake(mv[1]));
    else hit = hit;   // 未知表达式=跳过该支
  }
  if (immV.length || immM.length) {
    const r = { item: key };
    if (immV.length) r.immuneVanilla = [...new Set(immV)];
    if (immM.length) r.immuneMod = [...new Set(immM)];
    out.immunes.push(r);
    hit = true;
  }
  // —— AddBuff(ModContent.BuffType<X>(), N) ——(vanilla AddBuff=登记不产行)
  for (const m of body.matchAll(/AddBuff\((?:ModContent\.)?BuffType<(\w+)>\(\),\s*(\d+)/g)) {
    out.buffs.push({ item: key, buff: snake(m[1]), seconds: Number(m[2]) / 60 });
    hit = true;
  }
  if (/AddBuff\((?:BuffID|Type)\./.test(body)) cond++;   // vanilla buff 支=登记
  // —— van-bag 族 ——
  const van = {};
  if (/player\.noFallDmg\s*=\s*true/.test(body)) van.noFallDmg = true;
  if (/player\.jumpBoost\s*=\s*true/.test(body)) van.jumpBoost = true;
  if (/player\.waterWalk\s*=\s*true/.test(body)) van.waterWalk = true;
  if (/player\.fireWalk\s*=\s*true/.test(body)) van.fireWalk = true;
  if (/player\.accFlipper\s*=\s*true/.test(body)) van.accFlipper = true;
  if (/player\.noKnockback\s*=\s*true/.test(body)) van.noKnockback = true;
  if (/player\.blackBelt\s*=\s*true/.test(body)) van.blackBelt = true;
  if (/player\.lavaMax\s*\+=\s*(\d+)/.test(body)) omitLog.add(`${key}:lavaMax`);
  if (/player\.lavaImmune\s*=\s*true/.test(body)) van.lavaImmune = true;   // ★五百八十六:消费面已挂(modLavaImmune)
  if (/player\.breathMax\s*\+=\s*(\d+)/.test(body)) omitLog.add(`${key}:breathMax`);
  if (/player\.extraFall\s*\+=\s*(\d+)/.test(body)) omitLog.add(`${key}:extraFall`);
  if (Object.keys(van).length) { out.van.push({ item: key, van }); hit = true; }
  // —— wingTimeMax / maxMinions(cache-period 静态面) ——
  const boost = { item: key };
  const wm = [...body.matchAll(/wingTimeMax\s*\+=\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (wm.length) boost.wingTime = wm.reduce((a, b) => a + b, 0);
  const mm = [...body.matchAll(/maxMinions\+\+/g)].length;
  if (mm > 0) boost.minionSlots = mm;
  // ★五百八十七:pickSpeed-=N → pickSpeedOff 加算池(C# 负值=加速)
  const ps = [...body.matchAll(/pickSpeed -= (\d+(?:\.\d+)?)f?/g)].map((m) => Number(m[1]));
  if (ps.length) boost.pickSpeed = ps.reduce((a, b) => a + b, 0);
  if (boost.wingTime !== undefined || boost.minionSlots !== undefined || boost.pickSpeed !== undefined) {
    out.boosts.push(boost);
    hit = true;
  }
  if (hit) stat++;
  else {
    cond++;
    condList.push(key);
  }
}

// ★619-R4F10:immuneVanilla id 空间闸(原版 1-400;引擎 BuffType 枚举≠原版 id——
//  R4-F1 事故=七行引擎枚举值在 899 全绿下存活)。落盘前逐行核:vanilla id>400→报错
for (const r of out.immunes) {
  if (r.immuneVanilla) {
    for (const id of r.immuneVanilla) {
      if (id > 400 || id < 1) throw new Error(`[acc-faces] ${r.item} immuneVanilla[${id}] 越原版段(1-400)=引擎 BuffType 串入`);
    }
  }
}

// —— 落盘(merge:已存在键不重) ——
const mergeInto = (file, rows, keyOf) => {
  const p = join(GAME, `mods/calamity/${file}`);
  const cur = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
  const haveItems = new Set(cur.map(keyOf));
  const add = rows.filter((r) => !haveItems.has(keyOf(r)));
  if (add.length) writeFileSync(p, JSON.stringify([...cur, ...add], null, 1) + '\n');
  return add.length;
};
const nI = mergeInto('acc-immunes.json', out.immunes, (r) => r.item);
const nB = mergeInto('acc-buffs.json', out.buffs, (r) => `${r.item}|${r.buff}`);
const nV = mergeInto('acc-dash.json', out.van, (r) => r.item);
const nS = mergeInto('acc-boosts.json', out.boosts, (r) => r.item);
console.log(`覆盖 ${cov} / 无UA ${noUA} / 新增 stat ${stat} / 纯行为(手注尾) ${cond}`);
if (omitLog.size) console.log(`登记(消费面缺支,不产行): ${[...omitLog].join(', ')}`);
console.log(`落盘: immunes+${nI} buffs+${nB} van+${nV} boosts+${nS}`);
if (condList.length) console.log(`行为族尾(待手注): ${condList.join(', ')}`);
