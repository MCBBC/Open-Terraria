#!/usr/bin/env node
// tools/extract-gore.mjs —— NPC.HitEffect（Terarria1456/Terraria/NPC.cs:82421-:90873）死亡 gore 提取器
//
// 方法结构：`public void HitEffect(int hitDirection = 0, double dmg = 10.0)`（NPC.cs:82421），
// 逐 type 的 if/else-if 长链（:82877 `if (type == 552 || …)` 起）+ 尾部 catch-all `else`
// （:86465）内嵌第二层 type 链；每支内 `if (life > 0) { …; return; }` 之后即死亡段
// （life<=0 才执行到 gore 调用）。人形族共用支（:87845）尾段是 `type != 187 && type != 433`
// 排除守卫 + 通用碎块（gore 3/4/4/5/5）。
//
// 提取语义（对齐原版执行语义，偏差登记在产物 _meta.notes）：
//   1. 物理行先按括号深度拼成逻辑行（跨行实参/命名实参 Position:/Velocity:/Type: 支持）；
//   2. 逻辑行扫描，深度栈记录每个 Gore.NewGore[Perfect|Direct] 调用的完整守卫链；
//   3. npcId = 守卫链上 type 谓词的【并集∩跨层交集】（`type == N`、`type >= A && type <= B`、
//      `type != N` 排除、`type < N` 收窄）；`NPCID.Sets.IsTownPet[type]`（NPCID.cs:4444）静态
//      展开进 include（OR 项）；无 type 谓词 → _meta.defaultEntries 不摊到全部 id；
//   4. life 相位：内层最近 `life > 0` → hit 段跳过；`life <= 0` → 死亡段；无 life 守卫 →
//      hit/death 双段都会执行（HitEffect 死亡时必被调）→ 计为死亡 gore；
//   5. 只保留带具体数字 id 的调用：`X + Main.rand.Next(N)`/`Next(A,B)` 静态展开为区间，
//      `num + K` 局部变量按同 type 分支赋值流还原，仍不可求值保留表达式字符串；
//   6. 守卫编译成结构化 gates（运行时求值，语义=HitEffect 守卫链）：
//      · altTexture / spriteDirection / dmg —— NPC 字段门（运行时按来源 NPC 判定）
//      · IsShimmerVariant —— 微光变体门（NPC.cs:6643：townNpcVariationIndex==1）
//      · Main.netMode —— 联机模式门（运行时常量，单人=0）
//      · Main.rand.Next(N)==V —— 概率门（运行时掷骰）
//      · RedHatSkeletronAdjustmentsEnabled()（NPC.cs:67282：type/ai[3]/localAI[3] 组合）
//      · `<循环变量> < K` —— 循环相位门 → 静态折算成 loop 次数，不进 gates
//      · `A || type == N` —— OR 内带 type 谓词：N 型免门（freeTypes），其余型带 A 门
//      派对帽段（townNPC && life <= 0 && UsesPartyHat）整体剔除；
//   7. Position/Velocity 表达式编译（Vector2 局部赋值流 + 项式代数）：
//      · 项 = 锚点(position/Center/Top/Bottom) | new Vector2 | UnitX/UnitY×系数[×direction]
        //        | (Unit×系数).RotatedBy(rotation) | NextVector2Circular | Utils.RandomVector2 | 局部向量[×系数]
//      · 循环变量出现在 pos/vel 表达式 → 按循环域逐值展开（num189∈{-1,0,1} → 3 条 loop=1）
//   8. NewGore 之后的实例后处理（`int n = NewGore(...)` → `Main.gore[n].field =/+=/*=`
//      或 `Gore g = Main.gore[n]` 别名链）提取成有序 post 操作表，运行时按序应用。
//
// 产物：src/data/vanilla-gore.json
//   { "_meta": {...含 tex 尺寸表}, "<npcId>": [ { id|idAlt|idMin/idMax|ids, n?, vx?, vy?, velExpr?,
//      scale?, scaleExpr?, posExpr?, expr?, ai?, gates?, post?, line } , ... ] }
// velocity=velocity（缺省）表示继承 NPC 当前速度；NewGore 自带随机扰动（Gore.cs:1347-1348）
// 是运行时行为不进表。tex 尺寸供运行时碰撞盒 min(w,h)*0.9*scale（Gore.cs:1000-1012）。
//
// 用法：node tools/extract-gore.mjs [--audit]   （--audit = 只输出诊断 JSON，不落盘）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NPC_CS = join(ROOT, '..', 'Terarria1456', 'Terraria', 'NPC.cs');
const OUT = join(ROOT, 'src', 'data', 'vanilla-gore.json');
const SPRITE_DIR = join(ROOT, 'public', 'sprites', 'vanilla');

// ============ PNG 尺寸（IHDR 直读：8B 签名 + 4B len + 4B 'IHDR' + 4B w + 4B h） ============
const pngCache = new Map();
function pngSize(id) {
  if (pngCache.has(id)) return pngCache.get(id);
  let out = null;
  try {
    const p = join(SPRITE_DIR, `Gore_${id}.png`);
    if (existsSync(p)) {
      const b = readFileSync(p);
      out = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
  } catch { /* 缺贴图 → null，运行时回退 32px 盒（Gore.cs:999） */ }
  pngCache.set(id, out);
  return out;
}

// ============ 工具 ============
/** 括号深度（>0 = 未闭合） */
function parenDepth(s) {
  let d = 0;
  for (const c of s) { if (c === '(') d++; else if (c === ')') d--; }
  return d;
}

/** s[i] 须为 '('：取匹配内文 */
function parenBody(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')') { d--; if (d === 0) return s.slice(i + 1, j); }
  }
  return s.slice(i + 1);
}

/** 顶层逗号切分 */
function splitArgs(s) {
  const out = [];
  let d = 0, cur = '';
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

/** 顶层 `sep` 切分（括号/方括号内不切）；sep 为单字符如 '&' '|' */
function splitTop(s, sep) {
  const out = [];
  let d = 0, cur = '';
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

/** 顶层 ± 项切分 → [{t, sign}]（操作数后的 ± 视为一元符号不切，如 `40 * -1`） */
function splitTerms(s) {
  const out = [];
  let d = 0, cur = '', sign = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (d === 0 && (c === '+' || c === '-')
      && /[)\w.'\]]$/.test(cur.trimEnd())) {
      out.push({ t: cur.trim(), sign });
      cur = ''; sign = c === '+' ? 1 : -1;
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push({ t: cur.trim(), sign });
  return out;
}

/** NewGore(Vector2 Position, Vector2 Velocity, int Type, float Scale=1f) 命名实参归位 */
function namedArgs(args) {
  const map = { Position: args[0], Velocity: args[1], Type: args[2], Scale: args[3] };
  for (const a of args) {
    const m = a.match(/^(Position|Velocity|Type|Scale)\s*:\s*(.+)$/s);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

/** 数字后缀剥离（f/F/d/D/m/M）+ (float)/(int)/(double) 强转剥离 */
const numLit = (t) => {
  const m = String(t).trim().match(/^-?\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDmM]?$/);
  return m ? parseFloat(String(t).trim().replace(/[fFdDmM]$/, '')) : null;
};
/** 剥全部强转（含循环变量代换后的 `(float)-1` 形态）+ 修 `(int)(…)` 包裹 */
const stripCasts = (t) => String(t)
  .replace(/\(\s*(?:float|int|double|uint|byte|short|long)\s*\)/g, '')
  .replace(/\b\d+\.?\d*[fFdDmM](?![\w.])/g, (x) => x.slice(0, -1));

// ============ 守卫条件解析 ============
/** type 谓词全集（同条件内 || 并集；range 先消耗原文再扫单边界/!=） */
function parseTypeCond(cond) {
  const res = { include: new Set(), hasInclude: false, exclude: new Set(), lt: null, lte: null, gt: null, gte: null };
  if (!cond || cond === 'else') return res;
  let s = cond;
  let m;
  const range = [
    [/type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/g, (a, b) => [a, b]],
    [/type\s*>\s*(\d+)\s*&&\s*type\s*<\s*(\d+)/g, (a, b) => [a + 1, b - 1]],
    [/type\s*>=\s*(\d+)\s*&&\s*type\s*<\s*(\d+)/g, (a, b) => [a, b - 1]],
  ];
  for (const [re, f] of range) {
    for (const mm of s.matchAll(re)) {
      const [a, b] = f(+mm[1], +mm[2]);
      for (let t = a; t <= b; t++) res.include.add(t);
      res.hasInclude = true;
    }
    s = s.replace(new RegExp(re.source, 'g'), ' ');
  }
  for (const mm of s.matchAll(/type\s*==\s*(-?\d+)/g)) { res.include.add(+mm[1]); res.hasInclude = true; }
  for (const mm of s.matchAll(/type\s*!=\s*(-?\d+)/g)) res.exclude.add(+mm[1]);
  if ((m = s.match(/type\s*<\s*(\d+)/))) res.lt = +m[1];
  if ((m = s.match(/type\s*<=\s*(\d+)/))) res.lte = +m[1];
  if ((m = s.match(/type\s*>\s*(\d+)/))) res.gt = +m[1];
  if ((m = s.match(/type\s*>=\s*(\d+)/)) && +m[1] !== 0) res.gte = +m[1];
  return res;
}

function parseLife(cond) {
  if (!cond || cond === 'else') return null;
  if (/life\s*<=\s*0/.test(cond)) return 'death';
  if (/life\s*>\s*0/.test(cond) || /life\s*>=\s*1/.test(cond)) return 'alive';
  return null;
}

// ============ 结构化 gates ============
/** NPCID.Sets.IsTownPet（NPCID.cs:4444）——静态集合，OR 项直接展开进 include */
const IS_TOWN_PET = new Set([637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684]);

/** 单个子句归类 → {gate?, typePred?, staticTypes?, party?, loopGate?} | null(未知) */
function classifyClause(cl, loopNames) {
  const t = cl.trim();
  let m;
  if (/^type\b/.test(t) || /^life\b/.test(t)) return { typePred: true };
  if (/^ai\[\d\]\s*(==|!=)/.test(t)) return { typePred: true };   // 已由 parseAiGates 结构化
  if (t === 'NPCID.Sets.IsTownPet[type]') return { staticTypes: new Set(IS_TOWN_PET) };
  if ((m = t.match(/^!IsShimmerVariant$/))) return { gate: { k: 'shim', not: true } };
  if ((m = t.match(/^IsShimmerVariant$/))) return { gate: { k: 'shim', not: false } };
  if ((m = t.match(/^altTexture\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/))) return { gate: { k: 'alt', op: m[1], v: +m[2] } };
  if ((m = t.match(/^spriteDirection\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/))) return { gate: { k: 'sdir', op: m[1], v: +m[2] } };
  if ((m = t.match(/^dmg\s*(==|!=|>=|<=|>|<)\s*(-?[\d.]+)[fFdD]?$/))) return { gate: { k: 'dmg', op: m[1], v: +m[2] } };
  if ((m = t.match(/^Main\.netMode\s*(==|!=)\s*(\d+)$/))) return { gate: { k: 'net', op: m[1], v: +m[2] } };
  if ((m = t.match(/^Main\.rand\.Next\((\d+)\)\s*(==|!=)\s*(\d+)$/))) {
    return { gate: { k: 'rnd', n: +m[1], op: m[2], v: +m[3] } };
  }
  if (/^RedHatSkeletronAdjustmentsEnabled\(\)$/.test(t)) return { gate: { k: 'redhat' } };
  if (/UsesPartyHat|GetPartyHatColor|townNPC/.test(t)) return { party: true };
  if ((m = t.match(/^([A-Za-z_]\w*)\s*(<=|<)\s*(\d+)$/)) && loopNames.has(m[1])) {
    return { loopGate: { var: m[1], op: m[2], v: +m[3] } };
  }
  return null;
}

/** 剥一层包裹括号（子句整体被括号包住时） */
function unwrap(t) {
  let s = t.trim();
  while (s.startsWith('(') && parenBody(s, 0).length === s.length - 2) s = parenBody(s, 0).trim();
  return s;
}

/**
 * 守卫条件 → { gates, freeTypes, staticTypes, loopGates, party, unknown }
 *   单组（纯 &&）：gates = 全部门子句；多组（顶层 ||）：OR 内带 type 谓词的组只贡献
 *   freeTypes（该型免门），纯门组贡献 gates（见 _meta.notes 的 OR 语义说明）。
 */
function parseGateClauses(cond, loopNames) {
  const out = { gates: [], freeTypes: new Set(), staticTypes: new Set(), loopGates: [], party: false, unknown: [] };
  if (!cond || cond === 'else') return out;
  const groups = splitTop(cond, '|');
  const multi = groups.length > 1;
  for (const g of groups) {
    const clauses = splitTop(g, '&').map(unwrap);
    const gates = [], typesInGroup = new Set();
    for (const cl of clauses) {
      // 组内可能仍是嵌套 OR（`(type == 186 || type == 432)`）→ 递归判 type 谓词
      if (/^type\s*(==|>=|<=|>|<|!=)/.test(cl) || /^type\s*==/.test(cl)) { typesInGroup.add(0); continue; }
      if (/^NPCID\.Sets\.IsTownPet\[type\]$/.test(cl)) { for (const t of IS_TOWN_PET) out.staticTypes.add(t); continue; }
      const c = classifyClause(cl, loopNames);
      if (!c) { out.unknown.push(cl); continue; }
      if (c.party) { out.party = true; continue; }
      if (c.staticTypes) { for (const t of c.staticTypes) out.staticTypes.add(t); continue; }
      if (c.gate) gates.push(c.gate);
      if (c.loopGate) out.loopGates.push(c.loopGate);
    }
    if (multi) {
      // 多组：带 type 谓词的组只贡献类型免除；纯门组贡献 gates
      if (typesInGroup.size) {
        for (const mm of g.matchAll(/type\s*==\s*(-?\d+)/g)) out.freeTypes.add(+mm[1]);
      } else {
        out.gates.push(...gates);
      }
    } else {
      out.gates.push(...gates);
    }
  }
  return out;
}

// ============ gore id 表达式求值 ============
function evalIdExpr(expr) {
  const s = String(expr).trim();
  let m;
  if ((m = s.match(/^(-?\d+)[fFdD]?$/))) return { kind: 'id', id: +m[1] };
  if ((m = s.match(/^(\w+)\s*\?\s*(-?\d+)\s*:\s*(-?\d+)$/))) {
    // IsShimmerVariant ? 微光变体 : 常规 —— 常规态取 else 支，变体 id 进 idAlt
    return { kind: 'id', id: +m[3], idAlt: +m[2] };
  }
  if ((m = s.match(/^(-?\d+)\s*\+\s*Main\.rand\.Next\(\s*(\d+)\s*\)$/))) {
    const a = +m[1]; return { kind: 'range', min: a, max: a + +m[2] - 1 };
  }
  if ((m = s.match(/^(-?\d+)\s*\+\s*Main\.rand\.Next\(\s*(\d+)\s*,\s*(\d+)\s*\)$/))) {
    const a = +m[1]; return { kind: 'range', min: a + +m[2], max: a + +m[3] - 1 };
  }
  if ((m = s.match(/^Main\.rand\.Next\(\s*(\d+)\s*,\s*(\d+)\s*\)$/))) return { kind: 'range', min: +m[1], max: +m[2] - 1 };
  if ((m = s.match(/^Main\.rand\.Next\(\s*(\d+)\s*\)$/))) return { kind: 'range', min: 0, max: +m[1] - 1 };
  if (/^Utils\.SelectRandom</.test(s)) {
    const ids = [...s.matchAll(/(\d+)[fFdD]?/g)].map((x) => +x[1]);
    if (ids.length) return { kind: 'ids', ids };
  }
  // 局部变量 ± 常数偏移（人形族 `num46 + 3` 头/臂/腿族）
  if ((m = s.match(/^([A-Za-z_]\w*)\s*\+\s*(-?\d+)$/))) return { kind: 'local', name: m[1], off: +m[2] };
  if ((m = s.match(/^([A-Za-z_]\w*)\s*-\s*(-?\d+)$/))) return { kind: 'local', name: m[1], off: -+m[2] };
  if ((m = s.match(/^([A-Za-z_]\w*)$/))) return { kind: 'local', name: m[1], off: 0 };
  return null;
}

// ============ 主流程 ============
// 开发调试：`node tools/extract-gore.mjs --pos "<expr>"` / `--vel "<expr>"` 只跑表达式编译器
const DBG_POS = process.argv.includes('--pos');
const DBG_VEL = process.argv.includes('--vel');
const src = readFileSync(NPC_CS, 'utf8').split('\n');
const headIdx = src.findIndex((l) => l.includes('public void HitEffect(int hitDirection'));
if (headIdx < 0) { console.error('HitEffect not found in NPC.cs'); process.exit(1); }

// 方法体括号切片：签名行 '{' 起深度扫描到配平 '}'（其后即 `public static int CountNPCS`）
let bodyEnd = headIdx;
{
  let d = 0, seen = false;
  for (let i = headIdx; i < src.length; i++) {
    for (const c of src[i]) {
      if (c === '{') { d++; seen = true; } else if (c === '}') d--;
    }
    if (seen && d === 0) { bodyEnd = i; break; }
  }
}

// 逻辑行：括号深度 >0 持续拼接（跨行实参）
const logical = [];
{
  let buf = null;
  for (let ln = headIdx; ln <= bodyEnd; ln++) {
    if (!buf) buf = { text: src[ln], line: ln + 1 };
    else buf.text += ' ' + src[ln].trim();
    if (parenDepth(buf.text) <= 0) { logical.push(buf); buf = null; }
  }
  if (buf) logical.push(buf);
}

const stack = [];       // 深度栈：每项一个守卫上下文
let depth = 0;
let ctxSeq = 0;
let pendingGuard = null;
const caseAt = new Map(); // depth → { label, types:Set|null }
const lastCtxAt = new Map(); // depth → 该层最近弹出的守卫上下文（else 取反用）

/** else 分支门取反（`if (spriteDirection != -1) … else …` → else 段带 `== -1` 门） */
const NEG_OP = { '==': '!=', '!=': '==', '<': '>=', '<=': '>', '>': '<', '>=': '<=' };
function negateGates(gates) {
  const out = [];
  for (const g of gates) {
    if (g.op) out.push({ ...g, op: NEG_OP[g.op] ?? g.op });
    else if (g.k === 'shim') out.push({ k: 'shim', not: !g.not });
    else if (g.k === 'redhat') out.push({ k: 'redhat', not: !g.not });
    else out.push({ k: 'skip', reason: `!${g.k}` });   // 不可取反 → 运行时恒假（登记用）
  }
  return out;
}
const locals = new Map(); // name → [{ line, valExpr, typeCtxId }]（id 还原用）
const vecHist = new Map(); // Vector2 局部 → [{ line, kind:'pos'|'vel', ir }]（pos/vel 编译用）
const entries = new Map();
const defaultEntries = [];
const unresolved = [];
const unresolvedGates = [];
const unresolvablePost = [];
let callsTotal = 0, callsHitSkipped = 0, callsPartySkipped = 0;

function makeGuard(kind, cond) {
  const t = parseTypeCond(cond);
  const loopNames = new Set([...stack].map((c) => c?.loopVar).filter(Boolean));
  const g = parseGateClauses(cond, loopNames);
  if (g.unknown.length && process.env.GORE_AUDIT_GATES) {
    for (const u of g.unknown) console.error(`[gate-unknown] ${cond} → ${u}`);
  }
  return {
    kind, cond,
    types: t.hasInclude ? t.include : null,
    exclude: t.exclude.size ? t.exclude : null,
    bounds: { lt: t.lt, lte: t.lte, gt: t.gt, gte: t.gte },
    life: parseLife(cond),
    ai: parseAiGates(cond),
    gates: g.gates,
    gateFree: g.freeTypes,
    staticTypes: g.staticTypes.size ? g.staticTypes : null,
    loopGates: g.loopGates,
    party: g.party,
    gateUnknown: g.unknown,
  };
}
function pushCtx(guard) {
  ctxSeq++;
  stack.push({
    id: ctxSeq, kind: guard?.kind ?? null, cond: guard?.cond ?? null,
    types: guard?.types ?? null, exclude: guard?.exclude ?? null,
    bounds: guard?.bounds ?? null, life: guard?.life ?? null,
    ai: guard?.ai?.length ? guard.ai : null,
    gates: guard?.gates ?? [], gateFree: guard?.gateFree ?? null,
    staticTypes: guard?.staticTypes ?? null, loopGates: guard?.loopGates ?? [],
    party: guard?.party ?? false, gateUnknown: guard?.gateUnknown ?? [],
    loopN: guard?.loopN ?? null, loopVar: guard?.loopVar ?? null,
  });
}
/** 调用点守卫链解析 */
function resolveChain(extraCase) {
  const chain = [...stack];
  if (extraCase) chain.push(extraCase);
  let include = null, typeCtxId = null;
  const exclude = new Set(), gates = [], ai = [];
  const gateFree = new Set(), gateLayers = [], loopGates = [], gateUnknown = [];
  let party = false;
  for (const c of chain) {
    if (!c) continue;
    if (c.types) {
      include = include ? new Set([...include].filter((t) => c.types.has(t))) : new Set(c.types);
      typeCtxId = typeCtxId ?? c.id;
    }
    if (c.staticTypes) {
      // `NPCID.Sets.IsTownPet[type]` 是 OR 项（NPCID.cs:4444 静态集）→ 与本层 type 谓词并集
      include = include ? new Set([...include, ...c.staticTypes]) : new Set(c.staticTypes);
      typeCtxId = typeCtxId ?? c.id;
    }
    if (c.exclude) for (const t of c.exclude) exclude.add(t);
    if ((c.gates?.length ?? 0) > 0) {
      gates.push(...c.gates);
      gateLayers.push({ gates: c.gates, free: c.gateFree });
      if (c.gateFree) for (const t of c.gateFree) gateFree.add(t);
    }
    for (const g of c.loopGates ?? []) loopGates.push(g);
    for (const u of c.gateUnknown ?? []) gateUnknown.push(u);
    if (c.party) party = true;
    if (c.ai) ai.push(...c.ai);
    if (c.bounds && include) {
      if (c.bounds.lt != null) include = new Set([...include].filter((t) => t < c.bounds.lt));
      if (c.bounds.lte != null) include = new Set([...include].filter((t) => t <= c.bounds.lte));
      if (c.bounds.gt != null) include = new Set([...include].filter((t) => t > c.bounds.gt));
      if (c.bounds.gte != null) include = new Set([...include].filter((t) => t >= c.bounds.gte));
    }
  }
  let life = null;
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i]?.life) { life = chain[i].life; break; }
  const loopMap = new Map();
  let loopN = 1;
  for (const c of chain) {
    if (c?.loopN) loopN *= c.loopN;
    if (c?.loopVar) loopMap.set(c.loopVar, c.loopN ?? 1);
  }
  return { types: include, exclude, life, gates, gateFree, gateLayers, loopGates, gateUnknown, party, ai, typeCtxId, loopN, loopMap };
}

/** `ai[N] == V` / `ai[N] != V` → 结构化门 */
function parseAiGates(cond) {
  if (!cond) return [];
  const out = [];
  for (const m of cond.matchAll(/ai\[(\d)\]\s*==\s*(-?[\d.]+)[fF]?/g)) out.push({ slot: +m[1], value: +m[2], not: false });
  for (const m of cond.matchAll(/ai\[(\d)\]\s*!=\s*(-?[\d.]+)[fF]?/g)) out.push({ slot: +m[1], value: +m[2], not: true });
  return out;
}

function recordLocalAssign(name, valExpr, line, typeCtxId, loopRange) {
  if (!locals.has(name)) locals.set(name, []);
  locals.get(name).push({ line, valExpr, typeCtxId, loopRange });
}

/** Vector2 局部 IR 赋值/突变记录（kind 区分位置/速度两种编译） */
function recordVec(name, kind, ir, line) {
  if (!vecHist.has(name)) vecHist.set(name, []);
  vecHist.get(name).push({ line, kind, ir });
}
function vecIRFor(name, line) {
  const hist = (vecHist.get(name) ?? []).filter((h) => h.line <= line);
  return hist.length ? hist[hist.length - 1] : null;
}

// ---- 简易算术求值（局部变量/`type` 代数 id 还原用）----
/** 递归下降：数 / 一元± / * / + -；括号。`type==N` 归一后为 0/1。返回 number | null */
function evalArith(expr) {
  const toks = [];
  let s = String(expr).trim();
  let m;
  while (s.length) {
    if (/^\s/.test(s)) { s = s.slice(1); continue; }
    if ((m = s.match(/^(-?\d+\.?\d*)/))) { toks.push({ t: 'n', v: +m[1] }); s = s.slice(m[1].length); continue; }
    if ((m = s.match(/^([-+*()/<>?:])/))) {
      const op = m[1];
      // 双字符 <= >= == != 跳过（归一阶段已替换成数字）
      if ((op === '<' || op === '>') && '=<>=!'.includes(s[1] ?? '')) return null;
      toks.push({ t: op }); s = s.slice(1); continue;
    }
    if ((m = s.match(/^==/))) return null;
    return null;
  }
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (t) => { if (toks[pos] && toks[pos].t === t) { pos++; return true; } return false; };
  function ternary() {
    const c = additive();
    if (c == null) return null;
    if (eat('?')) {
      const a = ternary();
      if (a == null || !eat(':')) return null;
      const b = ternary();
      if (b == null) return null;
      return c !== 0 ? a : b;
    }
    return c;
  }
  function additive() {
    let v = multiplicative();
    while (v != null && (peek() && (peek().t === '+' || peek().t === '-'))) {
      const op = peek().t; pos++;
      const r = multiplicative();
      if (r == null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function multiplicative() {
    let v = unary();
    while (v != null && peek() && (peek().t === '*' || peek().t === '/')) {
      const op = peek().t; pos++;
      const r = unary();
      if (r == null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function unary() {
    if (eat('-')) { const v = unary(); return v == null ? null : -v; }
    if (eat('+')) return unary();
    if (eat('(')) { const v = ternary(); return eat(')') ? v : null; }
    const t = peek();
    if (t && t.t === 'n') { pos++; return t.v; }
    return null;
  }
  const out = ternary();
  return pos === toks.length ? out : null;
}

/** `type` → 具体值代入 + `X == Y` 归一为 0/1（仅支持全数字比较） */
function normalizeForArith(expr, t) {
  let s = String(expr).replace(/\btype\b/g, String(t));
  s = s.replace(/\(\s*(\d+)\s*==\s*(\d+)\s*\)/g, (_, a, b2) => (a === b2 ? '(1)' : '(0)'));
  s = s.replace(/(\d+)\s*==\s*(\d+)/g, (_, a, b2) => (a === b2 ? '1' : '0'));
  s = s.replace(/\(\s*\)/g, '');
  return s;
}

/** 单 type 值下的 id 求值 → {kind:id|range|ids} | null */
function evalIdForType(expr, t, callLine, typeCtxId) {
  // 纯数字代数（循环变量已代换成常数的 `728 + 3` 等）→ 常数折叠
  if (/^[\d\s+\-*/().]+$/.test(stripCasts(String(expr)))) {
    const v = evalArith(stripCasts(String(expr)));
    if (v != null && Number.isInteger(v)) return { kind: 'id', id: v };
  }
  const e = evalIdExpr(expr);
  if (e) {
    if (e.kind === 'id' || e.kind === 'range' || e.kind === 'ids') return e;
    if (e.kind === 'local') {
      const base = localValueForType(e.name, t, callLine, typeCtxId);
      if (base == null) return null;
      return applyOff(base, e.off);
    }
    return null;
  }
  // `X + local` / `local + rand(N)` / `local ± K` 反向形态
  let m;
  if ((m = expr.match(/^(-?\d+)\s*\+\s*([A-Za-z_]\w*)$/))) {
    const base = localValueForType(m[2], t, callLine, typeCtxId);
    return base == null ? null : applyOff(base, +m[1]);
  }
  if ((m = expr.match(/^([A-Za-z_]\w*)\s*\+\s*Main\.rand\.Next\(\s*(\d+)\s*\)$/))) {
    const base = localValueForType(m[1], t, callLine, typeCtxId);
    if (base == null || base.kind !== 'id') return null;
    return { kind: 'range', min: base.id, max: base.id + +m[2] - 1 };
  }
  if ((m = expr.match(/^(-?\d+)\s*\+\s*\(\(Main\.rand\.Next\(\d+\)\s*==\s*0\)\s*\?\s*(-?\d+)\s*:\s*(-?\d+)\)$/))) {
    return { kind: 'ids', ids: [+m[1] + +m[2], +m[1] + +m[3]] };
  }
  // 含 type 的代数式：代入后算术求值
  if (/\btype\b/.test(expr)) {
    const v = evalArith(normalizeForArith(expr, t));
    if (v != null) return { kind: 'id', id: v };
  }
  return null;
}

/** 局部变量在 type=t 下的值（赋值流末值；声明含 type/循环变量则代数求值） */
function localValueForType(name, t, callLine, typeCtxId) {
  const hist = (locals.get(name) ?? []).filter((h) => h.line < callLine && (h.typeCtxId === typeCtxId || h.typeCtxId == null));
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  if (last.loopRange) return { kind: 'range', min: last.loopRange[0], max: last.loopRange[1] };
  const e = evalIdExpr(last.valExpr);
  if (e && e.kind !== 'local') return e;
  if (/\btype\b/.test(last.valExpr)) {
    const v = evalArith(normalizeForArith(last.valExpr, t));
    if (v != null) return { kind: 'id', id: v };
  }
  if (/^([A-Za-z_]\w*)$/.test(last.valExpr.trim())) {
    return localValueForType(last.valExpr.trim(), t, callLine, typeCtxId);
  }
  // 算术组合（如 `11 + num744`，num744 为循环变量）
  let m;
  if ((m = last.valExpr.match(/^(-?\d+)\s*\+\s*([A-Za-z_]\w*)$/))) {
    const base = localValueForType(m[2], t, callLine, typeCtxId);
    return base == null ? null : applyOff(base, +m[1]);
  }
  return null;
}

function applyOff(v, off) {
  if (v.kind === 'id') return { kind: 'id', id: v.id + off };
  if (v.kind === 'range') return { kind: 'range', min: v.min + off, max: v.max + off };
  if (v.kind === 'ids') return { kind: 'ids', ids: v.ids.map((x) => x + off) };
  return null;
}

/** 逐 type 求值 → {fields} 统一 / {perType:Map} 分歧 / null 不可求值 */
function resolveIdPerType(expr, target, callLine, typeCtxId) {
  const per = new Map();
  for (const t of target) {
    const v = evalIdForType(expr, t, callLine, typeCtxId);
    if (!v) return null;
    per.set(t, v);
  }
  const uniq = [...new Set([...per.values()].map((v) => JSON.stringify(v)))];
  if (uniq.length === 1) return { fields: idFields(JSON.parse(uniq[0])) };
  const perMap = new Map();
  for (const [t, v] of per) perMap.set(t, idFields(v));
  return { perType: perMap };
}

function idFields(e) {
  const f = {};
  if (e.kind === 'id') {
    f.id = e.id;
    if (e.idAlt != null) f.idAlt = e.idAlt;   // IsShimmerVariant ? idAlt : id
  } else if (e.kind === 'range') {
    f.idMin = e.min; f.idMax = e.max; f.n = e.max - e.min + 1;
  } else if (e.kind === 'ids') {
    f.ids = e.ids; f.n = e.ids.length;
  }
  return f;
}

// ============ 位置/速度表达式编译（项式代数 + Vector2 局部流） ============
/**
 * 单位轴系数解析：`width / 2f` / `(float)width * 0.35f` / 常数 → {k, dim}
 * dim ∈ 'w' | 'h' | null（运行时 k*[w|h] 或 k 常数）
 */
/** 线性求值（width/height 为基）：`width * 0.35f + 40f` → {kw, kh, c} | null */
function linearOf(expr) {
  const s = stripCasts(String(expr)).replace(/\bwidth\b/g, 'W').replace(/\bheight\b/g, 'H');
  const toks = [];
  let rest = s;
  let m;
  while (rest.length) {
    if (/^\s/.test(rest)) { rest = rest.slice(1); continue; }
    if ((m = rest.match(/^(-?\d+\.?\d*)/))) { toks.push({ t: 'n', v: [0, 0, +m[1]] }); rest = rest.slice(m[1].length); continue; }
    if ((m = rest.match(/^([WH])/))) { toks.push({ t: 's', v: m[1] === 'W' ? [1, 0, 0] : [0, 1, 0] }); rest = rest.slice(1); continue; }
    if ((m = rest.match(/^([-+*/()])/))) { toks.push({ t: m[1] }); rest = rest.slice(1); continue; }
    return null;
  }
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (t) => { if (toks[pos] && toks[pos].t === t) { pos++; return true; } return false; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, b) => [a[0] * b[2], a[1] * b[2], a[2] * (b[0] + b[1] ? NaN : b[2])];
  const div = (a, b) => b[0] || b[1] ? null : [a[0] / b[2], a[1] / b[2], a[2] / b[2]];
  const isScalar = (a) => a[0] === 0 && a[1] === 0;
  function additive() {
    let v = mult();
    while (v && peek() && (peek().t === '+' || peek().t === '-')) {
      const op = peek().t; pos++;
      const r = mult();
      if (!r) return null;
      v = op === '+' ? add(v, r) : sub(v, r);
    }
    return v;
  }
  function mult() {
    let v = unary();
    while (v && peek() && (peek().t === '*' || peek().t === '/')) {
      const op = peek().t; pos++;
      const r = unary();
      if (!r) return null;
      if (op === '*') { if (!isScalar(r)) return null; v = mul(v, r); }
      else { if (!isScalar(r) || r[2] === 0) return null; v = div(v, r); }
      if (v.some(Number.isNaN)) return null;
    }
    return v;
  }
  function unary() {
    if (eat('-')) { const v = unary(); return v ? [-v[0], -v[1], -v[2]] : null; }
    if (eat('+')) return unary();
    if (eat('(')) { const v = additive(); return eat(')') ? v : null; }
    const t = peek();
    if (t && (t.t === 'n' || t.t === 's')) { pos++; return t.v; }
    return null;
  }
  const out = additive();
  if (!out || pos !== toks.length || out.some(Number.isNaN)) return null;
  return { kw: out[0], kh: out[1], c: out[2] };
}

/** 系数 → {k, c, dim}（dim ∈ 'w'|'h'|null；c = 伴随常数项） */
function coeffOf(kexpr) {
  const l = linearOf(kexpr);
  if (!l) return null;
  if (l.kw !== 0 && l.kh !== 0) return null;
  if (l.kw === 0 && l.kh === 0) return { k: 0, c: l.c, dim: null };
  return { k: l.kw !== 0 ? l.kw : l.kh, c: l.c, dim: l.kw !== 0 ? 'w' : 'h' };
}

/** `Main.rand.Next(a,b)`/`Next(n)` 常数链乘 → [lo, hi] | null（`Next(1,10)*0.3f*2.5f` 等） */
function nextRange(t) {
  const chainMag = (s) => {
    let mag = 1;
    for (const c of (s ?? '').matchAll(/([\d.]+)[fFdD]?/g)) mag *= +c[1];
    return mag;
  };
  let m = t.match(/^(?:\(float\)\s*)?Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)((?:\s*\*\s*-?[\d.]+[fFdD]?)*)$/);
  if (m) { const g = chainMag(m[3]); return [+m[1] * g, (+m[2] - 1) * g]; }
  m = t.match(/^(?:\(float\)\s*)?Main\.rand\.Next\((\d+)\)((?:\s*\*\s*-?[\d.]+[fFdD]?)*)$/);
  if (m) { const g = chainMag(m[2]); return [0, (+m[1] - 1) * g]; }
  return null;
}

/** 单个轴项 → { off, f, r:[a,b], j:[a,b] } | null（dim ∈ 'w'|'h'） */
function axisTerm(t, dim) {
  let term = t.trim();
  // 首项一元符号（splitTerms 只拆后续分隔符）
  let sgn = 1;
  if (/^[+-]/.test(term)) { sgn = term[0] === '-' ? -1 : 1; term = term.slice(1).trim(); }
  const dimName = dim === 'w' ? 'width' : 'height';
  let m;
  const scale = (r) => (r == null ? null : {
    ...(r.off != null ? { off: r.off * sgn } : {}),
    ...(r.f != null ? { f: r.f * sgn } : {}),
    ...(r.r != null ? { r: sgn > 0 ? r.r : [sgn * r.r[1], sgn * r.r[0]] } : {}),
    ...(r.j != null ? { j: sgn > 0 ? r.j : [sgn * r.j[1], sgn * r.j[0]] } : {}),
  });
  if ((m = term.match(/^-?\d+\.?\d*[fFdD]?$/))) return { off: parseFloat(term.replace(/[fFdD]$/, '')) * sgn };
  // `(<和式>)` [× 常数] → 递归缩放（vector30 的 (float)(-w + (int)(w*u))*0.5 等；子串严格变短防环）
  if ((m = term.match(/^\((.+)\)(?:\s*\*\s*(.+))?$/))) {
    const inner = axisExpr(m[1], dim);
    const c = m[2] != null ? coeffOf(m[2]) : { k: 1, c: 0, dim: null };
    if (inner && c && c.dim == null
      && (inner.off != null || inner.f != null || inner.r != null || inner.j != null)) {
      return scale({
        ...(inner.off != null ? { off: inner.off * c.k } : {}),
        ...(inner.f != null ? { f: inner.f * c.k } : {}),
        ...(inner.r != null ? { r: [inner.r[0] * c.k, inner.r[1] * c.k] } : {}),
        ...(inner.j != null ? { j: [inner.j[0] * c.k, inner.j[1] * c.k] } : {}),
      });
    }
    // 缩放失败 → 落到后续专项模式（`<和式> * NextFloat()` 等）
  }
  // 尺寸线性项（可带伴随常数：`width + 40f`）
  const c = coeffOf(term);
  if (c) {
    if (c.dim === dim) return scale({ ...(c.k ? { f: c.k } : {}), ...(c.c ? { off: c.c } : {}) });
    if (c.dim == null) return scale({ off: c.c });
    return null;
  }
  // `<尺寸式> * Main.rand.NextFloat()` → 随机分数域 + 伴随常数抖动（(w+40)*u → r[0,1]+j[0,40]）
  if ((m = term.match(/^(.+?)\s*\*\s*Main\.rand\.NextFloat\(\)$/))) {
    const cc = coeffOf(m[1]);
    if (!cc || cc.dim !== dim) return null;
    return scale({ ...(cc.k ? { r: [0, cc.k] } : {}), ...(cc.c ? { j: [0, cc.c] } : {}) });
  }
  // `Next(a,b)*C…` → 常数抖动域
  const nr = nextRange(term);
  if (nr) return scale({ j: nr });
  // `(int)((float)width * Main.rand.NextFloat())` → 随机分数域 [0,1]（截断粒度 ≤1px，近似）
  if ((m = stripCasts(term).match(/^\(\s*(width|height)\s*\*\s*Main\.rand\.NextFloat\(\)\s*\)$/))) {
    if (m[1] !== dimName) return null;
    return scale({ r: [0, 1] });
  }
  if ((m = term.match(/^Main\.rand\.Next\(\s*(width|height)\s*\)$/))) {
    if (m[1] !== dimName) return null;
    return scale({ r: [0, 1] });
  }
  // `<Vector2 局部>.X|.Y` 分量引用（vector10.X 等）——rot/dc/direction 项不可拆轴
  if ((m = term.match(/^([A-Za-z_]\w*)\.[XY]$/))) {
    const ir = localIR(m[1], 'pos', 999999, new Set());
    if (!ir || ir.rot || ir.dc || (m[0].endsWith('.X') ? ir.dx != null : ir.dy != null)) return null;
    const isX = m[0].endsWith('.X');
    const f = isX ? ir.fx : ir.fy;
    const off = isX ? ir.ox : ir.oy;
    if (f == null && off == null) return {};
    return scale({
      ...(f != null ? { f } : {}),
      ...(off != null ? { off } : {}),
    });
  }
  return null;
}

/** 轴分量编译 → { off, f, r:[a,b], j:[a,b] } | null（空表达式 = 无偏移） */
function axisExpr(expr, dim) {
  const body = stripCasts(String(expr)).trim();
  if (!body) return {};
  const terms = splitTerms(body);
  const out = { off: 0, f: 0, r: null, j: null };
  for (const { t, sign } of terms) {
    const r = axisTerm(t, dim);
    if (!r) return null;
    if (r.off != null) out.off += sign * r.off;
    if (r.f != null) out.f += sign * r.f;
    if (r.r) out.r = addRange(out.r, sign > 0 ? r.r : [sign * r.r[1], sign * r.r[0]]);
    if (r.j) out.j = addRange(out.j, sign > 0 ? r.j : [sign * r.j[1], sign * r.j[0]]);
  }
  const res = {};
  if (out.off) res.off = +out.off.toFixed(4);
  if (out.f) res.f = +out.f.toFixed(4);
  if (out.r) res.r = [+out.r[0].toFixed(4), +out.r[1].toFixed(4)];
  if (out.j) res.j = [+out.j[0].toFixed(4), +out.j[1].toFixed(4)];
  return res;
}

function addRange(cur, r) {
  if (!cur) return [Math.min(r[0], r[1]), Math.max(r[0], r[1])];
  return [cur[0] + r[0], cur[1] + r[1]];
}

/** IR 加法（同键相加；区间端点相加） */
function addIR(a, b) {
  const out = { ...a };
  for (const k of ['ox', 'oy', 'fx', 'fy', 'dx', 'dy']) {
    if (b[k] != null) out[k] = +(((out[k] ?? 0) + b[k])).toFixed(4);
  }
  for (const k of ['rwx', 'rwy', 'jx', 'jy']) {
    if (b[k]) out[k] = [ +((out[k]?.[0] ?? 0) + b[k][0]).toFixed(4), +((out[k]?.[1] ?? 0) + b[k][1]).toFixed(4) ];
  }
  if (b.dc) out.dc = [ +(((out.dc?.[0] ?? 0) + b.dc[0])).toFixed(4), +(((out.dc?.[1] ?? 0) + b.dc[1])).toFixed(4) ];
  if (b.rot) out.rot = [...(out.rot ?? []), ...b.rot];
  return out;
}

/** IR 缩放（局部向量 × 系数；系数可为尺寸分数 {k,dim}——rot 项的 k 继承 dim） */
function scaleIR(ir, coeff) {
  const { k, dim } = typeof coeff === 'number' ? { k: coeff, dim: null } : coeff;
  const out = {};
  for (const key of ['ox', 'oy', 'dx', 'dy']) {
    if (ir[key] != null) out[key] = +(ir[key] * k).toFixed(4);
  }
  if (ir.fx != null && !(dim === 'h')) out.fx = +(ir.fx * (dim === 'w' ? k : k)).toFixed(4);
  if (ir.fy != null && !(dim === 'w')) out.fy = +(ir.fy * k).toFixed(4);
  for (const key of ['rwx', 'rwy', 'jx', 'jy']) {
    if (ir[key]) out[key] = [+(ir[key][0] * k).toFixed(4), +(ir[key][1] * k).toFixed(4)];
  }
  if (ir.dc) out.dc = [+(ir.dc[0] * Math.abs(k)).toFixed(4), +(ir.dc[1] * Math.abs(k)).toFixed(4)];
  if (ir.rot) {
    out.rot = ir.rot.map((r) => {
      if (dim && r.dim) return null;   // 双重尺寸分数不支撑
      return { ...r, k: +(r.k * k).toFixed(4), dim: r.dim ?? dim ?? null };
    });
    if (out.rot.some((r) => r == null)) return null;
  }
  if (ir.rv) out.rv = [+(ir.rv[0] * k).toFixed(4), ir.rv[1]];
  return out;
}

/** Vector2 局部在 callLine 前的最新 IR（kind 须匹配） */
function localIR(name, kind, callLine, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const rec = vecIRFor(name, callLine);
  if (!rec || rec.kind !== kind) return null;
  if (rec.ir.__ref) return localIR(rec.ir.__ref, kind, callLine, seen);
  return rec.ir;
}

/** 单项 → IR（pos 语义）| null */
function posTermIR(term, callLine, seen) {
  const t = term.trim();
  let m;
  if (t === 'position') return {};
  if (t === 'base.Center') return { fx: 0.5, fy: 0.5 };
  if (t === 'base.Top') return { fx: 0.5 };
  if (t === 'base.Bottom') return { fx: 0.5, fy: 1 };
  // 荷兰人 vector20：`new Vector2((spriteDirection != 1) ? 1 : (-1), 0f).RotatedBy(rotation)`
  //   —— 须先于通用 new Vector2 分支（否则尾缀 .RotatedBy 被吞）
  if (/^new Vector2\(\s*\(spriteDirection != 1\)\s*\?\s*1\s*:\s*\(-1\)\s*,\s*0f?\s*\)\s*\.RotatedBy\(rotation\)$/.test(t)) {
    return { rot: [{ a: 'x', s: 'sd', k: 1, dim: null }] };
  }
  // `base.Size * K` = (width, height) × K
  if ((m = t.match(/^base\.Size\s*\*\s*([\d.]+)[fF]?$/))) return { fx: +m[1], fy: +m[1] };
  if (t.startsWith('new Vector2(')) {
    const comps = splitArgs(parenBody(t, t.indexOf('(')));
    if (comps.length === 1) {
      const v = numLit(comps[0]);
      return v == null ? null : { ox: v, oy: v };
    }
    if (comps.length !== 2) return null;
    const out = {};
    for (const [axis, dim, comp] of [['x', 'w', comps[0]], ['y', 'h', comps[1]]]) {
      let body = comp.trim();
      const anchorRe = new RegExp(`position\\.${axis.toUpperCase()}\\b`);
      if (anchorRe.test(body)) body = body.replace(anchorRe, '');
      // 无锚点轴：整体按偏移式编译（可含本轴尺寸分数项）
      const r = axisExpr(body, dim);
      if (!r) return null;
      if (r.off != null) out[`o${axis}`] = r.off;
      if (r.f != null) out[`f${axis}`] = r.f;
      if (r.r) out[axis === 'x' ? 'rwx' : 'rwy'] = r.r;
      if (r.j) out[axis === 'x' ? 'jx' : 'jy'] = r.j;
    }
    return out;
  }
  // `Vector2.UnitX|UnitY * 系数` [× direction]
  if ((m = t.match(/^Vector2\.Unit([XY])\s*\*\s*(.+)$/))) {
    const axis = m[1].toLowerCase();
    const kexpr = m[2].trim();
    if (/\bdirection\b/.test(kexpr)) {
      const v = numLit(kexpr.replace(/\(float\)\s*direction/g, '').replace(/\*|\s*direction/g, '').trim()) ?? numLit(kexpr.replace(/[*\s( float)direction]/g, ''));
      if (v == null) {
        // `20f * direction` 形态
        const mm = kexpr.match(/^([\d.]+)[fF]?\s*\*\s*\(float\)?\s*direction$/);
        if (!mm) return null;
        return axis === 'x' ? { dx: +mm[1] } : { dy: +mm[1] };
      }
      return axis === 'x' ? { dx: v } : { dy: v };
    }
    const c = coeffOf(kexpr);
    if (!c) return null;
    if (c.dim == null) return axis === 'x' ? { ox: c.k } : { oy: c.k };
    if (c.dim === 'w') return axis === 'x' ? { fx: c.k } : null;
    return axis === 'y' ? { fy: c.k } : null;
  }
  // `(-Vector2.UnitY * K).RotatedBy(rotation)` / `(...).RotatedBy(rotation)` 族
  if ((m = t.match(/^\(?\s*(-?)\s*Vector2\.Unit([XY])\s*\*\s*([\d.]+)[fF]?\s*\)?\.RotatedBy\(rotation\)$/))) {
    const sign = m[1] === '-' ? -1 : 1;
    return { rot: [{ a: m[2].toLowerCase(), s: sign, k: +m[3], dim: null }] };
  }
  // `Utils.RandomVector2(Main.rand, A, B)` → 均匀方形像素抖动
  if ((m = t.match(/^Utils\.RandomVector2\(\s*Main\.rand\s*,\s*(-?[\d.]+)[fF]?\s*,\s*(-?[\d.]+)[fF]?\s*\)$/))) {
    return { jx: [+m[1], +m[2]], jy: [+m[1], +m[2]] };
  }
  // `Main.rand.NextVector2Circular(A, B)` → 椭圆盘（Utils.cs:1269：单位向量×半径×u）
  if ((m = t.match(/^Main\.rand\.NextVector2Circular\(\s*([\d.]+)[fF]?\s*,\s*([\d.]+)[fF]?\s*\)$/))) {
    return { dc: [+m[1], +m[2]] };
  }
  // 局部向量 [× 系数]
  if ((m = t.match(/^([A-Za-z_]\w*)\s*\*\s*(.+)$/))) {
    const base = localIR(m[1], 'pos', callLine, seen);
    if (!base) return null;
    const c = coeffOf(m[2]);
    if (!c) return null;
    return scaleIR(base, c);
  }
  if (/^[A-Za-z_]\w*$/.test(t)) {
    return localIR(t, 'pos', callLine, seen);
  }
  return null;
}

/** Position 实参 → pos IR | null（不可编译时调用方保留 posExpr 原文） */
function compilePos(expr, callLine) {
  // 实体参照归一（base.Center.X = position.X + width/2 等）
  let s = String(expr).trim()
    .replace(/base\.Center\.X/g, 'position.X + (float)(width / 2)')
    .replace(/base\.Center\.Y/g, 'position.Y + (float)(height / 2)')
    .replace(/base\.Top\.X/g, 'position.X + (float)(width / 2)')
    .replace(/base\.Top\.Y/g, 'position.Y')
    .replace(/base\.Bottom\.X/g, 'position.X + (float)(width / 2)')
    .replace(/base\.Bottom\.Y/g, 'position.Y + (float)height')
    .replace(/base\.Right\.X/g, 'position.X + (float)width')
    .replace(/base\.Left\.X/g, 'position.X');
  const terms = splitTerms(s);
  if (!terms.length) return null;
  const seen = new Set();
  let out = {};
  for (const { t, sign } of terms) {
    const ir = posTermIR(t, callLine, seen);
    if (!ir) return null;
    const scaled = sign > 0 ? ir : scaleIR(ir, -1);
    if (!scaled) return null;
    out = addIR(out, scaled);
  }
  // 归零字段剔除（紧凑产物）
  for (const k of ['ox', 'oy', 'fx', 'fy', 'dx', 'dy']) if (out[k] === 0) delete out[k];
  return out;
}

/** Velocity 实参 → vel IR | null */
function compileVel(expr, callLine) {
  const s = String(expr).trim();
  let m;
  if (s === 'velocity') return {};
  if (s === 'Vector2.Zero' || s === 'default(Vector2)') return { vx: 0, vy: 0 };
  if ((m = s.match(/^velocity\s*\*\s*([\d.]+)[fF]?$/))) return +m[1] === 0 ? { vx: 0, vy: 0 } : { kx: +m[1], ky: +m[1] };
  if ((m = s.match(/^Main\.rand\.NextVector2Circular\(\s*([\d.]+)[fF]?\s*,\s*([\d.]+)[fF]?\s*\)$/))) {
    return { dc: [+m[1], +m[2]] };
  }
  // `Vector2.UnitY.RotatedByRandom(2π) * K` / `Vector2.Transform(new Vector2(K, 0f), CreateRotationZ(rand*2π))`
  //   → 均匀随机方向 × 定速（circular edge）
  if ((m = s.match(/^Vector2\.Unit[XY]\.RotatedByRandom\([\d.]+\)\s*\*\s*([\d.]+)[fF]?$/))) return { de: +m[1] };
  if ((m = s.match(/^Vector2\.Transform\(\s*new Vector2\(\s*([\d.]+)[fF]?\s*,\s*(-?[\d.]+)[fF]?\s*\)\s*,\s*Matrix\.CreateRotationZ\(/))) {
    return { de: +Math.hypot(+m[1], +m[2]) };
  }
  // `rotation.ToRotationVector2()`（flipX 由 `vector.X *= -1f`（spriteDirection==1 时）突变登记）
  if ((m = s.match(/^rotation\.ToRotationVector2\(\)$/))) return { rv: [1, 0] };
  if (s.startsWith('new Vector2(')) {
    const comps = splitArgs(parenBody(s, s.indexOf('(')));
    if (comps.length !== 2) return null;
    const out = {};
    const comp = (c, axis) => {
      const t = c.trim();
      let mm;
      if ((mm = t.match(/^(-?[\d.]+)[fF]?$/))) { out[`v${axis}`] = +mm[1]; return true; }
      if (t === 'hitDirection') { out.hd = 1; return true; }
      // `Next(a,b) * C… * (float)hitDirection` → 随机幅值 × 击退方向
      if ((mm = t.match(/^(?:\(float\)\s*)?Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)((?:\s*\*\s*-?[\d.]+[fFdD]?)+)\s*\*\s*\(float\)\s*hitDirection$/))) {
        let mag = 1;
        for (const cc of mm[3].matchAll(/([\d.]+)[fFdD]?/g)) mag *= +cc[1];
        out.hdm = [+mm[1] * mag, (+mm[2] - 1) * mag];
        return true;
      }
      if ((mm = t.match(/^(?:\(float\)\s*)?Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)((?:\s*\*\s*-?[\d.]+[fFdD]?)*)$/)) && mm[3]) {
        let mag = 1;
        for (const cc of mm[3].matchAll(/([\d.]+)[fFdD]?/g)) mag *= +cc[1];
        const lo = +mm[1] * mag, hi = (+mm[2] - 1) * mag;
        out[`m${axis}`] = +((lo + hi) / 2).toFixed(4);
        out[`a${axis}`] = +((hi - lo) / 2).toFixed(4);
        return true;
      }
      if ((mm = t.match(/^Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)$/))) {
        const lo = +mm[1], hi = +mm[2] - 1;
        out[`m${axis}`] = +((lo + hi) / 2).toFixed(4);
        out[`a${axis}`] = +((hi - lo) / 2).toFixed(4);
        return true;
      }
      if ((mm = t.match(/^Main\.rand\.Next\((-?\d+)\)$/))) {
        out[`m${axis}`] = +((+mm[1] - 1) / 2).toFixed(4);
        out[`a${axis}`] = +((+mm[1] - 1) / 2).toFixed(4);
        return true;
      }
      if ((mm = t.match(/^Main\.rand\.NextFloat\(\)\s*\*\s*([\d.]+)[fF]?$/))) {
        out[`m${axis}`] = +((+mm[1]) / 2).toFixed(4);
        out[`a${axis}`] = +((+mm[1]) / 2).toFixed(4);
        return true;
      }
      // `0f - (3f + Next(4)*0.3f)` 之类复合 → 项式代数（off ± j 抖动域折叠成 m/a）
      const ax = axisExpr(t, axis === 'x' ? 'w' : 'h');
      if (!ax || ax.f != null || ax.r != null) return false;
      if (ax.off != null && ax.j == null) { out[`v${axis}`] = ax.off; return true; }
      if (ax.j != null) {
        const lo = (ax.off ?? 0) + Math.min(ax.j[0], ax.j[1]);
        const hi = (ax.off ?? 0) + Math.max(ax.j[0], ax.j[1]);
        out[`m${axis}`] = +((lo + hi) / 2).toFixed(4);
        out[`a${axis}`] = +((hi - lo) / 2).toFixed(4);
        return true;
      }
      return false;
    };
    void comp;
    if (!comp(comps[0], 'x') || !comp(comps[1], 'y')) return null;
    return out;
  }
  // Vector2 局部
  if (/^[A-Za-z_]\w*$/.test(s)) return localIR(s, 'vel', callLine, new Set());
  if ((m = s.match(/^([A-Za-z_]\w*)\s*\*\s*([\d.]+)[fF]?$/))) {
    const base = localIR(m[1], 'vel', callLine, new Set());
    if (!base) return null;
    const scaled = scaleIR(base, +m[2]);
    return scaled && (scaled.kx != null || scaled.rv || scaled.dc || scaled.de) ? scaled : null;
  }
  return null;
}

// ============ 实例后处理（NewGore 之后对同一 gore 实例的赋值/缩放） ============
const goreIdx = new Map();     // 索引变量名 → 该 NewGore 发射的表项对象数组
const goreAlias = new Map();   // `Gore g = Main.gore[n]`/`Gore g = g2` 别名 → 索引变量名
let activeGoreEntries = [];    // 最近一次 NewGore 的表项（供 `Gore g = NewGore(...)` 直取）

/** 主扫描里解析一行中的后处理语句（返回是否产生 post） */
function handlePostLine(plain, lineNo) {
  let m;
  // 别名绑定：`Gore g = Main.gore[n];` / `Gore g = <别名>;` / `Gore g = Gore.NewGore...`（后者在 handleGoreCall 内）
  if ((m = plain.match(/^Gore\s+([A-Za-z_]\w*)\s*=\s*Main\.gore\[([A-Za-z_]\w*)\]\s*;$/))) {
    goreAlias.set(m[1], m[2]);
    return;
  }
  if ((m = plain.match(/^(?:Gore\s+)?([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*;$/)) && goreAlias.has(m[2])) {
    goreAlias.set(m[1], goreAlias.get(m[2]));
    return;
  }
  // 索引别名重绑（无类型前缀的重赋值）：`gore2 = Main.gore[num569];`
  if ((m = plain.match(/^([A-Za-z_]\w*)\s*=\s*Main\.gore\[([A-Za-z_]\w*)\]\s*;$/))) {
    goreAlias.set(m[1], m[2]);
    return;
  }
  // 索引变量复用：`n = Main.gore[n]` 不存在；`n = Gore.NewGore(...)` 在 handleGoreCall 内重绑
  // 目标解析：`Main.gore[n].field[.sub]` / `alias.field[.sub]`
  const targetOf = (s) => {
    let mm = s.match(/^Main\.gore\[([A-Za-z_]\w*)\]\.(\w+(?:\.\w+)?)$/);
    if (mm) return { idx: mm[1], field: mm[2] };
    mm = s.match(/^([A-Za-z_]\w*)\.(\w+(?:\.\w+)?)$/);
    if (mm && goreAlias.has(mm[1])) return { idx: goreAlias.get(mm[1]), field: mm[2] };
    return null;
  };
  const stmts = plain.split(';').map((x) => x.trim()).filter(Boolean);
  for (const st of stmts) {
    // `<lhs> <op> <rhs>` 单语句（lhs 形如 Main.gore[n].velocity.X / alias.scale）
    let mm = st.match(/^([\w.\[\]]+?)\s*(\*=|\+=|-=|=)\s*(.+)$/);
    if (!mm || !mm[1].includes('.')) continue;
    const tgt = targetOf(mm[1]);
    if (!tgt) continue;
    const list = goreIdx.get(tgt.idx);
    if (!list) continue;
    const op = compilePostOp(tgt.field, mm[2], mm[3], lineNo);
    if (!op) { unresolvablePost.push({ line: lineNo, stmt: st }); continue; }
    for (const e of list) (e.post ??= []).push(op);
  }
}

/** 单条后处理语句 → op 数组（有序语义） */
function compilePostOp(field, op, rhs, lineNo) {
  const r = rhs.trim();
  let m;
  if (field === 'velocity' || field === 'scale' || field === 'alpha' || field === 'rotation' || field === 'position') {
    if (op === '*=') {
      if (field === 'velocity') {
        const v = numLit(r);
        if (v != null) return ['vm', v];
        // `1f + (float)Next(-20,21) * 0.01f`（scale）在 scale 分支
      }
      if (field === 'scale') {
        if ((m = r.match(/^([\d.]+)[fF]?\s*\+\s*\(float\)\s*Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)\s*\*\s*([\d.]+)[fF]?$/))) {
          const lo = +m[1] + (+m[2]) * +m[4], hi = +m[1] + (+m[3] - 1) * +m[4];
          return ['sm', +lo.toFixed(4), +hi.toFixed(4)];
        }
        const v = numLit(r);
        if (v != null) return ['sm', v, v];
      }
    }
    if (op === '=') {
      if (field === 'velocity') {
        const ir = compileVel(r, lineNo);
        if (ir) return ['vs', ir];
        return null;
      }
      if (field === 'scale') { const v = numLit(r); if (v != null) return ['ss', v]; }
      if (field === 'alpha') {
        if (r === 'alpha') return ['al', 'npc'];
        const v = numLit(r);
        if (v != null) return ['al', v];
      }
      if (field === 'rotation') {
        if (r === 'MathF.PI' || r === 'Math.PI') return ['ro', Math.PI];
      }
      if (field === 'position') {
        const ir = compilePos(r, lineNo);
        if (ir) return ['ps', ir];
        return null;
      }
    }
    return null;
  }
  // `velocity.X += / -=`、`velocity.Y -= Main.rand.NextFloat()`
  if ((m = field.match(/^velocity\.([XY])$/))) {
    const axis = m[1] === 'X' ? 'x' : 'y';
    if (op === '+=') {
      const v = numLit(r);
      if (v != null) return ['va', axis, v, v];
      if ((m = r.match(/^\(float\)\s*Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)\s*\*\s*([\d.]+)[fF]?$/))) {
        const lo = +m[1] * +m[3], hi = (+m[2] - 1) * +m[3];
        return ['va', axis, +lo.toFixed(4), +hi.toFixed(4)];
      }
    }
    if (op === '-=') {
      if (r === 'Main.rand.NextFloat()') return ['va', axis, -1, 0];
      const v = numLit(r);
      if (v != null) return ['va', axis, -v, -v];
    }
    return null;
  }
  return null;
}

function emitEntry(npcId, fields, line, gates, ai, loopN) {
  if (!entries.has(npcId)) entries.set(npcId, []);
  const f = { ...fields, line };
  if (gates.length) f.gates = gates;
  if (ai.length) f.ai = ai;
  if (loopN && loopN > 1) f.loop = loopN;
  entries.get(npcId).push(f);
  return f;
}

// ---------- 逻辑行扫描（词法括号走查：对象初始化器 `{`/尾随 `}` 也计 depth） ----------
if (DBG_POS || DBG_VEL) {
  const e = process.argv[process.argv.indexOf(DBG_POS ? '--pos' : '--vel') + 1] ?? '';
  console.log(JSON.stringify(DBG_POS ? compilePos(e, 999999) : compileVel(e, 999999)));
  process.exit(0);
}
const LOOP_GUARD = {
  kind: 'loop', cond: null, types: null, exclude: null, bounds: null, life: null,
  gates: [], gateFree: null, staticTypes: null, loopGates: [], party: false, gateUnknown: [],
  loopN: 1, loopVar: null,
};
for (const { text, line: lineNo } of logical) {
  let i = 0;
  let guard = pendingGuard;   // 跨行：守卫头与 `{` 分行的挂起上下文
  pendingGuard = null;

  const plain = text.trim();
  // 后处理语句（NewGore 之后对同一实例的赋值）——先于守卫扫描消费
  if (/Main\.gore\[|^\s*Gore\s+\w+\s*=|\w+\.velocity|\w+\.scale|\w+\.alpha|\w+\.rotation|\w+\.position/.test(plain)) {
    handlePostLine(plain, lineNo);
  }

  // 局部变量赋值流（声明与重赋值；供 `num + K` id 还原 + Vector2 局部 IR）
  {
    let m;
    const isVecDecl = /^(?:int|float|double|byte|short|long|uint|var|bool|Vector2)\s+([A-Za-z_]\w*)\s*=\s*(.+?);$/.test(plain);
    if ((m = plain.match(/^(?:int|float|double|byte|short|long|uint|var|bool|Vector2)\s+([A-Za-z_]\w*)\s*=\s*(.+?);$/))
      || (m = plain.match(/^([A-Za-z_]\w*)\s*=(?![=>])\s*(.+?);$/))) {
      if (!/^(if|for|while|switch|return|else|do|try)$/.test(m[1])) {
        const r = resolveChain(null);
        recordLocalAssign(m[1], m[2], lineNo, r.typeCtxId);
        // Vector2 局部 IR（pos 优先，vel 兜底；两者都失败则跳过）
        if (/^Vector2\s/.test(plain) || vecHist.has(m[1]) || /^(?:position|base\.Center|base\.Top|base\.Bottom|new Vector2|Vector2\.)/.test(m[2].trim())
          || m[2].trim() === 'velocity') {
          const pi = compilePos(m[2], lineNo);
          if (pi) recordVec(m[1], 'pos', pi, lineNo);
          else {
            const vi = compileVel(m[2], lineNo);
            if (vi) recordVec(m[1], 'vel', vi, lineNo);
          }
        }
      }
    }
    // Vector2 局部突变：`v *= K`（含 `v.X *= -1f` 的 flipX 标记）
    if ((m = plain.match(/^([A-Za-z_]\w*)\s*\*=\s*(-?[\d.]+)[fF]?;$/))) {
      const rec = vecIRFor(m[1], lineNo);
      if (rec && !rec.ir.__ref) {
        const scaled = scaleIR(rec.ir, +m[2]);
        if (scaled) recordVec(m[1], rec.kind, scaled, lineNo);
      }
    }
    if ((m = plain.match(/^([A-Za-z_]\w*)\.X\s*\*=\s*(-?[\d.]+)[fF]?;$/))) {
      const rec = vecIRFor(m[1], lineNo);
      if (rec && rec.kind === 'vel' && rec.ir.rv) {
        const [k, flip] = rec.ir.rv;
        recordVec(m[1], 'vel', { rv: [k, flip + 1] }, lineNo);   // flip 次数累积（奇数次取反）
      }
    }
    void isVecDecl;
  }

  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      pushCtx(guard ?? null);
      guard = null;
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      // 记到弹出后的深度（else 与 `}` 后同级，键=depth-1）
      if (stack.length) lastCtxAt.set(depth - 1, stack[stack.length - 1]);
      if (stack.length) stack.pop();
      depth--;
      for (const k of [...caseAt.keys()]) if (k > depth) caseAt.delete(k);
      guard = null;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === ';') { i++; continue; }

    // 语句起点：守卫头 / case 标签 / 普通语句段
    const rest = text.slice(i);
    let m;
    let handled = true;
    if ((m = rest.match(/^(else\s+if|if)\s*\(/))) {
      const cond = parenBody(rest, m[0].length - 1);
      guard = makeGuard(m[1].replace(/\s+/g, ''), cond);
      i += m[0].length + cond.length + 1;
    } else if ((m = rest.match(/^else\b/))) {
      const g = makeGuard('else', 'else');
      // 兄弟 if 分支的门取反（`if (spriteDirection != -1) {A} else {B}` → B 带 `== -1`）
      const prev = lastCtxAt.get(depth);
      if (prev?.gates?.length) {
        g.gates = negateGates(prev.gates);
        g.gateFree = prev.gateFree ?? null;
      }
      guard = g;
      i += m[0].length;
    } else if ((m = rest.match(/^switch\s*\(/))) {
      const cond = parenBody(rest, m[0].length - 1);
      guard = makeGuard('switch', cond);
      i += m[0].length + cond.length + 1;
    } else if ((m = rest.match(/^case\s+([^:]+):/))) {
      const lbl = m[1].trim();
      const e = evalIdExpr(lbl);
      caseAt.set(depth, { label: lbl, types: e && e.kind === 'id' ? new Set([e.id]) : null });
      i += m[0].length;
    } else if ((m = rest.match(/^default\s*:/))) {
      caseAt.set(depth, null);
      i += m[0].length;
    } else if ((m = rest.match(/^(for|foreach|while|do|try)\b/))) {
      // for 头部：整数循环变量区间（id/pos 表达式引用时还原/展开）+ 常量次数（loop 字段）
      const fh = rest.match(/^for\s*\(\s*(?:int|float|double|var)?\s*([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*;\s*\1\s*(<=|<)\s*(\d+)\s*;/);
      let loopN = 1;
      if (fh) {
        const lo = +fh[2], hi = +fh[4];
        const rg = [lo, fh[3] === '<=' ? hi : hi - 1];
        recordLocalAssign(fh[1], `${rg[0]}`, lineNo, resolveChain(null).typeCtxId, rg);
        const n = (fh[3] === '<=' ? hi - lo + 1 : hi - lo);
        if (n > 0 && n <= 64) loopN = n;
        guard = { ...LOOP_GUARD, loopN, loopVar: fh[1] };
      }
      // 头部条件括号整体跳过（否则会被当成语句段消费掉守卫）
      const op = rest.indexOf('(');
      if (op >= 0) {
        const hd = parenBody(rest, op);
        i += op + hd.length + 2;
      } else {
        i += m[0].length;
      }
    } else {
      handled = false;
    }
    if (handled) continue;

    // 普通语句段：吃到顶层 ; { } 为止；段内提取 Gore.NewGore* 调用（此时 depth 即调用点深度）
    let j = i, pd = 0;
    const segStart = i;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '(') pd++;
      else if (ch === ')') pd--;
      else if (pd === 0 && (ch === ';' || ch === '{' || ch === '}')) break;
      j++;
    }
    const seg = text.slice(segStart, j);
    const segLoopN = guard && guard.kind === 'loop' ? (guard.loopN ?? 1) : 1;
    // NewGore 结果落地的局部变量（`int n = NewGore(...)` / `Gore g = NewGorePerfect(...)`）：
    // 供后续 Main.gore[n]/别名后处理定位表项
    let lhs = null;
    {
      const lm = seg.match(/^(?:int\s+|Gore\s+)?([A-Za-z_]\w*)\s*=\s*Gore\.NewGore(Perfect|Direct)?\(/);
      if (lm && seg.indexOf('Gore.NewGore') === lm[0].length - 'Gore.NewGore'.length - (lm[2] ? lm[2].length : 0) - 1) lhs = lm[1];
      else if (lm) lhs = lm[1];
    }
    let from = 0;
    for (;;) {
      const at = seg.indexOf('Gore.NewGore', from);
      if (at < 0) break;
      from = at + 1;
      const p = seg.indexOf('(', at);
      if (p < 0) continue;
      const callee = seg.slice(at, p);
      if (!/^Gore\.NewGore(Perfect|Direct)?$/.test(callee)) continue;
      handleGoreCall(callee, splitArgs(parenBody(seg, p)), lineNo, segLoopN, lhs);
      lhs = null;   // 同段多调用：只绑首个（源码无此形态）
    }
    if (guard && guard.kind === 'loop') guard = null; // 无括号体 = 单语句，守卫就此消费
    i = j;
  }
  // 行尾仍未消费的守卫头（与 `{` 分行）挂到下一逻辑行
  if (guard) pendingGuard = guard;
}

/** 单个 Gore.NewGore* 调用 → 表项 */
function handleGoreCall(callee, args, lineNo, segLoopN = 1, lhs = null) {
  callsTotal++;
  const a = namedArgs(args);
  if (a.Position === undefined || a.Type === undefined) return;
  const cc = caseAt.get(depth) ?? caseAt.get(depth - 1) ?? null;
  if (process.env.GORE_DBG_LINE && lineNo === +process.env.GORE_DBG_LINE) {
    console.error('[dbg] line', lineNo, 'depth', depth, 'stack', JSON.stringify(stack.map((c2) => c2?.cond)), 'case', cc?.label ?? null);
  }
  const r = resolveChain(cc ? {
    id: 0, kind: 'case', cond: `case ${cc.label}`, types: cc.types, exclude: null, bounds: null,
    life: null, gates: [], gateFree: null, staticTypes: null, loopGates: [], party: false,
    gateUnknown: [], loopN: null, loopVar: null,
  } : null);
  r.loopN *= segLoopN;

  if (r.party) { callsPartySkipped++; return; }                 // 派对帽专属段
  if (r.life === 'alive') { callsHitSkipped++; return; }        // hit 段
  for (const u of r.gateUnknown) unresolvedGates.push({ line: lineNo, cond: u });

  // 循环相位门（`num709 < 3`）：常量循环域内前 K 次迭代 → 折算 loop 次数，不进 gates
  for (const lg of r.loopGates) {
    const n = r.loopMap.get(lg.var);
    if (n && (lg.op === '<' ? lg.v : lg.v + 1) < n) {
      r.loopN = Math.max(1, Math.round((r.loopN / n) * (lg.op === '<' ? lg.v : lg.v + 1)));
      continue;
    }
    unresolvedGates.push({ line: lineNo, cond: `${lg.var} ${lg.op} ${lg.v}` });
  }

  // 循环变量展开：pos/vel/scale/id 表达式引用循环域 ≤8 的变量 → 逐值生成条目（loop 归 1）
  const posRaw = String(a.Position ?? 'position');
  const velRaw = String(a.Velocity ?? 'velocity');
  const sclRaw = String(a.Scale ?? '');
  const typeRaw = String(a.Type);
  const unrollVars = [...r.loopMap.entries()].filter(([v, n]) => n >= 1 && n <= 8
    && (new RegExp(`\\b${v}\\b`).test(posRaw) || new RegExp(`\\b${v}\\b`).test(velRaw)
      || new RegExp(`\\b${v}\\b`).test(sclRaw) || new RegExp(`\\b${v}\\b`).test(typeRaw)));
  let variants = [{}];
  let unrollCount = 1;
  if (unrollVars.length) {
    variants = [{}];
    for (const [v, n] of unrollVars) {
      const lo = Number((locals.get(v) ?? []).slice(-1)[0]?.valExpr ?? 0);
      const next = [];
      for (let k = 0; k < n; k++) for (const cur of variants) next.push({ ...cur, [v]: String(lo + k) });
      variants = next;
      unrollCount *= n;
    }
    r.loopN = Math.max(1, Math.round(r.loopN / unrollCount));
  }

  const emit = (sub) => {
    const sub1 = (raw) => (Object.keys(sub).length
      ? raw.replace(/\b([A-Za-z_]\w*)\b/g, (w) => sub[w] ?? w)
      : raw);
    emitCallEntry(callee, {
      Position: sub1(posRaw),
      Velocity: sub1(velRaw),
      Scale: sub1(sclRaw),
      Type: sub1(typeRaw),
    }, lineNo, r, lhs);
  };
  for (const sub of variants) emit(sub);
}

/** 单变体表项发射（gates 按 freeTypes 逐型豁免；不可求值 id 登记 unresolved） */
function emitCallEntry(callee, a, lineNo, r, lhs) {
  const velFields = (() => {
    const v = String(a.Velocity ?? 'velocity');
    const c = compileVel(v, lineNo);
    if (c) return c;
    return { velExpr: v }; // 不可编译 → 运行时按继承 NPC 速度
  })();
  const scaleFields = (() => {
    const v = a.Scale;
    if (v === undefined || v === '' || v === '1f' || v === '1') return {};
    let m;
    if ((m = String(v).match(/^([\d.]+)[fF]?$/))) return { scale: +m[1] };
    return { scaleExpr: String(v) }; // 'scale' = NPC.scale；其余登记原文
  })();
  const posFields = (() => {
    if (a.Position === 'position') return {};
    const c = compilePos(a.Position, lineNo);
    if (c) return c;
    return { posExpr: String(a.Position) }; // 不可编译 → 运行时按左上角
  })();
  const perfect = callee === 'Gore.NewGorePerfect' ? { perfect: true } : {};
  const base = { ...velFields, ...scaleFields, ...posFields, ...perfect };

  // id 表达式仍引用外层循环变量（未展开的场景：循环域 >8 或嵌套过深）→ loop 归 1，
  // 防运行时重复随机取样（展开过的调用此处不再命中）
  if (r.loopN > 1 && [...r.loopMap.keys()].some((v) => new RegExp(`\\b${v}\\b`).test(String(a.Type)))) r.loopN = 1;

  let perType = null;
  let fields = null;

  if (r.types) {
    const target = [...r.types].filter((t) => !r.exclude.has(t));
    const res = resolveIdPerType(String(a.Type), target, lineNo, r.typeCtxId);
    if (res?.fields) fields = res.fields;
    else if (res?.perType) perType = res.perType;
    // 区间/候选尺寸 == 循环次数 = 序列已被区间编码（469-475×7 等）→ loop 归 1
    const span = fields ? (fields.ids ? fields.ids.length : fields.idMin != null ? (fields.idMax - fields.idMin + 1) : 0) : 0;
    if (span > 1 && span === r.loopN) r.loopN = 1;
  }

  if (!r.types) {
    defaultEntries.push({ line: lineNo, idExpr: String(a.Type), gates: r.gates });
    return;
  }
  const target = [...r.types].filter((t) => !r.exclude.has(t));
  const emitted = [];
  /** 逐型门：OR 守卫的 freeTypes 只豁免【同层】的门（`altTexture==0 || type==106`） */
  const gatesFor = (t) => r.gateLayers.flatMap((l) => (l.free?.has(t) ? [] : l.gates));

  if (perType) {
    for (const t of target) {
      emitted.push(emitEntry(t, { ...base, ...perType.get(t) }, lineNo, gatesFor(t), r.ai, r.loopN));
    }
  } else if (fields) {
    for (const t of target) {
      emitted.push(emitEntry(t, { ...base, ...fields }, lineNo, gatesFor(t), r.ai, r.loopN));
    }
  } else {
    for (const t of target) {
      emitted.push(emitEntry(t, { ...base, expr: String(a.Type) }, lineNo, gatesFor(t), r.ai, r.loopN));
    }
    unresolved.push({
      line: lineNo, expr: String(a.Type),
      types: target.length > 6 ? `${target[0]}..${target[target.length - 1]}(${target.length})` : target.join('|'),
    });
  }
  // 后处理定位：`int n = NewGore(...)` / `Gore g = NewGorePerfect(...)`（别名即时绑定）
  if (lhs) {
    goreIdx.set(lhs, emitted);
    goreAlias.set(lhs, lhs);
  }
  activeGoreEntries = emitted;
  void e;
}

// ============ 手工补丁：守卫链为排除式(`type != N` + return)的收尾支 ============
// catch-all else 尾支（NPC.cs:90859-90867）：`if (type != 156) return;` → 仅 Red Devil
// 走到 184/185/185。排除式守卫无法从链上还原出正集（需要整链 else 语义），按源行手工钉死。
const MANUAL_PATCHES = {
  156: [
    { id: 184, line: 90865 },
    { id: 185, line: 90866 },
    { id: 185, line: 90867 },
  ],
};
for (const [npcId, list] of Object.entries(MANUAL_PATCHES)) {
  if (!entries.has(+npcId)) entries.set(+npcId, []);
  entries.get(+npcId).push(...list);
}

// ============ 贴图尺寸表（出现过的 gore id） ============
const idsSeen = new Set();
for (const list of entries.values()) {
  for (const e of list) {
    if (e.id != null) idsSeen.add(e.id);
    if (e.idAlt != null) idsSeen.add(e.idAlt);
    if (e.idMin != null) for (let i = e.idMin; i <= (e.idMax ?? e.idMin); i++) idsSeen.add(i);
    if (e.ids) for (const i of e.ids) idsSeen.add(i);
  }
}
const tex = {};
for (const id of [...idsSeen].sort((a, b) => a - b)) {
  const sz = pngSize(id);
  if (sz) tex[id] = sz;
}

// ============ 落盘 ============
const entryCount = [...entries.values()].reduce((n, l) => n + l.length, 0);
const countField = (pred) => [...entries.values()].reduce((n, l) => n + l.filter(pred).length, 0);
const out = {
  _meta: {
    source: 'Terarria1456/Terraria/NPC.cs HitEffect (:82421-:90873)；物理=Terraria/Gore.cs',
    generatedBy: 'tools/extract-gore.mjs',
    callsTotal,
    callsHitSkipped,
    callsPartySkipped,
    npcIds: entries.size,
    entryCount,
    unresolvedCount: unresolved.length,
    defaultEntryCount: defaultEntries.length,
    gatedEntryCount: countField((e) => (e.gates?.length ?? 0) > 0),
    postEntryCount: countField((e) => (e.post?.length ?? 0) > 0),
    posExprCount: countField((e) => !!e.posExpr),
    velExprCount: countField((e) => !!e.velExpr),
    unresolved,
    unresolvedGates,
    unresolvablePost,
    defaultEntries: defaultEntries.slice(0, 40),
    notes: [
      'life>0 守卫段(hit gore)与派对帽段(UsesPartyHat)已剔除；无 life 守卫的调用原版 hit/death 双段都执行 → 计为死亡 gore',
      'idMin..idMax = 原版 X+Next(N)/Next(A,B) 区间，运行时均匀取值；ids = SelectRandom 候选',
      'idAlt = `IsShimmerVariant ? idAlt : id` 的微光变体 id（运行时按来源 NPC 微光态取）',
      'velocity 缺省=继承 NPC 当前速度；NewGore 附加随机扰动见 Gore.cs:1347-1348（运行时实现）',
      'scaleExpr="scale" = 取 NPC.scale；posExpr 为不可编译的原文（默认 position=左上角）',
      'ai=[{slot,value}] = 原版 ai[N]==V 门（运行时按 NPC ai 槽位判定，不满足跳过该条）',
      'gates = 结构化守卫门（运行时求值，不满足跳过该条）：alt=altTexture / sdir=spriteDirection /',
      '  dmg=HitEffect dmg 实参 / shim=IsShimmerVariant / net=Main.netMode / rnd=Main.rand.Next(N)==V /',
      '  redhat=RedHatSkeletronAdjustmentsEnabled()（NPC.cs:67282）。OR 型守卫 `A || type == N` 中',
      '  N 型免门（freeTypes），其余型带 A 门；`NPCID.Sets.IsTownPet[type]` 静态展开进 npcId 集',
      'perfect=true = Gore.NewGorePerfect：随机扰动后回写精确 pos/vel（运行时不抖动）',
      'loop=N = 原版常量次数 for 循环体内（运行时重复生成 N 次，如 EoC <2 循环 = 8 块）；',
      '  pos/vel 引用循环变量时已按循环域逐值展开（每变体 loop=1）',
      'post = NewGore 之后对同一实例的有序操作（vm=velocity*=K / va=轴+=域 / vs=velocity 覆写 /',
      '  ss/sm=scale 设定/乘域 / al=alpha 设定(npc=来源 alpha) / ro=rotation 设定 / ps=position 覆写）',
      'pos 新字段：ox/oy=常量偏移；fx/fy=[w,h] 分数；rwx/rwy=[a,b] 随机尺寸分数域；jx/jy=[a,b] 像素抖动域；',
      '  dx/dy=×direction 偏移；rot=[{a,s,k}] Unit 轴×系数 再按 NPC rotation 旋转（s="sd" 取',
      '  (spriteDirection!=1?1:-1)）；dc=[rx,ry] 椭圆盘随机偏移（Utils.cs:1269）',
      'vel 新字段：dc=[rx,ry] 椭圆盘速度；de=均匀随机方向定速；rv=[k,flip]=rotation.ToRotationVector2()',
      '  ×k（flip 奇数次=spriteDirection==1 时 X 取反）；hdm=[lo,hi]=随机幅值×击退方向',
      'tex = gore 贴图 {w,h}（IHDR 直读）；缺图 id 运行时回退 32px 碰撞盒（Gore.cs:999）',
    ],
    tex,
  },
};
for (const [k, v] of [...entries.entries()].sort((a, b) => (+a[0]) - (+b[0]))) out[k] = v;

if (process.argv.includes('--audit')) {
  console.log(JSON.stringify({
    npcIds: entries.size, entryCount, callsTotal, callsHitSkipped, callsPartySkipped,
    unresolved: unresolved.length, defaultEntries: defaultEntries.length,
    unresolvedGates: unresolvedGates.length, unresolvablePost: unresolvablePost.length,
    gated: countField((e) => (e.gates?.length ?? 0) > 0), post: countField((e) => (e.post?.length ?? 0) > 0),
    posExpr: countField((e) => !!e.posExpr), velExpr: countField((e) => !!e.velExpr),
    texKnown: Object.keys(tex).length, texMissing: idsSeen.size - Object.keys(tex).length,
    sample: { 1: out[1], 3: out[3], 491: out[491]?.slice(0, 3), 50: out[50] },
  }));
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`vanilla-gore.json: ${entries.size} npcIds, ${entryCount} entries, `
    + `${unresolved.length} unresolved, ${unresolvedGates.length} unresolvedGates, `
    + `${unresolvablePost.length} unresolvablePost, `
    + `posExpr ${countField((e) => !!e.posExpr)}, velExpr ${countField((e) => !!e.velExpr)}, `
    + `gated ${countField((e) => (e.gates?.length ?? 0) > 0)}, post ${countField((e) => (e.post?.length ?? 0) > 0)}, `
    + `tex ${Object.keys(tex).length}/${idsSeen.size}`);
}
