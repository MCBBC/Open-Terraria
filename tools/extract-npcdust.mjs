#!/usr/bin/env node
// tools/extract-npcdust.mjs —— NPC.HitEffect 受击/死亡尘提取器（BJ254 2026-09-21）
//
// 方法结构（Terarria1457/Terraria/NPC.cs）：`public void HitEffect(int hitDirection = 0,
// double dmg = 10.0)`（:82492-:90941）。Allman 括号（`{`/`}` 独立行）。主体 = 一串顶层
// `if (type==…)` 特殊块 + 中段 if/else-if 级联 + 尾段 `if (63||64||103) else { 第二层
// type 链 }`；尾层 catch-all else 以 `if (type != 156) { return; }` 开门——★原版无通用
// 尘尾：未列型受击/死亡【不出尘】（该 else 是 156 专属支,非兜底）。
// 每支内 `if (life > 0) { …; return; }` = 受击相（dmg/lifeMax×K 计数）；其 else = 死亡相
// （固定计数）；无 life 门 = both（HitEffect 受击/击杀两拍都调 → 两管线同发）。
//
// 提取语义（对齐 Dust.NewDust :75-196 执行语义）：
//   1. 物理行按括号深度拼逻辑行；缩进块栈记录每个 Dust.NewDust[Direct|Perfect] 调用的
//      完整守卫链（if/else-if/else 帧）与循环域（for 帧）；
//   2. npcId = 守卫链 type 谓词【OR 项并集 ∩ 跨层交集】：`type == N`、`type >= A &&
//      type <= B` 区间展开、链内嵌套 if 收窄；`if (type != 156) { return; }` 单排除
//      开门式识别为 156 专属；非 type 谓词（ai[1]/NPCID.Sets/dmg/netMode/daybreak/
//      UsesPartyHat/IsShimmerVariant/IsGoldCritter）整组 unsupported → pending；
//   3. 相位：链上最近 `life > 0` → hit；`life <= 0` → death；else 取反；无 → both；
//   4. 计数：`for (numX < N)` → n=N；`for ((double)numX < dmg/(double)lifeMax * K)` →
//      hitK=K（运行时 ceil(dmg/lifeMax×K)）；局部变量计数只在【唯一字面赋值】时还原，
//      多重/运行时赋值 → pending（552-554 变体族 num28 二次赋值即此形态）；
//   5. 实参白名单分类（spX/spY token、alpha/color/scale 数|npc 引用、盒锚 position/
//      center±常数、dustId 字面|唯一赋值局部）——白名单外整条 statement unsupported；
//   6. post 后处理：`Main.dust[numX].f =/ *= / /= v`、别名链（`Dust dustN = Main.dust[N]`
//      可重绑定）、`if (Main.rand.Next(K) == V) {…} else {…}` 概率分支 post（运行时掷骰
//      语义直译）；position/fadeIn/velocity.X+= 等不表达 → pending；
//   7. 派生 carve-out 不入尘表（_meta.carveOuts）：泼岩浆/亡体 NewNPC 等世界改写与生成族
//      （BJ246 已接/另刀）、gore 表（tools/extract-gore.mjs 全量承担）、音效/公告/DBT。
//
// era guard 四要素（docs/era-guard-family.md ①②③④）：
//   ① SW_ITEM_VER 白名单 {1457,1458} 缺省 1457 fail-closed（1456 锚集未建显式拒）；
//   ② 输出三分离：缺省干跑零写盘（摘要+对拍）；SW_OUT=<dir> 沙箱；--write-real 逃生门
//      （与 SW_OUT 互斥；非 1457 拒写真库）；
//   ③ 锚 fail-loud：方法签名 :82492/方法尾 :90941/调用基数 619/探针组锚行失配即 exit 1；
//   ④ 判别力自证：tests/extract-npcdust-era-guard.test.ts（毒锚必 exit≠0+锚点名、
//      干跑零写盘 canary、SW_OUT 重放确定性）。
//
// 1458 交叉：HitEffect 区 :82492-:90941 与 1457 逐字节全等（2026-09-21 diff 实证）。
//
// 用法：
//   node tools/extract-npcdust.mjs                 # 干跑：摘要 + 对拍现库
//   node tools/extract-npcdust.mjs --probe 59,1    # 干跑 + 打印指定型提取快照（手核）
//   SW_OUT=/tmp/x node tools/extract-npcdust.mjs   # 沙箱写 /tmp/x/vanilla-npcdust.json
//   node tools/extract-npcdust.mjs --write-real    # 定谳后写真库（禁非 1457）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_NAME = 'vanilla-npcdust.json';
const REAL_OUT = join(ROOT, 'src', 'data', OUT_NAME);

// ---------------- era guard ① 版本门 ----------------
const VER_WHITELIST = new Set([1457, 1458]);
const VER = process.env.SW_ITEM_VER ? Number(process.env.SW_ITEM_VER) : 1457;
if (!VER_WHITELIST.has(VER)) {
  console.error(`[era-guard] SW_ITEM_VER=${process.env.SW_ITEM_VER} 不在白名单 {1457,1458}（1456 锚集未建,显式拒并给退役指引,docs/era-guard-family.md ①）`);
  process.exit(1);
}
const REPO_VER = join(ROOT, '..', `Terarria${VER}`);
if (!existsSync(join(REPO_VER, 'Terraria', 'NPC.cs'))) {
  console.error(`[era-guard] 反编译目录缺失: ${REPO_VER}（fail-closed）`);
  process.exit(1);
}

// ---------------- era guard ② 输出三分离 ----------------
const SW_OUT = process.env.SW_OUT;
const WRITE_REAL = process.argv.includes('--write-real');
if (SW_OUT && WRITE_REAL) {
  console.error('[era-guard] SW_OUT 与 --write-real 互斥（双旗 footgun 拒跑,docs/era-guard-family.md ②）');
  process.exit(1);
}
if (WRITE_REAL && VER !== 1457) {
  console.error('[era-guard] 非 1457 禁写真库（旧基线重放只许进 SW_OUT 沙箱）');
  process.exit(1);
}
const PROBE = (() => {
  const i = process.argv.indexOf('--probe');
  return i >= 0 ? String(process.argv[i + 1] || '').split(',').map(Number).filter(Number.isFinite) : null;
})();

// ---------------- 锚（era guard ③ fail-loud） ----------------
const ANCHOR_SIG = 82492;
const ANCHOR_END = 90939;
const ANCHOR_CALLS = 629;   // 619 裸 NewDust + 10 NewDustDirect（1457/1458 全等区实测）
const ANCHOR_PROBES = [   // [绝对行, 片段]——提取规则回归锚（手核过的代表组）
  [86360, 'type == 112 || type == 666'],
  [86539, 'type == 59 || type == 60 || type == 151'],
  [89905, 'type == 290'],
  [85162, 'type == 372 || type == 373'],
  [90918, 'type != 156'],
];
const NPC_CS = join(REPO_VER, 'Terraria', 'NPC.cs');
const SRC = readFileSync(NPC_CS, 'utf8');
const LINES = SRC.split('\n');
const SIG = 'public void HitEffect(int hitDirection = 0, double dmg = 10.0)';
const SIG_LINE = LINES.findIndex((l) => l.includes(SIG)) + 1;
function failAnchor(name, got, want) {
  console.error(`[era-guard] 锚失配：${name} got=${got} want=${want}（源码漂移——按 era-guard ③ 重推锚+1458 交叉+现库逐值 diff 定谳后才准更新）`);
  process.exit(1);
}
if (SIG_LINE !== ANCHOR_SIG) failAnchor('HitEffect 签名行', SIG_LINE, ANCHOR_SIG);
let depth = 0, started = false, endLine = -1;
for (let i = SIG_LINE - 1; i < LINES.length; i++) {
  for (const ch of LINES[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
  if (started && depth === 0) { endLine = i + 1; break; }
}
if (endLine !== ANCHOR_END) failAnchor('HitEffect 方法尾行', endLine, ANCHOR_END);
for (const [ln, frag] of ANCHOR_PROBES) {
  if (!String(LINES[ln - 1] || '').includes(frag)) failAnchor(`探针锚行 :${ln}`, String(LINES[ln - 1] || '').trim().slice(0, 60), frag);
}

// ---------------- 逻辑行装配（括号深度续行 + 注释丢弃） ----------------
function parenDepth(s) { let d = 0; for (const c of s) { if (c === '(') d++; else if (c === ')') d--; } return d; }
const phys = LINES.slice(SIG_LINE - 1, endLine);
const LOGICAL = [];
{
  let buf = null, bufLine = 0, bufInd = 0;
  for (let i = 0; i < phys.length; i++) {
    const raw = phys[i];
    const line = i + SIG_LINE;
    const t = raw.trim();
    if (t.startsWith('//')) continue;                     // 注释行
    if (buf === null) { buf = t; bufLine = line; bufInd = (raw.match(/^\t+/) || [''])[0].length; }
    else buf += ' ' + t;
    if (parenDepth(buf) <= 0) {
      LOGICAL.push({ text: buf.replace(/\s+/g, ' ').trim(), line: bufLine, ind: bufInd });
      buf = null;
    }
  }
  if (buf !== null) LOGICAL.push({ text: buf.replace(/\s+/g, ' ').trim(), line: bufLine, ind: bufInd });
}

// ---------------- 条件解析 ----------------
function splitTop(s, sep) {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (d === 0 && c === sep && s[i + 1] === sep) { out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function splitArgs(s) {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parseCond(raw) {
  const cond = { typeIds: new Set(), ranges: [], excludes: new Set(), gates: [], life: null, others: false };
  if (!raw) { cond.others = true; return cond; }
  const text = raw.trim();
  const orParts = splitTop(text, '|').filter(Boolean);
  for (const p0 of orParts) {
    const p = p0.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
    let mr;
    if ((mr = p.match(/^type >= (\d+) && type <= (\d+)$/))) { cond.ranges.push([Number(mr[1]), Number(mr[2])]); continue; }
    for (const a0 of splitTop(p, '&').filter(Boolean)) {
      const a = a0.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
      if (a.includes(' || ')) {
        // AND 项内嵌 OR（(type==210||type==211) && life<=0）——递归取并集语义
        const sub = parseCond(a.replace(/^\(/, '').replace(/\)$/, ''));
        for (const id of sub.typeIds) cond.typeIds.add(id);
        for (const r of sub.ranges) cond.ranges.push(r);
        for (const ex of sub.excludes) cond.excludes.add(ex);
        for (const g of sub.gates) cond.gates.push(g);
        if (sub.life) cond.life = sub.life;
        continue;
      }
      let m;
      if ((m = a.match(/^type == (\d+)$/))) { cond.typeIds.add(Number(m[1])); continue; }
      if ((m = a.match(/^type >= (\d+) && type <= (\d+)$/))) { cond.ranges.push([Number(m[1]), Number(m[2])]); continue; }
      if ((m = a.match(/^type != (\d+)$/))) { cond.excludes.add(Number(m[1])); continue; }
      if (/^life > 0$/.test(a)) { cond.life = 'hit'; continue; }
      if (/^life <= 0$/.test(a)) { cond.life = 'death'; continue; }
      cond.gates.push(a);
    }
  }
  if (orParts.length === 0) cond.others = true;   // else 帧无条件
  return cond;
}

// ---------------- 局部字面赋值流（唯一赋值才可还原） ----------------
const locals = new Map();        // name → {v, count}
const colorLocals = new Map();   // name → Map(typeId|0 → {r,g,b,a})——per-type 条件色（63/64/103、333-336）
function nearestTypeId() {       // 当前帧栈最近 if 帧的唯一 type id（无/多义 → 0）
  for (let k = frames.length - 1; k >= 0; k--) {
    const f = frames[k];
    if (f.kind === 'if' && f.cond && f.cond.typeIds.size === 1 && f.cond.ranges.length === 0) return [...f.cond.typeIds][0];
    if (f.kind === 'if' && f.cond && (f.cond.typeIds.size > 0 || f.cond.ranges.length > 0)) return 0;
  }
  return 0;
}
function noteAssign(text) {
  let m;
  if ((m = text.match(/^(?:int|float)\s+(num\d+)\s*=\s*(-?\d+(?:\.\d+)?)f?\s*(?:;|$)/))) {
    const e = locals.get(m[1]) || { v: null, count: 0 };
    e.count++; e.v = Number(m[2]); locals.set(m[1], e); return;
  }
  if ((m = text.match(/^(num\d+)\s*=\s*(-?\d+(?:\.\d+)?)f?\s*(?:;|$)/))) {
    const e = locals.get(m[1]) || { v: null, count: 0 };
    e.count++; e.v = Number(m[2]); locals.set(m[1], e); return;
  }
  // 非纯字面右值（含 Next/velocity/算式）→ 撤销还原资格
  if ((m = text.match(/^(?:int|float)\s+(num\d+)\s*=\s*(?!-?\d+(?:\.\d+)?f?\s*(?:;|$))/))) {
    const e = locals.get(m[1]) || { v: null, count: 0 };
    e.count++; e.v = null; locals.set(m[1], e); return;
  }
  if ((m = text.match(/^(num\d+)\s*(\*?=|\/=|\+=|-=)\s*/)) && !/^\s*-?\d+(?:\.\d+)?f?\s*;/.test(text.slice(m[0].length))) {
    const e = locals.get(m[1]) || { v: null, count: 0 };
    e.count++; e.v = null; locals.set(m[1], e);
  }
  // Color 局部（newColorN = Color.White / new Color(...)）——帧栈 type 谓词挂 per-type 桶
  let mc;
  if ((mc = text.match(/^(?:Color )?(newColor\d+) = (Color\.White|new Color\([^)]*\))\s*;?$/))) {
    const name = mc[1];
    let val = null;
    if (mc[2] === 'Color.White') val = { r: 255, g: 255, b: 255, a: 255 };
    else {
      const mm = mc[2].match(/^new Color\((\d+), (\d+), (\d+)(?:, (\d+))?\)$/);
      if (mm) val = { r: +mm[1], g: +mm[2], b: +mm[3], a: mm[4] === undefined ? 255 : +mm[4] };
    }
    if (val) {
      if (!colorLocals.has(name)) colorLocals.set(name, new Map());
      colorLocals.get(name).set(nearestTypeId(), val);
    }
  }
}
function localValue(name) {
  const e = locals.get(name);
  return e && e.count === 1 ? e.v : null;   // 唯一赋值才还原
}

// ---------------- 实参分类 ----------------
function classifySpeed(e) {
  if (e === undefined || e === '') return { ok: true, v: 0 };
  const s = e.trim();
  if (/^-?\d+(\.\d+)?f?$/.test(s)) return { ok: true, v: Number(s.replace(/f$/, '')) };
  if (s === 'hitDirection') return { ok: true, v: 'hd' };
  if (s === '2 * hitDirection' || s === 'hitDirection * 2') return { ok: true, v: '2hd' };
  if (s === '6 * hitDirection' || s === 'hitDirection * 6') return { ok: true, v: '6hd' };
  if (s === '2.5f * (float)hitDirection' || s === '(float)hitDirection * 2.5f') return { ok: true, v: '2.5hd' };
  if (s === '1.5f * (float)hitDirection' || s === '(float)hitDirection * 1.5f') return { ok: true, v: '1.5hd' };
  if (s === '-1 * hitDirection' || s === '-1f * hitDirection') return { ok: true, v: '-1hd' };
  if (s === '-1.5f * (float)hitDirection') return { ok: true, v: '-1.5hd' };
  if (s === 'velocity.X') return { ok: true, v: 'velX' };
  if (s === 'velocity.Y') return { ok: true, v: 'velY' };
  if (s === '(0f - velocity.X) * 0.2f') return { ok: true, v: 'negVelX*0.2' };
  if (s === '(0f - velocity.Y) * 0.2f') return { ok: true, v: 'negVelY*0.2' };
  if (s === 'velocity.X * 0.2f') return { ok: true, v: 'velX*0.2' };
  if (s === 'velocity.Y * 0.2f') return { ok: true, v: 'velY*0.2' };
  return { ok: false, v: s };
}
function classifyAlpha(e) {
  if (e === undefined || e === '') return { ok: true, v: 0 };
  const s = e.trim();
  if (/^\d+$/.test(s)) return { ok: true, v: Number(s) };
  if (s === 'alpha') return { ok: true, v: 'npc' };
  return { ok: false, v: s };
}
function classifyColor(e) {
  if (e === undefined || e === '') return { ok: true, v: null };
  const s = e.trim();
  if (s === 'default(Color)') return { ok: true, v: null };
  if (s === 'this.color' || s === 'color') return { ok: true, v: 'npc' };
  let m;
  if ((m = s.match(/^new Color\((\d+), (\d+), (\d+)(?:, (\d+))?\)$/))) {
    return { ok: true, v: { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 255 : +m[4] } };
  }
  if (s === 'Color.Transparent') return { ok: true, v: { r: 0, g: 0, b: 0, a: 0 } };
  if (/^newColor\d+$/.test(s)) return { ok: true, v: { local: s } };
  return { ok: false, v: s };
}
function classifyScale(e) {
  if (e === undefined || e === '') return { ok: true, v: 1 };
  const s = e.trim();
  if (/^-?\d+(\.\d+)?f?$/.test(s)) return { ok: true, v: Number(s.replace(/f$/, '')) };
  if (s === 'scale') return { ok: true, v: 'npc' };
  if (/^num\d+$/.test(s) && Number.isInteger(localValue(s))) return { ok: true, v: localValue(s) };
  return { ok: false, v: s };
}
function classifyBox(pos, w, h) {
  const p = pos.trim();
  let dx = 0, dy = 0, W, H, anchor = 'pos';
  let m0;
  if (p === 'position' || p === 'new Vector2(position.X, position.Y)') { /* default */ }
  else if ((m0 = p.match(/^new Vector2\(position\.X, position\.Y \+ (-?\d+(?:\.\d+)?)f?\)$/))) dy = Number(m0[1]);
  else if ((m0 = p.match(/^new Vector2\(position\.X \+ (-?\d+(?:\.\d+)?)f?, position\.Y\)$/))) dx = Number(m0[1]);
  else if (p === 'base.Center') anchor = 'center';
  else if ((m0 = p.match(/^base\.Center - new Vector2\((-?\d+(?:\.\d+)?)f?, (-?\d+(?:\.\d+)?)f?\)$/))) { anchor = 'center'; dx = Number(m0[1]); dy = Number(m0[2]); }
  else if ((m0 = p.match(/^base\.Center - Vector2\.One \* (\d+(?:\.\d+)?)f?$/))) { anchor = 'center'; dx = dy = -Number(m0[1]); }
  else return { ok: false };
  const wS = (w || '').trim(), hS = (h || '').trim();
  if (wS === 'width') W = 'npc'; else if (/^\d+f?$/.test(wS)) W = Number(wS.replace(/f$/, ''));
  else return { ok: false };
  if (hS === 'height') H = 'npc'; else if (/^\d+f?$/.test(hS)) H = Number(hS.replace(/f$/, ''));
  else return { ok: false };
  return { ok: true, box: { anchor, dx, dy, w: W, h: H } };
}
function classifyDustId(e) {
  const s = e.trim();
  if (/^\d+$/.test(s)) return { ok: true, v: Number(s) };
  if (/^num\d+$/.test(s)) {
    const v = localValue(s);
    if (v != null && Number.isInteger(v)) return { ok: true, v };
    return { ok: false, v: s };
  }
  return { ok: false, v: s };
}

// ---------------- 循环头解析 ----------------
function splitTopChar(s, sep) {   // 单字符顶层切分（splitTop 只支持双字符 &&/||）
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (d === 0 && c === sep) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parseFor(text) {
  const inner = text.replace(/^for \(/, '').replace(/\)$/, '');
  const parts = splitTopChar(inner, ';');   // for 头三段以顶层分号分隔（splitArgs 是逗号,误用会 forParts 全灭）
  if (parts.length !== 3) return { ok: false, reason: 'forParts' };
  const cond = parts[1].trim();
  let m;
  if ((m = cond.match(/^\(double\)num\d+ < dmg \/ \(double\)lifeMax \* (\d+(?:\.\d+)?)f?$/))) return { ok: true, hitK: Number(m[1]) };
  if ((m = cond.match(/^\(double\)num\d+ < dmg \/ \(double\)\(lifeMax \* (\d+)\)$/))) return { ok: true, hitK: Number(m[1]) };
  if ((m = cond.match(/^(?:\(double\)|\(float\))?num\d+ < (\d+(?:\.\d+)?)f?$/))) return { ok: true, n: Number(m[1]) };
  if ((m = cond.match(/^num\d+ < (num\d+)(?: \* (\d+))?$/))) {
    const base = localValue(m[1]);
    if (base != null && Number.isInteger(base)) return { ok: true, n: base * (m[2] ? Number(m[2]) : 1) };
    return { ok: false, reason: `count=${m[1]}${m[2] ? '*' + m[2] : ''}` };
  }
  if ((m = cond.match(/^[A-Za-z]\w* < (\d+)$/))) return { ok: true, n: Number(m[1]) };
  if ((m = cond.match(/^num\d+ < (.+)$/))) return { ok: false, reason: `count=${m[1].trim().slice(0, 40)}` };
  return { ok: false, reason: 'forCond' };
}

// ---------------- post 后处理捕获（Allman 括号结构） ----------------
const POST_OP_RES = [
  [/^D\.noGravity = true;?$/, () => ['ng', true]],
  [/^D\.noGravity = false;?$/, () => ['ng', false]],
  [/^D\.velocity \*= (-?\d+(?:\.\d+)?)f?;?$/, (m) => ['velMul', Number(m[1])]],
  [/^D\.velocity \/= (\d+(?:\.\d+)?)f?;?$/, (m) => ['velDiv', Number(m[1])]],
  [/^D\.scale \*= (-?\d+(?:\.\d+)?)f?;?$/, (m) => ['scaleMul', Number(m[1])]],
  [/^D\.scale \/= (\d+(?:\.\d+)?)f?;?$/, (m) => ['scaleDiv', Number(m[1])]],
  [/^D\.scale = (-?\d+(?:\.\d+)?)f?;?$/, (m) => ['scaleSet', Number(m[1])]],
  [/^D\.scale = (-?\d+(?:\.\d+)?)f? \* scale;?$/, (m) => ['scaleSetNpc', Number(m[1])]],
];
const POST_BAD_RE = /^D\.(position|fadeIn|velocity\.X|velocity\.Y|color|noLight|shader|type|frame)\b|^D\.scale (?:\*|\/)?= (?!-?\d+(?:\.\d+)?f?;?$)/;
/** 编译一段 post 语句（别名链/直引形直译）→ ops|null(不可表达) */
function compilePostStmts(stmts) {
  const ops = [];
  let alias = null;
  for (const s0 of stmts) {
    const s = s0.replace(/\s+/g, ' ').trim();
    let m;
    if ((m = s.match(/^(?:Dust )?(\w+) = Main\.dust\[(?:num\d+)\];?$/))) { alias = m[1]; continue; }
    let body = null;
    if (alias && s.startsWith(alias + '.')) body = 'D' + s.slice(alias.length);
    else if (s.startsWith('dz.')) body = 'D' + s.slice(2);                 // normDirect 归一形
    else if (s.includes('Main.dust[')) body = 'D' + s.replace(/^.*?Main\.dust\[\w+\]\./, '');
    if (!body || !body.startsWith('D')) return { bad: `aliasMiss:${s.slice(0, 60)}` };
    let matched = false;
    for (const [re, mk] of POST_OP_RES) {
      const mm = body.match(re);
      if (mm) { ops.push(mk(mm)); matched = true; break; }
    }
    if (matched) continue;
    if (POST_BAD_RE.test(body)) return { bad: `postUnsupported:${s.slice(0, 60)}` };
    return { bad: `postUnknown:${s.slice(0, 60)}` };
  }
  return { ops };
}
/** 从 LOGICAL[i+1] 起捕获 callVar 的后置写；preAlias=内嵌别名形态（`Dust dustN = Main.dust[Dust.NewDust(...)]`）
 *  返回 {ok, posts, alt, consumed} */
function capturePosts(callVar, i, preAlias) {
  const posts = [];
  let alt = null;
  let j = i + 1;
  const bound = new Set(preAlias ? [preAlias] : []);
  const STOP_RE = /Dust\.NewDust|Gore\.NewGore|NewNPC|PlaySound|NPCID\.|NetMessage|CloneDust|^NPC |^Player |^Item |^Vector2 \w+ = |^float |^int |^bool /;
  while (j < LOGICAL.length) {
    const L = LOGICAL[j];
    const t = L.text;
    if (STOP_RE.test(t)) break;
    let m;
    // 别名绑定（`Dust dustN = Main.dust[numX];` / `dust = Main.dust[numX];` 重绑定）
    if ((m = t.match(/^(?:Dust )?(\w+) = Main\.dust\[(num\d+)\];?$/))) {
      if (!callVar || m[2] !== callVar) break;
      bound.add(m[1]);
      j++; continue;
    }
    // 直引 Main.dust[numX]（归一成 dz. 形交给编译器）
    if (callVar && t.includes(`Main.dust[${callVar}]`)) {
      const raw = t.replace(`Main.dust[${callVar}]`, 'dz');
      const r = compilePostStmts([raw]);
      if (r.ops) { posts.push(...r.ops); j++; continue; }
      return { ok: false, reason: r.bad, consumed: j - i };
    }
    // 别名字段写（已绑定的别名引用）
    const aliasRef = t.match(/^(\w+)(\.|$)/);
    if (aliasRef && bound.has(aliasRef[1]) && aliasRef[2] === '.') {
      const body = 'D' + t.slice(aliasRef[1].length);
      let matched = false;
      for (const [re, mk] of POST_OP_RES) {
        const mm = body.match(re);
        if (mm) { posts.push(mk(mm)); matched = true; break; }
      }
      if (!matched) {
        if (POST_BAD_RE.test(body)) return { ok: false, reason: `postUnsupported:${t.slice(0, 60)}`, consumed: j - i };
        break;
      }
      j++; continue;
    }
    // 概率分支：inline 单行（`if (Main.rand.Next(K) op V) { Main.dust[numX].f = ...; }`）
    if ((m = t.match(/^if \(Main\.rand\.Next\((\d+)\) (==|!=) (\d+)\) \{ (.*) \};?$/))) {
      const stmts = m[4].split(';').map((x) => x.trim()).filter(Boolean);
      // 直引形改写：Main.dust[numX].f → dz.f
      const r2 = compilePostStmts(stmts.map((x) => x.replace(new RegExp(`^Main\\.dust\\[${callVar}\\]\\.`), 'dz.')));
      if (r2.ops) { alt = { k: +m[1], op: m[2], v: +m[3], ifOps: r2.ops, elseOps: null }; j++; continue; }
      return { ok: false, reason: r2.bad, consumed: j - i };
    }
    // 概率分支：Allman
    if ((m = t.match(/^if \(Main\.rand\.Next\((\d+)\) (==|!=) (\d+)\)$/))) {
      let j2 = j + 1;
      if (!/^\{$/.test(LOGICAL[j2]?.text || '')) return { ok: false, reason: 'altNoBrace', consumed: j2 - i };
      j2++;
      const stmts = [];
      while (j2 < LOGICAL.length && !/^\}$/.test(LOGICAL[j2].text)) {
        if (STOP_RE.test(LOGICAL[j2].text)) return { ok: false, reason: 'altStop', consumed: j2 - i };
        stmts.push(LOGICAL[j2].text);
        j2++;
      }
      j2++;   // 越过 }
      // else 支
      let elseOps = null;
      if (/^else$/.test(LOGICAL[j2]?.text || '')) {
        j2++;
        if (!/^\{$/.test(LOGICAL[j2]?.text || '')) return { ok: false, reason: 'elseNoBrace', consumed: j2 - i };
        j2++;
        const estmts = [];
        while (j2 < LOGICAL.length && !/^\}$/.test(LOGICAL[j2].text)) {
          if (STOP_RE.test(LOGICAL[j2].text)) return { ok: false, reason: 'elseStop', consumed: j2 - i };
          estmts.push(LOGICAL[j2].text);
          j2++;
        }
        j2++;   // 越过 }
        const rE = compilePostStmts(estmts.map(normDirect));
        if (!rE.ops) return { ok: false, reason: rE.bad, consumed: j2 - i };
        elseOps = rE.ops;
      }
      const rI = compilePostStmts(stmts.map(normDirect));
      if (!rI.ops) return { ok: false, reason: rI.bad, consumed: j2 - i };
      alt = { k: +m[1], op: m[2], v: +m[3], ifOps: rI.ops, elseOps };
      j = j2; continue;
    }
    break;
  }
  return { ok: true, posts, alt, consumed: j - i - 1 };
  /** 分支内直引形归一：`Main.dust[numX].f …` → `dz.f …`（配合编译器别名约定） */
  function normDirect(s) {
    return s.replace(new RegExp(`^Main\\.dust\\[${callVar}\\]\\.`), 'dz.');
  }
}

// ---------------- 主扫描（缩进块栈,Allman） ----------------
const frames = [];        // {ind, kind:'if'|'else'|'for'|'neutral', cond, loop}
const lastIfAtInd = new Map();   // indent → 最近 if 帧（else 取反 life 用）
let callsTotal = 0;
const entries = [];
const unreachableMarks = [];

for (let i = 0; i < LOGICAL.length; i++) {
  const L = LOGICAL[i];
  const t = L.text;
  noteAssign(t);
  // 块开
  if (/^\{$/.test(t)) {
    const prev = LOGICAL[i - 1];
    const h = prev && !/^[{}]$/.test(prev.text) ? prev.text : '';
    if (/^if \((.*)\)$/.test(h)) {
      const f = { ind: L.ind, kind: 'if', cond: parseCond(h.match(/^if \((.*)\)$/)[1]) };
      frames.push(f); lastIfAtInd.set(L.ind, f);
    } else if (/^else if \((.*)\)$/.test(h)) {
      const sib = lastIfAtInd.get(L.ind) || null;
      const c = parseCond(h.match(/^else if \((.*)\)$/)[1]);
      const f = { ind: L.ind, kind: 'if', cond: c, _sibElse: true };
      frames.push(f); lastIfAtInd.set(L.ind, f);
    } else if (/^else$/.test(h)) {
      const sib = lastIfAtInd.get(L.ind) || null;
      const neg = { typeIds: new Set(), ranges: [], excludes: new Set(), gates: sib ? [...sib.cond.gates] : [], life: null, others: true };
      if (sib) { if (sib.cond.life === 'hit') neg.life = 'death'; else if (sib.cond.life === 'death') neg.life = 'hit'; }
      frames.push({ ind: L.ind, kind: 'else', cond: neg });
    } else if (/^for \(/.test(h)) {
      frames.push({ ind: L.ind, kind: 'for', cond: null, loop: parseFor(h) });
    } else {
      frames.push({ ind: L.ind, kind: 'neutral', cond: null });
    }
    continue;
  }
  // 块关
  if (/^\}$/.test(t)) {
    for (let k = frames.length - 1; k >= 0; k--) {
      if (frames[k].ind === L.ind) {
        const f = frames[k];
        frames.splice(k, frames.length - k);
        // `if (life>0) { …; return; }` 落出段 = 反相位（hit 相 return 后的同层代码 = death 相）
        if (f.kind === 'if' && f.cond && f.cond.life && f.hadReturn && frames.length) {
          frames[frames.length - 1].phaseAfter = f.cond.life === 'hit' ? 'death' : 'hit';
        }
        // `if (type != N) { return; }` 开门式（无正谓词/门,体仅 return）→ 之后的语句 = N 专属
        if (f.kind === 'if' && f.cond && f.hadReturn && f.cond.typeIds.size === 0
          && f.cond.ranges.length === 0 && f.cond.gates.length === 0 && f.cond.excludes.size >= 1 && frames.length) {
          frames[frames.length - 1].exclusiveAfter = new Set([...(frames[frames.length - 1].exclusiveAfter || []), ...f.cond.excludes]);
        }
        break;
      }
    }
    continue;
  }
  // `return;`——标记所在帧（直序体,缩进=帧+1 才计;嵌套 if 内 return 不算无条件）
  if (/^return;?$/.test(t)) {
    const f = frames[frames.length - 1];
    if (f && L.ind === f.ind + 1) f.hadReturn = true;
    continue;
  }
  // 语句行：dust 调用
  if (/Dust\.NewDust(Direct|Perfect)?\(/.test(t)) {
    callsTotal++;
    // 同层 return 不可达检测（statement 缩进层向前找最近 return;）
    for (let k = i - 1; k >= 0; k--) {
      const p = LOGICAL[k];
      if (p.ind < L.ind) break;
      if (/^return;?$/.test(p.text)) { unreachableMarks.push({ line: L.line, text: t.slice(0, 60) }); break; }
    }
    const stmts = extractStmts(t, L.line, i);
    for (const st of stmts) entries.push(st);
  }
}

// ---------------- 语句提取 ----------------
function extractStmts(text, line, li) {
  const out = [];
  const re = /Dust\.NewDust(Direct|Perfect)?\(/g;
  let m;
  while ((m = re.exec(text))) {
    const start = re.lastIndex - 1;
    let d = 0, end = -1;
    for (let j = start; j < text.length; j++) {
      if (text[j] === '(') d++;
      else if (text[j] === ')') { d--; if (d === 0) { end = j; break; } }
    }
    if (end < 0) continue;
    if (/:\s*\w/.test(text.slice(start, end)) && /\w+: /.test(text.slice(start, end))) { out.push({ unsupported: true, reasons: ['namedArgs'], line }); continue; }
    const args = splitArgs(text.slice(start + 1, end));
    if (args.length < 4) { out.push({ unsupported: true, reasons: ['args<4'], line }); continue; }
    const [pos, w, h, id, sx, sy, al, col, sc] = args;
    const boxR = classifyBox(pos, w, h);
    const idR = classifyDustId(id);
    const sxR = classifySpeed(sx);
    const syR = classifySpeed(sy);
    const alR = classifyAlpha(al);
    const colR = classifyColor(col);
    const scR = classifyScale(sc);
    const loopFrame = [...frames].reverse().find((f) => f.kind === 'for');
    const loop = loopFrame ? loopFrame.loop : { ok: true, n: 1 };
    // 守卫链合成
    const chain = frames.filter((f) => f.kind === 'if' || f.kind === 'else');
    let typeIds = null;
    const gates = [];
    let phase = null;
    let unresolvableGate = null;
    for (const f of chain) {
      const c = f.cond;
      if (!c) continue;
      if (c.gates.length) gates.push(...c.gates);
      if (c.life) phase = c.life;
      const setHere = new Set(c.typeIds);
      for (const [a, b] of c.ranges) for (let k = a; k <= b; k++) setHere.add(k);
      if (setHere.size === 0 && c.excludes.size === 1 && c.ranges.length === 0 && c.gates.length === 0) {
        // 尾层 catch-all else 内 `if (type != 156) { return; }` 开门式 → 专属型 156
        const [only] = c.excludes;
        setHere.add(only);
      }
      if (setHere.size === 0) {
        if (c.gates.length) { unresolvableGate = unresolvableGate || c.gates.join(' && '); continue; }
        continue;   // else 帧不收窄
      }
      if (typeIds === null) typeIds = setHere;
      else typeIds = new Set([...typeIds].filter((x) => setHere.has(x)));
    }
    // 无 type 谓词但链上有 exclusiveAfter（`if (type != N){return}` 开门）→ N 专属
    if (typeIds === null) {
      for (let k = frames.length - 1; k >= 0; k--) {
        if (frames[k].exclusiveAfter && frames[k].exclusiveAfter.size) { typeIds = new Set(frames[k].exclusiveAfter); break; }
      }
    }
    // 无显式 life 帧 → 找最近的 phaseAfter（`if (life>0){…return}` 落出段=death 相）
    if (!phase) {
      for (let k = frames.length - 1; k >= 0; k--) {
        if (frames[k].phaseAfter) { phase = frames[k].phaseAfter; break; }
      }
    }
    const bad = [];
    // v1：一切非 type 谓词（ai[1]/!wet/dmg/netMode/IsGoldCritter/…）→ 整条 pending
    // （曾只拦空谓词帧——正 type 帧上的 gate 会静默丢门,590 !wet 案）
    if (gates.length) bad.push(`gate:${gates.join(' && ')}`);
    if (!boxR.ok) bad.push(`pos:${pos.slice(0, 50)}`);
    if (!idR.ok) bad.push(`id:${idR.v}`);
    if (!sxR.ok) bad.push(`sx:${sxR.v}`);
    if (!syR.ok) bad.push(`sy:${syR.v}`);
    if (!alR.ok) bad.push(`alpha:${alR.v}`);
    if (!colR.ok) bad.push(`color:${colR.v}`);
    if (!scR.ok) bad.push(`scale:${scR.v}`);
    if (loop.ok === false) bad.push(loop.reason || 'loop');
    if (unresolvableGate) bad.push(`gate:${unresolvableGate}`);
    // post 捕获：callVar = `int numX = Dust.NewDust` / `numX = Dust.NewDust`；
    // preAlias = `Dust dustN = Main.dust[Dust.NewDust` 内嵌别名形态
    const pre = text.slice(0, start);
    let callVar = null;
    let preAlias = null;
    let mv;
    if ((mv = pre.match(/(?:int )?(num\d+) = Dust\.NewDust$/))) callVar = mv[1];
    else if ((mv = pre.match(/(?:Dust )?(dust\w*) = Main\.dust\[Dust\.NewDust$/))) preAlias = mv[1];
    let postR = { ok: true, posts: [], alt: null };
    if (callVar) postR = capturePosts(callVar, li, null);
    else if (preAlias) postR = capturePosts(null, li, preAlias);
    if (postR.ok === false) bad.push(postR.reason);
    out.push({
      line,
      box: boxR.ok ? boxR.box : null,
      id: idR.ok ? idR.v : null,
      sx: sxR.ok ? sxR.v : null,
      sy: syR.ok ? syR.v : null,
      alpha: alR.ok ? alR.v : null,
      color: colR.ok ? colR.v : null,
      scale: scR.ok ? scR.v : null,
      n: loop.ok && loop.n != null ? loop.n : null,
      hitK: loop.ok && loop.hitK != null ? loop.hitK : null,
      posts: postR.posts || [],
      alt: postR.alt || null,
      types: typeIds ? [...typeIds].sort((a, b) => a - b) : null,
      gates: [...gates],
      phase,
      unsupported: bad.length > 0,
      reasons: bad,
      src: text.slice(0, 120),
    });
  }
  return out;
}
if (callsTotal !== ANCHOR_CALLS) failAnchor('HitEffect 尘调用基数', callsTotal, ANCHOR_CALLS);

// ---------------- 汇总分组 ----------------
// types=null（无法定界）或含 unsupported statement 的组 → pending
const byType = new Map();     // id → {hit:[], death:[]}
const pendings = new Map();   // key → {key, line, types, phase, reason, count}
let stdStmts = 0, unsupStmts = 0;
for (const e of entries) {
  if (e.unsupported || e.types === null) {
    unsupStmts++;
    const key = `${e.types ? 'T' + e.types.join('_') : 'OTHER'}@${e.line}`;
    const p = pendings.get(key) || { key, line: e.line, types: e.types, phase: e.phase || 'both', reason: (e.reasons || []).join(';') || 'typesUnknown', count: 0 };
    p.count++;
    pendings.set(key, p);
    continue;
  }
  const phases = e.phase ? [e.phase] : ['hit', 'death'];
  // color local（newColorN）→ 逐型解析（63/64/103、333-336 per-type 条件色）
  const colorLocal = e.color && typeof e.color === 'object' && e.color.local ? e.color.local : null;
  for (const ty of e.types) {
    let color = e.color;
    if (colorLocal) {
      const m2 = colorLocals.get(colorLocal);
      color = (m2 && (m2.get(ty) ?? m2.get(0))) || null;
      if (!color) {
        unsupStmts++;
        const key = `T${e.types.join('_')}@${e.line}`;
        const pp = pendings.get(key) || { key, line: e.line, types: e.types, phase: e.phase || 'both', reason: `colorLocal:${colorLocal}@${ty}`, count: 0 };
        pp.count++; pendings.set(key, pp);
        continue;
      }
    }
    stdStmts++;
    const stmt = {};
    stmt.dust = e.id;
    if (e.n != null && e.n !== 1) stmt.n = e.n;
    if (e.hitK != null) stmt.hitK = e.hitK;
    if (e.box && (e.box.anchor !== 'pos' || e.box.dx !== 0 || e.box.dy !== 0 || e.box.w !== 'npc' || e.box.h !== 'npc')) {
      if (e.box.anchor === 'center') stmt.anchor = 'center';
      if (e.box.dx !== 0) stmt.dx = e.box.dx;
      if (e.box.dy !== 0) stmt.dy = e.box.dy;
      if (e.box.w !== 'npc') stmt.w = e.box.w;
      if (e.box.h !== 'npc') stmt.h = e.box.h;
    }
    if (e.sx !== 0 && e.sx != null) stmt.sx = e.sx;
    if (e.sy !== 0 && e.sy != null) stmt.sy = e.sy;
    if (e.alpha !== 0 && e.alpha != null) stmt.alpha = e.alpha;
    if (color != null) stmt.color = color;
    if (e.scale !== 1 && e.scale != null) stmt.scale = e.scale;
    if (e.posts.length) stmt.posts = e.posts;
    if (e.alt) stmt.alt = { k: e.alt.k, op: e.alt.op, v: e.alt.v, ifOps: e.alt.ifOps, elseOps: e.alt.elseOps };
    stmt.line = e.line;
    let rec = byType.get(ty);
    if (!rec) { rec = { hit: [], death: [] }; byType.set(ty, rec); }
    for (const ph of phases) rec[ph].push(stmt);
  }
}

// ---------------- 产物 ----------------
const data = { _meta: {} };
const typeIds = [...byType.keys()].sort((a, b) => a - b);
for (const id of typeIds) data[String(id)] = byType.get(id);
data._meta = {
  source: `Terarria${VER}/Terraria/NPC.cs NPC.HitEffect (:${SIG_LINE}-:${endLine})`,
  crossVer: '1458 同区 (:82492-:90941) 与 1457 逐字节全等（2026-09-21 diff 实证）——SW_ITEM_VER=1458 重产同值',
  generatedBy: 'tools/extract-npcdust.mjs',
  callTotal: callsTotal,
  entryCount: entries.length,
  stdStmts,
  unsupStmts,
  npcIds: typeIds.length,
  entryNpcIds: typeIds.length,
  schema: 'per-npcId: {hit:[stmt],death:[stmt]}; stmt={dust,n?|hitK?,anchor?/dx?/dy?/w?/h?,sx?,sy?,alpha?,color?,scale?,posts?,alt?,line}; n 缺省 1/hitK=ceil(dmg/lifeMax*K)/alpha0/color 默认/scale1; sx token: hd|2hd|2.5hd|1.5hd|-1hd|-1.5hd|velX|velY|negVelX*0.2|negVelY*0.2|velX*0.2|velY*0.2|数; anchor=center → 盒=中心±(dx,dy) 半开 w×h; posts ops: ng|velMul|velDiv|scaleMul|scaleDiv; alt={k,op,v,ifOps,elseOps}=Main.rand.Next(k) op v 掷骰分支',
  noGenericTail: '★原版无通用尘尾（最终 else=if(type!=156) return 专属支）——表外型受击/死亡不出尘（BJ254 双向偏差收口的行为变化面）',
  carveOuts: [
    '泼岩浆/亡体 NewNPC/分裂生成等世界改写与生成族不入尘表（BJ246 已接泼岩浆+分裂链;其余另刀）',
    'gore 表由 tools/extract-gore.mjs 全量承担（spawnNpcDeathGore）',
    '音效（SoundID.NPCHit/NPCDeath）/DBT/公告/探针生成（135 探针等）非尘面',
  ],
  pending: [...pendings.values()].map((p) => ({ types: p.types, line: p.line, phase: p.phase, reason: p.reason, count: p.count })),
  unreachableAfterReturn: unreachableMarks,
};

// ---------------- 输出通道 ----------------
const json = JSON.stringify(data, null, 1) + '\n';
function diffLive(live) {
  const diffs = [];
  const ids = new Set([...Object.keys(data), ...Object.keys(live).filter((k) => k !== '_meta')]);
  for (const id of ids) {
    if (id === '_meta') continue;
    const a = JSON.stringify(data[id] ?? null);
    const b = JSON.stringify(live[id] ?? null);
    if (a !== b) diffs.push(id);
  }
  const am = JSON.stringify({ ...data._meta, pending: undefined, unreachableAfterReturn: undefined });
  const bm = JSON.stringify({ ...(live._meta || {}), pending: undefined, unreachableAfterReturn: undefined });
  const metaDiff = am !== bm;
  return { diffs, metaDiff };
}
const live = existsSync(REAL_OUT) ? JSON.parse(readFileSync(REAL_OUT, 'utf8')) : null;
if (PROBE) {
  for (const vid of PROBE) {
    const rec = byType.get(vid);
    console.log(`===== probe ${vid} =====`);
    if (!rec) { console.log('  （无 std 表项）'); }
    else {
      for (const ph of ['hit', 'death']) {
        if (!rec[ph].length) continue;
        console.log(`  [${ph}]`);
        for (const s of rec[ph]) console.log('   ', JSON.stringify(s));
      }
    }
  }
  console.log('===== pending（前 40 条）=====');
  for (const p of [...pendings.values()].slice(0, 40)) {
    console.log(`  L${p.line} phase=${p.phase} types=${p.types ? p.types.join(',') : '?'} ×${p.count} ${p.reason}`);
  }
  process.exit(0);
}
console.log(`[extract-npcdust] ver=${VER} 调用=${callsTotal} 语句=${entries.length} std=${stdStmts} pending语句=${unsupStmts} 型=${typeIds.length} pending组=${pendings.size}`);
if (!SW_OUT && !WRITE_REAL) {
  if (!live) {
    console.log('[dry-run] 现库无 src/data/vanilla-npcdust.json —— 首产须走 SW_OUT 沙箱→对拍→--write-real（era-guard ②）');
  } else {
    const { diffs, metaDiff } = diffLive(live);
    if (diffs.length === 0 && !metaDiff) console.log('[dry-run] 对拍零漂移（重产=现库逐字节）');
    else {
      console.log(`[dry-run] 对拍漂移 ${diffs.length} 型${metaDiff ? ' +meta' : ''}：${diffs.slice(0, 20).join(',')}${diffs.length > 20 ? '…' : ''}`);
      process.exitCode = 1;
    }
  }
}
if (SW_OUT) {
  mkdirSync(SW_OUT, { recursive: true });
  const p = join(SW_OUT, OUT_NAME);
  writeFileSync(p, json);
  console.log(`[sandbox] 写 ${p}（${json.length} B）`);
}
if (WRITE_REAL) {
  writeFileSync(REAL_OUT, json);
  console.log(`[write-real] 写 ${REAL_OUT}（${json.length} B）`);
}
