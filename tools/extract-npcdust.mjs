#!/usr/bin/env node
// tools/extract-npcdust.mjs —— NPC.HitEffect 受击/死亡尘提取器（BJ254 2026-09-21；BJ296 批2 2026-09-23；BJ304 批3 2026-09-23）
//
// ★BJ304 批3（2026-09-23）fadeIn 定谳翻案+per-type 局部：`fadeIn = N` 收编 std 算子
//   （原版=生长目标语义 Dust.cs :2148-2171,本仓 VDust.fadeIn 引擎 1:1——BJ296 批2 曾误
//   登记 postUnsupported「alpha 渐入」）；复合 `scale = A + NextFloat()` = scaleSet+scaleAddR01;
//   typedLocals per-type 数值局部桶（组头初值+型帧覆写,524-527 num205）；门静态析取
//   `numN > 0`（per-type 判,假→掷流占位空分支:roll 照耗臂体死）。
//
// ★BJ296 批2（2026-09-23）概率门接入：帧树化重构（帧 id/parent/elseOf 链 + 逐型臂解析）。
//   概率门语义（原版 Main.rand 直译,掷序=源序）：`if (Main.rand.Next(K) op V) {尘A} [else {尘B}]`
//   → 分支元素 {roll:{k,op,v}, t:[…], e:[…]}（单掷二选一,勿双掷）；臂上前置非掷谓词
//   `life > lifeMax / 2` → pre:['lifeGtHalf']（短路与掷门,life 判负→e 臂不掷,262）;
//   区域门（`if (life >= 0) {return;}` 早退）→ phaseAfter='death'+gate:['lifeLt0']
//   （判负→整支跳过,life==0 拍原版不出尘,265）。
//   for 体多元素 → 循环组 {n?|hitK?, body:[…]}（单元素仍内联 n/hitK=批1 相容）——旧扁平
//   编码对多尘循环体掷流/出尘序错位（409/410 死亡支 d17,d229 交错 vs 扁平两连发）,批2 起
//   循环组保真。死臂剪枝：臂 type 集 ∩ 外层 type 集 = ∅（262-264 块内 `type == 265` 臂）
//   → 对组内所有型静态假 → else 无条件化+死臂登记 _meta.deadArms。id 表达式
//   `N + Main.rand.Next(K)` → {dust:N, idRand:K}（478 死亡支 237/238 逐尘掷）。
//   无尘空门（186/632 `Next(5)==0` 只含 gore）→ 空分支元素 {roll} 保留掷流占位（与原版
//   同拍耗掷）。
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
  // ★BJ263（2026-09-22）：配对括号剥离（旧 .replace(/^\(/,'').replace(/\)$/,'') 无条件
  //   剥一侧——(A||B)&&C 形态首括被剥而尾无括号 → 后续 splitTop('&') 因游离 ')' 深度
  //   -1 拒切 → OR 尾臂 `type == 591) && !wet` 整段坠 gates（590/591 案:types 只剩 590、
  //   reason 出残臂）。仅在首括与末字确为同一配对时才剥。
  function stripMatchedParens(s) {
    if (!s.startsWith('(') || !s.endsWith(')')) return s;
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') d++;
      else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) return s; }
    }
    return d === 0 ? s.slice(1, -1).trim() : s;
  }
  function parseCond(raw) {
    const cond = { typeIds: new Set(), ranges: [], excludes: new Set(), gates: [], life: null, others: false };
    if (!raw) { cond.others = true; return cond; }
    const text = raw.trim();
    const orParts = splitTop(text, '|').filter(Boolean);
    for (const p0 of orParts) {
      const p = stripMatchedParens(p0.trim());
      let mr;
      if ((mr = p.match(/^type >= (\d+) && type <= (\d+)$/))) { cond.ranges.push([Number(mr[1]), Number(mr[2])]); continue; }
      for (const a0 of splitTop(p, '&').filter(Boolean)) {
        const a = stripMatchedParens(a0.trim());
        if (a.includes(' || ')) {
          // AND 项内嵌 OR（(type==210||type==211) && life<=0）——递归取并集语义
          const sub = parseCond(stripMatchedParens(a));
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
// ★BJ304 批3：per-type 数值局部桶（组头初始化 + 型内覆写族,524-527 num205=0/75/170/67）——
//   全局唯一赋值还原（locals.count==1）对「组头 `int numN = 0` + 各型帧内覆写」形失效
//   （count≥2）,按 colorLocals 同款逐型桶挂帧栈最近单型 id（0=中性桶=组头初值）;
//   materialize/门分类按 ctx.t 取（桶缺 t 回落桶 0=该型未覆写走初值,与原版赋值流同相）。
const typedLocals = new Map();   // name → Map(typeId|0 → literal)
function noteTypedLocal(name, v) {
  const tid = nearestTypeId();
  if (!typedLocals.has(name)) typedLocals.set(name, new Map());
  typedLocals.get(name).set(tid, v);
}
function typedLocalValue(name, t) {
  const b = typedLocals.get(name);
  if (!b) return null;
  return b.has(t) ? b.get(t) : b.get(0);
}
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
    e.count++; e.v = Number(m[2]); locals.set(m[1], e);
    noteTypedLocal(m[1], Number(m[2]));   // ★BJ304:per-type 桶（中性帧→桶0=组头初值）
    return;
  }
  if ((m = text.match(/^(num\d+)\s*=\s*(-?\d+(?:\.\d+)?)f?\s*(?:;|$)/))) {
    const e = locals.get(m[1]) || { v: null, count: 0 };
    e.count++; e.v = Number(m[2]); locals.set(m[1], e);
    noteTypedLocal(m[1], Number(m[2]));   // ★BJ304:型帧内覆写→该型桶
    return;
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
  let m;   // ★BJ296：`N + Main.rand.Next(K)` 逐尘掷 id（478 死亡支 237/238）
  if ((m = s.match(/^(\d+) \+ Main\.rand\.Next\((\d+)\)$/))) return { ok: true, v: Number(m[1]), rand: Number(m[2]) };
  if (/^num\d+$/.test(s)) {
    const v = localValue(s);
    if (v != null && Number.isInteger(v)) return { ok: true, v };
    // ★BJ304：全局唯一赋值还原失败 + 有 per-type 桶 → 延迟到 materialize 按 ctx.t 取
    //   （524-527 num205:525/526/527 桶=75/170/67,其余型回落桶0=0）
    if (typedLocals.has(s)) return { ok: false, typedLocal: s, v: s };
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
  // ★BJ304：复合 `scale = A + Main.rand.NextFloat()`（426/427 死亡支）——既有两算子机械
  //   组合（先定值后掷;与原版语句序同相:scaleSet 无掷,scaleAddR01 掷 [0,1)）,须排在
  //   纯 scaleSet 前（正则互不碰撞,序排纯可读性）
  [/^D\.scale = (-?\d+(?:\.\d+)?)f? \+ Main\.rand\.NextFloat\(\);?$/, (m) => [['scaleSet', Number(m[1])], ['scaleAddR01']]],
  [/^D\.scale = (-?\d+(?:\.\d+)?)f?;?$/, (m) => ['scaleSet', Number(m[1])]],
  [/^D\.scale = (-?\d+(?:\.\d+)?)f? \* scale;?$/, (m) => ['scaleSetNpc', Number(m[1])]],
  // ★BJ296：`scale += Main.rand.NextFloat()`（516 尘 6 随机放大 [0,1)）——曾沿 break 路径静默丢
  [/^D\.scale \+= Main\.rand\.NextFloat\(\);?$/, () => ['scaleAddR01']],
  // ★BJ304 批3：`fadeIn = N`——定谳翻案（BJ296 批2 报告曾按「alpha 渐入,本仓不可用」
  //   登记 postUnsupported）：原版语义=生长目标（Dust.cs :2148-2171,0<fadeIn<100 时
  //   scale += 0.03/t(46/213/260=0.1,235=0.007) 至超 fadeIn 归零转衰落,无 alpha 参与）;
  //   本仓 VDust.fadeIn 字段在位+老化链 1:1（fx/VanillaDust.ts :740-745）,spawnDust 返
  //   活尘对象 → 后置赋值=原版 NewDust 后 fadeIn 写同相。fadeIn *= 等其余形态仍 unsupported。
  [/^D\.fadeIn = (-?\d+(?:\.\d+)?)f?;?$/, (m) => ['fadeIn', Number(m[1])]],
];
const POST_BAD_RE = /^D\.(position|fadeIn|velocity\.X|velocity\.Y|color|noLight|shader|type|frame)\b|^D\.scale (?:\*|\/)?= (?!-?\d+(?:\.\d+)?f?;?$)/;
/** ★BJ304:mk 产物归一入栈——单算子（op 元组）push 整元组,复合（op 元组数组）逐个 push
 *  （直接 push(...mk) 会把 ['ng',true] 摊平成两个元素,曾炸出扁平 posts） */
function pushOps(dst, out) {
  if (Array.isArray(out[0])) dst.push(...out);
  else dst.push(out);
}
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
      if (mm) { pushOps(ops, mk(mm)); matched = true; break; }   // ★BJ304:mk 可返多算子（复合 scale）
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
    // ★BJ296：别名拷贝重绑定（`Dust dust = dust48;`）——曾静默断链丢后续
    //   `dust.velocity *= 3f`（409/410/407 死亡支 d229 只剩 ng）
    if ((m = t.match(/^(?:Dust )?(\w+) = (\w+);$/)) && bound.has(m[2])) {
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
        if (mm) { pushOps(posts, mk(mm)); matched = true; break; }   // ★BJ304:mk 可返多算子
      }
      if (!matched) {
        if (POST_BAD_RE.test(body)) return { ok: false, reason: `postUnsupported:${t.slice(0, 60)}`, consumed: j - i };
        break;
      }
      j++; continue;
    }
    // 概率分支：inline 单行（`if (Main.rand.Next(K) op V) { Main.dust[numX].f = ...; }`）
    if ((m = t.match(/^if \(Main\.rand\.Next\((\d+)\) (==|!=) (\d+)\) \{ (.*) \};?$/))) {
      // ★BJ296：分支体内含 NewDust = 语句级分支（树面处理）,非本尘的 post——停止捕获
      if (/NewDust/.test(m[4])) break;
      const stmts = m[4].split(';').map((x) => x.trim()).filter(Boolean);
      // 直引形改写：Main.dust[numX].f → dz.f
      const r2 = compilePostStmts(stmts.map((x) => x.replace(new RegExp(`^Main\\.dust\\[${callVar}\\]\\.`), 'dz.')));
      if (r2.ops) { alt = { k: +m[1], op: m[2], v: +m[3], ifOps: r2.ops, elseOps: null }; j++; continue; }
      return { ok: false, reason: r2.bad, consumed: j - i };
    }
    // 概率分支：Allman
    if ((m = t.match(/^if \(Main\.rand\.Next\((\d+)\) (==|!=) (\d+)\)$/))) {
      // ★BJ296：首语句含 NewDust = 语句级分支——停止捕获（树面处理）
      if (/NewDust/.test(LOGICAL[j + 2]?.text || '')) break;
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

// ---------------- 主扫描（缩进块栈,Allman；BJ296 帧树 id/parent/elseOf） ----------------
const frames = [];        // {ind, kind:'if'|'else'|'for'|'neutral', cond, loop, id, parentId, elseOfId?}
const lastIfAtInd = new Map();   // indent → 最近 if 帧（else 取反 life 用）
let callsTotal = 0;
const entries = [];
const unreachableMarks = [];
const kidsMap = new Map();        // ★BJ296 帧树：frameId → [{ev:'frame',f}|{ev:'stmt',e}] 源序
let frameSeq = 0;
function kidPush(fid, ev) {
  let a = kidsMap.get(fid);
  if (!a) { a = []; kidsMap.set(fid, a); }
  a.push(ev);
}
const frameById = new Map();   // id → frame（else 链 life 回溯用）
const ROOT_FID = 0;

for (let i = 0; i < LOGICAL.length; i++) {
  const L = LOGICAL[i];
  const t = L.text;
  noteAssign(t);
  // 块开
  if (/^\{$/.test(t)) {
    const prev = LOGICAL[i - 1];
    const h = prev && !/^[{}]$/.test(prev.text) ? prev.text : '';
    const parentId = frames.length ? frames[frames.length - 1].id : ROOT_FID;
    // 帧级相位（叶-less 空门分支用）：链上 life 帧（内层胜）→ phaseAfter（内层胜）
    let frPhase = null;
    for (const fr of frames) { const c = fr.cond; if (c && c.life) frPhase = c.life; }
    if (!frPhase) {
      for (let k = frames.length - 1; k >= 0; k--) {
        if (frames[k].phaseAfter) { frPhase = frPhase || frames[k].phaseAfter; break; }
      }
    }
    if (/^if \((.*)\)$/.test(h)) {
      const f = { ind: L.ind, kind: 'if', cond: parseCond(h.match(/^if \((.*)\)$/)[1]), id: ++frameSeq, parentId, line: L.line, elseOfId: 0, phase: frPhase };
      // ★BJ296：Allman post-alt 帧（体=Main.dust 写,已由 capturePosts 并入上一语句 alt）
      //   不再当语句分支——曾致 59/60/151 alt+空分支双掷
      const lastE = entries[entries.length - 1];
      const mg = f.cond && f.cond.gates.length === 1 && f.cond.typeIds.size === 0 && f.cond.ranges.length === 0
        ? f.cond.gates[0].match(/^Main\.rand\.Next\((\d+)\) (==|!=) (\d+)$/) : null;
      if (lastE && lastE.alt && mg && +mg[1] === lastE.alt.k && mg[2] === lastE.alt.op && +mg[3] === lastE.alt.v) {
        f.postAltConsumed = true;
      }
      frames.push(f); lastIfAtInd.set(L.ind, f);
      frameById.set(f.id, f);
      kidPush(parentId, { ev: 'frame', f });
    } else if (/^else if \((.*)\)$/.test(h)) {
      const sib = lastIfAtInd.get(L.ind) || null;
      const c = parseCond(h.match(/^else if \((.*)\)$/)[1]);
      const f = { ind: L.ind, kind: 'if', cond: c, _sibElse: true, id: ++frameSeq, parentId, line: L.line, elseOfId: sib ? sib.id : 0, phase: frPhase };
      frames.push(f); lastIfAtInd.set(L.ind, f);
      frameById.set(f.id, f);
      kidPush(parentId, { ev: 'frame', f });
    } else if (/^else$/.test(h)) {
      const sib = lastIfAtInd.get(L.ind) || null;
      const neg = { typeIds: new Set(), ranges: [], excludes: new Set(), gates: sib ? [...sib.cond.gates] : [], life: null, others: true };
      // ★BJ296：else = 否定【整条前臂链】——life 相位沿 elseOf 链回溯最近 life 臂取反
      //  （曾只看直系 sib：245-249 尾 else 漏判 death → n50 双相误发 hit）
      {
        let s = sib;
        while (s) {
          if (s.cond && s.cond.life) { neg.life = s.cond.life === 'hit' ? 'death' : 'hit'; break; }
          s = s.elseOfId ? frameById.get(s.elseOfId) : null;
        }
      }
      // ★BJ296：else 帧语义 = 「前臂全败」——抄门不作数（树解析按链走）；elseOfId 记链
      const f = { ind: L.ind, kind: 'else', cond: neg, id: ++frameSeq, parentId, line: L.line, elseOfId: sib ? sib.id : 0, phase: frPhase };
      frames.push(f);
      frameById.set(f.id, f);
      kidPush(parentId, { ev: 'frame', f });
    } else if (/^for \(/.test(h)) {
      const f = { ind: L.ind, kind: 'for', cond: null, loop: parseFor(h), id: ++frameSeq, parentId, line: L.line, phase: frPhase };
      frames.push(f);
      frameById.set(f.id, f);
      kidPush(parentId, { ev: 'frame', f });
    } else {
      const f = { ind: L.ind, kind: 'neutral', cond: null, id: ++frameSeq, parentId, line: L.line, phase: frPhase };
      frames.push(f);
      frameById.set(f.id, f);
      kidPush(parentId, { ev: 'frame', f });
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
        // ★BJ296：`if (life >= 0) { return; }`（265）——相位门+life==0 拍不出尘：
        //   后续同层 = death 相且须 pre lifeLt0（原版 life>lifeMax/2 族同款短路面）
        if (f.kind === 'if' && f.hadReturn && f.cond && f.cond.life === null
          && f.cond.typeIds.size === 0 && f.cond.ranges.length === 0 && f.cond.excludes.size === 0
          && f.cond.gates.length === 1 && f.cond.gates[0] === 'life >= 0' && frames.length) {
          frames[frames.length - 1].phaseAfter = 'death';
          frames[frames.length - 1].phaseAfterPre = ['lifeLt0'];
          f.phaseReturnGuard = true;   // 树解析跳过（相位由 phaseAfter 承载）
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

// ---------------- 语句提取（★BJ296：type/门移交帧树逐型解析,此处只认参/相位/post） ----------------
function extractStmts(text, line, li) {
  const out = [];
  const parentFid = frames.length ? frames[frames.length - 1].id : ROOT_FID;
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
    if (/:\s*\w/.test(text.slice(start, end)) && /\w+: /.test(text.slice(start, end))) { out.push(mkEntry({ unsupported: true, reasons: ['namedArgs'] })); continue; }
    const args = splitArgs(text.slice(start + 1, end));
    if (args.length < 4) { out.push(mkEntry({ unsupported: true, reasons: ['args<4'] })); continue; }
    const [pos, w, h, id, sx, sy, al, col, sc] = args;
    const boxR = classifyBox(pos, w, h);
    const idR = classifyDustId(id);
    const sxR = classifySpeed(sx);
    const syR = classifySpeed(sy);
    const alR = classifyAlpha(al);
    const colR = classifyColor(col);
    const scR = classifyScale(sc);
    // 相位：链上最近 life 帧 + phaseAfter（`if (life>0){…return}` 落出段=death 相）
    const chain = frames.filter((f) => f.kind === 'if' || f.kind === 'else');
    let phase = null;
    for (const f of chain) {
      const c = f.cond;
      if (c && c.life) phase = c.life;
    }
    // ★BJ296：phaseAfterPre（`if (life >= 0){return}` 落出段 = death 且 life<0 才出尘）
    const pres = [];
    for (let k = frames.length - 1; k >= 0; k--) {
      if (frames[k].phaseAfter) {
        phase = phase || frames[k].phaseAfter;
        if (frames[k].phaseAfterPre) pres.push(...frames[k].phaseAfterPre);
      }
    }
    const bad = [];
    if (!boxR.ok) bad.push(`pos:${pos.slice(0, 50)}`);
    if (!idR.ok && !idR.typedLocal) bad.push(`id:${idR.v ?? (idR.rand != null ? idR.v : 'id')}`);   // ★BJ304:typedLocal 延迟逐型取,不入 bad
    if (!sxR.ok) bad.push(`sx:${sxR.v}`);
    if (!syR.ok) bad.push(`sy:${syR.v}`);
    if (!alR.ok) bad.push(`alpha:${alR.v}`);
    if (!colR.ok) bad.push(`color:${colR.v}`);
    if (!scR.ok) bad.push(`scale:${scR.v}`);
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
    // ★BJ296：路径上是否出现过正 type 谓词帧（无 → 全局悬空,树解析判 typesUnknown）
    const inTypeScope = frames.some((f) => {
      const c = f.cond;
      return c && (c.typeIds.size > 0 || c.ranges.length > 0);
    });
    const e = mkEntry({});
    e.line = line;
    e.parentFid = parentFid;
    e.box = boxR.ok ? boxR.box : null;
    e.id = idR.ok ? idR.v : null;
    e.idTyped = idR.typedLocal ?? null;
    e.idRand = idR.ok && idR.rand != null ? idR.rand : null;
    e.sx = sxR.ok ? sxR.v : null;
    e.sy = syR.ok ? syR.v : null;
    e.alpha = alR.ok ? alR.v : null;
    e.color = colR.ok ? colR.v : null;
    e.scale = scR.ok ? scR.v : null;
    e.posts = postR.posts || [];
    e.alt = postR.alt || null;
    e.phase = phase;
    e.pres = pres;
    e.inTypeScope = inTypeScope;
    e.unsupported = bad.length > 0;
    e.reasons = bad;
    e.src = text.slice(0, 120);
    out.push(e);
  }
  return out;
  function mkEntry(base) {
    const e = { line, parentFid, ...base };
    kidPush(parentFid, { ev: 'stmt', e });
    return e;
  }
}
if (callsTotal !== ANCHOR_CALLS) failAnchor('HitEffect 尘调用基数', callsTotal, ANCHOR_CALLS);

// ---------------- BJ254 首批接入名单（78 门组 / 275 型,2026-09-21 定谳） ----------------
// 选中门组（按 HitEffect 源序）：史莱姆基族+变体族（305-314/325/326/327/302/304/344/245-249/
// 204/225/243/352）、恶魔眼族 2/190-194/317/318、僵尸人形族（L87923 29 型+187/433 额外面）、
// 骷髅族（L89526 28 型）、鸟族 61/252/301（R1-F2 转表）、克眼仆从族 63/64/103（per-type 色）、
// 岩浆族 59/60/151（BJ243 金标保形）、唾液 112/666（FX45 钉值）、圣骑士 290、猪鲨 370/372/373、
// 蝙蝠族（L86926 27 型）、法师族/金鱼/小鼠/蜗牛/EoW 段/残骸族 42/176/205/231-235、
// catch-all 专属支 156 等。★刻意排除：113-116 WoF 族（死亡面 netMode 权威/傀儡门+StrikeNPC
// 扇出派发与 gore 跳过纠缠——手块保留,待 gates 支持后转表）。
const BATCH1_TYPES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 26, 27, 28, 29,
  31, 32, 35, 36, 37, 39, 40, 41, 42, 44, 45, 46, 47, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59, 60,
  61, 63, 64, 65, 67, 68, 71, 73, 74, 77, 78, 79, 80, 82, 83, 84, 87, 88, 89, 90, 91, 92, 93, 94,
  95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 117, 118,
  119, 123, 124, 125, 126, 132, 148, 149, 150, 151, 152, 155, 156, 158, 159, 161, 162, 163, 164,
  165, 166, 167, 168, 173, 174, 176, 179, 181, 182, 186, 187, 188, 189, 190, 191, 192, 193, 194,
  195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 217, 218, 219, 220, 221, 222, 223,
  224, 225, 226, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245,
  246, 247, 248, 249, 250, 251, 252, 253, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278,
  279, 280, 281, 282, 283, 284, 285, 286, 287, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299,
  300, 301, 302, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 317, 318, 319, 320, 321,
  322, 323, 324, 325, 326, 327, 331, 332, 337, 370, 372, 373, 430, 431, 432, 433, 434, 435, 436,
  441, 449, 450, 451, 452, 464, 465, 470, 481, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503,
  504, 505, 506, 535, 538, 540, 542, 543, 544, 545, 590, 591, 610, 611, 614, 615, 616, 617, 624,
  625, 626, 627, 628, 630, 632, 666, 671, 672, 673, 674, 675, 689, 692, 693,
]);

// ---------------- BJ296 批2 接入名单（概率门族,2026-09-23 定谳） ----------------
// 带掷门/概率条件的门组（手核反编译 diff=0 后批量重产）：
//   · 636 沙元素（:82780-:82798 hit/death Next(2)==0→d67 else d69 单掷二选一）；
//   · 516 （:83896-:83905 both 循环组 20×[d6 velMul3+scaleAddR01, Next(2)==0→d259 ng]）；
//   · 428 （:84177-:84184 death 循环组 10×[d241, Next(2)==0→d229 else d240]）；
//   · 409/410/407/411 （:84412-:84590 史莱姆母巢族 hitK 循环组内 Next(2..4) 掷门副尘）；
//   · 262/263/264/265 （:88157-:88218 262 pre lifeGtHalf+Next(3)!=0→d166 else d167；
//     263/264 死臂剪枝后恒 d167 无掷；265 death pre lifeLt0+Next(3)!=0 分支）；
//   · 134/135/136 （:90359-:90369 death Next(2)==0 单臂 [d31×10, 循环组 5×[d6,d6]]）；
//   · 478 （:84914 death id=`237+Next(2)` 逐尘掷 id）。
// ★刻意排除（边界）：661（Next(5)+NextVector2Circular post+color local → 批3 postUnsupported）、
//   415-429/518（fadeIn postUnsupported 族 → 批3）、524-527（num205 运行时门+fadeIn → 批3/4）、
//   402（oldPos 轨迹盒+oldPos.Length 计数,需 Enemy oldPos 支持 → 批4）、非概率门
//   （gold critter/ai[1]/!wet/netMode/TownPet/IsShimmerVariant/daybreak/484-487 区间门）。
const BATCH2_TYPES = new Set([
  134, 135, 136, 262, 263, 264, 265, 407, 409, 410, 411, 428, 478, 516, 636,
]);

// ---------------- BJ304 批3 接入名单（fadeIn 定谳翻案族,2026-09-23 定谳） ----------------
// ★定谳翻案（BJ296 批2 报告曾按「fadeIn=alpha 渐入,本仓不可用」登记 postUnsupported）：
//   原版 fadeIn=生长目标（Dust.cs :2148-2171:0<fadeIn<100 时 scale += 0.03/t(46/213/260=
//   0.1,235=0.007) 至超 fadeIn 归零转衰落,无 alpha 参与）;本仓 VDust.fadeIn 在位+老化链
//   1:1（fx/VanillaDust.ts :740-745）+spawnDust 返活尘 → `fadeIn = N` 收编为 std 算子。
// 接入面（手核 NPC.cs 亲读 diff=0）：
//   · fadeIn 叶族 15 型（叶=[ng,scaleSet1.5,fadeIn1,velMul3],主尘 d241|d249+叶 d6|d242|d229）：
//     415（death n40 无门双发）/416+518（Next4/3）/417（Next4/2）/418（Next2/death 无门 n20）/
//     419（Next4/3）/420·421（d249+d242,Next2,death n10 无门）/423（hitK50,death n20 无门）/
//     424（d249+d242,Next4/3）/425·429（d241+d229,Next4/3）/426·427 hit 相（d229 叶）。
//   · 426/427 death 半接（保守形态）：d241 主环 n20|n10 入表;SelectRandom 环
//     （Utils.SelectRandom id 掷+fadeIn0.25+复合 scale）仍 pending——阻塞面=noLight
//     （VDust.noLight 字段在位但引擎不消费,接线=假保真）+idPick 机制未建。
//   · 524-527（num205 运行时门+per-type 局部 id）：组头 `int num205=0`+型帧覆写
//     （525=75/526=170/527=67）→ typedLocals 逐型桶;门 `Next(K)==0 && num205>0` 静态
//     析取逐型判——524（=0）臂体静态死→掷流占位空分支（roll 照耗,&& 左先同相）,
//     525/526/527 恒真脱门正常分支。叶 d75/170/67 仍带 fadeIn=1（std）。
// ★仍排除：661（color local=hslToRgb 彩虹+position=Center+NextVector2Circular+velocity=
//   position−Center+CloneDust 回声四缺口,零尘登记）;402（oldPos 轨迹盒 → 批4）;
//   426/427 SelectRandom 死亡环（noLight+idPick）。
const BATCH3_TYPES = new Set([
  415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 429, 518, 524, 525, 526, 527,
]);
const WIRED_TYPES = new Set([...BATCH1_TYPES, ...BATCH2_TYPES, ...BATCH3_TYPES]);

// ---------------- BJ296 帧树逐型解析（汇总分组） ----------------
// 树结构：kidsMap（frameId → 帧/语句源序）；SUCCESSOR（elseOfId → 后继臂）。
// 逐型 t 解析：臂对 t 静态活/死（type 谓词+excludes）→ 活臂按门分类：
//   · 概率门（Main.rand.Next(K) op V / life>lifeMax/2）→ 分支元素（单掷二选一,pre 短路在前）；
//   · 不可表达门 → 整链 pending（批3/4 边界）；无门 → 内联。
// 死臂（臂 type 集 ∩ 外层 type 集=∅）→ 对组内全型静态假 → 跳过 + _meta.deadArms 登记。
const SUCCESSOR = new Map();   // elseOfId → 后继臂帧
for (const [, evs] of kidsMap) {
  for (const ev of evs) {
    if (ev.ev === 'frame' && ev.f.elseOfId && !SUCCESSOR.has(ev.f.elseOfId)) SUCCESSOR.set(ev.f.elseOfId, ev.f);
  }
}
function framePosTypes(f) {
  if (!f.cond) return null;
  const s = new Set(f.cond.typeIds);
  for (const [a, b] of f.cond.ranges) for (let k = a; k <= b; k++) s.add(k);
  return s.size ? s : null;
}
function setDisjoint(a, b) { if (!a || !b) return false; for (const x of a) if (b.has(x)) return false; return true; }
function condStaticTrue(f, t) {   // 帧条件在型 t 上的静态真值（gates=运行时面不参与）
  if (!f.cond) return true;
  const s = framePosTypes(f);
  if (s && !s.has(t)) return false;
  if (f.cond.excludes.has(t)) return false;
  return true;
}
function classifyGates(gates, t) {   // → {ok:true, pre:[], roll, staticFalse?}|{ok:false}
  const pre = [];
  let roll = null;
  let staticFalse = false;
  for (const g of gates) {
    let m;
    if ((m = g.match(/^Main\.rand\.Next\((\d+)\) (==|!=) (\d+)$/))) {
      if (roll) return { ok: false };   // 双掷帧（402 Next4&&Next3 族）不表达
      roll = { k: +m[1], op: m[2], v: +m[3] };
      continue;
    }
    if (g === 'life > lifeMax / 2') { pre.push('lifeGtHalf'); continue; }
    // ★BJ304 批3：per-type 静态门析取 `numN > 0`（524-527 num205>0:524=0 静态假,
    //   525/526/527=75/170/67 恒真脱门）——桶无 t 回落桶 0（组头初值,原版赋值流同相）
    if ((m = g.match(/^(num\d+) > 0$/)) && typedLocals.has(m[1])) {
      const v = typedLocalValue(m[1], t);
      if (v == null) return { ok: false };
      if (v <= 0) staticFalse = true;
      continue;
    }
    return { ok: false };
  }
  return { ok: true, pre, roll, staticFalse };
}
function hasStmtKids(fid) {
  const a = kidsMap.get(fid);
  if (!a) return false;
  for (const ev of a) if (ev.ev === 'stmt') return true;
  return false;
}
function firstLineOf(f) {
  const a = kidsMap.get(f.id);
  if (a) for (const ev of a) {
    if (ev.ev === 'stmt') return ev.e.line;
    const r = firstLineOf(ev.f);
    if (r != null) return r;
  }
  return null;
}
function collectStmts(fid, acc) {
  const a = kidsMap.get(fid);
  if (!a) return;
  for (const ev of a) { if (ev.ev === 'stmt') acc.push(ev.e); else collectStmts(ev.f.id, acc); }
}
function subtreePend(fid) {
  const acc = [];
  collectStmts(fid, acc);
  return acc.some((e) => e.__pend);
}
function SChild(S, f) {
  const ft = framePosTypes(f);
  if (!ft) return S;
  if (!S) return new Set(ft);
  return new Set([...S].filter((x) => ft.has(x)));
}

const byType = new Map();     // id → {hit:[], death:[]}
const pendings = new Map();   // key → {key, line, types:Set, phase, reason, count}
const deadArms = [];
let stdStmts = 0, unsupStmts = 0;

function registerPending(e, t, reasons) {
  e.__pend = true;
  const reason = reasons.join(';');
  const key = `${e.line}|${reason}`;
  const p = pendings.get(key) || { key, line: e.line, types: new Set(), phase: e.phase || 'both', reason, count: 0 };
  if (t != null) p.types.add(t);
  if (!e.__pendKeys) e.__pendKeys = new Set();
  if (!e.__pendKeys.has(key)) { e.__pendKeys.add(key); p.count++; unsupStmts++; }
  pendings.set(key, p);
}
function markChainPending(f, ctx, reason) {
  const acc = [];
  collectStmts(f.id, acc);
  for (const e of acc) registerPending(e, e.inTypeScope ? ctx.t : null, e.unsupported && e.reasons.length ? e.reasons : [reason]);
}
const deadArmSeen = new Set();   // 全局去重（逐型解析每 t 走一遍,曾重复登记）
function markDeadArm(f, S, ctx) {
  const ft = framePosTypes(f);
  if (!ft || !S || !setDisjoint(ft, S)) return;
  const dk = `${firstLineOf(f)}|${[...ft].sort((a, b) => a - b).join(',')}`;
  if (deadArmSeen.has(dk)) { const acc0 = []; collectStmts(f.id, acc0); for (const e of acc0) e.__dead = true; return; }
  deadArmSeen.add(dk);
  const acc = [];
  collectStmts(f.id, acc);
  for (const e of acc) e.__dead = true;
  deadArms.push({ line: firstLineOf(f), types: [...ft].sort((a, b) => a - b), enclosing: [...S].sort((a, b) => a - b) });
}
function wrapEl(el, phases) { return { el, phases }; }

/** 循环计数内联：按元素形态规范键序（stmt: dust,idRand?,n?,hitK?…/branch: pre?,roll?,n?,hitK?…） */
function withCount(el, n, hitK) {
  const out = {};
  if (el.dust !== undefined) {
    out.dust = el.dust;
    if (el.idRand !== undefined) out.idRand = el.idRand;
    if (n != null && n !== 1) out.n = n;
    if (hitK != null) out.hitK = hitK;
    for (const k of ['anchor', 'dx', 'dy', 'w', 'h', 'sx', 'sy', 'alpha', 'color', 'scale', 'pre', 'posts', 'alt', 'line']) {
      if (el[k] !== undefined) out[k] = el[k];
    }
    return out;
  }
  if (el.roll !== undefined || el.pre !== undefined) {   // branch
    if (el.pre !== undefined) out.pre = el.pre;
    if (el.roll !== undefined) out.roll = el.roll;
    if (n != null && n !== 1) out.n = n;
    if (hitK != null) out.hitK = hitK;
    for (const k of ['gate', 't', 'e', 'line']) if (el[k] !== undefined) out[k] = el[k];
    return out;
  }
  // loop 组（嵌套）
  if (n != null && n !== 1) out.n = n;
  if (hitK != null) out.hitK = hitK;
  for (const k of ['body', 'line']) if (el[k] !== undefined) out[k] = el[k];
  return out;
}

function materialize(e, out, ctx) {
  e.__seen = true;
  const t = e.inTypeScope ? ctx.t : null;   // 无 type 域（daybreak/gold-critter 等根级门）→ 单条 pending,不逐型膨胀
  if (ctx.failFace) { registerPending(e, t, [ctx.failFace]); return; }   // 运行时失败面：叶改登记（割面/死臂语义照走）
  if (e.unsupported) { registerPending(e, t, e.reasons); return; }
  // ★BJ304 批3：per-type 数值局部 id（typedLocals 延迟取,524-527 num205）
  let dustId = e.id;
  if (e.idTyped != null) {
    const v = typedLocalValue(e.idTyped, ctx.t);
    if (v == null || !Number.isInteger(v)) { registerPending(e, t, [`idTyped:${e.idTyped}@${ctx.t}`]); return; }
    dustId = v;
  }
  // color local（newColorN）→ 逐型解析（63/64/103、333-336 per-type 条件色）
  let color = e.color;
  const colorLocal = e.color && typeof e.color === 'object' && e.color.local ? e.color.local : null;
  if (colorLocal) {
    const m2 = colorLocals.get(colorLocal);
    color = (m2 && (m2.get(ctx.t) ?? m2.get(0))) || null;
    if (!color) { registerPending(e, t, [`colorLocal:${colorLocal}@${ctx.t}`]); return; }
  }
  stdStmts++;
  const stmt = {};
  stmt.dust = dustId;
  if (e.idRand != null) stmt.idRand = e.idRand;
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
  if (e.pres && e.pres.length) stmt.gate = [...e.pres];   // 区域门（phaseAfterPre）：判负整元素跳过
  if (e.posts.length) stmt.posts = e.posts;
  if (e.alt) stmt.alt = { k: e.alt.k, op: e.alt.op, v: e.alt.v, ifOps: e.alt.ifOps, elseOps: e.alt.elseOps };
  stmt.line = e.line;
  out.push(wrapEl(stmt, e.phase ? new Set([e.phase]) : new Set(['both'])));
}

/** 分支叶 pre 归并（phaseAfterPre 落叶 → 提到分支,掷门短路在前）；不均匀 → null */
function mergeLeafPres(frames2, ctx) {
  const acc = [];
  for (const f of frames2) {
    const a = [];
    collectStmts(f.id, a);
    for (const e of a) if (e.pres && e.pres.length) acc.push(e);
  }
  if (!acc.length) return [];
  const first = JSON.stringify(acc[0].pres);
  for (const e of acc) if (JSON.stringify(e.pres) !== first) { registerPending(e, ctx.t, ['preNonUniform']); return null; }
  const vals = [...acc[0].pres];   // ★先取值再清（曾取已清空副本 → 265 pre 丢失）
  for (const e of acc) e.pres = [];
  return vals;
}

function buildBranchEl(cls, body, eels, f, ctx) {
  const phases = new Set();
  for (const b of body) for (const p of b.phases) phases.add(p);
  if (eels) for (const b of eels) for (const p of b.phases) phases.add(p);
  if (phases.size === 0) phases.add(f.phase || ctx.phaseCtx || 'both');   // 无叶空门（186/632 掷流占位）
  if (phases.size > 1) {                                                  // 混相复合（不应出现）→ 保守 pending
    const acc = [];
    collectStmts(f.id, acc);
    for (const e of acc) registerPending(e, ctx.t, ['mixedPhaseComposite']);
    return null;
  }
  const leafPres = mergeLeafPres([f], ctx);
  if (leafPres === null) return null;
  if (leafPres.length) {
    // 叶 stmt 已在 materialize 时烤入 gate —— 上提到分支后从叶上摘除（防双写）
    for (const b of body) if (b.el.dust !== undefined) delete b.el.gate;
    if (eels) for (const b of eels) if (b.el.dust !== undefined) delete b.el.gate;
  }
  const el = {};
  // ★pre=臂条件（判负→e 臂,262 lifeGtHalf）；gate=区域门（判负→整支跳过,265 lifeLt0）
  if (cls.pre.length) el.pre = [...cls.pre];
  if (leafPres.length) el.gate = [...leafPres];
  if (cls.roll) el.roll = { ...cls.roll };
  if (body.length) el.t = body.map((b) => b.el);
  if (eels && eels.length) el.e = eels.map((b) => b.el);
  el.line = (body.length ? body[0].el.line : (firstLineOf(f) ?? f.line)) ?? 0;
  return wrapEl(el, phases);
}

/** 臂链解析：f 起（含死臂跳跃）找第一个对 t 活的臂；返回 'cut' = 纯门 return 割同层后续 */
/** 运行时失败面清扫：不可表达门/混合组之后继臂——对 t 静态活者递归解析（failFace 模式:
 *  叶改登记,割面/死臂/相位语义照走——曾盲扫 collectStmts → 156 专属尘被镇宠臂连坐 pending）。
 *  对 t 死的臂跳过（曾全局盲扫 → 449-452 骷髅族被 369 镇宠臂连坐 pending）。 */
function sweepFailureFace(from, S, ctx, reason) {
  const { t } = ctx;
  for (let x = from; x; x = SUCCESSOR.get(x.id)) {
    if (!condStaticTrue(x, t)) { markDeadArm(x, S, ctx); ctx.consumed.add(x.id); continue; }
    ctx.consumed.add(x.id);
    const saved = ctx.failFace;
    ctx.failFace = reason;
    resolveKids(x.id, SChild(S, x), [], ctx);
    ctx.failFace = saved;
    if (x.kind === 'if' && x.cond && !x.cond.life
      && (x.cond.typeIds.size > 0 || x.cond.ranges.length > 0) && x.cond.gates.length === 0) {
      for (let y = SUCCESSOR.get(x.id); y; y = SUCCESSOR.get(y.id)) { markDeadArm(y, S, ctx); ctx.consumed.add(y.id); }
      break;   // 纯 type 活臂：其后继不可达
    }
  }
}

function resolveArmChain(head, S, out, ctx) {
  const { t, consumed } = ctx;
  let cur = head;
  while (cur && !condStaticTrue(cur, t)) {
    markDeadArm(cur, S, ctx);
    consumed.add(cur.id);
    cur = SUCCESSOR.get(cur.id) || null;
  }
  if (!cur) return undefined;
  if (cur.kind === 'else') {              // else 臂 = 前臂全败后的无条件体（不收门）
    consumed.add(cur.id);
    resolveKids(cur.id, S, out, ctx);
    return undefined;
  }
  const gates = cur.cond ? cur.cond.gates : [];
  const cls = gates.length ? classifyGates(gates, ctx.t) : { ok: true, pre: [], roll: null };
  if (!cls.ok) {
    // 不可表达门（ai[1]/!wet/netMode/daybreak/双掷…）→ 本臂 pending + 失败面逐型清扫
    const reason = `gate:${gates.join(' && ')}`;
    markChainPending(cur, ctx, reason);
    sweepFailureFace(SUCCESSOR.get(cur.id) || null, S, ctx, reason);
    consumed.add(cur.id);
    return undefined;
  }
  // ★BJ304 批3：`roll && per-type 静态假` 复合门（524 num205=0 → num205>0 恒假,&& 左先
  //   求值）→ roll 照耗（掷流占位）+ 臂体对 t 静态死（dead 标记,零尘不臆发）。仅无 pre
  //   （roll 为首析取,短路序同相）且无后继臂（无 else 链）的形状走此道,其余保守 pending。
  if (cls.staticFalse && cls.pre.length === 0 && !SUCCESSOR.has(cur.id)) {
    const acc = [];
    collectStmts(cur.id, acc);
    for (const se of acc) se.__dead = true;
    consumed.add(cur.id);
    if (cls.roll) {
      out.push(wrapEl({ roll: { ...cls.roll }, line: (firstLineOf(cur) ?? cur.line) ?? 0 }, new Set([cur.phase || ctx.phaseCtx || 'both'])));
    }
    return undefined;
  }
  if ((cls.roll || cls.pre.length) && subtreePend(cur.id)) {
    // 分支叶含 pending（postUnsupported/colorLocal 族）→ 掷门结构不可表达 → 整链 pending
    const reason = 'branchMixedWithPending';
    markChainPending(cur, ctx, reason);
    sweepFailureFace(SUCCESSOR.get(cur.id) || null, S, ctx, reason);
    consumed.add(cur.id);
    return undefined;
  }
  const savedPhase = ctx.phaseCtx;
  if (cur.cond && cur.cond.life) ctx.phaseCtx = cur.cond.life;
  const body = [];
  resolveKids(cur.id, SChild(S, cur), body, ctx);
  ctx.phaseCtx = savedPhase;
  consumed.add(cur.id);
  if (cls.roll || cls.pre.length) {
    const tail = elseTail(SUCCESSOR.get(cur.id) || null, S, ctx);
    if (!tail.ok) {
      const reason = tail.reason;
      markChainPending(cur, ctx, reason);
      sweepFailureFace(SUCCESSOR.get(cur.id) || null, S, ctx, reason);
      return undefined;
    }
    for (let x = SUCCESSOR.get(cur.id); x; x = SUCCESSOR.get(x.id)) consumed.add(x.id);
    const br = buildBranchEl(cls, body, tail.els, cur, ctx);
    if (br) out.push(br);
    return undefined;
  }
  out.push(...body);
  if (cur.cond && cur.cond.life) return undefined;   // 相位臂：后继 = 补相位,由 kids-loop 续走
  if (cur.hadReturn && !hasStmtKids(cur.id) && cur.cond.typeIds.size === 0
    && cur.cond.ranges.length === 0 && cur.cond.gates.length === 0 && cur.cond.excludes.size >= 1) {
    return 'cut';   // `if (type != N) { return; }` 纯门割面：同层后续 = N 专属
  }
  for (let x = SUCCESSOR.get(cur.id); x; x = SUCCESSOR.get(x.id)) consumed.add(x.id);   // 纯 type 臂后继对 t 不可达
  return undefined;
}

/** 运行时失败面（分支 e 臂）解析 */
function elseTail(s, S, ctx) {
  const { t, consumed } = ctx;
  let cur = s;
  while (cur && !condStaticTrue(cur, t)) {
    markDeadArm(cur, S, ctx);
    consumed.add(cur.id);
    cur = SUCCESSOR.get(cur.id) || null;
  }
  if (!cur) return { ok: true, els: null };
  if (cur.kind === 'else') {
    consumed.add(cur.id);
    const els = [];
    resolveKids(cur.id, S, els, ctx);
    return { ok: true, els };
  }
  const gates = cur.cond ? cur.cond.gates : [];
  const cls = gates.length ? classifyGates(gates, ctx.t) : { ok: true, pre: [], roll: null };
  if (!cls.ok || cls.staticFalse) return { ok: false, reason: `gate:${gates.join(' && ')}` };   // ★BJ304:staticFalse 失败面保守 pending（本批无此形状）
  if ((cls.roll || cls.pre.length) && subtreePend(cur.id)) return { ok: false, reason: 'branchMixedWithPending' };
  const savedPhase = ctx.phaseCtx;
  if (cur.cond && cur.cond.life) ctx.phaseCtx = cur.cond.life;
  const body = [];
  resolveKids(cur.id, SChild(S, cur), body, ctx);
  ctx.phaseCtx = savedPhase;
  consumed.add(cur.id);
  if (cls.roll || cls.pre.length) {
    const sub = elseTail(SUCCESSOR.get(cur.id) || null, S, ctx);
    if (!sub.ok) return sub;
    for (let x = SUCCESSOR.get(cur.id); x; x = SUCCESSOR.get(x.id)) consumed.add(x.id);
    const br = buildBranchEl(cls, body, sub.els, cur, ctx);
    return { ok: true, els: br ? [br] : [] };
  }
  if (cur.cond && cur.cond.life) {         // 相位臂：补相位后继仍在失败面内 → 续链并入
    const rest = elseTail(SUCCESSOR.get(cur.id) || null, S, ctx);
    if (!rest.ok) return rest;
    return { ok: true, els: [...body, ...(rest.els || [])] };
  }
  for (let x = SUCCESSOR.get(cur.id); x; x = SUCCESSOR.get(x.id)) consumed.add(x.id);
  return { ok: true, els: body };
}

function resolveKids(fid, S, out, ctx) {
  const evs = kidsMap.get(fid);
  if (!evs) return;
  let cutRest = false;
  for (const ev of evs) {
    if (cutRest) break;               // 纯门 return 割面：`if (type != N) return` 后同层 = N 专属
    if (ev.ev === 'stmt') { materialize(ev.e, out, ctx); continue; }
    const f = ev.f;
    if (ctx.consumed.has(f.id)) continue;
    if (f.kind === 'for') {
      ctx.consumed.add(f.id);
      if (!f.loop.ok) { markChainPending(f, ctx, f.loop.reason || 'loop'); continue; }
      const body = [];
      resolveKids(f.id, S, body, ctx);
      if (!body.length) continue;
      if (subtreePend(f.id)) { markChainPending(f, ctx, 'groupMixedWithPending'); continue; }   // 循环体部分 pending → 整组保守 pending
      if (body.length === 1) {
        const el = body[0].el;
        if (f.loop.n != null || f.loop.hitK != null) {
          body[0].el = withCount(el, f.loop.n, f.loop.hitK);
        }
        out.push(body[0]);
      } else {
        const phases = new Set();
        for (const b of body) for (const p of b.phases) phases.add(p);
        const el = {};
        if (f.loop.n != null && f.loop.n !== 1) el.n = f.loop.n;
        if (f.loop.hitK != null) el.hitK = f.loop.hitK;
        el.body = body.map((b) => b.el);
        el.line = body[0].el.line ?? 0;
        out.push(wrapEl(el, phases));
      }
      continue;
    }
    if (f.kind === 'if' || f.kind === 'else') {
      if (f.phaseReturnGuard) { ctx.consumed.add(f.id); continue; }   // `life >= 0` return：相位由 phaseAfter 承载
      if (f.postAltConsumed) { ctx.consumed.add(f.id); continue; }    // Allman post-alt 已并入上一语句 alt
      const r = resolveArmChain(f, S, out, ctx);
      if (r === 'cut') cutRest = true;
      continue;
    }
    resolveKids(f.id, S, out, ctx);   // neutral 帧透传
  }
}

function resolveType(t) {
  const ctx = { t, consumed: new Set(), deadSeen: new Set(), phaseCtx: null, failFace: null };
  const out = [];
  resolveKids(ROOT_FID, null, out, ctx);
  return out;
}

// 候选型宇宙 = 所有帧正 type 集 ∪ excludes
const allTypes = new Set();
for (const [, evs] of kidsMap) {
  for (const ev of evs) {
    if (ev.ev !== 'frame' || !ev.f.cond) continue;
    const ft = framePosTypes(ev.f);
    if (ft) for (const x of ft) allTypes.add(x);
    for (const x of ev.f.cond.excludes) allTypes.add(x);
  }
}
for (const t of [...allTypes].sort((a, b) => a - b)) {
  const out = resolveType(t);
  for (const wp of out) {
    let rec = byType.get(t);
    if (!rec) { rec = { hit: [], death: [] }; byType.set(t, rec); }
    const phases = [...wp.phases];
    for (const ph of (phases.includes('both') ? ['hit', 'death'] : phases)) rec[ph].push(wp.el);
  }
}
// 未达语句（全局悬空,无 type 域）→ typesUnknown pending（保守,不臆发）
for (const e of entries) {
  if (!e.__seen && !e.__dead && !e.__pend) registerPending(e, null, ['typesUnknown']);
}

// ---------------- 产物 ----------------
const data = { _meta: {} };
const typeIds = [...byType.keys()].sort((a, b) => a - b);
for (const id of typeIds) {
  if (WIRED_TYPES.has(id)) data[String(id)] = byType.get(id);
  else pendings.set('batch:' + id, { key: 'batch:' + id, line: byType.get(id).hit[0]?.line ?? byType.get(id).death[0]?.line ?? 0, types: new Set([id]), phase: 'both', reason: 'batch3+:std-expressible（未接组滚动清单）', count: 1 });
}
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
  schema: 'per-npcId: {hit:[el],death:[el]}; el=stmt|branch|loop; stmt={dust,idRand?,n?|hitK?,anchor?/dx?/dy?/w?/h?,sx?,sy?,alpha?,color?,scale?,pre?,posts?,alt?,line}; branch={pre?,gate?,roll:{k,op,v},n?|hitK?,t?:[el],e?:[el],line}=Main.rand.Next(k) op v 单掷二选一（pre=臂条件判负→e 臂不掷;gate=区域门判负→整支跳过）; 无臂 branch=掷流占位（roll 照耗零尘,★BJ304 524 静态死臂）; loop={n?|hitK?,body:[el],line}=循环组（逐拍按序走 body）; n 缺省 1/hitK=ceil(dmg/lifeMax*K)/alpha0/color 默认/scale1; idRand=K → dust=base+Next(K) 逐尘掷; sx token: hd|2hd|2.5hd|1.5hd|6hd|-1hd|-1.5hd|velX|velY|negVelX*0.2|negVelY*0.2|velX*0.2|velY*0.2|数; anchor=center → 盒=中心±(dx,dy) 半开 w×h; pre/gate: lifeGtHalf=hp>floor(maxHp/2)|lifeLt0=hp<0（命中时点 post-deduction,StrikeNPC :82206/:82213 life-=num 先于 HitEffect :82325）; posts ops: ng|velMul|velDiv|scaleMul|scaleDiv|scaleSet|scaleSetNpc|scaleAddR01(scale+=NextFloat())|fadeIn(N)=原版生长目标语义 Dust.cs :2148-2171（★BJ304 定谳:非 alpha 渐入;VanillaDust.ts :740-745 引擎 1:1）|复合 scale=A+NextFloat()=scaleSet+scaleAddR01（426/427 死亡支形态）; alt={k,op,v,ifOps,elseOps}=逐尘掷骰 post 分支',
  noGenericTail: '★原版无通用尘尾（最终 else=if(type!=156) return 专属支）——表外型受击/死亡不出尘（BJ254 双向偏差收口的行为变化面）',
  batch2: 'BJ296 批2（2026-09-23）概率门族接入：帧树逐型臂解析（死臂剪枝/循环组/单掷分支/pre 谓词/idRand）；掷流通道=Math.random（与批1 alt 同源,引擎侧 spawnDust 抖动同拍）; 接入 15 型：134-136/262-265/407/409/410/411/428/478/516/636',
  batch3: 'BJ304 批3（2026-09-23）fadeIn 定谳翻案族接入：★翻案=fadeIn 非「alpha 渐入/本仓不可用」（BJ296 批2 报告登记误）——原版语义=生长目标（Dust.cs :2148-2171:0<fadeIn<100 时 scale+=0.03/t 至超 fadeIn 归零转衰落,无 alpha 参与）,本仓 VDust.fadeIn 在位+老化 1:1（VanillaDust.ts :740-745）→ 收编 std 算子 fadeIn(N)。接入 18 型：fadeIn 叶族 415-421/423-427/429/518（叶=[ng,scaleSet1.5,fadeIn1,velMul3],主 d241|d249+叶 d6|d242|d229）+524-527（typedLocals per-type 局部 id:num205=0/75/170/67;门 Next(K)==0&&num205>0 静态析取——524 臂体静态死→掷流占位空分支,525/526/527 恒真脱门）。426/427 death 半接（d241 主环入表;SelectRandom 环 pending:noLight=VDust.noLight 字段在位但引擎不消费+idPick 未建）。仍排除：661（hslToRgb 彩虹色+NextVector2Circular 位移+velocity 派生+CloneDust 回声,零尘登记）/402（oldPos,批4）',
  carveOuts: [
    '泼岩浆（BJ246 已接）/亡体 NewNPC 分裂等世界改写不入尘表——★S4 亡体 NewNPC 10 站站点级登记（HitEffect :82492-:90939 逐站普查;接刀=Enemy.ts 死亡管线,防批 2+ 普查误读为缺刀）: :83989 426外星蜂后→428×3 已接/:84400 405星细胞→406≤4 已接/:85721 16母史莱姆→-5×2-3 已接/:85917 246石巨人挂载头→249 已接(golemHeadAI 血尽转自由态,非 NewNPC 直出)/:86418 121飞尸→-2 ★BJ263 接/:86434 81腐化史莱姆→-1×2-3 ★BJ263 接/:86671 50史莱姆王→1×4-7 已接/:87982 632蛆虫僵尸→606×2-3 ★BJ263 接/:88413 115饥饿者→116 已接/:90342 135毁灭者身段→139 已接(存活面 ai2==0 掷探针)',
    'gore 表由 tools/extract-gore.mjs 全量承担（spawnNpcDeathGore）',
    '音效（SoundID.NPCHit/NPCDeath）/DBT/公告/探针生成（135 探针等）非尘面',
  ],
  pending: [...pendings.values()].map((p) => ({ types: [...p.types].sort((a, b) => a - b), line: p.line, phase: p.phase, reason: p.reason, count: p.count })),
  deadArms: deadArms,
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
    const tys = p.types instanceof Set ? [...p.types] : p.types;
    console.log(`  L${p.line} phase=${p.phase} types=${tys ? tys.join(',') : '?'} ×${p.count} ${p.reason}`);
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
