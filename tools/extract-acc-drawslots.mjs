// 从 1456 反编译 Item.cs SetDefaults1-5 提取配饰身上贴图绘制槽（Player.cs
// UpdateVisibleAccessory :36441-36520 消费的 11 个 Item.xxxSlot 字段）：
//   backSlot/frontSlot/shieldSlot/shoeSlot/waistSlot/neckSlot/faceSlot/
//   balloonSlot/handOnSlot/handOffSlot/beardSlot
// → src/data/vanilla-acc-drawslots.json（vid → {family: slotId}，仅非空槽）。
// 解析口径与 tools/extract-equip-prefix.mjs 同法（case 共享体全体标签 + 嵌套
// switch(type) 命中分支 + type 算式求值），另补一类：default 体内的
// `if (type >= A && type <= B)` 范围块（虚荣披风 2284-2287 backSlot/frontSlot
// 算式族——extract-equip-prefix 的 case 段扫描不含 default 体，Boss 面具同款缺口，
// patch-vanity-stats.mjs ③ 同类补法）。
// 用法: node tools/extract-acc-drawslots.mjs [--audit] [--ver=1457|1458]
//   （--audit=字节级对账通道,只比对不落盘,漂移 exit 1；SW_VER/--ver 选标杆,缺省 1457）
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期①【洗库险】清偿——原缺省无 env 无旗直写现库）：
//   ① SW_ITEM_VER（家族标准面,SW_VER=legacy 别名仍受纳）/--ver 白名单 {1457,1458}
//     （Item.cs 1457↔1458 逐字节全等 md5 15ebd617,BJ298
//     亲核;1456 锚集退役显式拒+指引——2026-08-23 基准切 1457）;缺省 1457（拍板#7A）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库双向路径级 diff——live-only=洗库
//     预警/fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 /
//     --write-real=写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era
//     双旗）;SW_OUT 与 --write-real 双旗互斥;非 1457 禁写真库;探测注入面
//     SW_ACC_DRAWSLOTS_JSON 与 --write-real 混用拒（g1 footgun,探测与写盘分离=守卫被绕过）;
//   ③ 锚 fail-loud：SetDefaults1..5 五方法体全命中（原 methodBodyOf 静默返空反模式已修）+
//     哨兵 vid 硬校验（49/532/2287/5106/3252/3731 族位）+基数护栏（vid≥160/族分布下限）;
//   ④ 判别力自证：tests/extract-drawslots-era-guard.test.ts（M1 摘干跑门/M2 毒化锚/
//     M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const AUDIT = process.argv.includes('--audit');
const VER = (process.argv.find((a) => a.startsWith('--ver='))?.slice(6)
  ?? process.env.SW_ITEM_VER ?? process.env.SW_VER ?? '1457').replace(/[^0-9]/g, '') || '1457';
// ---- ★BJ298 era guard ①：版本白名单 + ②：输出通道开关（对拍在文末落盘段） ----
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}Terarria${VER}/Terraria/Item.cs`)) {
  console.error(`[extract-acc-drawslots] 拒绝运行：SW_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（2026-08-23 基准切 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-acc-drawslots] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-acc-drawslots] 拒绝写真库：SW_VER=${VER}≠1457（旧基线重放禁写 vanilla-acc-drawslots.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_ACC_DRAWSLOTS_JSON !== undefined) {
  console.error('[extract-acc-drawslots] 拒绝运行：探测注入面（SW_ACC_DRAWSLOTS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const src = readFileSync(`${ROOT}Terarria${VER}/Terraria/Item.cs`, 'utf8');

// ---- 与 extract-equip-prefix.mjs 同款的解析核（该脚本非模块,此处复制;改动须双同步）----
function methodBodyOf(src, name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}

/** case/default 段收集（default 也收——键 'def'，供范围块二次解析） */
function outerCaseSegments(src) {
  const out = new Map();
  const collect = (body) => {
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0;
    let m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*type\b/.test(t), opened: false, bodyDepth: -1, labels: [], segStart: 0 });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') {
            // switch 收尾段：末标签组同写；无标签（default 收尾/switch 前缀）→ def 累积
            if (top.labels.length === 0) {
              const prev = out.get('def') ?? '';
              out.set('def', prev ? prev + '\n' + seg : seg);
            } else {
              for (const id of top.labels) out.set(id, seg);
            }
          }
          stack.pop();
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') {
            // 落空标签组（case A: case B: 共享体）全体标签同写；default 体单独
            // 累积（键 'def'）供范围块二次解析
            if (top.labels.length === 0) {
              const prev = out.get('def') ?? '';
              out.set('def', prev ? prev + '\n' + seg : seg);
            } else {
              for (const id of top.labels) out.set(id, seg);
            }
            top.labels = [];
          }
          if (t !== 'default:') top.labels.push(+m[2]);
          top.segStart = m.index + t.length;
        }
      }
    }
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    // ★BJ298 ③ 锚 fail-loud（原 methodBodyOf 未命中静默返空→整段漏提反模式已修）
    if (!body) throw new Error(`[extract-acc-drawslots] 锚点失配: SetDefaults${n} 方法体未找到（源码漂移,禁止静默空扫）`);
    collect(body);
  }
  return out;
}

const CASE_SEGMENTS = outerCaseSegments(src);

function typeSwitchSpans(seg) {
  const spans = [];
  const re = /switch\s*\(\s*type\s*\)/g;
  let m;
  while ((m = re.exec(seg))) {
    const brace = seg.indexOf('{', m.index + m[0].length);
    if (brace < 0) break;
    let d = 0, end = -1;
    for (let i = brace; i < seg.length; i++) {
      if (seg[i] === '{') d++;
      else if (seg[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) break;
    spans.push([m.index, end + 1]);
    re.lastIndex = end + 1;
  }
  return spans;
}

function parseSwitchCases(swBody) {
  const cases = new Map();
  let def = null;
  const tokRe = /case (\d+):|default:|[{}]/g;
  let depth = 0, segStart = 0, m;
  let pending = [];
  const flush = (endIdx) => {
    const body = swBody.slice(segStart, endIdx);
    if (body.trim() === '') return;
    for (const L of pending) { if (L === 'def') def = body; else cases.set(L, body); }
    pending = [];
  };
  while ((m = tokRe.exec(swBody))) {
    const t = m[0];
    if (t.startsWith('case') || t === 'default:') {
      if (depth === 0) {
        flush(m.index);
        pending.push(t === 'default:' ? 'def' : +m[1]);
        segStart = m.index + t.length;
      }
    } else if (t === '{') depth++;
    else if (t === '}') depth--;
  }
  flush(swBody.length);
  return { cases, def };
}

function caseParts(seg, id) {
  const spans = typeSwitchSpans(seg);
  const parts = [];
  let last = 0;
  for (const [s, e] of spans) {
    parts.push(seg.slice(last, s));
    const brace = seg.indexOf('{', s);
    const { cases, def } = parseSwitchCases(seg.slice(brace + 1, e - 1));
    parts.push(cases.has(id) ? cases.get(id) : (def ?? ''));
    last = e;
  }
  parts.push(seg.slice(last));
  return parts;
}

function evalTypeExpr(expr, id) {
  const cleaned = expr.replace(/\(\s*(?:sbyte|byte|short|ushort|int|uint|long|ulong)\s*\)\s*/g, '').trim();
  if (!/^[\d\s+\-*/().]*\btype\b[\d\s+\-*/().]*$/.test(cleaned)) return undefined;
  try {
    const v = new Function('type', `"use strict";return (${cleaned});`)(id);
    return Number.isFinite(v) ? v : undefined;
  } catch { return undefined; }
}

const FIELDS = ['backSlot', 'frontSlot', 'shieldSlot', 'shoeSlot', 'waistSlot', 'neckSlot',
  'faceSlot', 'balloonSlot', 'handOnSlot', 'handOffSlot', 'beardSlot'];

// ---- ① case 段：逐 id 逐字段（嵌套 switch 命中分支拼接,后值覆盖先值）----
const table = new Map();   // vid -> {family: slot}
const put = (id, fam, v) => {
  if (!Number.isFinite(v) || v <= 0) return;
  const k = String(id);
  if (!table.has(k)) table.set(k, {});
  table.get(k)[fam] = v;
};
const famOf = (f) => f.replace(/Slot$/, '').replace(/^handOn$/, 'handOn').replace(/^handOff$/, 'handOff')
  .replace('back', 'back').replace('front', 'front').replace('shield', 'shield').replace('shoe', 'shoe')
  .replace('waist', 'waist').replace('neck', 'neck').replace('face', 'face').replace('balloon', 'balloon')
  .replace('beard', 'beard');

for (const [id, seg] of CASE_SEGMENTS) {
  if (id === 'def') continue;
  for (const f of FIELDS) {
    const fam = famOf(f);
    let val;
    for (const p of caseParts(seg, id)) {
      const m = p.match(new RegExp(`\\b${f}\\s*=\\s*([^;]+);`));
      if (m && m[1] !== undefined) {
        const lit = m[1].trim();
        if (/^-?\d+$/.test(lit)) val = +lit;
        else {
          const v = evalTypeExpr(lit, id);
          if (v !== undefined) val = v;
        }
      }
    }
    if (val !== undefined) put(id, fam, val);
  }
}

// ---- ② default 体内 `if (type >= A && type <= B)` 范围块（嵌套 switch 已在
//      caseParts 命中分支处理,这里只取外层余体的范围块）----
for (const [key, seg] of CASE_SEGMENTS) {
  if (key !== 'def') continue;
  const spans = typeSwitchSpans(seg);
  const parts = [];
  let last = 0;
  for (const [s, e] of spans) { parts.push(seg.slice(last, s)); last = e; }
  parts.push(seg.slice(last));
  const outer = parts.join('\n');
  const rangeRe = /if\s*\(\s*type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)\s*\)/g;
  let m;
  while ((m = rangeRe.exec(outer))) {
    const brace = outer.indexOf('{', m.index + m[0].length);
    if (brace < 0) continue;
    let d = 0, end = -1;
    for (let i = brace; i < outer.length; i++) {
      if (outer[i] === '{') d++;
      else if (outer[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const body = outer.slice(brace + 1, end);
    const lo = +m[1], hi = +m[2];
    for (const f of FIELDS) {
      const fm = body.match(new RegExp(`\\b${f}\\s*=\\s*([^;]+);`));
      if (!fm) continue;
      const fam = famOf(f);
      for (let id = lo; id <= hi; id++) {
        const lit = fm[1].trim();
        const v = /^-?\d+$/.test(lit) ? +lit : evalTypeExpr(lit, id);
        if (v !== undefined) put(id, fam, v);
      }
    }
  }
}

// ---- 落盘 ----
const out = Object.fromEntries([...table.entries()]
  .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort())])
  .sort((a, b) => +a[0] - +b[0]));
const json = JSON.stringify(out, null, 0) + '\n';
const TARGET = `${ROOT}game/src/data/vanilla-acc-drawslots.json`;
const LIVE_JSON = process.env.SW_ACC_DRAWSLOTS_JSON ?? TARGET;

// ---- ★BJ298 ③ 锚 fail-loud：哨兵 vid 族位硬校验（原 print-only 抽查升格断言）----
{
  const probes = [
    ['49', 'handOn', 2], ['532', 'back', 2],
    ['2287', 'back', 6], ['2287', 'front', 4],
    ['5106', 'beard', 4], ['3252', 'balloon', 15], ['3731', 'balloon', 17],
  ];
  const bad = probes.filter(([id, fam, v]) => out[id]?.[fam] !== v)
    .map(([id, fam, v]) => `${id}.${fam}=${out[id]?.[fam] ?? '∅'}≠${v}`);
  if (bad.length) throw new Error(`[extract-acc-drawslots] 锚点失配: 哨兵 vid 族位漂移: ${bad.join('; ')}（解析面漂移,禁止静默半表）`);
}
// ---- ★BJ298 ③ 基数护栏（1457 实测 vid 167 + 族分布,BJ298 --audit 定谳）----
{
  const famFloors = { back: 20, front: 8, shield: 8, shoe: 20, waist: 12, neck: 10, face: 12, balloon: 12, handOn: 25, handOff: 15, beard: 3 };
  const famCount = {};
  for (const v of Object.values(out)) for (const f of Object.keys(v)) famCount[f] = (famCount[f] ?? 0) + 1;
  const bad = Object.entries(famFloors).filter(([f, fl]) => (famCount[f] ?? 0) < fl).map(([f, fl]) => `${f} ${famCount[f] ?? 0} < ${fl}`);
  if (Object.keys(out).length < 160 || bad.length) {
    throw new Error(`[extract-acc-drawslots] 锚点失配: 基数护栏: vid ${Object.keys(out).length} < 160 或 ${bad.join('; ')}（解析面漂移,禁止静默半表）`);
  }
}

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash）----
/** 现库 vs 重产双向路径级 diff（对象键集+叶值;数组按位）。live-only=洗库预警面 /
 *  fresh-only=现库退化缺键型面（★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const outW = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) outW.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return outW;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    outW.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return outW;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { outW.liveOnly.push(p); continue; }
    const w = deepWash(live[k], fresh[k], p);
    outW.liveOnly.push(...w.liveOnly); outW.freshOnly.push(...w.freshOnly); outW.drift.push(...w.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) outW.freshOnly.push(`${prefix}.${k}`);
  return outW;
}
const washEmpty = (w) => !w.liveOnly.length && !w.freshOnly.length && !w.drift.length;
function washReport(w) {
  console.error('  物证：');
  if (w.liveOnly.length) console.error(`    [live-only] 现库独有 ${w.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${w.liveOnly.slice(0, 6).join(', ')}`);
  if (w.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${w.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${w.freshOnly.slice(0, 6).join(', ')}`);
  if (w.drift.length) console.error(`    [drift] 值漂移 ${w.drift.length}: ${w.drift.slice(0, 6).join(' | ')}`);
}
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(json));
if (AUDIT) {
  // --audit = 字节级对账通道（era guard 之外的对账面,漂移 exit 1）
  const cur = readFileSync(TARGET, 'utf8');
  console.log(cur === json ? 'audit: identical' : 'audit: DRIFT');
  process.exitCode = cur === json ? 0 : 1;
} else if (WRITE_REAL || SW_OUT) {
  const OUT_JSON = WRITE_REAL ? TARGET : `${SW_OUT.replace(/\/+$/, '')}/vanilla-acc-drawslots.json`;
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-acc-drawslots] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, json);
  console.error(`[extract-acc-drawslots] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-acc-drawslots] 干跑（零写盘）：现库缺 vanilla-acc-drawslots.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-acc-drawslots] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-acc-drawslots] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
const famCount = {};
for (const v of Object.values(out)) for (const f of Object.keys(v)) famCount[f] = (famCount[f] ?? 0) + 1;
console.log('vid 数:', Object.keys(out).length, '族分布:', JSON.stringify(famCount));
// 抽查锚点（Item.cs case 手读对照）：
//   49 再生手环 handOn=2(:1959 区) · 532 星星斗篷 back=2(:7701) ·
//   2284-2287 虚荣披风 back=3..6/front=1..4(范围块 :22968) · 5104-5106 威尔逊胡须
//   beard=2..4(:40884) · 3250-3252 马蹄气球族 balloon=13..15(:29923) ·
//   3730-3731 派对束气球 vanity balloon=16..17(:33035)
for (const probe of ['49', '532', '2284', '2287', '5104', '5106', '3250', '3252', '3730', '3731', '899', '900', '3991', '4822']) {
  console.log(' ', probe, JSON.stringify(out[probe] ?? null));
}
