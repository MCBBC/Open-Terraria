// 一次性:从 Terarria1456 Item.cs 提取 vanity=true 物品清单,
// 给 src/data/vanilla-itemstats.json 对应条目补 "van": 1(原版 Item.vanity)。
// 两类来源（2026-08-14 补范围块——Boss 面具 2104-2113 无 case 标签曾被整段漏提）:
//   ① 五个 SetDefaultsN switch 的 case 块内 `vanity = true;`
//   ② `if (type >= A && type <= B)` 范围块内 `vanity = true;`(全体成员同标记)
// ★2026-08-19 ①改 token 级扫描（与 extract-equip-prefix.mjs 同法）：旧逐行扫描把
//   落空标签组的 vanity 归给【末标签】（DD2 面具 3863/3864 缺 van）、嵌套 switch(type)
//   内的 5-tab vanity（2222/2417 族共 26 处）整族漏标——改为共享体全体标签 + 嵌套
//   命中分支求值。
// 用法: node tools/patch-vanity-stats.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('../Terarria1456/Terraria/Item.cs', 'utf8');
const lines = src.split('\n');
const vanityIds = new Set();
// ① case 块（token 级:落空标签组全体共享体;嵌套 switch(type) 只认命中分支）
{
  const methodBodyOf = (name) => {
    const idx = src.indexOf(name);
    if (idx < 0) return '';
    const start = src.indexOf('{', idx);
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
    }
    return '';
  };
  // id → case 共享体（落空标签组全体标签映射同体）
  const segments = [];
  const collect = (body) => {
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0, m;
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
          if (seg.trim() !== '') for (const id of top.labels) segments.push([id, seg]);
          stack.pop();
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') { for (const id of top.labels) segments.push([id, seg]); top.labels = []; }
          if (t !== 'default:') top.labels.push(+m[2]);
          top.segStart = m.index + t.length;
        }
      }
    }
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(`private void SetDefaults${n}(`)
      || methodBodyOf(`public void SetDefaults${n}(`)
      || methodBodyOf(`void SetDefaults${n}(`);
    if (body) collect(body);
  }
  // 段内嵌套 switch(type)：外层余体 + 命中分支体（case 本 id 优先,否则 default）
  const VANITY_RE = /(?:^|[^a-zA-Z])vanity\s*=\s*true;/;
  for (const [id, seg] of segments) {
    const spans = [];
    {
      const re = /switch\s*\(\s*type\s*\)/g;
      let mm;
      while ((mm = re.exec(seg))) {
        const brace = seg.indexOf('{', mm.index + mm[0].length);
        if (brace < 0) break;
        let d = 0, end = -1;
        for (let i = brace; i < seg.length; i++) {
          if (seg[i] === '{') d++;
          else if (seg[i] === '}') { d--; if (d === 0) { end = i; break; } }
        }
        if (end < 0) break;
        spans.push([mm.index, end + 1]);
        re.lastIndex = end + 1;
      }
    }
    let has = false;
    let last = 0;
    for (const [s, e] of spans) {
      if (VANITY_RE.test(seg.slice(last, s))) has = true;
      const brace = seg.indexOf('{', s);
      const swBody = seg.slice(brace + 1, e - 1);
      const cases = new Map();
      let def = null;
      const tokRe = /case (\d+):|default:|[{}]/g;
      let depth = 0, segStart = 0, m2, pending = [];
      const flush = (endIdx) => {
        const b = swBody.slice(segStart, endIdx);
        if (b.trim() === '') return;
        for (const L of pending) { if (L === 'def') def = b; else cases.set(L, b); }
        pending = [];
      };
      while ((m2 = tokRe.exec(swBody))) {
        const t = m2[0];
        if (t.startsWith('case') || t === 'default:') {
          if (depth === 0) { flush(m2.index); pending.push(t === 'default:' ? 'def' : +m2[1]); segStart = m2.index + t.length; }
        } else if (t === '{') depth++;
        else if (t === '}') depth--;
      }
      flush(swBody.length);
      const branch = cases.has(id) ? cases.get(id) : (def ?? '');
      if (VANITY_RE.test(branch)) has = true;
      last = e;
    }
    if (VANITY_RE.test(seg.slice(last))) has = true;
    if (has) vanityIds.add(id);
  }
}
// ② 范围块（花括号配对收块体）
for (let i = 0; i < lines.length; i++) {
  const m = /^\t\tif \(type >= (\d+) && type <= (\d+)\)/.exec(lines[i]);
  if (!m) continue;
  let depth = 0, blob = [];
  for (let j = i; j < lines.length; j++) {
    blob.push(lines[j]);
    depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
    if (depth <= 0 && j > i) break;
  }
  if (blob.join('\n').includes('vanity = true;')) {
    for (let id = Number(m[1]); id <= Number(m[2]); id++) vanityIds.add(id);
  }
}
console.log('vanity=true 物品数(含范围块):', vanityIds.size);
const stats0 = JSON.parse(readFileSync('src/data/vanilla-itemstats.json', 'utf8'));
// ③ 范围块的算式槽位（如 Boss 面具 `headSlot = type + 146 - 2104`）——原提取器只认
//    case 内字面量,整族漏表;此处逐 id 求值并入表 {s,hs/bs/ls,van}
const slotInserts = {};
for (let i = 0; i < lines.length; i++) {
  const m = /^\t\tif \(type >= (\d+) && type <= (\d+)\)/.exec(lines[i]);
  if (!m) continue;
  let depth = 0; const blob = [];
  for (let j = i; j < lines.length; j++) {
    blob.push(lines[j]);
    depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
    if (depth <= 0 && j > i) break;
  }
  const text = blob.join('\n');
  const slotM = /headSlot = type \+ (\d+) - (\d+)/.exec(text)
    ?? /bodySlot = type \+ (\d+) - (\d+)/.exec(text)
    ?? /legSlot = type \+ (\d+) - (\d+)/.exec(text);
  if (!slotM) continue;
  const kind = /headSlot/.test(slotM[0]) ? 'h' : /bodySlot/.test(slotM[0]) ? 'b' : 'l';
  const off = Number(slotM[1]) - Number(slotM[2]);
  for (let id = Number(m[1]); id <= Number(m[2]); id++) {
    const entry = { s: kind, van: 1 };
    if (kind === 'h') entry.hs = id + off;
    else if (kind === 'b') entry.bs = id + off;
    else entry.ls = id + off;
    slotInserts[String(id)] = entry;
    vanityIds.add(id);
  }
}
Object.assign(stats0, slotInserts);
// stats0 已含 slotInserts 合并;再统一 van 标记后落盘
const stats = stats0;
let hit = 0;
const missing = [];
for (const id of vanityIds) {
  const k = String(id);
  if (stats[k]) {
    if (stats[k].van !== 1) hit++;
    stats[k].van = 1;
  } else missing.push(id);
}
console.log('stats 新增标记:', hit, '入表总数:', Object.keys(stats).length,
  '未入表(非装备):', missing.length, missing.slice(0, 10));
writeFileSync('src/data/vanilla-itemstats.json', JSON.stringify(stats) + '\n');
console.log('patched → src/data/vanilla-itemstats.json');
