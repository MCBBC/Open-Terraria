// ★RB17b 红队独立扫描 v2（2026-09-14）：useStyle 真值反向清查（B 面误杀候选）。
//  与 tools/_bj69-nouse-item-audit.mjs（发现期,顺序分派模型已自认勘误）和
//  tests/bj69-nouse-gate.test.ts（守卫）都不同源。v2 = 递归块解析器：
//   · case 标签组（含 fallthrough）体共享;体 = 到 break/return/下一 case/块尾
//   · 嵌套 switch(type) 递归;case 体继承外层 ctx（交集）
//   · if (type == N) / 区间 if 精化;Variant== 门=基态恒假→gated;Variant!= 恒真→不 gated
//   · DefaultTo* helper 种子（DefaultToFood useGulpSound=true→9,否则 2）
//   · default: 体 = 该 switch 域内未列 id（保守并入）
//  超集语义（宁多勿漏）,候选全部人工复核。自证：16 个已知正例必须全命中。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const LINES = SRC.split('\n');
const FUNC = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'vanilla-itemfunc.json'), 'utf8'));
const BACKFILL = { 226: 9, 2320: 1, 5326: 2, 4785: 4, 4786: 4, 4792: 4, 4793: 4, 4794: 4, 4795: 4 };
for (let i = 1874; i <= 1904; i++) BACKFILL[i] = 1;
BACKFILL[2337] = 1; BACKFILL[2338] = 1; BACKFILL[2436] = 1; BACKFILL[2437] = 1;

// ---------- helper useStyle 种子 ----------
function methodBody(name) {
  const sig = LINES.findIndex((l) => new RegExp(`\\bvoid ${name}\\(`).test(l));
  if (sig < 0) return null;
  let depth = 0;
  for (let i = sig; i < LINES.length; i++) {
    depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
    if (depth === 0 && i > sig) return [sig, i];
  }
  return null;
}
const HELPERS = {};
for (const n of ['DefaultToPlaceableTile', 'DefaultToPlaceableWall', 'DefaultToCapturedCritter', 'DefaultToFood',
  'DefaultToHealingPotion', 'DefaultToManaPotion', 'DefaultToTorch', 'DefaultToMusicBox', 'DefaultToBanner',
  'DefaultToMonolith', 'DefaultToSeaShell', 'DefaultToGolfBall', 'DefaultToGolfClub', 'DefaultToLawnMower',
  'DefaultToGuitar', 'DefaultToQuestFish', 'DefaultToVoiceOverrideAccessory', 'DefaultToBomb', 'DefaultToSolution',
  'DefaultToWhip', 'DefaultToKite', 'DefaultToVanitypet', 'DefaultToSpear', 'DefaultToBow', 'DefaultToStaff',
  'DefaultToMagicWeapon', 'DefaultToRangedWeapon', 'DefaultToThrownWeapon']) {
  const r = methodBody(n);
  if (!r) continue;
  for (let i = r[0]; i <= r[1]; i++) {
    const m = LINES[i].match(/^\t\tuseStyle = (\d+);/);
    if (m) { HELPERS[n] = +m[1]; break; }
  }
}

// ctx 表示：{ all:boolean, ids:Set<number>|null, gated:boolean, desc:string }
const ALL = (gated, desc) => ({ all: true, ids: null, gated, desc });
const IDS = (ids, gated, desc) => ({ all: false, ids, gated, desc });
function intersect(a, b) {
  if (a.gated || b.gated) {
    // 任一 gated → 整支 gated（保守:仍记录 id 但标 gated）
  }
  if (a.all) return IDS(b.ids ?? new Set(), a.gated || b.gated, `${a.desc}∩${b.desc}`);
  if (b.all) return IDS(a.ids, a.gated || b.gated, `${a.desc}∩${b.desc}`);
  const s = new Set([...a.ids].filter((x) => b.ids.has(x)));
  return IDS(s, a.gated || b.gated, `${a.desc}∩${b.desc}`);
}

const findings = [];
function record(ctx, style, where) {
  if (ctx.gated) return;   // 基态恒假支（Variant==）→ 不采用（登记不报）
  if (ctx.all) { findings.push({ wide: true, style, where, ctx: ctx.desc }); return; }
  for (const id of ctx.ids) findings.push({ id, style, where, ctx: ctx.desc });
}

// 解析 [from,to) 行区间（0-based idx），ctx 为进入该块的上下文
let TRACE_N = 0;
function parseBlock(from, to, ctx) {
  if (process.env.RB17B_TRACE && TRACE_N++ < 12) console.error(`[parseBlock ${from}..${to}] first=${JSON.stringify(LINES[from]?.trim())} ctx=${ctx.desc} n=${ctx.all ? 'ALL' : ctx.ids.size}`);
  let i = from;
  while (i < to) {
    const raw = LINES[i];
    const line = raw.trim();
    if (!line || line === '{' || line === '}') { i++; continue; }
    // 嵌套深度：本行是否有 {（块的开始）与匹配的 }
    let m;
    if ((m = line.match(/^switch \(type\)\s*\{?\s*$/)) || line === 'switch (type)') {
      // 找 switch 体 {..}（{ 在本行或下一行）
      let j = i; while (j < to && !LINES[j].includes('{')) { j++; }
      const body = braceSpan(j, to);
      parseSwitch(body.from + 1, body.to, ctx);
      i = body.to + 1; continue;
    }
    if ((m = line.match(/^case (\d+):/))) {
      // 收集连续标签组
      const ids = new Set();
      let k = i;
      let last = k;
      while (k < to) {
        const l2 = LINES[k].trim();
        const c2 = l2.match(/^case (\d+):/);
        if (c2) { ids.add(+c2[1]); last = k; k++; continue; }
        if (l2 === '{' || l2 === '}' || l2 === '' || /^switch \(type\)/.test(l2)) {
          if (l2 === 'switch (type)' || /^switch \(type\)/.test(l2)) break;
          k++; continue;   // 跳过标签间的空行/花括号
        }
        break;   // 体首行
      }
      // 体 = [k, 体尾)（到 break/return/下一 case/default/块尾）
      const bodyEnd = caseBodyEnd(k, to);
      const caseCtx = intersect(ctx, IDS(ids, ctx.gated, `case${[...ids].join(',')}@${last + 1}`));
      parseBlock(k, bodyEnd, caseCtx);
      // 跳到该 case 组体结束（fallthrough 由 caseBodyEnd 定界）
      i = bodyEnd;
      // 若 caseBodyEnd 停在下一 case 标签,继续循环处理它
      continue;
    }
    if ((m = line.match(/^if \((.*)\)\s*\{?\s*$/)) || (m = line.match(/^(else if \((.*)\))\s*\{?\s*$/))) {
      const cond = m[2] ?? m[1];
      const braceIdx = raw.includes('{') ? i : i + 1;   // { 在本行或下一行
      const body = braceSpan(braceIdx, to);
      const inner = refineCond(ctx, cond, i + 1);
      if (inner) parseBlock(body.from + 1, body.to, inner);
      // else 支
      let elseLine = -1;
      for (let q = body.to + 1; q < to; q++) {
        const l2 = LINES[q].trim();
        if (l2 === '' ) continue;
        if (/^else\b/.test(l2)) { elseLine = q; }
        break;
      }
      if (elseLine >= 0) {
        const l2 = LINES[elseLine].trim();
        if (l2 === 'else' || /^else if/.test(l2)) {
          const eBrace = LINES[elseLine].includes('{') ? elseLine : elseLine + 1;
          const eBody = braceSpan(eBrace, to);
          const innerElse = refineCond(ctx, l2 === 'else' ? 'ELSE' : l2.replace(/^else if \((.*)\)\s*\{?$/, '$1'), elseLine + 1);
          if (innerElse) parseBlock(eBody.from + 1, eBody.to, innerElse);
          i = eBody.to + 1; continue;
        }
      }
      i = body.to + 1; continue;
    }
    if (line === 'else' ) {
      const eBrace = raw.includes('{') ? i : i + 1;
      const eBody = braceSpan(eBrace, to);
      parseBlock(eBody.from + 1, eBody.to, ctx);   // 保守:else = 同 ctx
      i = eBody.to + 1; continue;
    }
    // 普通行
    parseStmt(line, i, ctx);
    i++;
  }
}

function parseStmt(line, i, ctx) {
  let m;
  if ((m = line.match(/^useStyle = (\d+);/))) { record(ctx, +m[1], `${i + 1}`); return; }
  if ((m = line.match(/^(DefaultTo\w+)\((.*)\);\s*$/)) && HELPERS[m[1]] !== undefined) {
    let style = HELPERS[m[1]];
    if (m[1] === 'DefaultToFood' && /(?:^|[, ])true(?:,|\)|$)/.test(m[2].trim())) style = 9;
    record(ctx, style, `${i + 1}:${m[1]}`);
  }
}

// case 体尾：从 k 起扫描,遇 break;/return;/case N:/default:（深度 0）止
function caseBodyEnd(from, to) {
  for (let k = from; k < to; k++) {
    const l = LINES[k].trim();
    if (/^(break|return|goto)/.test(l)) return k;         // 停在终结行（含）
    if (/^case \d+:/.test(l) || l === 'default:') return k;   // 下一组
    // 深度防护：本行净闭合把外层 case 体吞了（近似忽略——反编译 case 体在 switch 深度内）
  }
  return to;
}

function braceSpan(openIdx, to) {
  // LINES[openIdx] 含 '{'（或其后首个含 '{' 行）;返回 {from, to} = { 行,匹配 } 行 idx
  let i = openIdx;
  while (i < to && !LINES[i].includes('{')) i++;
  let depth = 0;
  for (let k = i; k < to; k++) {
    depth += (LINES[k].match(/{/g) ?? []).length - (LINES[k].match(/}/g) ?? []).length;
    if (depth === 0) return { from: i, to: k };
  }
  return { from: i, to: to - 1 };
}

// switch 体解析：域内 default 语义
function parseSwitch(from, to, ctx) {
  // 收集该 switch 的全部 case 标签（浅层）供 default 用
  let depth = 0;
  const labels = new Set();
  const lines = [];
  for (let k = from; k <= to; k++) {
    const raw = LINES[k];
    depth += (raw.match(/{/g) ?? []).length - (raw.match(/}/g) ?? []).length;
    if (depth < 0) break;
    lines.push(raw);
    const c = raw.trim().match(/^case (\d+):/);
    if (c && depth === 0) labels.add(+c[1]);
  }
  const sub = ALL(ctx.gated, `sw`);
  if (process.env.RB17B_TRACE && TRACE_N < 20) console.error(`[parseSwitch ${from}..${to}] labels=${labels.size}`);
  // 临时:在 sub 上跑 parseBlock,但 default 体需补未列 id —— 简化:先正常解析,
  // default 体单独收集（二次扫描）。
  parseBlockWithDefault(from, to, ctx, labels);
}
function parseBlockWithDefault(from, to, ctx, labels) {
  // 同 parseBlock,但遇到 default: 时 ctx = 方法域 id − labels（若 ctx.all 展开）
  let i = from;
  while (i < to) {
    const line = LINES[i].trim();
    if (line === 'default:') {
      const body = braceSpan(LINES[i].includes('{') ? i : i + 1, to);
      if (ctx.all) {
        // 方法域展开
        const ids = new Set();
        for (let x = 1; x <= 5455; x++) if (!labels.has(x)) ids.add(x);
        parseBlock(body.from + 1, body.to, IDS(ids, ctx.gated, `default@${i + 1}`));
      } else {
        const ids = new Set([...ctx.ids].filter((x) => !labels.has(x)));
        parseBlock(body.from + 1, body.to, IDS(ids, ctx.gated, `default@${i + 1}`));
      }
      i = body.to + 1; continue;
    }
    // 其余交给 parseBlock 的单步（重实现避免双解析:直接调 parseBlock 一次处理到 default 前）
    const start = i;
    let j = i;
    while (j < to && LINES[j].trim() !== 'default:') j++;
    if (j > start) parseBlock(start, j, ctx);
    i = j;   // default: 由循环头处理
    if (i < to && LINES[i].trim() === 'default:') continue;
    break;
  }
}

// 条件精化
function refineCond(ctx, cond, lineNo) {
  let m;
  if (cond === 'ELSE') return ctx;
  if (/Variant == ItemVariants/.test(cond)) return { all: ctx.all, ids: ctx.ids, gated: true, desc: `variant@${lineNo}` };
  if (/Variant != ItemVariants/.test(cond)) return ctx;   // 基态恒真
  if ((m = cond.match(/^type == (\d+)$/))) {
    return intersect(ctx, IDS(new Set([+m[1]]), false, `if==${m[1]}@${lineNo}`));
  }
  if ((m = cond.match(/^type >= (\d+) && type <= (\d+)$/))) {
    const s = new Set();
    for (let x = +m[1]; x <= +m[2]; x++) s.add(x);
    return intersect(ctx, IDS(s, false, `rng@${lineNo}`));
  }
  if ((m = cond.match(/^type >= (\d+) && type < (\d+)$/))) {
    const s = new Set();
    for (let x = +m[1]; x < +m[2]; x++) s.add(x);
    return intersect(ctx, IDS(s, false, `rng@${lineNo}`));
  }
  return ctx;   // 未知条件:保守继承
}

// 独占分派域（Item.cs:48666-48711;行号逐字核对）
const REGIONS = [
  ['SetFoodDefaults', 48041, 48543, null],
  ['SetDefaults1', 1388, 12931, [1, 1000]],
  ['SetDefaults2', 12932, 21380, [1001, 2001]],
  ['SetDefaults3', 21381, 27659, [2002, 3000]],
  ['SetDefaults4', 27660, 35462, [3001, 3989]],
  ['SetDefaults5', 35463, 48040, [3990, 5455]],
];
for (const [nm, a, b, dom] of REGIONS) {
  // 方法体真界：从签名行起
  const sig = LINES.findIndex((l) => new RegExp(`\\bvoid ${nm}\\(`).test(l));
  const start = sig >= 0 ? sig : a - 1;
  const span = braceSpan(start, b);
  const ctx = dom ? IDS(new Set(), false, nm) : ALL(false, nm);
  if (dom) for (let x = dom[0]; x <= dom[1]; x++) ctx.ids.add(x);
  parseBlock(span.from + 1, span.to, ctx);
}

// ---------- 汇总 ----------
const byId = new Map();
for (const f of findings) {
  if (f.wide) { byId.set('WIDE', byId.get('WIDE') ?? []); byId.get('WIDE').push(f); continue; }
  if (!byId.has(f.id)) byId.set(f.id, []);
  byId.get(f.id).push(f);
}
const gateZero = [];
for (const [id, list] of byId) {
  if (id === 'WIDE') continue;
  const gateData = FUNC[id]?.useStyle ?? BACKFILL[id] ?? 0;
  if (gateData > 0) continue;
  const last = list.reduce((a, b) => (+a.where.split(':')[0] > +b.where.split(':')[0] ? a : b));
  gateZero.push({ id, style: last.style, where: last.where, ctx: last.ctx, n: list.length });
}
gateZero.sort((a, b) => a.id - b.id);
console.log(`== 反向扫描：useStyle>0 可达但门数据=0 的 id（超集候选,人工复核）==`);
for (const g of gateZero) console.log(`${g.id}\tstyle=${g.style}\tItem.cs:${g.where}\t${g.ctx}\t(n=${g.n})`);
console.log(`total candidates: ${gateZero.length}; wide(unbounded) records: ${(byId.get('WIDE') ?? []).length}`);
// --- 中立性自证 ---
if (process.env.RB17B_DEBUG) {
  console.log(`scanner: ${byId.size - (byId.has('WIDE') ? 1 : 0)} ids, records=${findings.length}`);
  for (const id of [71, 72, 226, 2320, 1882, 2337, 2436, 4785, 4786, 4792, 5326, 1905]) {
    const list = byId.get(id);
    console.log(`  id=${id}: ` + (list ? list.map((f) => `${f.style}@${f.where}${f.ctx}`).join(' | ') : 'MISS'));
  }
  const knownPos = [71, 72, 73, 74, 226, 2320, 1882, 2337, 2436, 4785, 4786, 4792, 4793, 4794, 4795, 5326];
  const missing = knownPos.filter((i) => !byId.has(i));
  console.log(missing.length ? `SELF-TEST FAIL: missed ${missing.join(',')}` : 'SELF-TEST PASS: all 16 known positives hit');
}
