// ★BJ69 一次性审计（2026-09-14）：非使用物 useStyle 门推广的误杀面清查。
//  铁律=先定谳再动刀：落刀前用反编译 Item.cs（1457 权威）机械提取每 id 的
//  useStyle 真值（SetDefaults1..5 顺序 switch 链执行序仿真），与仓内运行时
//  数据源 vanilla-itemfunc.json（heldUseStyle 消费面）逐 id 对拍：
//   A 面（误杀风险）：vanilla useStyle>0 但 itemfunc 缺/0 → 新门会吞掉原版
//      该有的挥摆——再按「是否被上方/臂内特殊支消费」过滤，
//      幸存者 = 真·误杀候选（须处理才可落刀）。
//   B 面（修复目标）：vanilla 无 useStyle 且 itemfunc 缺/0、且经「其它物品」
//      臂兜底起挥 → 数据门正确静默面（RB15a 袋家族的推广面）。
// 用法: node tools/run-diag.mjs tools/_bj69-nouse-item-audit.mjs
// ★勘误（同批晚点定谳）：Item.SetDefaults（Item.cs:48666-48711）对 SetDefaults1..5
//  为【独占区间分派】（≤1000/≤2001/≤3000/≤3989/其余;IsFood→SetFoodDefaults）——本脚本
//  落刀期版本按「顺序多区执行」建模,对跨区同 id 有伪值面（如 4785 的 default-return
//  链被误判终止）。canonical 逐 id 锁=tests/bj69-nouse-gate.test.ts（独占分派+
//  default 兜底+条件栈解释器,含手读锚定）;本脚本保留作发现期证据与消费分类面。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const GAME = join(ROOT, 'game');
const SRC = readFileSync(join(ROOT, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const LINES = SRC.split('\n');

// ============ 1) SetDefaults1..5 方法体切片 ============
function methodRange(name) {
  const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let depth = 0;
  for (let i = sig; i < LINES.length; i++) {
    depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
    if (depth === 0 && i > sig) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}
const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults'].map((n) => [n, methodRange(n)]);

// ============ 2) DefaultTo* 辅助函数 useStyle 种子（方法体顶层首个 useStyle 赋值） ============
function helperUseStyle(name) {
  let r;
  try { r = methodRange(name); } catch { return undefined; }
  for (let i = r[0]; i <= r[1]; i++) {
    const m = LINES[i].match(/^\t\tuseStyle = (\d+);/);
    if (m) return +m[1];
  }
  return undefined;
}
const HELPERS = {};
for (const n of ['DefaultToPlaceableTile', 'DefaultToPlaceableWall', 'DefaultToCapturedCritter', 'DefaultToFood',
  'DefaultToHealingPotion', 'DefaultToManaPotion', 'DefaultToTorch', 'DefaultToMusicBox', 'DefaultToBanner',
  'DefaultToMonolith', 'DefaultToSeaShell', 'DefaultToGolfBall', 'DefaultToGolfClub', 'DefaultToLawnMower',
  'DefaultToGuitar', 'DefaultToQuestFish', 'DefaultToVoiceOverrideAccessory', 'DefaultToBomb', 'DefaultToSolution',
  'DefaultToWhip', 'DefaultToKite', 'DefaultToVanitypet', 'DefaultToSpear', 'DefaultToBow', 'DefaultToStaff',
  'DefaultToMagicWeapon', 'DefaultToRangedWeapon', 'DefaultToThrownWeapon', 'DefaultToFood']) {
  const v = helperUseStyle(n);
  if (v !== undefined) HELPERS[n] = v;
}

const lineDepth = (l) => (l.match(/^\t*/) ?? [''])[0].length;

/** 单个 switch(type) 块的 case 标签组收集（花括号层级感知，不依赖 tab 深度——
 *  反编译缩进异构：`switch (type)`/`{`/`case` 同深度也合法）。
 *  level 0 = switch 头/闭括号；level 1 = switch 体（直属 case）；≥2 = 嵌套块。 */
function switchCases(from, to, startLine) {
  let level = 0, bodyEnd = to;
  const cases = [];
  let curIds = [], curStart = -1, curEnd = -1;
  const flush = () => {
    if (curStart >= 0) cases.push({ ids: [...curIds], start: curStart, end: curEnd });
    curIds = []; curStart = -1; curEnd = -1;
  };
  for (let k = startLine; k <= to; k++) {
    const opens = (LINES[k].match(/{/g) ?? []).length;
    const closes = (LINES[k].match(/}/g) ?? []).length;
    const before = level;
    level += opens - closes;
    if (k > startLine && level === 0 && before === 1) {   // switch 体闭括号
      if (curStart >= 0) curEnd = k - 1;
      flush();
      bodyEnd = k;
      return { cases, bodyEnd };
    }
    if (level === 1) {
      const cl = LINES[k].trim().match(/^case (\d+):\s*$/);
      if (cl) {
        // 连续标签（fallthrough 组）共享同一体：体尚未开始（curEnd<curStart）则并入，
        // 已有体行则 flush 后起新组
        if (curStart >= 0 && curEnd >= curStart) flush();
        curIds.push(+cl[1]);
        if (curStart < 0) { curStart = k + 1; curEnd = k; }
        continue;
      }
      if (curStart >= 0) curEnd = k;
    } else if (curStart >= 0 && level >= 2) {
      curEnd = k;   // 嵌套块行计入当前 case 体
    }
  }
  flush();
  return { cases, bodyEnd };
}

/**
 * per-id useStyle 真值。C# 语义：SetDefaults1..5 顺序执行，每个 switch(type)
 * 命中首个匹配 case 标签组（fallthrough 组全体成员命中同一体），体按行执行：
 *  · `useStyle = N;` 无条件 → 覆写；`if (type == N)`/`N == type` 内 → 仅 N；
 *  · `if (Variant != …)` 基态恒真 / `if (Variant == …)` 恒假（FX53 定谳口径）；
 *  · `DefaultToXxx(` → 辅助函数 useStyle 种子；
 *  · `return` → 整个方法终止（后续 switch 不可达）；`break` → 本 switch 结束。
 */
function vanillaUseStyle(vid) {
  const result = { v: 0, where: '' };
  for (const [name, [from, to]] of REGIONS) {
    let i = from;
    while (i <= to) {
      if (!/^\t*switch \(type\)\s*$/.test(LINES[i])) { i++; continue; }
      const { cases, bodyEnd } = switchCases(from, to, i);
      for (const c of cases) {
        if (!c.ids.includes(vid)) continue;
        let pendingCond = null, ret = false;
        for (let k = c.start; k <= c.end; k++) {
          const s = LINES[k].trim();
          if (!s) continue;
          const cme = s.match(/^if \((?:type == (\d+)|(\d+) == type)\)\s*$/);
          const vne = s.match(/^if \(Variant != [^)]+\)\s*$/);
          const veq = s.match(/^if \(Variant == [^)]+\)\s*$/);
          if (cme) { pendingCond = { kind: 'eq', id: +cme[1] }; continue; }
          if (vne) { pendingCond = { kind: 'variant', applies: true }; continue; }
          if (veq) { pendingCond = { kind: 'variant', applies: false }; continue; }
          const um = s.match(/^useStyle = (\d+);$/);
          if (um) {
            const condOk = !pendingCond || (pendingCond.kind === 'eq' ? pendingCond.id === vid : pendingCond.applies);
            if (condOk) { result.v = +um[1]; result.where = `${name}:L${k + 1}`; }
            pendingCond = null;
            continue;
          }
          if (s === '{') continue;   // 块开括号不清条件（if 头跨行）
          if (s === '}') { pendingCond = null; continue; }
          if (/^return/.test(s)) { ret = true; pendingCond = null; continue; }
          if (s === 'break;') { pendingCond = null; continue; }
          const hm = s.match(/^(DefaultTo\w+)\(/);
          if (hm) {
            const hv = HELPERS[hm[1]];
            if (hv !== undefined) { result.v = hv; result.where = hm[1]; }
            pendingCond = null;
            continue;
          }
          if (/^(SetShopValues|Item\.|int |float |bool |Vector2 |for |if |else)/.test(s)) {
            // 其它赋值/控制流：条件体语义不展开（useStyle 已在窄式覆盖）；
            // 仅当行首 if 不匹配窄式时清 pending（防跨块串扰）
            if (!cme && !vne && !veq) pendingCond = null;
            continue;
          }
          pendingCond = null;
        }
        if (ret) return result;
      }
      i = i + 1;           // 嵌套 switch（外层 case 体内）也要扫到——不能跳过外层体
    }
  }
  return result;
}

// ============ 4) 仓内运行时数据源 ============
const func = JSON.parse(readFileSync(join(GAME, 'src', 'data', 'vanilla-itemfunc.json'), 'utf8'));
const combat = JSON.parse(readFileSync(join(GAME, 'src', 'data', 'vanilla-itemcombat.json'), 'utf8'));
const vanillaMeta = JSON.parse(readFileSync(join(GAME, 'public', 'sprites', 'vanilla.json'), 'utf8'));
const ALL_VIDS = Object.keys(vanillaMeta.items).map(Number).filter((n) => n > 0);
const mounts = JSON.parse(readFileSync(join(GAME, 'src', 'data', 'vanilla-mounts.json'), 'utf8'));
const MOUNT_ITEMS = new Set(Object.keys(mounts.itemMount ?? {}).map(Number));

const gs = readFileSync(join(GAME, 'src', 'core', 'Game.ts'), 'utf8');
const parseSetFrom = (src, name) => {
  const m = src.match(new RegExp(`(?:const|export const) ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!m) return new Set();
  return new Set(m[1].replace(/\/\/[^\n]*/g, '').split(',')
    .map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0));
};
const SETS = {
  BOSS_BAG: parseSetFrom(gs, 'BOSS_BAG_NO_USE_VIDS'),
  TELEPORT: parseSetFrom(gs, 'TELEPORT_ITEM_VIDS'),
  PERMANENT: parseSetFrom(gs, 'PERMANENT_USE_VIDS'),
  FUN_USE: parseSetFrom(gs, 'FUN_USE_VIDS'),
  ORPHAN_THROW: parseSetFrom(gs, 'ORPHAN_THROW_VIDS'),
  ORPHAN_B2: parseSetFrom(gs, 'ORPHAN_B2_VIDS'),
  ORPHAN_B1: parseSetFrom(gs, 'ORPHAN_B1_BUFF_VIDS'),
};
const INLINE_VIDS = new Set();
for (const m of gs.matchAll(/else if \(heldDef && \[([[\]0-9,\s.]+)\]\s*\n?\s*\.includes/g)) {
  for (const n of m[1].match(/\d+/g) ?? []) INLINE_VIDS.add(+n);
}
const SPECIAL_VID = new Set([43, 29, 109, 1291, 5340, 2610, 4049, 1130, 5438, 5518, 3989, 4271, 4382, 5336, 1844, 1958, 4095]);
for (let v = 4242; v <= 4253; v++) SPECIAL_VID.add(v);

const keysOfLiteral = (src, name) => {
  const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) return [];
  return [...m[1].matchAll(/(?:^|[{,\n])\s*(\d+)\s*:/g)].map((x) => +x[1]);
};
const crittersSrc = readFileSync(join(GAME, 'src', 'data', 'critters.ts'), 'utf8');
const CRITTER_ITEMS = new Set(keysOfLiteral(crittersSrc, 'CRITTER_RELEASE_BY_ITEM'));
const hooksSrc = readFileSync(join(GAME, 'src', 'data', 'grappleHooks.ts'), 'utf8');
const HOOK_VIDS = new Set(keysOfLiteral(hooksSrc, 'HOOK_ITEMS'));
const itemsSrc = readFileSync(join(GAME, 'src', 'data', 'items.ts'), 'utf8');
const PLACE_ALT_USE = parseSetFrom(itemsSrc, 'PLACE_TILE_ON_ALT_USE');
const dyeJson = JSON.parse(readFileSync(join(GAME, 'src', 'data', 'vanilla-hairdyes.json'), 'utf8'));
const HAIR_DYE = new Set([...Object.keys(dyeJson.hairDyes ?? {}).map(Number), dyeJson.meta?.removerItem].filter((n) => n > 0));

// ============ 5) 消费分类（保守：只认确定的消费支） ============
function classify(vid) {
  const f = func[String(vid)] ?? {};
  const c = combat[String(vid)] ?? {};
  const meta = vanillaMeta.items[String(vid)] ?? {};
  const cons = [];
  if (f.pick > 0 || f.axe > 0 || f.hammer > 0) cons.push('tool');
  if (meta.createTile != null || f.createTile != null) cons.push('tile');
  if (f.createWall != null) cons.push('wall');
  if (HOOK_VIDS.has(vid)) cons.push('hook');
  if (f.fishingPole) cons.push('fishingPole( ladderB 自挥)');
  if (CRITTER_ITEMS.has(vid)) cons.push('critter(臂内)');
  if (MOUNT_ITEMS.has(vid)) cons.push('mount(臂内)');
  if (HAIR_DYE.has(vid)) cons.push('hairDye');
  if (SETS.TELEPORT.has(vid)) cons.push('teleport');
  if (SETS.PERMANENT.has(vid)) cons.push('permanent');
  if (SETS.FUN_USE.has(vid)) cons.push('funUse');
  if (SETS.ORPHAN_THROW.has(vid) || SETS.ORPHAN_B1.has(vid) || SETS.ORPHAN_B2.has(vid)) cons.push('orphan');
  if (SPECIAL_VID.has(vid) || INLINE_VIDS.has(vid)) cons.push('specialVid');
  if (PLACE_ALT_USE.has(vid)) cons.push('placeAltUse');
  if (f.consumable && (f.healLife > 0 || f.healMana > 0 || (f.buffType ?? 0) > 0)) cons.push('potion(药水桥)');
  if ((f.damage ?? 0) > 0 || (f.shoot ?? 0) > 0 || f.melee || f.ranged || f.magic || f.summon
    || (c.damage ?? 0) > 0 || (c.shoot ?? 0) > 0) cons.push('weapon?');
  return cons;
}

// ============ 6) 对拍 ============
const riskA = [];   // 误杀风险:vanilla>0 但 itemfunc 缺/0
const fixB = [];    // 门正确静默且无消费支
let agreeUse = 0, agreeNoUse = 0, funcOnly = 0;
const funcOnlyList = [];
for (const vid of ALL_VIDS) {
  const vt = vanillaUseStyle(vid);
  const fv = func[String(vid)]?.useStyle ?? 0;
  if (vt.v > 0 && fv === 0) riskA.push({ vid, v: vt.v, where: vt.where, consumers: classify(vid) });
  else if (vt.v === 0 && fv === 0) {
    if (classify(vid).length === 0) fixB.push({ vid });
    else agreeNoUse++;
  } else if (vt.v > 0 && fv > 0) agreeUse++;
  else { funcOnly++; funcOnlyList.push({ vid, fv }); }
}
console.log('funcOnlyList 前 25:', funcOnlyList.slice(0, 25).map((r) => `${r.vid}(func=${r.fv})`).join(' '));
console.log('== DefaultTo* useStyle 种子 ==');
console.log(HELPERS);
console.log(`\n== 对拍（vanilla.json 注册 id 共 ${ALL_VIDS.length} 件）==`);
console.log(`双正（vanilla>0 ∧ func>0）: ${agreeUse}`);
console.log(`双零且无消费支（门正确静默、现状兜底挥=bug 面）: ${fixB.length}`);
console.log(`双零但有消费支: ${agreeNoUse}`);
console.log(`func-only（vanilla 链未命中——提取自 SetDefaults 外通道/模板缺）: ${funcOnly}`);
console.log(`\nA 面 误杀风险（vanilla>0 ∧ func 缺/0）: ${riskA.length}`);
for (const r of riskA) console.log(`  ${r.vid} vanilla=${r.v}（${r.where}）consumers=[${r.consumers.join(',') || '无'}]`);
console.log(`\nB 面 样本（前 40）: ${fixB.slice(0, 40).map((r) => r.vid).join(', ')}`);
console.log('\n== 臂内特殊支 useStyle 数据在位性（门不得吞）==');
let armRisk = 0;
for (const vid of [...CRITTER_ITEMS, ...MOUNT_ITEMS, 43]) {
  const fv = func[String(vid)]?.useStyle ?? 0;
  const vt = vanillaUseStyle(vid);
  if (fv === 0 || vt.v === 0) { console.log(`  !! ${vid} func=${fv} vanilla=${vt.v} ← 门风险`); armRisk++; }
}
console.log(armRisk === 0 ? '  全部在位（critter+mount+43 均有 useStyle 数据）' : `  风险 ${armRisk} 件`);
const bagList = [...SETS.BOSS_BAG];
console.log(`\n== 袋 21 件 func useStyle 全 0 应答: ${bagList.filter((v) => (func[String(v)]?.useStyle ?? 0) === 0).length}/21 ==`);
console.log('OK');
