// 1.4.5.6 ItemDropDatabase 结构化规则提取器（tools/extract-npcdrops.mjs）
// 输入 Terarria1456/Terraria.GameContent.ItemDropRules/ItemDropDatabase.cs（616 条注册）
// 输出 src/data/vanilla-npcdrops.json：按注册顺序的条目列表（RuleNode 类型树）
// + src/data/vanilla-npcvalue.json：NPC.value（铜币，击杀掉钱管线用）
//
// RuleNode kinds:
//   common {item,denom,min,max,num?,noLuck?}  rerolls {item,denom,min,max,rerolls,num?}
//   cond {cond,item,denom,min,max,num}        oneOf {denom,num,ids,noLuck?}
//   expert {normal,expert}                    master {def,master}   masterExpert {def,expert,master}
//   bossBag {item,cond?}                      masterCommon {item}   masterAll {item,denom}
//   local {item,denom,min,max,cond?}          perPlayer {item,denom,min,max,cond?}
//   gate {cond, chain}                        nothing
//   oneOfRules {denom,rules}                  noRepeat {count,ids}
//   dropOneByOne {item,params}                slimeBody        mechSpawn
//   statueMimic (未知内容记 unknown)
// chain: [{on:'failedRoll'|'success'|'failedConditions', rule}]
import { readFileSync, writeFileSync } from 'fs';

const DB = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria.GameContent.ItemDropRules/ItemDropDatabase.cs', 'utf8');
const npcCs = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria/NPC.cs', 'utf8');

// ============ 表达式解析（嵌套调用/对象初始化器/new/数字/标识符/链式调用） ============
function parseExpr(src, pos = 0) {
  const node = parsePostfix(src, pos);
  return node;
}
// 解析一个"基本表达式" + 之后的链式 .X(...) 序列
function parsePostfix(src, pos) {
  let base = parseAtom(src, pos);
  for (;;) {
    skipWs(src, base.end);
    if (src[base.end] === '.') {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(base.end + 1));
      if (!m) break;
      const name = m[0];
      let p = base.end + 1 + name.length;
      skipWs(src, p);
      const args = [];
      if (src[p] === '(') {
        const r = parseArgs(src, p);
        args.push(...r.args); p = r.end;
      }
      base = { t: 'call', fn: name, args: args.length ? [base, ...args] : [base], base: true, end: p };
      continue;
    }
    break;
  }
  return base;
}
function skipWs(src, p) { while (p < src.length && /\s/.test(src[p])) p++; return p; }
function parseArgs(src, openParen) {
  // src[openParen] === '('
  let p = openParen + 1;
  const args = [];
  for (;;) {
    p = skipWs(src, p);
    if (src[p] === ')') { p++; break; }
    // 命名参数 hideLootReport: true → 跳过名: 取值
    const named = /^[A-Za-z_][A-Za-z0-9_]*\s*:/.exec(src.slice(p, p + 40));
    if (named) p += named[0].length, p = skipWs(src, p);
    const arg = parsePostfix(src, p);
    args.push(arg);
    p = skipWs(src, arg.end);
    if (src[p] === ',') { p++; continue; }
    if (src[p] === ')') { p++; break; }
    break; // 异常 → 上层兜底
  }
  return { args, end: p };
}
function parseAtom(src, pos) {
  let p = skipWs(src, pos);
  if (src[p] === '(') {
    const r = parseArgs(src, p);
    return { t: 'paren', inner: r.args[0], end: r.end };
  }
  // 字符串字面量（NamedNPC("GuideNames.Andrew") 的具名键）
  if (src[p] === '"') {
    let q = p + 1, out = '';
    while (q < src.length && src[q] !== '"') { if (src[q] === '\\') { out += src[q]; q++; } out += src[q]; q++; }
    return { t: 'str', v: out, end: q + 1 };
  }
  // 直接函数调用（含限定名 A.B.C(args)）：点号段并入名字，'(' 跟随 → call
  const idm = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(p));
  if (idm) {
    const name = idm[0];
    const lastSeg = name.slice(name.lastIndexOf('.') + 1);
    const after = skipWs(src, p + name.length);
    if (src[after] === '(' && !CHAIN_FN[lastSeg]) {
      const r = parseArgs(src, after);
      return { t: 'call', fn: name, args: r.args, end: r.end };
    }
    // 链式调用语句头（rule.OnSuccess(...)）：idm 贪婪吃掉了 '.OnSuccess' 段，
    // 截断到点号前只返回主体名，让 parsePostfix 的 '.' 循环建出 call(base) 结构
    // ——否则返回 {t:'id', name:'rule.OnSuccess'}，外层 expr.t!=='call' 链体整体丢失
    if (src[after] === '(' && CHAIN_FN[lastSeg] && name.includes('.')) {
      const cut = name.lastIndexOf('.');
      return { t: 'id', name: name.slice(0, cut), end: p + cut };
    }
  }
  if (src[p] === 'n' && src.startsWith('new ', p)) {
    p = skipWs(src, p + 4);
    const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(p));
    const cls = m[0]; p += cls.length;
    p = skipWs(src, p);
    // 泛型参数 <T,…>（List<IItemDropRule>）：成对消耗到 '>'
    if (src[p] === '<') {
      let depth = 0;
      while (p < src.length) { if (src[p] === '<') depth++; else if (src[p] === '>') { depth--; p++; if (!depth) break; } p++; }
      p = skipWs(src, p);
    }
    let args = [], init = null;
    if (src[p] === '(') { const r = parseArgs(src, p); args = r.args; p = r.end; p = skipWs(src, p); }
    // 数组尺寸 [N]（int[3] {…}）—先消耗再找 {
    const sizeM = /^\[\d*\]/.exec(src.slice(p));
    if (sizeM) p += sizeM[0].length, p = skipWs(src, p);
    if (src[p] === '{') { // 数组 { a, b, c }
      p++;
      const items = [];
      for (;;) {
        p = skipWs(src, p);
        if (src[p] === '}') { p++; break; }
        const it = parsePostfix(src, p);
        items.push(it);
        p = skipWs(src, it.end);
        if (src[p] === ',') { p++; continue; }
        if (src[p] === '}') { p++; break; }
        break;
      }
      return { t: 'newarr', cls, items, end: p };
    }
    if (src[p] === '{') { // 对象初始化器 { Prop = N, ... }
      p++;
      const props = {};
      for (;;) {
        p = skipWs(src, p);
        if (src[p] === '}') { p++; break; }
        const pm = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(p));
        const prop = pm[0]; p += prop.length;
        p = skipWs(src, p);
        if (src[p] === '=') { p++; p = skipWs(src, p); }
        const v = parsePostfix(src, p);
        props[prop] = v;
        p = skipWs(src, v.end);
        if (src[p] === ',') { p++; continue; }
        if (src[p] === '}') { p++; break; }
        break;
      }
      return { t: 'newinit', cls, args, props, end: p };
    }
    return { t: 'new', cls, args, end: p };
  }
  const num = /^-?\d+(?:\.\d+)?f?/.exec(src.slice(p));
  if (num) return { t: 'num', v: parseFloat(num[0]), end: p + num[0].length };
  const cast = /^\(int\)/.exec(src.slice(p));
  if (cast) { p += cast[0].length; p = skipWs(src, p); }
  const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(p));
  if (id) return { t: 'id', name: id[0], end: p + id[0].length };
  return { t: 'bad', end: p + 1 };
}

// ============ AST → 类型化 RuleNode ============
const CHAIN_FN = { OnFailedRoll: 'failedRoll', OnSuccess: 'success', OnFailedConditions: 'failedConditions' };
const stats = { unknown: [], kinds: {}, conds: {} };

// 条件实参：数字取值；字符串去 "GuideNames." 式语言键前缀取本地化值本身
// （NamedNPC 的 neededName 与 npc.GivenName 比对，lang 值即 Andrew/Whitney/Jim）
function condArg(n) {
  if (n?.t === 'num') return n.v;
  if (n?.t === 'str') return n.v.replace(/^[A-Za-z]+Names\./, '');
  return undefined;
}
function condOf(n) {
  // 条件节点 → {name, args}
  if (!n) return null;
  if (n.t === 'new') {
    const name = n.cls.replace('Conditions.', '');
    stats.conds[name] = (stats.conds[name] ?? 0) + 1;
    return { name, args: n.args.map(condArg) };
  }
  if (n.t === 'id') {
    // 条件变量（Conditions.NotExpert condition = new …）：查声明表
    const v = rules.get(n.name);
    if (v && v.k === '__cond') return v.cond;
    return { name: n.name, args: [] };
  }
  return null;
}
function lit(n) {
  if (n?.t === 'num') return n.v;
  // 局部 int 变量（chanceDenominator = 9 之类作规则参数）：查声明表
  if (n?.t === 'id' && ints.has(n.name)) return ints.get(n.name);
  return undefined;
}
function commonArgs(a, defaults = [1, 1, 1]) {
  // lit 兼顾数字字面量与局部 int 变量（chanceDenominator = 9）
  const v = (i, d) => { const x = a[i]; const l = x ? lit(x) : undefined; return l !== undefined ? l : d; };
  return [v(0, defaults[0]), v(1, defaults[1]), v(2, defaults[2])];
}

function toRule(n) {
  if (!n) return { k: 'unknown', raw: String(n).slice(0, 80) };
  if (n.t === 'call' && !n.base) return callRule(n);
  if (n.t === 'call' && n.base) {
    // 链式：主体规则 + .OnXxx(...)（多级链宿主逐级传递，见 applyChainLinks）
    const base = toRule(n.args[0]);
    applyChainLinks(base, n, false);
    return base;
  }
  if (n.t === 'new') return newRule(n);
  if (n.t === 'newarr') return { k: 'listRef', rules: n.items.map(toRule) };  // List<IItemDropRule>{…}
  if (n.t === 'id') return { k: 'varRef', name: n.name };
  if (n.t === 'paren') return toRule(n.inner);
  stats.unknown.push(render(n));
  return { k: 'unknown', raw: render(n) };
}
// 链式调用是嵌套的：postfix 把 a.OnX(b) 解析成 call(fn='OnX', args=[postfix(a), b])
// 宿主语义（Chains.cs:93-110）：host.OnX(A) 把链挂到 host 并【返回 A】——
// host.OnSuccess(A).OnFailedRoll(B) = host.chain[success A] + A.chain[failedRoll B]，
// 不是平铺挂 host（平铺会让 B 错误地以 host 的状态门控）
function applyChainLinks(host, n, resolve = false) {
  if (n.t !== 'call' || !n.base) return host;
  const inner = applyChainLinks(host, n.args[0], resolve);   // 更内层（更早）的链先挂
  let linked = n.args[1] ? toRule(n.args[1]) : null;
  if (resolve && linked) linked = linked.k === 'varRef'
    ? (rules.get(linked.name) ?? { k: 'unknown', raw: `var:${linked.name}` })  // 原实例直挂（语句级，emit 已过）
    : resolveRule(linked);
  if (linked) {
    inner.chain = inner.chain ?? [];
    inner.chain.push({ on: CHAIN_FN[n.fn] ?? 'success', rule: linked });
  }
  return linked;   // 下一层链宿主 = 本层 rule
}
function render(n) {
  if (!n) return '?';
  if (n.t === 'num') return String(n.v);
  if (n.t === 'id') return n.name;
  if (n.t === 'new') return `new ${n.cls}(${n.args.map(render).join(',')})`;
  if (n.t === 'newinit') return `new ${n.cls}{...}`;
  if (n.t === 'newarr') return `new []{${n.items.map(render).join(',')}}`;
  if (n.t === 'call') return n.base ? `${render(n.args[0])}.${n.fn}(${n.args.slice(1).map(render).join(',')})` : `${n.fn}(${n.args.map(render).join(',')})`;
  if (n.t === 'paren') return `(${render(n.inner)})`;
  return '?';
}

function callRule(n) {
  const a = n.args;
  const fn = n.fn.includes('.') ? n.fn.slice(n.fn.lastIndexOf('.') + 1) : n.fn;  // ItemDropRule.Common → Common
  switch (fn) {
    case 'Common': { const [d, mn, mx] = commonArgs(a.slice(1)); return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx }; }
    case 'NotScalingWithLuck': case 'ScalingWithOnlyBadLuck': {
      const [d, mn, mx] = commonArgs(a.slice(1));
      return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, noLuck: fn === 'NotScalingWithLuck' };
    }
    case 'WithRerolls': { // (item, rerolls, denom=1, min=1, max=1)
      const [d, mn, mx] = commonArgs(a.slice(2));
      return { k: 'rerolls', item: lit(a[0]), denom: d, min: mn, max: mx, rerolls: lit(a[1]) ?? 0 };
    }
    case 'ByCondition': { // (cond, item, denom=1,min=1,max=1,num=1)
      const [d, mn, mx] = commonArgs(a.slice(2));
      return { k: 'cond', cond: condOf(a[0]), item: lit(a[1]), denom: d, min: mn, max: mx, num: lit(a[4]) ?? 1 };
    }
    case 'Food': { // (item, denom, min=1,max=1) 条件 NotFromStatue（我们恒真）
      const [mn, mx] = commonArgs(a.slice(2));
      return { k: 'cond', cond: { name: 'NotFromStatue', args: [] }, item: lit(a[0]), denom: lit(a[1]) ?? 1, min: mn, max: mx, num: 1 };
    }
    case 'OneFromOptions': case 'OneFromOptionsWithNumerator':
    case 'OneFromOptionsNotScalingWithLuck': case 'OneFromOptionsNotScalingWithLuckWithX': {
      const num = fn.includes('WithNumerator') || fn.endsWith('WithX') ? lit(a[1]) ?? 1 : 1;
      const idsFrom = fn.includes('WithNumerator') || fn.endsWith('WithX') ? 2 : 1;
      return { k: 'oneOf', denom: lit(a[0]) ?? 1, num, ids: a.slice(idsFrom).map(lit).filter(v => v !== undefined), noLuck: fn.includes('NotScaling') };
    }
    case 'ExpertGetsRerolls': // (item, denom, expertRerolls)
      return { k: 'expert', normal: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: 0 }, expert: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: lit(a[2]) ?? 0 } };
    case 'NormalvsExpert': case 'NormalvsExpertNotScalingWithLuck':
      return { k: 'expert', normal: { k: 'common', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, noLuck: fn.includes('Not') }, expert: { k: 'common', item: lit(a[0]), denom: lit(a[2]), min: 1, max: 1, noLuck: fn.includes('Not') } };
    case 'NormalvsExpertOneFromOptions': case 'NormalvsExpertOneFromOptionsNotScalingWithLuck': {
      const ids = a.slice(3).map(lit).filter(v => v !== undefined);
      return { k: 'expert',
        normal: { k: 'oneOf', denom: lit(a[1]), num: 1, ids, noLuck: fn.includes('NotScaling') },
        expert: { k: 'oneOf', denom: lit(a[2]), num: 1, ids, noLuck: fn.includes('NotScaling') } };
    }
    case 'BossBag': return { k: 'bossBag', item: lit(a[0]) };
    case 'BossBagByCondition': return { k: 'bossBag', item: lit(a[1]), cond: condOf(a[0]) };
    case 'MasterModeCommonDrop': return { k: 'masterCommon', item: lit(a[0]) };
    case 'MasterModeDropOnAllPlayers': return { k: 'masterAll', item: lit(a[0]), denom: lit(a[1]) ?? 1 };
    case 'DropNothing': return { k: 'nothing' };
    case 'Gel': { // (denom=1,min=1,max=1) 物品恒 23
      const [d, mn, mx] = commonArgs(a);
      return { k: 'common', item: 23, denom: d, min: mn, max: mx, gel: true };
    }
    case 'StatusImmunityItem': // = ExpertGetsRerolls(item, x, 1)
      return { k: 'expert', normal: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: 0 }, expert: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: 1 } };
    default:
      stats.unknown.push(`call:${fn}`);
      return { k: 'unknown', raw: render(n) };
  }
}
function newRule(n) {
  const a = n.args;
  switch (n.cls) {
    case 'LeadingConditionRule':
      return { k: 'gate', cond: condOf(a[0]) };
    case 'CommonDrop': { // (item, denom, min=1, max=1, num=1)
      const [d, mn, mx] = commonArgs(a.slice(1));
      return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, num: lit(a[4]) ?? 1 };
    }
    case 'CommonDropNotScalingWithLuck': case 'CommonDropScalingWithOnlyBadLuck': {
      const [d, mn, mx] = commonArgs(a.slice(1));
      return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, noLuck: true };
    }
    case 'CommonDropWithRerolls': { // (item, denom, min, max, rerolls)
      const [mn, mx] = commonArgs(a.slice(2));
      return { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: mn, max: mx, rerolls: lit(a[4]) ?? 0 };
    }
    case 'ItemDropWithConditionRule': { // (item, denom, min, max, cond, num=1)
      const [mn, mx] = commonArgs(a.slice(2));
      return { k: 'cond', cond: condOf(a[4]), item: lit(a[0]), denom: lit(a[1]), min: mn, max: mx, num: lit(a[5]) ?? 1 };
    }
    case 'OneFromOptionsDropRule': case 'OneFromOptionsNotScaledWithLuckDropRule':
      return { k: 'oneOf', denom: lit(a[0]), num: lit(a[1]) ?? 1, ids: a.slice(2).map(lit).filter(v => v !== undefined), noLuck: n.cls.includes('Not') };
    case 'DropBasedOnExpertMode': return { k: 'expert', normal: toRule(a[0]), expert: toRule(a[1]) };
    case 'DropBasedOnMasterMode': return { k: 'master', def: toRule(a[0]), master: toRule(a[1]) };
    case 'DropBasedOnMasterAndExpertMode': return { k: 'masterExpert', def: toRule(a[0]), expert: toRule(a[1]), master: toRule(a[2]) };
    case 'DropNothing': return { k: 'nothing' };
    case 'DropLocalPerClientAndResetsNPCMoneyTo0':
      return { k: 'local', item: lit(a[0]), denom: lit(a[1]) ?? 1, min: lit(a[2]) ?? 1, max: lit(a[3]) ?? 1, cond: condOf(a[4]) };
    case 'DropPerPlayerOnThePlayer':
      return { k: 'perPlayer', item: lit(a[0]), denom: lit(a[1]) ?? 1, min: lit(a[2]) ?? 1, max: lit(a[3]) ?? 1, cond: condOf(a[4]) };
    case 'OneFromRulesRule': return { k: 'oneOfRules', denom: lit(a[0]) ?? 1, rules: a.slice(1).map(toRule) };
    case 'FromOptionsWithoutRepeatsDropRule': return { k: 'noRepeat', count: lit(a[0]) ?? 1, ids: a.slice(1).map(lit).filter(v => v !== undefined) };
    case 'DropOneByOne': return { k: 'dropOneByOne', item: lit(a[0]), params: a[1] };
    case 'SlimeBodyItemDropRule': return { k: 'slimeBody' };
    case 'MechBossSpawnersDropRule': return { k: 'mechSpawn' };
    case 'StatueMimicItemDropRule': return { k: 'statueMimic' };
    default:
      stats.unknown.push(`new:${n.cls}`);
      return { k: 'unknown', raw: render(n) };
  }
}

// ============ 语句级处理（变量跟踪 + 注册调用） ============
const entries = [];   // {npcs:[], rule, global?:true}
const rules = new Map();    // 局部规则变量
const ints = new Map();     // 局部 int 变量
const arrays = new Map();   // int[] 变量
const paramss = new Map();  // DropOneByOne.Parameters 变量
let methodLine = -1;        // 方法边界（进入新 private void 清空局部变量）

// DropOneByOne 参数结构体语义（值拷贝）：对象 + 变更即克隆
function paramsObj(n) {
  // n: newinit DropOneByOne.Parameters {props} 或 varRef
  const base = { ChanceNumerator: 1, ChanceDenominator: 1, MinimumItemDropsCount: 1, MaximumItemDropsCount: 1, MinimumStackPerChunkBase: 1, MaximumStackPerChunkBase: 1, BonusMinDropsPerChunkPerPlayer: 0, BonusMaxDropsPerChunkPerPlayer: 0 };
  const fill = (node) => {
    if (!node) return;
    if (node.t === 'newinit') for (const [p, v] of Object.entries(node.props ?? {})) base[p] = lit(v) ?? base[p];
    if (node.t === 'paren') fill(node.inner);
  };
  fill(n);
  return base;
}
function resolveRule(node) {
  // varRef 解引用 + 参数对象实化
  const walk = (r) => {
    if (!r || typeof r !== 'object') return r;
    if (r.k === 'varRef') return walk(rules.get(r.name) ?? { k: 'unknown', raw: `var:${r.name}` });
    for (const key of Object.keys(r)) {
      if (key === 'chain') { r[key] = r[key].map(c => ({ ...c, rule: walk(c.rule) })); continue; }
      const v = r[key];
      if (v && typeof v === 'object' && !Array.isArray(v) && v.k) r[key] = walk({ ...v });
      else if (Array.isArray(v)) r[key] = v.map(x => (x && typeof x === 'object' && x.k ? walk({ ...x }) : x));
    }
    return r;
  };
  const out = walk({ ...node });
  // 参数对象实化（dropOneByOne.params / oneOfRules 内不含）
  if (out.k === 'dropOneByOne') {
    const pn = out.params;
    out.params = pn?.t === 'id' ? (paramss.get(pn.name) ?? null)
      : pn?.t === 'paren' ? paramsObj(pn.inner) : paramsObj(pn);
  }
  return out;
}
function emit(npcs, ruleNode, global = false) {
  const rule = resolveRule(ruleNode);
  if (rule?.k) stats.kinds[rule.k] = (stats.kinds[rule.k] ?? 0) + 1;
  entries.push(global ? { global: true, rule } : { npcs, rule });
  return rule;  // 返回 resolve 后的实例：语句级挂链（emit 之后的 var.OnXxx）必须改这份
}
/** 注册语句尾部的 .OnXxx(...) 链挂到规则上——宿主逐级传递（同 applyChainLinks 语义） */
function attachChains(rule, layers) {
  let host = rule;
  for (const layer of layers) {
    if (!host || host.k === 'unknown') return;
    const linked = toRule(layer.args[1]);
    host.chain = host.chain ?? [];
    host.chain.push({ on: CHAIN_FN[layer.fn] ?? 'success', rule: linked });
    host = linked;
  }
}
/** 剥掉 .OnXxx 链得到最内层调用（不转译） */
function stripChains(expr) {
  let n = expr;
  while (n.t === 'call' && n.base) n = n.args[0];
  return n;
}
/** 条件变量引用（条件声明语句的 RHS 是 new Conditions.X()） */
function condOfVar(n) {
  if (n?.t === 'new') return { name: n.cls.replace('Conditions.', ''), args: [] };
  return null;
}
// 已 emit 条目的活动引用（rule = RegisterTo... 时记录，供后续 rule.OnSuccess 挂链）
const emittedRefs = new Map();

/**
 * 统一注册处理。expr = 完整 postfix（可含链），rootCall = 剥链后的注册调用，
 * refVar = 可选的变量名（IItemDropRule rule = RegisterTo...(…) 时记录活动引用，
 * 之后的 rule.OnSuccess(...) 语句直接挂到已 emit 的规则上）
 */
/**
 * 注册 arg 是规则变量（RegisterToNPC(type, leadingConditionRule).OnSuccess(...)）时，
 * attachChains 必须挂到变量背后的真实规则对象——resolveRule 对 varRef 返回 rules 里
 * 的【同一实例】，故挂它即可见；挂 varRef 包装器会被 resolve 丢弃（女皇 636 两链全丢的根因）
 */
function chainHost(r) {
  return r && r.k === 'varRef' && rules.has(r.name) ? rules.get(r.name) : r;
}
function handleRegistration(s, expr, rootCall, refVar) {
  const reg = rootCall.fn;
  const a = rootCall.args;
  // 链（expr 与 rootCall 之间的层，AST 节点按出现顺序）
  const layers = [];
  if (expr !== rootCall) {
    let n = expr;
    while (n !== rootCall) { layers.unshift(n); n = n.args[0]; }
  }
  if (reg === 'RegisterToGlobal') {
    const r = toRule(a[0]);
    if (layers.length) attachChains(chainHost(r), layers);
    const resolved = emit([], r, true);
    if (refVar) { emittedRefs.set(refVar, { rule: resolved, entry: null }); rules.set(refVar, resolved); }
    return;
  }
  if (reg === 'RegisterToNPC') {
    let id = null;
    if (a[0].t === 'num') id = [a[0].v];
    else if (a[0].t === 'id' && ints.has(a[0].name)) id = [ints.get(a[0].name)];
    if (id == null) return;  // npcNetIds[i] 变体拷贝辅助
    const r = toRule(a[1]);
    if (layers.length) attachChains(chainHost(r), layers);
    const resolved = emit(id, r);
    if (refVar) { emittedRefs.set(refVar, { rule: resolved, entry: entries[entries.length - 1] }); rules.set(refVar, resolved); }
    return;
  }
  // Multiple 系
  const rule = toRule(a[0]);
  if (layers.length) attachChains(chainHost(rule), layers);
  const ids = [];
  for (const arg of a.slice(1)) {
    if (arg.t === 'num') ids.push(arg.v);
    else if (arg.t === 'id' && arrays.has(arg.name)) ids.push(...arrays.get(arg.name));
    else if (arg.t === 'newarr') ids.push(...arg.items.map(x => lit(x)).filter(v => v !== undefined));
  }
  if (ids.length) {
    const resolved = emit(ids, rule);
    if (refVar) { emittedRefs.set(refVar, { rule: resolved, entry: entries[entries.length - 1] }); rules.set(refVar, resolved); }
  }
  else stats.unknown.push(`regids:${render(a[0])}`);
}

// 按行扫描 + 语句累积（多行语句拼到分号）
let buf = '';
const flushStmt = (stmt) => {
  const s = stmt.trim();
  if (!s) return;
  // 方法边界
  const mm = /^\s*private void ([A-Za-z0-9_]+)\(\)/.exec(stmt);
  if (mm) { rules.clear(); ints.clear(); arrays.clear(); paramss.clear(); emittedRefs.clear(); return; }
  try {
    // 数组声明
    let m = /^(?:\w+\[\]|\w+)\s+(\w+)\s*=\s*new\s+\w+\[\d*\]\s*\{/.exec(s) ;
    if (m) {
      const ni = s.indexOf('new');   // 从 'new int[3] {…}' 的 new 起解析（从 '{' 起会得 bad 节点 → 空数组）
      const expr = parseExpr(s, ni >= 0 ? ni : s.indexOf('{'));
      if (expr.t === 'newarr') arrays.set(m[1], expr.items.map(x => lit(x)).filter(v => v !== undefined));
      return;
    }
    // int/short 声明（Boss helper 的 short type = 127 等）
    m = /^(?:int|short|long)\s+(\w+)\s*=\s*(-?\d+)/.exec(s);
    if (m) { ints.set(m[1], parseInt(m[2], 10)); return; }
    // Parameters 声明
    m = /^DropOneByOne\.Parameters\s+(\w+)\s*=/.exec(s);
    if (m) {
      const expr = parseExpr(s, s.indexOf('=') + 1);
      paramss.set(m[1], paramsObj(expr));
      return;
    }
    // Parameters 拷贝+变更：p2 = p; p2.Prop = N;
    m = /^DropOneByOne\.Parameters\s+(\w+)\s*=\s*(\w+)\s*;/.exec(s);
    if (m) { const src = paramss.get(m[2]); if (src) paramss.set(m[1], { ...src }); return; }
    m = /^(\w+)\.(ChanceNumerator|ChanceDenominator|MinimumItemDropsCount|MaximumItemDropsCount|MinimumStackPerChunkBase|MaximumStackPerChunkBase|BonusMinDropsPerChunkPerPlayer|BonusMaxDropsPerChunkPerPlayer)\s*=\s*(?:\(int\))?\s*([\d.]+)/.exec(s);
    if (m && paramss.has(m[1])) { const o = { ...paramss.get(m[1]) }; o[m[2]] = Math.round(parseFloat(m[3])); paramss.set(m[1], o); return; }
    // 规则/条件变量声明
    m = /^(?:IItemDropRule|IItemDropRuleCondition|LeadingConditionRule|List<IItemDropRule>|Conditions\.[A-Za-z_][A-Za-z0-9_]*)\s+(\w+)\s*=/.exec(s);
    if (m) {
      const rhs = s.slice(s.indexOf('=') + 1).replace(/;$/, '');
      const isCond = s.startsWith('IItemDropRuleCondition') || s.startsWith('Conditions.');
      const expr = parseExpr(rhs, 0);
      if (isCond) rules.set(m[1], { k: '__cond', cond: condOf(expr) ?? condOfVar(expr) });
      else {
        // RHS 是变量挂链（:202 rule2 = rule.OnSuccess(gate2)；:1192 rule = gate.OnSuccess(oneOf)）：
        // Chains 语义——host.chain 挂入被挂规则并【返回被挂规则】，故变量值 = 最后一层链的规则，
        // 后续 var.OnXxx(...) 挂到它身上（同一实例，宿主链数组内可见）。走通用 toRule 只会
        // 把链挂到 varRef 包装器上，从未 emit → 整条丢失
        if (expr.t === 'call' && expr.base && expr.args[0].t === 'id'
          && (rules.has(expr.args[0].name) || emittedRefs.has(expr.args[0].name))) {
          const ref0 = emittedRefs.get(expr.args[0].name);
          const host0 = ref0 ? ref0.rule : rules.get(expr.args[0].name);
          const last = applyChainLinks(host0, expr, true);
          if (last && last.k) rules.set(m[1], last);
          return;
        }
        // RHS 是注册调用（EoW 模式：rule = RegisterToMultipleNPCs(gate, ids)）：emit + 记活动引用
        const rootCall = stripChains(expr);
        if (rootCall.t === 'call' && rootCall.fn.startsWith('RegisterTo')) {
          handleRegistration(s, expr, rootCall, m[1]);
        } else {
          rules.set(m[1], toRule(expr));
        }
      }
      return;
    }
    // 变量上挂链 / Add：rule.OnSuccess(...) / rule2.OnFailedRoll(...)；
    // 变量可能是规则变量（rules）或已 emit 条目引用（emittedRefs，EoW 模式）
    m = /^(\w+)\.(OnSuccess|OnFailedRoll|OnFailedConditions)\(/.exec(s);
    if (m && (rules.has(m[1]) || emittedRefs.has(m[1]))) {
      const expr = parseExpr(s, s.indexOf(m[0]));
      // postfix 结构：call(fn=OnX, args=[varRef, rule])，可再套 .OnY(...)（如
      // .OnSuccess(Common(1871,15)).OnFailedRoll(OneFromOptions(...))）→ collectChain 收全部层
      if (expr.t === 'call' && expr.base) {
        const ref = emittedRefs.get(m[1]);
        const host = ref ? ref.rule : rules.get(m[1]);
        // 语句级挂链发生在 emit 之后（resolveRule 已跑过）→ resolve=true 补 varRef 解引用
        applyChainLinks(host, expr, true);
      }
      return;
    }
    // RemoveFromMultipleNPCs(entry, ids)：把 ids 从已 emit 条目的 npc 列表移除
    m = /^RemoveFromMultipleNPCs\((\w+),\s*(\w+)\)/.exec(s);
    if (m && emittedRefs.has(m[1])) {
      const ids = arrays.get(m[2]) ?? [];
      const entry = emittedRefs.get(m[1]).entry;
      if (entry) entry.npcs = entry.npcs.filter((n) => !ids.includes(n));
      return;
    }
    // 注册调用（含链式 .OnSuccess(...) 尾巴）：剥链到最内层注册调用
    for (const reg of ['RegisterToMultipleNPCsNotRemixSeed', 'RegisterToMultipleNPCsRemixSeed', 'RegisterToMultipleNPCs', 'RegisterToGlobal', 'RegisterToNPC']) {
      const idx = s.indexOf(reg + '(');
      if (idx !== 0 && !(idx > 0 && /\w/.test(s[idx - 1]) === false && idx <= 2)) continue;
      if (idx < 0) continue;
      const expr = parseExpr(s, idx);
      if (expr.t !== 'call') continue;
      const node = stripChains(expr);
      if (node.t !== 'call' || node.fn !== reg) continue;
      handleRegistration(s, expr, node, null);
      return;
    }
  } catch (e) {
    stats.unknown.push(`EXC:${s.slice(0, 70)} (${e.message})`);
  }
};

for (const line of DB.split('\n')) {
  const t = line.trim();
  if (/^(private void|public void) /.test(t)) flushStmt(t);
  // 类/方法体花括号行：语句边界。但多行数组初始化器 `int[] x = new int[18]` 后跟 `{`
  // 行不是边界——buf 尾是类型声明而非完整语句时继续累积
  if (t === '{' && /[)}]\s*$|^\s*$/.test(buf)) { flushStmt(buf); buf = ''; continue; }
  if (t === '}') { flushStmt(buf); buf = ''; continue; }
  buf += (buf ? '\n' : '') + line;
  // 对象初始化器语句未闭合时不 flush
  const opens = (buf.match(/{/g) ?? []).length, closes = (buf.match(/}/g) ?? []).length;
  if (t.endsWith(';') && opens === closes) { flushStmt(buf); buf = ''; }
}
flushStmt(buf);

// ============ NPC.value 提取（1456 NPC.cs SetDefaults :8361 起的 else-if 链首个 value = N） ============
const values = {};
{
  // SetDefaults 方法体（8361 起 → 下一个 public/private 方法前），链式 else if (type == N)
  const start = npcCs.indexOf('public void SetDefaults(int Type');
  const body = npcCs.slice(start);
  const re = /\b(?:else )?if \(type == (\d+)\)/g;
  const marks = [];
  let m;
  while ((m = re.exec(body))) marks.push({ id: Number(m[1]), at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : marks[i].at + 4000;
    const seg = body.slice(marks[i].at, end);
    const v = seg.match(/value = (\d+(?:\.\d+)?)f?;/);  // 25f / 5000f 浮点字面量
    if (v) values[marks[i].id] = Math.round(parseFloat(v[1]));
  }
  // SetDefaultsFromNetId 负 id 变体（case -N: 块内的 value = Xf;——史莱姆变体专属值，
  // -1=100/-3=3/-4=10000/-5=10/-6=20…变体掉钱走这张表而非 type 表）。
  // 该方法在文件里位于 SetDefaults(:8361) 之前 → 扫全文
  const re2 = /case (-\d+):/g;
  const marks2 = [];
  while ((m = re2.exec(npcCs))) marks2.push({ id: Number(m[1]), at: m.index });
  for (let i = 0; i < marks2.length; i++) {
    const end = i + 1 < marks2.length ? marks2[i + 1].at : marks2[i].at + 800;
    const seg = npcCs.slice(marks2[i].at, end);
    const v = seg.match(/value = (\d+(?:\.\d+)?)f?;/);
    if (v && values[marks2[i].id] === undefined) values[marks2[i].id] = Math.round(parseFloat(v[1]));
  }
}

// ============ SlimeBody 数量表 ============
const slimeBody = {};
{
  const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria.GameContent.ItemDropRules/SlimeBodyItemDropRule.cs', 'utf8');
  // switch 在 CanDrop 之后（本文件方法序）：从 switch 起切到文件尾
  const body = src.slice(src.indexOf('switch (itemId)'));
  const caseRe = /case (\d+):/g;
  const marks = [];
  let m;
  while ((m = caseRe.exec(body))) marks.push({ id: Number(m[1]), at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : body.length;
    const seg = body.slice(marks[i].at, end);
    const mn = seg.match(/amountDroppedMinimum = (\d+);/);
    const mx = seg.match(/amountDroppedMaximum = (\d+);/);
    if (mn && mx) slimeBody[marks[i].id] = [Number(mn[1]), Number(mx[1])];
  }
}

writeFileSync('src/data/vanilla-npcdrops.json', JSON.stringify({ entries, slimeBody }));
writeFileSync('src/data/vanilla-npcvalue.json', JSON.stringify(values));

const npcCount = new Set(entries.filter(e => !e.global).flatMap(e => e.npcs)).size;
console.log('entries:', entries.length, '| global:', entries.filter(e => e.global).length,
  '| npcs covered:', npcCount, '| kinds:', JSON.stringify(stats.kinds));
console.log('unknown:', stats.unknown.length, stats.unknown.slice(0, 12));
console.log('npc values:', Object.keys(values).length, '| slimeBody items:', Object.keys(slimeBody).length);
console.log('conds:', JSON.stringify(stats.conds));
