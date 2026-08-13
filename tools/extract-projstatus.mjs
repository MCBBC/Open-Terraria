// 从 Terarria1456 Projectile.StatusNPC 提取"投射物命中 → 敌怪 debuff"表。
// 语义基准:Projectile.cs StatusNPC(~:10555-11065),由 StrikeNPC:12757 在每次命中敌怪后调用。
// 解析形态:
//   if (type == N [&& Main.rand.Next(K) == 0]) { [if (Main.rand.Next(K) == 0) {] nPC.AddBuff(B, D); [}] }
//   D ∈ { 常量 | Main.rand.Next(a,b) | 60 * Main.rand.Next(a,b) }  (单位 tick)
// 复杂条件(ai[1]==i 定向 / setHuntressT2 / remixWorld / 变量时长)跳过并打印供人工 PATCH。
// 产物:src/data/vanilla-projstatus.json —— { "<projType>": [{buff, chance, durMin, durMax(tick)}] }
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SRC = join(ROOT, '..', 'Terarria1456', 'Terraria', 'Projectile.cs');
const OUT = join(ROOT, 'src', 'data', 'vanilla-projstatus.json');
const AUDIT = process.argv.includes('--audit'); // 自审计:不写文件,stdout 出 {types,entries,skipped}

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);
// ---- 定位 StatusNPC 方法体 ----
const start = lines.findIndex((l) => l.includes('public void StatusNPC('));
if (start < 0) throw new Error('StatusNPC not found');
let end = start + 1, depth = 0, began = false;
for (let i = start + 1; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
  if (lines[i].includes('{')) began = true;
  if (began && depth === 0) { end = i; break; }
}
const body = lines.slice(start, end + 1);
console.log(`StatusNPC: lines ${start + 1}-${end + 1} (${body.length} 行)`);

// ---- 顶层 if / else-if 块切分(方法体内 depth==1 的 if) ----
const blocks = [];
let cur = null, d = 0;
for (const line of body) {
  const condMatch = /^\t\t(?:else )?if \((.+)\) ?$/.exec(line.trim() ? line : '') || (d === 1 && /^\t\t(?:else )?if \((.+)\) ?$/.test(line) ? /^\t\t(?:else )?if \((.+)\) ?$/.exec(line) : null);
  if (d === 1 && condMatch) {
    cur = { cond: condMatch[1], bodyLines: [] };
    blocks.push(cur);
  }
  if (cur) cur.bodyLines.push(line);
  d += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  if (cur && d <= 1 && line.includes('}')) cur = null;
}
console.log(`顶层条件块: ${blocks.length}`);

// ---- 逐块解析 ----
const table = {};
const skipped = [];
let mutSeq = 0;

/** 时长表达式 → {durMin, durMax}(tick);不识别返回 null */
function parseDur(dExpr) {
  const mul = /^60 \* Main\.rand\.Next\((\d+), (\d+)\)$/.exec(dExpr);
  const rng = /^Main\.rand\.Next\((\d+), (\d+)\)$/.exec(dExpr);
  const one = /^Main\.rand\.Next\((\d+)\)$/.exec(dExpr);
  // confused 族:60 * (int)((double)Main.rand.Next(a, b) * 0.1) → 60×[trunc(a×0.1)..trunc((b-1)×0.1)]
  const mulF = /^60 \* \(int\)\(\(double\)Main\.rand\.Next\((\d+), (\d+)\) \* 0\.1\)$/.exec(dExpr);
  // Oiled 族(套装门已跳过,兜底):Main.rand.Next(a, b) * 30
  const rng30 = /^Main\.rand\.Next\((\d+), (\d+)\) \* 30$/.exec(dExpr);
  if (mul) return { durMin: 60 * +mul[1], durMax: 60 * (+mul[2] - 1) };
  if (rng) return { durMin: +rng[1], durMax: +rng[2] - 1 };
  if (one) return { durMin: 0, durMax: +one[1] - 1 }; // 裸 Next(K)=0..K-1 tick(勿×60,2026-08-13 review)
  if (mulF) return { durMin: 60 * Math.trunc(+mulF[1] * 0.1), durMax: 60 * Math.trunc((+mulF[2] - 1) * 0.1) };
  if (rng30) return { durMin: 30 * +rng30[1], durMax: 30 * (+rng30[2] - 1) };
  if (/^\d+$/.test(dExpr)) return { durMin: +dExpr, durMax: +dExpr };
  return null;
}
for (const b of blocks) {
  const cond = b.cond;
  const bodyText = b.bodyLines.join('\n');
  // 类型门:仅接受 type == N(单个或 || 连列的多个 ==),拒绝区间/变量
  const typeIds = [...cond.matchAll(/\btype == (\d+)\b/g)].map((m) => +m[1]);
  if (!typeIds.length) { skipped.push([cond, '无 type==N']); continue; }
  if (/type\s*[<>]=?|type >=|type <=/.test(cond.replace(/\btype == \d+\b/g, ''))) { skipped.push([cond, '区间/变量类型门']); continue; }
  // cond 内含套装/世界分支等条件门 → 按复杂块跳过(setHuntressT2 等运行时另行处理)
  if (/setHuntress|remixWorld|ai\[|player\[/.test(cond)) { skipped.push([cond, 'cond 复杂门']); continue; }
  // 复杂语义:定向命中/套装门/世界分支/玩家状态
  if (/ai\[|setHuntress|remixWorld|player\[|Mounted|npc\[|whipSettings|num\d+ *=/.test(cond + bodyText) && !/Main\.rand/.test(bodyText.replace(/Main\.rand\.Next\([^)]+\) *[=!]= 0/g, ''))) {
    // 仅当体内除 rand 判定与 AddBuff 外还有实质逻辑才跳过
    const stripped = bodyText
      .replace(/nPC\.AddBuff\([^;]+;/g, '')
      .replace(/if \(Main\.rand\.Next\(\d+\) ==?=? ?0\) \{?\}?/g, '')
      .replace(/[{}]/g, '').trim();
    if (stripped.length > 2) { skipped.push([cond, '复杂块:' + stripped.slice(0, 60)]); continue; }
  }
  // 概率门分两层:cond 外层门 + 体内嵌套门。
  // ★ else 分支陷阱(2026-08-13 review 实锤):嵌套 `if (rand(K)==0) {A} else {B}` 的
  //   else 概率是 (K-1)/K 而非 1/K——此前 cond+body 首个 rand 匹配一把抓,285/267/
  //   504/163 族 else 分支全被标错。现按形状分流:
  //   a) 嵌套双分支(A/else B)→ A=outer×1/K,B=outer×(K-1)/K
  //   b) 嵌套单门包单 AddBuff(35/948 族)→ chance=outer×1/K(或 !=0 → 1-1/K)
  //   c) 其余多 AddBuff+嵌套门 → 防御性跳过(人工核对)
  let chanceOuter = 1;
  const oc = /Main\.rand\.Next\((\d+)\) *== *0/.exec(cond);
  const oc2 = /Main\.rand\.Next\((\d+)\) *!= *0/.exec(cond);
  if (oc) chanceOuter = 1 / +oc[1];
  else if (oc2) chanceOuter = 1 - 1 / +oc2[1];
  const adds = [...bodyText.matchAll(/nPC\.AddBuff\((\d+), (.+?)\);/g)];
  if (!adds.length) { skipped.push([cond, '无 AddBuff']); continue; }
  // a) 嵌套双分支(压平空白匹配:`if (rand(K)==0) { A } else { B }`)
  const flat = bodyText.replace(/\s+/g, ' ');
  const twoBranch = /if \(Main\.rand\.Next\((\d+)\) == 0\) \{ nPC\.AddBuff\((\d+), (.+?)\); \} else \{ nPC\.AddBuff\((\d+), (.+?)\); \}/.exec(flat);
  const nestedGate = /if \(Main\.rand\.Next\(\d+\)/.test(bodyText);
  if (twoBranch && adds.length === 2) {
    const k = +twoBranch[1];
    const pairs = [[twoBranch[2], twoBranch[3], chanceOuter / k], [twoBranch[4], twoBranch[5], chanceOuter * (k - 1) / k]];
    // ★互斥组(2026-08-13 语义修正):原版 if/else 是"单掷骰二选一必中其一",
    //   两条独立掷骰会让双落空/双中——同型两条标同一 mut id,运行时单掷按累积概率选
    const mutId = ++mutSeq;
    for (const [buffS, dExprRaw, chance] of pairs) {
      const dur = parseDur(dExprRaw.trim());
      if (!dur) { skipped.push([cond, `时长表达式不识别: AddBuff(${buffS}, ${dExprRaw})`]); continue; }
      for (const t of typeIds) (table[t] ??= []).push({ buff: +buffS, chance, mut: mutId, ...dur });
    }
    continue;
  }
  if (nestedGate && adds.length > 1) { skipped.push([cond, '多 AddBuff+嵌套门(形状未识别)']); continue; }
  // b/c) 单 chance = 外层 × 体内单门
  let chance = chanceOuter;
  if (nestedGate) {
    const nc = /Main\.rand\.Next\((\d+)\) *== *0/.exec(bodyText);
    const nc2 = /Main\.rand\.Next\((\d+)\) *!= *0/.exec(bodyText);
    if (nc) chance *= 1 / +nc[1];
    else if (nc2) chance *= 1 - 1 / +nc2[1];
  }
  for (const a of adds) {
    const buff = +a[1];
    const dExpr = a[2].trim();
    const dur = parseDur(dExpr);
    if (!dur) { skipped.push([cond, `时长表达式不识别: AddBuff(${buff}, ${dExpr})`]); continue; }
    for (const t of typeIds) {
      (table[t] ??= []).push({ buff, chance, ...dur });
    }
  }
}

const types = Object.keys(table).length;
const entries = Object.values(table).reduce((s, v) => s + v.length, 0);
console.log(`提取: ${types} 型号 / ${entries} 条`);
console.log(`跳过 ${skipped.length} 块(人工核对):`);
for (const [c, why] of skipped) console.log(`  SKIP ${c.slice(0, 80)}  ← ${why}`);

if (AUDIT) {
  process.stdout.write(JSON.stringify({ types: Object.keys(table).length,
    entries: Object.values(table).reduce((n, v) => n + v.length, 0),
    skipped: skipped.length, skippedKinds: skipped.map((x) => x[1]).slice(0, 20) }));
  process.exit(skipped.length > 25 ? 1 : 0); // 跳过数基数护栏(语义修正后基线 ~16)
}
writeFileSync(OUT, JSON.stringify(table, null, 1) + '\n');
console.log(`写入 ${OUT}`);
