// 武器全量覆盖清查（只读）：golden shoot 表 796 件 × 我方数据面逐字段 diff + 实现存在性 + 纯近战提取
// 运行: node scripts/_coverage-audit.mjs   输出 /tmp/recon/_coverage-audit.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname; // game/
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));

const golden = read('tools/golden/vanilla-shoot-table.json');
const combatRaw = read('src/data/vanilla-itemcombat.json');
const usesound = read('src/data/vanilla-itemusesound.json');
const legacy = read('src/data/legacyItemIndex.generated.json');
const projs = read('src/data/vanilla-projectiles.json');
const whips = read('src/data/vanilla-whips.json');
const itemsTs = readFileSync(ROOT + 'src/data/items.ts', 'utf8');
const combatTs = readFileSync(ROOT + 'src/data/vanillaItemCombat.ts', 'utf8');

// ---- 解析 EXTRACT_PATCH（vanillaItemCombat.ts 内的 JS 对象字面量）----
function parseExtractPatch(ts) {
  const start = ts.indexOf('const EXTRACT_PATCH');
  const braceStart = ts.indexOf('{', start);
  // 找到与之配对的右括号（深度计数，忽略字符串/注释）
  let depth = 0, i = braceStart, inStr = null, end = -1;
  while (i < ts.length) {
    const ch = ts[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
    } else if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; }
    else if (ch === '/' && ts[i + 1] === '/') { while (i < ts.length && ts[i] !== '\n') i++; }
    else if (ch === '/' && ts[i + 1] === '*') { i += 2; while (i < ts.length && !(ts[i] === '*' && ts[i + 1] === '/')) i++; }
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    i++;
  }
  const lit = ts.slice(braceStart, end + 1);
  // TS 对象字面量带类型标注 Partial<ItemCombat> 已在 slice 外；字面量本身是纯 JS
  return eval('(' + lit.replace(/(?<![a-zA-Z0-9_.])Record</g, 'Record_') + ')');
}
let EXTRACT_PATCH = {};
try { EXTRACT_PATCH = parseExtractPatch(combatTs); } catch (e) { console.error('EXTRACT_PATCH parse fail:', e.message); }

// ---- 我方有效战斗表 = json + patch（whips 单独）----
const ours = { ...combatRaw };
for (const [k, v] of Object.entries(EXTRACT_PATCH)) ours[k] = { ...(ours[k] ?? {}), ...v };

const goldenIds = Object.keys(golden.items).map(Number).sort((a, b) => a - b);

// ---- 分类 ----
function classify(it) {
  if (it.melee) return 'melee';
  if (it.ranged) return 'ranged';
  if (it.magic) return 'magic';
  if (it.summon) return 'summon';
  return 'other';
}

// ---- 实现存在性：vanilla.json 自动注册（6174 件全量）+ items.ts 手写/桥接 ----
const vanillaMeta = JSON.parse(readFileSync(ROOT + 'public/sprites/vanilla.json', 'utf8'));
const metaIds = new Set(Object.keys(vanillaMeta.items ?? {}).map(Number));
const registeredKeys = new Set([...itemsTs.matchAll(/key:\s*['"]([a-zA-Z0-9_]+)['"]/g)].map(m => m[1]));
const viIds = new Set([...itemsTs.matchAll(/key:\s*['"]vi_(\d+)_/g)].map(m => Number(m[1])));
for (const m of itemsTs.matchAll(/\bvid:\s*(\d+)/g)) viIds.add(Number(m[1]));
function implementedVia(id) {
  if (viIds.has(id)) return 'hand';
  if (metaIds.has(id)) return 'auto'; // vanilla.json 自动注册（vi_<id>_<Pascal>）
  return null;
}

// ---- 弹道实现痕迹：proj id 在 src 非 data 代码里的 token 出现（去注释版 + 含注释版）----
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
function listTs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listTs(p));
    else if (e.endsWith('.ts') && !e.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const corpusFiles = listTs(join(ROOT, 'src')).filter(p => !p.includes('/src/data/') && !p.includes('/src/i18n/'));
const codeTokenFiles = new Map(); // token -> Set<fileIdx>
const anyTokenFiles = new Map();
const fileNames = [];
corpusFiles.forEach((f, i) => {
  fileNames.push(relative(ROOT, f));
  let srcTxt = readFileSync(f, 'utf8');
  const anyToks = srcTxt.match(/\d{1,6}/g) ?? [];
  for (const t of anyToks) {
    if (!anyTokenFiles.has(t)) anyTokenFiles.set(t, new Set());
    anyTokenFiles.get(t).add(i);
  }
  // 去注释（粗粒度：块注释+行注释；字符串内数字误伤可接受）
  const noCmt = srcTxt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/([^:]\/\/.*)$/gm, ' ');
  for (const t of (noCmt.match(/\b\d{1,6}\b/g) ?? [])) {
    if (!codeTokenFiles.has(t)) codeTokenFiles.set(t, new Set());
    codeTokenFiles.get(t).add(i);
  }
});
function projTrace(pid) {
  return {
    code: [...(codeTokenFiles.get(String(pid)) ?? [])].slice(0, 6).map(i => fileNames[i]),
    codeCount: (codeTokenFiles.get(String(pid)) ?? []).size,
    anyCount: (anyTokenFiles.get(String(pid)) ?? []).size,
  };
}

// ---- combatWeapon 分流族归属（复刻 vanillaItemCombat.ts 派发规则）----
const AI = { ARROW: 1, THROWN: 2, BOOMERANG: 3, FLAIL: 15, GRENADE: 16, SPEAR: 19, ANCHORED: 13, YOYO: 99, SHORTSWORD: 161, WHIP: 165, GLOWSTICK: 14 };
const GLOWSTICK_VIDS = new Set([282, 286, 3112, 3002, 4776, 5643]);
function dispatchKind(id) {
  const vid = id;
  if (whips[String(vid)]) return { kind: 'whip', ai: AI.WHIP };
  const c = ours[String(vid)];
  if (!c || c.useAmmo || c.ammo) {
    if (!c) return { kind: 'NO_DATA' };
    return { kind: 'ammo-system', ai: -1 }; // 弓弩枪弹药体系
  }
  const shoot = c.shoot ?? 0;
  if (!shoot) {
    if (c.melee && !c.noMelee) return { kind: 'melee-swing', ai: -1 };
    return { kind: 'non-combat', ai: -1 };
  }
  const ai = projs[String(shoot)] ? projs[String(shoot)].aiStyle : -1;
  if (c.consumable && c.noMelee) {
    if (ai === AI.GLOWSTICK && GLOWSTICK_VIDS.has(vid)) return { kind: 'glowstick', ai };
    if (ai === AI.GRENADE) return { kind: 'grenade', ai };
    return { kind: 'thrown(ai2)', ai };
  }
  if (ai === AI.BOOMERANG) return { kind: 'boomerang', ai };
  if (vid === 1227 && ai === AI.SHORTSWORD) return { kind: 'shot(chlorosaber)', ai };
  if (ai === AI.SPEAR || ai === AI.SHORTSWORD || ai === AI.ANCHORED) return { kind: 'spear', ai };
  if (ai === AI.YOYO) return { kind: 'yoyo', ai };
  if (c.summon) return { kind: 'summon', ai };
  if (ai === AI.FLAIL) return { kind: 'flail', ai };
  if (ai === 182 && c.melee) return { kind: 'melee(zenith)', ai };
  if (vid === 1226 && c.melee) return { kind: 'melee(chloro)', ai };
  if (c.melee && !c.noMelee) return { kind: 'melee+shoot', ai };
  if (c.magic || c.mana) return { kind: 'magic', ai };
  if (c.melee || c.ranged || c.noMelee) return { kind: 'shot', ai };
  return { kind: 'other-shoot', ai };
}

// ---- 字段 diff ----
// 合法换算备注：EXTRACT_PATCH 件=手工按源码回填（若 diff 报不一致需人工核对源行）；
// 变体层(vanillaItemVariants)仅秘密世界态，普通世界不生效——diff 用基础表。
const FIELDS = ['damage', 'useTime', 'useAnimation', 'mana', 'shootSpeed', 'autoReuse', 'knockBack'];
const diffs = [];
const multiShotGaps = []; // golden 多弹(number>1 或 shoot 数组>1)而我方单 shoot
const soundDiffs = [];
const missingInOurs = [];
for (const id of goldenIds) {
  const g = golden.items[id];
  const o = ours[String(id)];
  if (!o) { missingInOurs.push(id); continue; }
  const patched = !!EXTRACT_PATCH[String(id)];
  const whippy = !!whips[String(id)];
  for (const f of FIELDS) {
    const gv = g[f], ov = o[f];
    const gvDef = gv !== undefined, ovDef = ov !== undefined;
    if (!gvDef && !ovDef) continue;
    if (gv === ov) continue;
    // 数值容差（float kb 等）
    if (typeof gv === 'number' && typeof ov === 'number' && Math.abs(gv - ov) < 1e-6) continue;
    diffs.push({ id, field: f, golden: gv ?? '<缺>', ours: ov ?? '<缺>', tag: patched ? 'EXTRACT_PATCH' : (whippy ? 'WHIP' : '') });
  }
  // shoot：golden 数组 vs 我方单值
  const gShoots = Array.isArray(g.shoot) ? g.shoot : (g.shoot ? [g.shoot] : []);
  const oShoot = o.shoot ?? 0;
  if (gShoots.length > 1 || (g.number ?? 1) > 1 || g.overrideShoot != null) {
    multiShotGaps.push({ id, goldenShoots: gShoots, number: g.number ?? 1, overrideShoot: g.overrideShoot ?? null,
      branches: !!g.branches, oursShoot: oShoot });
  } else if (gShoots.length === 1 && oShoot !== gShoots[0]) {
    diffs.push({ id, field: 'shoot', golden: gShoots[0], ours: oShoot, tag: '' });
  } else if (gShoots.length === 0 && oShoot) {
    diffs.push({ id, field: 'shoot', golden: '<无>', ours: oShoot, tag: '' });
  }
  // useSound
  if (g.useSound && usesound[String(id)] !== undefined && usesound[String(id)] !== g.useSound) {
    soundDiffs.push({ id, golden: g.useSound, ours: usesound[String(id)] });
  }
}

// ---- 特殊行为字段清单（channel/holdStyle/useStyle5/reuseDelay/speedRand/multishotPerCycle/shootsOnRelease/gunProj/branches）----
const special = [];
for (const id of goldenIds) {
  const g = golden.items[id];
  const sp = [];
  if (g.channel) sp.push('channel');
  if (g.useStyle === 5) sp.push('useStyle5');
  if (g.useStyle === 13) sp.push('useStyle13');
  if (g.reuseDelay) sp.push('reuseDelay=' + g.reuseDelay);
  if (g.speedRand) sp.push('speedRand');
  if (g.multishotPerCycle) sp.push('multishotPerCycle');
  if (g.shootsEveryUse) sp.push('shootsEveryUse');
  if (g.shootsOnRelease) sp.push('shootsOnRelease');
  if (g.gunProj) sp.push('gunProj');
  if (g.branches) sp.push('branches');
  if (sp.length) special.push({ id, cls: classify(g), sp });
}

// ---- 纯近战（damage>0 && 无 shoot && melee && 非 noMelee）----
const pureMeleeAll = [];
for (const [idS, c] of Object.entries(combatRaw)) {
  const id = Number(idS);
  if ((c.damage ?? 0) > 0 && !c.shoot && c.melee && !c.noMelee) {
    pureMeleeAll.push({ id, damage: c.damage, knockBack: c.knockBack ?? 0, useTime: c.useTime ?? 0, useAnimation: c.useAnimation ?? 0,
      autoReuse: !!c.autoReuse, inGolden: !!golden.items[idS], implKey: implementedVia(id) });
  }
}
pureMeleeAll.sort((a, b) => a.id - b.id);

// ItemID.cs 名字表
const nameCs = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1458/Terraria.ID/ItemID.cs', 'utf8');
const names = {};
for (const m of nameCs.matchAll(/public const short (\w+) = (\d+);/g)) names[Number(m[2])] = m[1];

// ---- golden 796 中未在 items.ts 注册的（= 游戏里没有该物品）----
const unimplementedGolden = goldenIds.filter(id => !implementedVia(id)).map(id => ({
  id, name: names[id] ?? '?', cls: classify(golden.items[id]),
  damage: golden.items[id].damage ?? 0, shoot: (golden.items[id].shoot || []).join('/'),
}));

// ---- 每件 golden 武器的族归属 + 弹道痕迹 ----
const perItem = goldenIds.map(id => {
  const g = golden.items[id];
  const dk = dispatchKind(id);
  const shoots = Array.isArray(g.shoot) ? g.shoot : (g.shoot ? [g.shoot] : []);
  return {
    id, name: names[id] ?? '?', cls: classify(g), damage: g.damage ?? 0,
    shoot: shoots.join('/'), ai: dk.ai, kind: dk.kind,
    impl: implementedVia(id),
    trace: shoots.length ? shoots.map(p => projTrace(p)) : [],
    special: (special.find(s => s.id === id) ?? {}).sp ?? [],
    branches: !!g.branches,
  };
});

const out = {
  meta: { goldenCount: goldenIds.length, extractPatchKeys: Object.keys(EXTRACT_PATCH).length,
    whipKeys: Object.keys(whips).length, viRegistered: viIds.size, autoRegistered: metaIds.size },
  classes: {}, classIds: {},
  diffs, soundDiffs, multiShotGaps, special, missingInOurs, pureMeleeAll, names,
  unimplementedGolden, perItem,
};
for (const id of goldenIds) {
  const cls = classify(golden.items[id]);
  (out.classes[cls] ||= []).push(id);
}
writeFileSync('/tmp/recon/_coverage-audit.json', JSON.stringify(out));
console.log('golden:', goldenIds.length, '| diff fields:', diffs.length, '| sound:', soundDiffs.length,
  '| multishot gaps:', multiShotGaps.length, '| special:', special.length, '| missingInOurs:', missingInOurs.length,
  '| pureMelee(no-shoot):', pureMeleeAll.length, '| unimplementedGolden:', unimplementedGolden.length);
for (const k of Object.keys(out.classes)) console.log(' ', k, out.classes[k].length);
console.log('--- unimplemented golden ids ---');
for (const u of unimplementedGolden) console.log(u.id, u.name, u.cls, 'dmg=' + u.damage, 'shoot=' + u.shoot);
console.log('--- pureMelee unimplemented ---');
console.log(pureMeleeAll.filter(p => !p.implKey).map(p => p.id + ':' + (names[p.id] ?? '?')).join(', ') || '(none)');
console.log('--- multishot gaps ---');
for (const m of multiShotGaps) console.log(m.id, names[m.id] ?? '?', 'shoots=[' + m.goldenShoots + '] number=' + m.number + ' override=' + m.overrideShoot + ' branches=' + m.branches + ' oursShoot=' + m.oursShoot);
console.log('--- dispatch kinds ---');
const kindCount = {};
for (const p of perItem) { kindCount[p.kind] = (kindCount[p.kind] ?? 0) + 1; }
console.log(JSON.stringify(kindCount));
// 无弹道痕迹（code token 零命中）的件
const noTrace = perItem.filter(p => p.trace.length && p.trace.every(t => t.codeCount === 0));
console.log('--- golden weapons whose shoot proj has ZERO code trace:', noTrace.length);
console.log(noTrace.slice(0, 80).map(p => p.id + ':' + p.name).join(', '));
