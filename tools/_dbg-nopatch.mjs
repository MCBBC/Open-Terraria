// 从 Terarria1458 Item.cs SetDefaults1-5 逐物品提取【功能画像】→ vanilla-itemfunc.json。
// ★2026-08-25 用户令"以 1458 作为最新基准"：源 1456→1458（1458 SetDefaults 数值面
// 零变更——旧件终值应零 diff,新增件=6150-6185 块等 1458 新物品,此前整块漏提）。
// 用途：道具功能全量审计的"原版应有功能"基准（tools/item-audit.mjs 对照）。
// 提取字段（仅记非默认值）：
//   近战/远程/魔法/召唤旗、noMelee、damage、mana（耗魔）
//   工具：pick/axe/hammer（>0 即工具）
//   放置：createTile/createWall/placeStyle
//   消耗：consumable、potion、healLife/healMana、buffType（+buffTime 近似）
//   弹药：ammo/useAmmo/notAmmo、shoot、channel、autoReuse、holdStyle、torch
//   改向：useTurn（=1；全量归档自 extract-itemcombat.mjs 提取库，2026-08-17）
// 注意 case 归属 = 最近一层 switch(type)（嵌套 switch 陷阱同 extract-equip-prefix.mjs）。
// 2026-08-17 useTurn 叠加：全量归档来自 extract-itemcombat.mjs 三通道提取库（显式字面
// + DefaultTo* 辅助函数族 + 区间 if 块；Item.cs:170 默认 false——表内仅记 true=1）。
// 2026-08-25 DefaultTo 武器族展开（1458 Item.cs）：MagicWeapon/RangedWeapon/Bow/
//   Staff/Spear/ThrownWeapon——此前只认显式赋值,这些辅助函数族的 case（整块 615x）
//   全部漏提 → heldUseStyle 回退 useStyle 1（冰川之牙斜挥穿胸,用户实报）。
// 2026-09-03 ★PS-STRUCT placeStyle 条件感知结构层（F1 工具自愈,蓝队定谳）：
//   v1 collectCaseSegments 对「多支共享 case 段（fallthrough 组）」只有【组末支】拿到
//   body 段——①嵌套 switch(type) 组：末支段卷进整个内层 switch → 字段首匹配吃到
//   组锚值（花岗岩 11/大理石 8 家具 + 2642 黑曜石灯 + 3868 奖杯 = 伪值）;②if/else
//   覆写组：非末支段=空白 → 整组缺档（2641/3866/3867）。运行时已由 items.ts
//   SHARED_GROUP_PLACE_STYLE_1457（24 行）无条件纠偏,本批让工具自愈：
//   structuralPlaceStyles() 重建 C# 执行序（fallthrough 组共享 body + 嵌套 switch 孔剥
//   + per-id 归并 + if(type==N)/else 条件感知）,只解 placeStyle 一个字段——其余字段
//   仍走 v1 文本段首匹配（重提会引入超预期 diff,落盘闸门=placeStyle 之外零 diff）。
//   修正面：已有条目伪值覆写 + 无条目最小新增 {placeStyle}（其余字段仍由 items.ts
//   vanilla.json 回填链承载;placeStyle=0 的补齐项经回填门 `!== 0` 为运行时无操作）。
import { readFileSync, writeFileSync } from 'node:fs';
import { EXTRA_USETURN } from './extract-itemcombat.mjs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const OUT = process.env.ITEMFUNC_OUT ?? `${ROOT}/game/src/data/vanilla-itemfunc.json`;
const itemSrc = readFileSync(`${ROOT}/Terarria1458/Terraria/Item.cs`, 'utf8');

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

/** case 段 → itemId: segment（最近一层 switch(type) 归属，嵌套 switch(type) 的内层标签才是物品 id） */
function collectCaseSegments(body, out) {
  const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
  const stack = [];
  let depth = 0, m;
  while ((m = tokRe.exec(body))) {
    const t = m[0];
    if (t.startsWith('switch')) {
      stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, cur: null, segStart: 0 });
    } else if (t === '{') {
      depth++;
      const top = stack[stack.length - 1];
      if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
    } else if (t === '}') {
      const top = stack[stack.length - 1];
      if (top && top.opened && depth === top.bodyDepth) {
        if (top.isType && top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        stack.pop();
      }
      depth--;
    } else {
      const top = stack[stack.length - 1];
      if (top && top.opened && top.isType) {
        if (top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        top.cur = t === 'default:' ? null : +m[2];
        top.segStart = m.index + t.length;
      }
    }
  }
}

function outerCaseSegments(src) {
  const out = new Map();
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collectCaseSegments(body, out);
  }
  return out;
}

// ================= ★PS-STRUCT placeStyle 条件感知结构层（2026-09-03） =================
// 只服务 placeStyle 字段；其余字段走 v1 collectCaseSegments 文本段首匹配（零漂移）。

/** 剥掉段内嵌套 switch(type) 块（holes=[start,end) 记于所属 case 段）后的文本 */
function sliceHoles(body, rec) {
  if (!rec.holes.length) return body.slice(rec.start, rec.end);
  let out = '', pos = rec.start;
  for (const [hs, he] of rec.holes) {
    if (hs < pos || he > rec.end) continue;   // 孔不属于本段（理论不可达,防御）
    out += body.slice(pos, hs);
    pos = he;
  }
  return out + body.slice(pos, rec.end);
}

/** 消费一个语句：{…} 块或到分号的裸语句 → 返回结束下标（exclusive） */
function stmtEnd(text, i) {
  if (text[i] === '{') {
    let d = 0;
    for (; i < text.length; i++) {
      if (text[i] === '{') d++;
      else if (text[i] === '}') { d--; if (d === 0) return i + 1; }
    }
    return text.length;
  }
  const semi = text.indexOf(';', i);
  return semi < 0 ? text.length : semi + 1;
}

/** 解析 if (type == N) <stmt> [else <stmt>] → { body, elseBody, end }
 *  body/elseBody 为【源文本】（else-if 链整段交给递归） */
function consumeIf(text, afterHeader) {
  let i = afterHeader;
  while (/\s/.test(text[i] ?? '')) i++;
  if (i >= text.length) return null;
  const bodyStart = text[i] === '{' ? i + 1 : i;
  const bodyEnd = stmtEnd(text, i);
  const body = text[i] === '{' ? text.slice(bodyStart, bodyEnd - 1) : text.slice(i, bodyEnd);
  let j = bodyEnd;
  while (/\s/.test(text[j] ?? '')) j++;
  let elseBody, end = bodyEnd;
  if (text.startsWith('else', j)) {
    let k = j + 4;
    while (/\s/.test(text[k] ?? '')) k++;
    if (text[k] === '{') {
      const eEnd = stmtEnd(text, k);
      elseBody = text.slice(k + 1, eEnd - 1);
      end = eEnd;
    } else {
      // else if … / else 裸语句：整段源文本递归
      const eEnd = text[k] === 'i' ? consumeIf(text, text.indexOf(')', k) + 1).end : stmtEnd(text, k);
      elseBody = text.slice(k, eEnd);
      end = eEnd;
    }
  }
  return { body, elseBody, end };
}

/** 括号感知条件扫描：i 指向 '(' 后首字符 → 返回配对 ')' 之后下标（串感知） */
function scanParen(text, i) {
  const n = text.length;
  let pd = 1;
  for (; i < n; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; } continue; }
    if (ch === '(') pd++;
    else if (ch === ')') { pd--; if (pd === 0) return i + 1; }
  }
  return n;
}

/** 段文本 → 该 id 的 placeStyle 终值。
 *  顺序单位扫描（C# 执行序）：无条件赋值【后写覆盖】（★十五批备B 收尾,2026-09-03
 *  改——原"首个生效=v1 首匹配"与 C# 顺序语义反,共享体 placeStyle 双赋值或 if 支后
 *  再有无条件赋值时后写才是终值;线性扫描每次赋值事件都覆写 ps 即执行序）。
 *  条件面感知（★本批扩）：`if (type == N)`/反序 `if (N == type)`（Item.cs:33139-33147
 *  防御锻造炉 3743-3745 三连 if）命中支覆写、未命中走 else 支（else-if 链递归同规）;
 *  【非】type 比较条件（Variant 变体支/区间支）按未命中处理——只走 else 支（基态
 *  画像口径,Variant 支体不入单值面）+整支消耗;switch 块整块跳过（per-id 归并是
 *  psResolveSwitch 孔剥层职能）。算式（20 + type - 2637 等）不解（与 v1 同口径,
 *  交 items.ts vanilla.json 回填链）。 */
function evalPlaceStyle(text, id) {
  let ps;
  const re = /(if|switch)\s*\(|placeStyle\s*=\s*(\d+)\s*;/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2] !== undefined) { ps = +m[2]; continue; }   // ★后写覆盖（原 if (ps===undefined) 首写钉死）
    if (m[1] === 'switch') {
      let j = re.lastIndex;
      while (j < text.length && /\s/.test(text[j])) j++;
      re.lastIndex = text[j] === '{' ? skipBraced(text, j) : skipSimple(text, j);
      if (re.lastIndex <= j) re.lastIndex = text.length;   // skipBraced 失配防御
      continue;
    }
    const afterHeader = scanParen(text, re.lastIndex);
    const cond = text.slice(re.lastIndex, afterHeader - 1);
    const cm = /^\s*(?:(?:type|currentItem\.type)\s*==\s*(\d+)|(\d+)\s*==\s*(?:type|currentItem\.type))\s*$/.exec(cond);
    const parsed = consumeIf(text, afterHeader);
    if (!parsed) continue;
    re.lastIndex = parsed.end;   // 绝对下标（consumeIf 以同一 text 计位）
    const n = cm ? (+cm[1] || +cm[2]) : -1;   // 非 type 比较（Variant/区间）=未命中
    const branch = n === id ? parsed.body : parsed.elseBody;
    if (branch !== undefined) {
      const v = evalPlaceStyle(branch, id);
      if (v !== undefined) ps = v;   // 条件命中覆写（C# 后写胜）
    }
  }
  return ps;
}

function psRec(sw) {
  let r = sw.cases.get(sw.cur);
  if (!r) { r = { start: sw.segStart, end: 0, holes: [], nested: [] }; sw.cases.set(sw.cur, r); }
  return r;
}

/** 单个 switch(type) 的 per-id placeStyle 解析（close 时调用;子层已解析存 sw.ps） */
function psResolveSwitch(sw, body) {
  sw.ps = new Map();
  const ids = [...sw.cases.keys()].filter((k) => k !== null);
  const stripComment = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  // fallthrough 分组：连续 case 标签,中间段全空白 → 共享【末支段】为组 body
  const groups = [];
  let run = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const rec = sw.cases.get(id);
    run.push(id);
    const empty = stripComment(sliceHoles(body, rec)).trim() === '';
    if (!empty || i === ids.length - 1) { groups.push({ members: run, bodyRec: rec }); run = []; }
  }
  for (const g of groups) {
    const bodyText = sliceHoles(body, g.bodyRec);
    for (const id of g.members) {
      let ps = evalPlaceStyle(bodyText, id);
      for (const child of g.bodyRec.nested) {
        const cps = child.ps?.get(id);
        if (cps !== undefined) ps = cps;   // 嵌套 switch(type) per-id 条目覆盖（执行序在后）
      }
      if (ps !== undefined) sw.ps.set(id, ps);
    }
  }
  // default: 段（key=null）——无条件/区间赋值无法按 id 归属,不解（v1 同口径整段丢弃,
  // 零漂移）;但其内嵌套 switch(type) 的 per-id 条目按 id 归并（显式 case 优先）
  const defRec = sw.cases.get(null);
  if (defRec) {
    for (const child of defRec.nested) {
      for (const [cid, cps] of child.ps ?? []) {
        if (!sw.ps.has(cid)) sw.ps.set(cid, cps);
      }
    }
  }
}

/** 结构层主入口：SetDefaults1-5 → Map(vid → placeStyle 终值) */
function structuralPlaceStyles(src) {
  const out = new Map();
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (!body) continue;
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0, m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, tokStart: m.index, cur: null, segStart: 0, cases: new Map() });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          stack.pop();
          depth--;
          if (top.isType) {
            if (top.cur !== null) psRec(top).end = m.index;
            const parent = stack[stack.length - 1];
            if (parent && parent.isType && parent.opened) {
              // ①嵌套 switch(type) 闭合：孔登记 + 子层归并（"保护内层条目"的承载点——
              //   子层 per-id 终值经 parent 解析时归并,不再被 parent 段首匹配冲掉）。
              //   parent.cur === null = default: 段（Item.cs:22374 巨型 default 支内
              //   兄弟嵌套 switch 逐 id 分派,2641-2647 区即此形态）——同样登记,
              //   归并在 psResolveSwitch 的 default 支处理。
              const pr = psRec(parent);
              pr.holes.push([top.tokStart, m.index + 1]);
              pr.nested.push(top);
            }
            psResolveSwitch(top, body);
            if (!stack.some((s) => s.isType && s.opened)) {
              for (const [id, ps] of top.ps) out.set(id, ps);   // 最外层才落总表（后法覆盖前法=v1 同序）
            }
          }
          continue;
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          if (top.cur !== null) psRec(top).end = m.index;
          top.cur = t === 'default:' ? null : +m[2];
          top.segStart = m.index + t.length;
        }
      }
    }
  }
  return out;
}

const SEGS = outerCaseSegments(itemSrc);

// ================= ★拓扑层残文 + 同字段后写覆盖（十五批备B 收尾,2026-09-03） =================
// 缺陷：v1 `seg.match(re)` 取首匹配——case 段内同字段【无条件】双赋值时 C# 语义=
// 后写生效（实例：496 灵风筝 knockBack 0f→2f 双赋值、498/1989/3977 展示人偶
// createTile 128/269→470/475 后写=1.4 改版终值,items.ts:926-931 曾备案"只抓首值"
// 帽架放成女模特的根因;2209 超级魔药 healMana 300→400 实为 1456→1458 版值变更,
// 见 DELEGATE_EXPANSION 退役注）。
// ★盲取"全段最后命中"是错的：SetDefaults 段内还有【条件面】——①`if (Variant ==
// ItemVariants.WeakerVariant) { damage = 14; }`（112/157/517/683/725/1314/1319/
// 1325/2623/3069 等变体支,基态=拓扑层值,变体值不入单值画像面）;②嵌套 switch(type)
// 他 id 支（3292/3834/3857——本 id 终值在嵌套 case 内,per-id 归并是 PS-STRUCT
// 结构层职能,本文本层不碰）。故后写扫描只对【拓扑层残文】（剥全部 {} 块 + 无括号
// 控制语句体后的裸语句面）做——残文里只剩无条件赋值,线性扫取最后命中=执行序终值。
// 边界：只覆盖同一 case 段（同一工作对象）的无条件赋值序——跨对象继承链
// （DefaultTo* 基座/CopyFrom/委托展开/SetFoodDefaults 合并）语义不变（各链仍
// "基底打底→后段覆写",与本语义同向）。

/** 字符串/注释感知的块级消耗：i 指向 '{' → 返回配对 '}' 之后下标；失败返回 -1 */
function skipBraced(text, i) {
  const n = text.length;
  let d = 0;
  for (; i < n; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; i--; continue; }
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 1; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return i + 1; }
  }
  return -1;
}

/** 段文本 → 拓扑层残文：剥全部 {} 块（含嵌套 switch/条件支体）与无括号
 *  if/else/for/while/foreach/switch/do 的头+单语句体,字符串/注释感知。
 *  残文=该 case 段的【无条件裸语句面】（含 goto case/return 等无害残迹）。 */
function topStatementText(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  const KW = /^(foreach|while|switch|else|if|for|do)\b/;
  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      i++; out += ' ';
      continue;
    }
    if (ch === '{') { i = skipBraced(text, i); if (i < 0) break; out += ' '; continue; }
    if (depth0Kw(text, i)) {
      const m = KW.exec(text.slice(i, i + 9));
      if (m) {
        let j = i + m[1].length;
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] === '(') {
          // 跳过头括号（串感知配对）
          let pd = 0;
          for (; j < n; j++) {
            const c2 = text[j];
            if (c2 === '"' || c2 === "'") { const q = c2; j++; while (j < n && text[j] !== q) { if (text[j] === '\\') j++; j++; } continue; }
            if (c2 === '(') pd++;
            else if (c2 === ')') { pd--; if (pd === 0) { j++; break; } }
          }
          i = j;
          // 头后：{ 块 → 块剥;裸语句 → 单语句剥（括号感知到 ';'）
          while (i < n && /\s/.test(text[i])) i++;
          if (text[i] === '{') { i = skipBraced(text, i); if (i < 0) break; out += ' '; continue; }
          i = skipSimple(text, i);
          out += ' ';
          continue;
        }
        // 无头型（do {…} / else {…} / else 裸语句）：落回主循环逐字符处理
        //（'{' 块剥/下个关键词再判）;此处只防 else-if 链重复计词——i 原位前进 1
        out += text[i]; i++;
        continue;
      }
    }
    out += ch; i++;
  }
  return out;
}

/** 括号感知的单语句消耗：到 pd==0 的 ';'（含）止 */
function skipSimple(text, i) {
  const n = text.length;
  let pd = 0;
  for (; i < n; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < n && text[i] !== q) { if (text[i] === '\\') i++; i++; } continue; }
    if (ch === '(') pd++;
    else if (ch === ')') pd--;
    else if (ch === ';' && pd === 0) return i + 1;
  }
  return i;
}

/** i 是否处于词首（左邻非词字符）——防 useTurn 内 "for" 等子串误判 */
function depth0Kw(text, i) {
  if (i > 0 && /\w/.test(text[i - 1])) return false;
  return /^(foreach|while|switch|else|if|for|do)\b/.test(text.slice(i, i + 9));
}

const RESIDUE_CACHE = new Map();
function segResidue(seg) {
  let r = RESIDUE_CACHE.get(seg);
  if (r === undefined) { r = topStatementText(seg); RESIDUE_CACHE.set(seg, r); }
  return r;
}

/** 同字段多次【无条件】赋值=后写生效：对拓扑层残文全局扫取【最后】命中。
 *  ★残文无命中 → 回落 v1 整段首匹配：条件面（Variant 变体支/嵌套 switch 他 id 支）
 *  的提取结果与本批前【逐字节相同】（旧口径原样保留）——本批只改"拓扑层出现
 *  同字段多次无条件赋值"这一类的取值（首→后写）,其余一概不动（零超界 diff 闸门）：
 *  · 544/556/557/5334 的 useStyle=4/consumable=1 在 `if (Variant != Disabled…) {…}`
 *    内（对基态恒真）——盲剥会整键丢失（boss 召唤物不再 consumable=实机回归）,
 *    回落面保住旧值;
 *  · 3292 妙语悠悠球 damage/shoot/knockBack 旧值系嵌套 switch case 3278 首匹配伪值,
 *    真值在嵌套 case 3292 内——文本层不碰（同 PS-STRUCT 前的 placeStyle 旧账,
 *    per-id 归并属结构层后续扩展,本批登记不动）。 */
function lastFieldMatch(seg, re) {
  const residue = segResidue(seg);
  const gre = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m, last = null;
  while ((m = gre.exec(residue))) last = m;
  if (last) return last;
  return seg.match(re);
}

// 字段正则表：[输出名, 正则, 类型]
const FIELDS = [
  ['melee', /melee = true;/, 'b'],
  ['ranged', /ranged = true;/, 'b'],
  ['magic', /magic = true;/, 'b'],
  ['summon', /summon = true;/, 'b'],
  ['noMelee', /noMelee = true;/, 'b'],
  ['consumable', /consumable = true;/, 'b'],
  ['potion', /potion = true;/, 'b'],
  ['channel', /channel = true;/, 'b'],
  ['autoReuse', /autoReuse = true;/, 'b'],
  ['torch', /torch = true;/, 'b'],
  ['expert', /expert = true;/, 'b'],
  ['questItem', /questItem = true;/, 'b'],
  ['damage', /\bdamage = (\d+);/, 'n'],
  ['mana', /\bmana = (\d+);/, 'n'],
  ['pick', /\bpick = (\d+);/, 'n'],
  ['axe', /\baxe = (\d+);/, 'n'],
  ['hammer', /\bhammer = (\d+);/, 'n'],
  ['createTile', /\bcreateTile = (\d+);/, 'n'],
  ['createWall', /\bcreateWall = (\d+);/, 'n'],
  ['placeStyle', /\bplaceStyle = (\d+);/, 'n'],
  ['healLife', /\bhealLife = (\d+);/, 'n'],
  ['healMana', /\bhealMana = (\d+);/, 'n'],
  ['buffType', /\bbuffType = (-?\d+);/, 'n'],
  ['buffTime', /\bbuffTime = (\d+);/, 'n'],
  ['ammo', /\bammo = (\d+);/, 'n'],
  ['useAmmo', /\buseAmmo = (\d+);/, 'n'],
  ['notAmmo', /notAmmo = true;/, 'b'],
  ['shoot', /\bshoot = (-?\d+);/, 'n'],
  ['holdStyle', /\bholdStyle = (\d+);/, 'n'],
  ['useStyle', /\buseStyle = (\d+);/, 'n'],
  ['knockBack', /\bknockBack = ([\d.]+)f;/, 'f'],
  ['fishingPole', /\bfishingPole = (\d+);/, 'n'],
  ['bait', /\bbait = (\d+);/, 'n'],
];

const FUNC = {};
/** DefaultTo 武器族基座（1458 Item.cs :48016/:48025/:48425-48470）：case 段内的
 *  辅助调用 → 基础字段（case 显式赋值随后在 FIELDS pass 覆盖——显式=终值）。
 *  · MagicWeapon(p,t,v[,autoReuse]) → useStyle5/magic/noMelee/shoot
 *  · RangedWeapon(p,ammo,t,v[,autoReuse]) → useStyle5/ranged/noMelee/shoot/useAmmo
 *  · Bow(t,v[,autoReuse]) = RangedWeapon(1,Arrow=1,…)（case 可覆写 shoot）
 *  · Staff(p,v,t,mana) = MagicWeapon(…,autoReuse:true)+mana（case 显式 mana 覆盖）
 *  · Spear(p,v,t) → useStyle5/melee+noMelee+noUseGraphic/shoot（投矛即弹体）
 *  · ThrownWeapon(p,t,v[,autoReuse]) → useStyle1/ranged/noMelee/consumable/shoot */
function defaultToBase(seg) {
  const f = {};
  const auto = (m) => (m[0].includes('true') ? 1 : undefined);
  let m;
  m = seg.match(/DefaultToMagicWeapon\(\s*(-?\d+)\s*,\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 5; f.magic = 1; f.noMelee = 1; const a = auto(m); if (a) f.autoReuse = a; }
  m = seg.match(/DefaultToRangedWeapon\(\s*(-?\d+)\s*,\s*(\d+)\s*,\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = +m[1]; f.useAmmo = +m[2]; f.useStyle = 5; f.ranged = 1; f.noMelee = 1; const a = auto(m); if (a) f.autoReuse = a; }
  m = seg.match(/DefaultToBow\(\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = 1; f.useAmmo = 1; f.useStyle = 5; f.ranged = 1; f.noMelee = 1; const a = auto(m); if (a) f.autoReuse = a; }
  m = seg.match(/DefaultToStaff\(\s*(-?\d+)\s*,\s*[\d.]+f?\s*,\s*\d+\s*,\s*(\d+)\s*\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 5; f.magic = 1; f.noMelee = 1; f.autoReuse = 1; f.mana = +m[2]; }
  m = seg.match(/DefaultToSpear\(\s*(-?\d+)\s*,\s*[\d.]+f?\s*,\s*\d+\s*\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 5; f.melee = 1; f.noMelee = 1; f.noUseGraphic = 1; }
  m = seg.match(/DefaultToThrownWeapon\(\s*(-?\d+)\s*,\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 1; f.ranged = 1; f.noMelee = 1; f.consumable = 1; const a = auto(m); if (a) f.autoReuse = a; }
  return f;
}
for (const [id, seg] of SEGS) {
  const f = defaultToBase(seg);
  for (const [name, re, type] of FIELDS) {
    const m = lastFieldMatch(seg, re);   // ★后写生效（首匹配→末匹配,见 lastFieldMatch 注）
    if (!m) continue;
    f[name] = type === 'b' ? 1 : type === 'f' ? parseFloat(m[1]) : parseInt(m[1], 10);
  }
  if (Object.keys(f).length) FUNC[id] = f;
}
// ★PS-STRUCT placeStyle 条件感知修正（在 FIELDS 之后、手补丁之前——手补丁无 placeStyle
// 键,不受影响）：①伪值覆写（已有条目 placeStyle≠结构层真值）②缺档最小新增 {placeStyle}
// （其余字段仍由 items.ts vanilla.json 回填链承载=placeStyle 之外零 diff 闸门）
{
  const PS = structuralPlaceStyles(itemSrc);
  let fix = 0, add = 0;
  const fixed = [], added = [];
  for (const [id, ps] of PS) {
    const cur = FUNC[id];
    if (cur) {
      if (cur.placeStyle !== ps) { fixed.push(`${id}:${cur.placeStyle}->${ps}`); cur.placeStyle = ps; fix++; }
    } else {
      FUNC[id] = { placeStyle: ps }; added.push(`${id}:${ps}`); add++;
    }
  }
  console.error(`PS-STRUCT: 伪值纠偏 ${fix} 件 [${fixed.join(', ')}]`);
  console.error(`PS-STRUCT: 缺档补齐 ${add} 件 [${added.join(', ')}]`);
}
// 钓竿区段补丁：2290-2296 族在 case 段外的 type 区间块赋值（最近 switch 归属扫不到），
// 按源码实表补齐（Item.cs:23005-23040 前向扫描实证）。
for (const [id, pow] of Object.entries({ 2291: 15, 2293: 20, 2292: 30, 2295: 35, 2296: 40, 2294: 50 })) {
  FUNC[id] = { ...(FUNC[id] ?? {}), fishingPole: pow };
}
// 嵌套块首匹配错位补丁（collectCaseSegments 是文本段正则——嵌套 switch/`int num` 分支
// 里的同字段多赋值取首匹配；以下逐 case 按源码校对，2026-08-17 与提交态对账固化）：
//  · 2674-2676 诱饵三连（Item.cs:25851-25870 嵌套 switch：2675=30 / 2676=50 / default 2674=15，
//    首匹配把 2676 吃成 2675 的 30）
//  · 2001 蠕虫笼族（:21313-21350 `int num = type - 1994` 逐分支：num=7→25，
//    首匹配吃到 num=0 的 5）
//  · 2422 熔线钓钩（SetDefaults2 `if (type >= 2421 && type <= 2422)` 区间块，case 标签外
//    ——同 2291 族漏提形态；:23048-23066 `else` 分支 fishingPole 45（1405 同位 :25413 同读
//    45）。此前提交态手记 25 与两版反编译均不符，2026-08-17 按 1456 最终态校正；
//    melee/autoReuse 为旧手记误加，源块未设，随校正摘除）
for (const [id, patch] of Object.entries({
  2674: { bait: 15, consumable: 1 },
  2676: { bait: 50 },
  2001: { bait: 25 },
  2422: { fishingPole: 45 },
})) {
  FUNC[id] = { ...(FUNC[id] ?? {}), ...patch };
}
// SetDefaults 委托展开补丁（2026-08-25 r33 蓝队）：`SetDefaults3(N)`/`SetDefaults1(N)` 形态
// 的 case 段本体只有 type/glowMask/shoot 覆写，工具力/伤害面全在【被委托基底】的 case 段——
// 文本段正则解不开跨 case 继承，此前六件月主锯钻只提到 {shoot:N}（itemFuncTool 判空 →
// 不进工具分支 → combatWeapon 落 'shot' 兜底把持械弹当直飞箭弹）、九件月主挥砍件整条缺失
// （combat+func 双缺 → 左键纯摆动零伤零挖；red-team-r33 §三 P0-①②）。
// C# 语义 = 先跑完基底 case 全部赋值再执行本 case 覆写（type/shoot/glowMask），终值 =
// 基底终态 + 本段覆写。逐件按源码固化（值=基底 case 直赋实值，非推断）：
//  · 月主锯钻（1456 Item.cs :26571/:26577/:26598/:26604 + :31037/:31043；1457/1458 同位
//    :26572/:26578/:26599/:26605 + :31061/:31067，两版 diff=0 已对账）：
//    2778←2773+shoot429 / 2783←2773+431 / 3463←2773+610（axe27/dmg80/kb4）
//    2779←2774+shoot430 / 2784←2774+432 / 3464←2774+609（pick225/dmg50/kb0.5）
//  · 月主挥砍斧/锤/镐（:26566/:26583/:26588 + :31032/:31049/:31054）：
//    2777·2782·3462←2772（axe27/dmg100/kb6/autoReuse）/ 2780·2785·3465←2775
//    （hammer100/dmg110/kb7/useTurn）/ 2781·2786·3466←2776（pick225/dmg80/kb5.5/useTurn）
//  · 2209 超级治疗药水 healMana=400 为提交态历史手补（脚本直提 300——case 1933 段
//    healLife/healMana 双赋值取首匹配），随批固化防重跑回退。
const DELEGATE_EXPANSION = {
  2778: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 429 },
  2783: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 431 },
  3463: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 610 },
  2779: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 430 },
  2784: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 432 },
  3464: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 609 },
  2777: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  2782: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  3462: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  2780: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  2785: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  3465: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  2781: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  2786: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  3466: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
};
for (const [id, expansion] of Object.entries(DELEGATE_EXPANSION)) {
  // 委托语义：基底字段打底、本 case 显式字段覆盖——现有条目（如六锯钻的 {shoot:N}）
  // 即"显式覆写"，展开值与之同键同值，直接整体赋终态。
  FUNC[id] = { ...(FUNC[id] ?? {}), ...expansion };
}

// ---- SetFoodDefaults（Item.cs:47653）：食物族走 SetDefaults 的 IsFood 分支直转此方法，
// SetDefaults1-5 扫不到——85 个 case 全靠此 switch 补。逐 case 解析
// DefaultToFood(w,h,buff,dur[,useGulpSound]) → buffType/buffTime/useStyle(2 咀嚼 | 9 仰饮)
// /consumable（DefaultToFood :48155 实体）；DefaultToHealingPotion（case 1912）→ 治疗。
// case 内显式赋值可覆盖（967/969 强制 useStyle=9；353 清酒 Ale holdStyle/ammo/notAmmo）。
{
  const foodSegs = new Map();
  const foodBody = methodBodyOf(itemSrc, 'private void SetFoodDefaults(');
  if (foodBody) collectCaseSegments(foodBody, foodSegs);
  const foodFunc = {};
  for (const [id, seg] of foodSegs) {
    const f = {};
    const dm = seg.match(/DefaultToFood\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)([^)]*)\)/);
    if (dm) {
      f.buffType = +dm[3];
      f.buffTime = +dm[4];
      // DefaultToFood：useGulpSound=true → useStyle 9（Item2/Item3 音效差异不在此表）
      f.useStyle = /useGulpSound\s*:\s*true/.test(dm[5]) ? 9 : 2;
      f.consumable = 1;
    }
    const dh = seg.match(/DefaultToHealingPotion\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (dh) {
      f.healLife = +dh[3];
      f.useStyle = 9;
      f.consumable = 1;
      f.potion = 1;
    }
    if (!Object.keys(f).length) continue;
    // case 段内显式赋值（仅 useStyle 允许覆盖解析值；其余字段并集）
    // ★后写生效同主线（lastFieldMatch 注）——SetFoodDefaults case 段同字段双赋值
    for (const [name, re, type] of FIELDS) {
      if (f[name] !== undefined && name !== 'useStyle') continue;
      const m = lastFieldMatch(seg, re);
      if (!m) continue;
      f[name] = type === 'b' ? 1 : type === 'f' ? parseFloat(m[1]) : parseInt(m[1], 10);
    }
    foodFunc[id] = f;
  }
  for (const [id, f] of Object.entries(foodFunc)) {
    FUNC[id] = { ...(FUNC[id] ?? {}), ...f };
  }
  console.error(`foodfunc: ${Object.keys(foodFunc).length} 件（SetFoodDefaults）`);
}
// useTurn 全量叠加（只在已有条目上补键，不新增 id）：EXTRA_USETURN 含 SetDefaults1-5
// case 显式 + DefaultToPlaceableTile/Wall/Torch/Food/HealingPotion/CapturedCritter/MusicBox
// 等辅助函数族 + 区间 if 块 + 委托继承 + SetFoodDefaults 食物族
{
  let n = 0;
  for (const [id, f] of Object.entries(FUNC)) {
    if (EXTRA_USETURN.get(Number(id)) === true) { f.useTurn = 1; n++; }
  }
  console.error(`useTurn=1: ${n} 件（EXTRA_USETURN 全量 ${EXTRA_USETURN.size}）`);
}
writeFileSync(OUT, JSON.stringify(FUNC));
console.error(`itemfunc: ${Object.keys(FUNC).length} 件`);
const stats = {};
for (const f of Object.values(FUNC)) {
  for (const k of Object.keys(f)) stats[k] = (stats[k] ?? 0) + 1;
}
console.error(JSON.stringify(stats));
