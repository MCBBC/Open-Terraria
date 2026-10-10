// ★BJ601 一次性提取器：Terarria1457 Item.cs SetDefaults1..5 逐 case 提取 glowMask
// 终值 → stdout JSON { map: {itemType: glowMask}, audit: {...} }。
// 解析规则（与 extract-itemrare.mjs 同判例域,简化版——glowMask 赋值全是整数字面量）：
//   ① 区域 = SetDefaults1..5 五方法体（行锚签名,花括号深度配平定界）。
//   ② 深度无关通用规则（实测 SD1 标签 2 tab/体 3 tab;SD3 内嵌 switch 标签 4 tab/
//     体 5 tab——标签体深度=标签+1 恒成立）：glowMask 赋值行 tabs=T 归属【最近
//     case 标签 tabs=T-1】;嵌套 if/switch 内更深层赋值记 audit.nested（变体面）。
//   ③ case 标签列（case A: case B:）共享体——全标签收同值;新标签/反缩进清上下文。
//   ④ SetDefaultsN(base) 委托链:base 的 glowMask 若存在而本 case 无显式赋值 →
//     继承（audit.inherits 记录,人工复核）;本 case 显式赋值恒胜（源序覆盖）。
//   ⑤ 值域:-2=FakeUser / -1=None;正数=GlowMaskID 0..383。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(ROOT, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const lines = src.split('\n');

const METHODS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5'];

function methodRange(name) {
  const sig = lines.findIndex((l) => l.includes(`private void ${name}(int type)`));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let depth = 0;
  let started = false;
  for (let i = sig; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started && depth <= 0) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}

function parseTabs(line) {
  let n = 0;
  while (line[n] === '\t') n++;
  return n;
}

const map = Object.create(null);       // id -> value（终值,后写覆盖）
const audit = { nested: [], delegate: [], labels: 0, assigns: 0 };

for (const name of METHODS) {
  const [from, to] = methodRange(name);
  // caseCtx: 深度升序的 case 标签栈 {tabs, ids}
  let caseCtx = [];
  for (let i = from; i <= to; i++) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (!stripped) continue;
    const tabs = parseTabs(raw);
    // case 标签（任意深度）
    const caseM = /^case (-?\d+):/.exec(stripped);
    if (caseM || stripped === 'default:') {
      // 新标签：同深/更深旧上下文作废
      caseCtx = caseCtx.filter((c) => c.tabs < tabs);
      if (caseM) {
        const ids = [];
        const re = /case (-?\d+):/g;
        let m2;
        while ((m2 = re.exec(stripped))) ids.push(Number(m2[1]));
        caseCtx.push({ tabs, ids });
        audit.labels += ids.length;
      } else {
        caseCtx.push({ tabs, ids: ['default'] });
      }
      continue;
    }
    // 反缩进：离开更深 case 体（ tabs <= ctx.tabs 的上下文全部出栈,
    // 但注意 case 体语句与标签相差 1 tab,语句 tabs = 标签 tabs+1 不会误清）
    caseCtx = caseCtx.filter((c) => c.tabs < tabs || (c.tabs === tabs - 1));
    // 委托调用（继承面）
    const delM = /^SetDefaults[1-5]\((\d+)\);/.exec(stripped);
    if (delM && caseCtx.length) {
      const owner = caseCtx.find((c) => c.tabs === tabs - 1);
      if (owner) audit.delegate.push({ from: name, ids: owner.ids, base: Number(delM[1]) });
      continue;
    }
    // glowMask 赋值
    const gmM = /^glowMask = (-?\d+);/.exec(stripped);
    if (gmM) {
      const val = Number(gmM[1]);
      const owner = caseCtx.find((c) => c.tabs === tabs - 1);
      if (owner) {
        audit.assigns++;
        for (const id of owner.ids) {
          if (typeof id !== 'number') continue;   // default 不进表
          map[id] = val;
        }
      } else {
        audit.nested.push({ line: i + 1, method: name, tabs, case: caseCtx, val, text: stripped });
      }
      continue;
    }
  }
}

// 委托继承面:本 case 无显式 glowMask 而 base 有 → 继承
const inherits = [];
for (const d of audit.delegate) {
  for (const id of d.ids) {
    if (typeof id !== 'number') continue;
    if (map[id] === undefined && map[d.base] !== undefined) {
      map[id] = map[d.base];
      inherits.push({ id, base: d.base, val: map[d.base], method: d.from });
    }
  }
}

const pos = Object.entries(map).filter(([, v]) => v >= 0);
const neg = Object.entries(map).filter(([, v]) => v < 0);
console.log(JSON.stringify({
  src: '1457',
  count: Object.keys(map).length,
  positive: pos.length,
  negative: neg.length,
  negativeIds: neg.map(([k, v]) => `${k}:${v}`),
  inherits,
  nested: audit.nested,
  assigns: audit.assigns,
  map,
}, null, 1));
