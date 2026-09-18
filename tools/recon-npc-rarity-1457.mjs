// recon-npc-rarity-1457.mjs — NPC_RARITY 对账闸门（1457 权威重提）
//
// 程序化直读 Terarria1457/Terraria/NPC.cs SetDefaults(int Type) 全段
// （:8454-17890，含区间 if 块（type >= A && type <= B）/ `int numN = type` 别名
//  嵌套 / `type == A || type == B` 多型联言 / switch(type) case 四形态），提取全部
//  `rarity = N` 赋值的覆盖型集合，与本仓 src/data/vanillaNpcs.ts 的 NPC_RARITY
//  表逐型对拍。
//
// 背景（红蓝-H ①定谳）：旧表 335 条中真值仅 79 型（1477 赋值位），其余 256 条为
// 手维护捏造（表头自称 "SetDefaults if-chain 提取" 而无任何生成器痕迹）——本工具
// 即补上的权威生成/对账链。DRIFT 必须 = 0（EXTRA/MISS/DIFF 三类全零）。
//
// 语义注记：
//  · 世界态/难度条件帧（Main.remixWorld / !Main.hardMode / expertMode 等不可静态
//    定集者）之下的 rarity 赋值 → wild 记录：不入金标，打 WARN 人工复核
//    （金标 = 缺省世界态下 SetDefaults 的终值）。
//  · 同型多次赋值按源码序后者覆盖（C# 顺序语义）；value 变更即记 dupConflict。
//
// 用法：
//   node tools/recon-npc-rarity-1457.mjs            # 对拍，DRIFT!=0 则 exit 1
//   node tools/recon-npc-rarity-1457.mjs --json     # 机读输出（金标测试消费）
//   node tools/recon-npc-rarity-1457.mjs --gold     # 只打印金标 JSON 片段
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NPC_CS = path.resolve(HERE, '../../Terarria1457/Terraria/NPC.cs');
const TABLE_TS = path.resolve(HERE, '../src/data/vanillaNpcs.ts');

// ---------- 1. 截取 SetDefaults(int Type) 方法体 ----------
const src = readFileSync(NPC_CS, 'utf8');
const lines = src.split('\n');
let sigLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (/\bvoid SetDefaults\(int Type\b/.test(lines[i])) { sigLine = i; break; }
}
if (sigLine < 0) throw new Error('SetDefaults(int Type ...) not found in NPC.cs');

let depth = 0, bodyEnd = -1, started = false;
for (let i = sigLine; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { bodyEnd = i; break; } }
  }
  if (bodyEnd >= 0) break;
}
if (bodyEnd < 0) throw new Error('SetDefaults body end not found');

// ---------- 2. 条件解析 ----------
const aliasMap = new Map(); // numN -> 'type'（`int numN = type;`）

function parseCondIds(condRaw) {
  let cond = condRaw;
  for (const [name] of aliasMap) cond = cond.replace(new RegExp(`\\b${name}\\b`, 'g'), 'type');
  if (!/\btype\b/.test(cond)) return null; // 世界态/难度等与 type 无关的门
  const ids = new Set();
  // 先吃掉区间（type >= A && type <= B）
  cond = cond.replace(/\btype >= (\d+) && type <= (\d+)/g, (_, a, b) => {
    for (let v = +a; v <= +b; v++) ids.add(v);
    return ' ';
  });
  // 再吃掉等值（type == N，可多个 || 联言）
  const eqs = [...cond.matchAll(/\btype == (\d+)/g)];
  if (eqs.length) {
    for (const m of eqs) ids.add(+m[1]);
    cond = cond.replace(/\btype == \d+/g, ' ');
  }
  // 残留 type 引用（<、!=、数组下标等）→ 不可静态定集
  if (/\btype\b/.test(cond)) return null;
  return ids;
}

// ---------- 3. 缩进制帧扫描（反编译输出 tab 缩进恒定） ----------
// 帧：{ indent, ids:Set|null, desc, isSwitch }
const stack = [];
const records = []; // { ids, value, line, desc, wild }
const warnings = [];

const indentOf = (s) => { const m = s.match(/^\t*/); return m ? m[0].length : 0; };

for (let i = sigLine + 1; i <= bodyEnd; i++) {
  const raw = lines[i];
  const t = raw.trim();
  if (!t) continue;
  const ind = indentOf(raw);

  // 3a. 行首 '}'：闭合 indent >= ind 的帧
  if (t.startsWith('}')) {
    while (stack.length && stack[stack.length - 1].indent >= ind) stack.pop();
  }

  // 3b. 开帧
  let m;
  if ((m = t.match(/^(?:\} )?(?:else )?if \((.*)\)\s*\{?$/)) && t !== m[1]) {
    const ids = parseCondIds(m[1]);
    const tail = t.replace(/^(?:\} )?(?:else )?if \((.*)\)\s*/, '');
    if (tail && tail !== '{') warnings.push(`L${i + 1} unbraced if body: ${t}`);
    stack.push({ indent: ind, ids, desc: m[1].trim(), isSwitch: false });
    if (ids === null) warnings.push(`L${i + 1} wild cond: ${m[1].trim()}`);
  } else if (/^(?:\} )?else\s*\{$/.test(t)) {
    stack.push({ indent: ind, ids: null, desc: 'else(complement)', isSwitch: false });
    warnings.push(`L${i + 1} bare else frame (wild)`);
  } else if ((m = t.match(/^(?:\} )?switch \((type|num\d*)\)\s*\{?$/))) {
    stack.push({ indent: ind, ids: new Set(), desc: `switch(${m[1]})`, isSwitch: true });
  } else if ((m = t.match(/^case (\d+):$/)) && stack.length && stack[stack.length - 1].isSwitch) {
    stack[stack.length - 1].ids.add(+m[1]);
  }

  // 3c. 别名声明
  if ((m = t.match(/^int (num\d*) = type;$/))) aliasMap.set(m[1], 'type');

  // 3d. rarity 赋值捕获
  if ((m = t.match(/^rarity = (\d+);$/))) {
    const val = +m[1];
    let eff = null; let wild = false;
    for (const f of stack) {
      if (f.isSwitch && f.ids.size === 0) { wild = true; break; } // case 未覆盖（异常态）
      if (f.ids === null) { wild = true; continue; }
      eff = eff === null ? new Set(f.ids) : new Set([...eff].filter((v) => f.ids.has(v)));
    }
    const rec = { ids: eff ? [...eff].sort((a, b) => a - b) : [], value: val, wild, line: i + 1, desc: stack.map((f) => f.desc).join(' > ') };
    records.push(rec);
    if (wild) warnings.push(`L${i + 1} rarity=${val} under wild frame: ${rec.desc}`);
  }
}

// ---------- 4. 归并金标（源码序后者覆盖；wild 不入） ----------
const gold = new Map();
const dupConflict = [];
for (const r of records) {
  if (r.wild) continue;
  for (const id of r.ids) {
    const prev = gold.get(id);
    if (prev && prev.value !== r.value) dupConflict.push({ id, prev, now: r });
    gold.set(id, { value: r.value, line: r.line });
  }
}
const goldPositive = {};
for (const [id, { value, line }] of [...gold.entries()].sort((a, b) => a[0] - b[0])) {
  if (value > 0) goldPositive[id] = { value, line };
}

// ---------- 5. 读本仓表 + 对拍 ----------
const tsSrc = readFileSync(TABLE_TS, 'utf8');
const tableMatch = tsSrc.match(/export const NPC_RARITY: Record<number, number> = (\{[^\n]*\});/);
if (!tableMatch) throw new Error('NPC_RARITY table not found in vanillaNpcs.ts');
const table = JSON.parse(tableMatch[1]);

const goldIds = new Set(Object.keys(goldPositive).map(Number));
const tableIds = new Set(Object.keys(table).map(Number));
const EXTRA = [...tableIds].filter((id) => !goldIds.has(id)).sort((a, b) => a - b);
const MISS = [...goldIds].filter((id) => !tableIds.has(id)).sort((a, b) => a - b);
const DIFF = [...goldIds].filter((id) => tableIds.has(id) && table[id] !== goldPositive[id].value)
  .map((id) => ({ id, gold: goldPositive[id].value, table: table[id] }));

const drift = EXTRA.length + MISS.length + DIFF.length;
const report = {
  method: { sigLine: sigLine + 1, bodyEnd: bodyEnd + 1, assignmentSites: records.length, warnings },
  goldCount: Object.keys(goldPositive).length,
  goldPositive,
  dupConflict,
  tableCount: Object.keys(table).length,
  EXTRA, MISS, DIFF,
  drift,
};

if (process.argv.includes('--gold')) {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(goldPositive).map(([k, v]) => [k, v.value]))));
  process.exit(0);
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`SetDefaults :${report.method.sigLine}-${report.method.bodyEnd}  assignment sites=${records.length}  wild records=${records.filter((r) => r.wild).length}  warnings=${report.method.warnings.length}`);
  console.log(`gold rarity>0 types = ${report.goldCount}  (dup conflict=${dupConflict.length})`);
  console.log(`table entries = ${report.tableCount}`);
  console.log(`EXTRA(表多余)=${EXTRA.length}  MISS(表缺失)=${MISS.length}  DIFF(值不符)=${DIFF.length}  → DRIFT=${drift}`);
  if (MISS.length) console.log('MISS:', MISS.join(','));
  if (DIFF.length) console.log('DIFF:', JSON.stringify(DIFF));
  if (EXTRA.length) console.log('EXTRA:', EXTRA.join(','));
}
process.exit(drift === 0 ? 0 : 1);
