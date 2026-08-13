// 从 Terarria1456 Projectile.StatusNPC 提取"投射物命中 → 敌怪 debuff"表。
// 语义基准:Projectile.cs StatusNPC(~:10555-11065),由 StrikeNPC:12757 在每次命中敌怪后调用。
// 解析形态:
//   if (type == N [&& Main.rand.Next(K) == 0]) { [if (Main.rand.Next(K) == 0) {] nPC.AddBuff(B, D); [}] }
//   D ∈ { 常量 | Main.rand.Next(a,b) | 60 * Main.rand.Next(a,b) }  (单位 tick)
// 复杂形状(2026-08-13 G7 扩展,均带 gate 标记 + src 行号):
//   · cond 侧运行时门:`ai[1] == (float)i`(定向 tag,598/636/971/975/614 族)、
//     `Main.player[owner].setHuntressT2`(套装门,694-696)——拆出记 gate 后继续提取
//   · 体内局部变量门:`int numN = C; if (Main.remixWorld) { numN = ALT; }`(954/979/15,
//     取基档 C,remix 秘密种子分支记 gate)与 `int numN = ((ai[0] == 1f) ? A : B);`(85,
//     取 else 档 B,ai0 分支记 gate)
// 仍解不开的形状打 SKIP+行号留人工(meleeEnchant/frostBurn/magmaStone 三块为
// "无 type==N"的运行时配件门,由 projStatus.ts 的 applyMeleeImbue/applyFrostBurn/
// applyMagmaStoneProj 承接,不入表)。
// 产物:src/data/vanilla-projstatus.json —— { "<projType>": [{buff, chance, durMin, durMax, src, gate?}] }
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

// ---- 顶层 if / else-if 块切分(方法体内 depth==1 的 if;记 src 源码行号) ----
const blocks = [];
let cur = null, d = 0;
for (let i = 0; i < body.length; i++) {
  const line = body[i];
  const condMatch = /^\t\t(?:else )?if \((.+)\) ?$/.exec(line);
  if (d === 1 && condMatch) {
    cur = { cond: condMatch[1], bodyLines: [], srcLine: start + 1 + i };
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
  // Oiled 族(694-696 setHuntressT2 门,G7 已入表):Main.rand.Next(a, b) * 30
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
  const gates = [];
  let cond = b.cond;
  const srcLine = b.srcLine;
  // ---- cond 侧运行时门(2026-08-13 G7):拆出记 gate,剩余条件继续走类型门 ----
  // ai[1] == (float)i = 定向 tag(附着弹只对锁定目标生效)。时序实证:StrikeNPC
  //   :12421-12427 `if (aiStyle == 113 && ai[0] < 2f) { ai[0]=1; ai[1]=victimIndex; }`
  //   先于 :12757 StatusNPC(victimIndex) 执行 → 首次命中恒满足;repo 侧附着弹
  //   (598/636/971/975/614)无 ai[1] 追踪态,单次命中语义下等价恒真,gate 留档
  if (/\bai\[1\] == \(float\)i\b/.test(cond)) {
    gates.push('ai1==i');
    cond = cond.replace(/\s*&&\s*ai\[1\] == \(float\)i/, '');
  }
  // setHuntressT2 套装门(Player.cs:16119-16122/16145-16149):运行时须校验穿戴
  if (/Main\.player\[owner\]\.setHuntressT2/.test(cond)) {
    gates.push('setHuntressT2');
    cond = cond.replace(/\s*&&\s*Main\.player\[owner\]\.setHuntressT2/, '');
  }
  // bodyLines[0] 是 cond 行本身——已拆门后单独解析,体解析从第二行起
  // (否则 cond 里的 ai[1]/player 门会让下方"复杂块"守卫误拦)
  const bodyText = b.bodyLines.slice(1).join('\n');
  // ---- 体内局部变量门(2026-08-13 G7):拆出记 gate,变量解析进 buff 常量 ----
  const lv = {}; // numN → buff 常量(取基档/else 档)
  let bodyWork = bodyText;
  // remix 秘密种子重赋值:`if (Main.remixWorld) { numN = ALT; }`(954/979/15)——
  //   repo 不跟踪 remixWorld 恒 false → 基档生效,ALT 分支记 gate
  bodyWork = bodyWork.replace(/if \(Main\.remixWorld\)\s*\{\s*(num\d+) = (\d+);\s*\}/g, (_m, n, alt) => {
    void n; gates.push(`remixWorld→${alt}`);
    return '';
  });
  // 常量声明:`int numN = C;`
  bodyWork = bodyWork.replace(/int (num\d+) = (\d+);/g, (_m, n, v) => { lv[n] = +v; return ''; });
  // ai 三元:`int numN = ((ai[0] == Vf) ? A : B);`(85 彩虹魔棒弹)——取 else 档 B,
  //   ai0==V 分支(附着态)记 gate;repo 弹无 ai0 态,默认档与原版常态一致
  bodyWork = bodyWork.replace(/int (num\d+) = \(\(ai\[(\d+)\] == (\d+)f\) \? (\d+) : (\d+)\);/g, (_m, n, slot, v, a, bv) => {
    lv[n] = +bv; gates.push(`ai${slot}==${v}→${a}`);
    return '';
  });
  const gate = gates.length ? gates.join('+') : undefined;
  const resolveBuff = (s) => (/^\d+$/.test(s) ? +s : (lv[s] !== undefined ? lv[s] : null));
  // 类型门:type == N(单个或 || 连列) + 区间 type >= A && type <= B(2026-08-13 补:
  // 390-392/399-402/1107-1109 三族区间块此前被拒)。其余变量类型门仍跳过。
  const typeIdsEq = [...cond.matchAll(/\btype == (\d+)\b/g)].map((m) => +m[1]);
  const typeIdsRange = [...cond.matchAll(/\btype >= (\d+) && type <= (\d+)\b/g)].flatMap((m) => {
    const out = [];
    for (let t = +m[1]; t <= +m[2]; t++) out.push(t);
    return out;
  });
  const typeIds = [...new Set([...typeIdsEq, ...typeIdsRange])];
  if (!typeIds.length) { skipped.push([b.cond, `无 type==N(:${srcLine})`]); continue; }
  const strippedType = cond
    .replace(/\btype == \d+\b/g, '')
    .replace(/\btype >= \d+ && type <= \d+\b/g, '')
    .replace(/[()|&\s]/g, '');
  if (/type[<>]=?\d|type>=|type<=/.test(strippedType)) { skipped.push([b.cond, `剩余区间/变量类型门(:${srcLine})`]); continue; }
  // cond 内仍含套装/世界分支等未识别条件门 → 复杂块跳过
  if (/setHuntress|remixWorld|ai\[|player\[/.test(cond)) { skipped.push([b.cond, `cond 复杂门(:${srcLine})`]); continue; }
  // 复杂语义:定向命中/套装门/世界分支/玩家状态
  if (/ai\[|setHuntress|remixWorld|player\[|Mounted|npc\[|whipSettings|num\d+ *=/.test(cond + bodyWork) && !/Main\.rand/.test(bodyWork.replace(/Main\.rand\.Next\([^)]+\) *[=!]= 0/g, ''))) {
    // 仅当体内除 rand 判定与 AddBuff 外还有实质逻辑才跳过
    const stripped = bodyWork
      .replace(/nPC\.AddBuff\([^;]+;/g, '')
      .replace(/if \(Main\.rand\.Next\(\d+\) ==?=? ?0\) \{?\}?/g, '')
      .replace(/[{}]/g, '').trim();
    if (stripped.length > 2) { skipped.push([b.cond, `复杂块(:${srcLine}):` + stripped.slice(0, 60)]); continue; }
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
  const adds = [...bodyWork.matchAll(/nPC\.AddBuff\((\d+|num\d+), (.+?)\);/g)]
    .map((m) => ({ buff: resolveBuff(m[1]), dExprRaw: m[2] }))
    .filter((a) => a.buff !== null);
  if (!adds.length) { skipped.push([b.cond, `无 AddBuff(:${srcLine})`]); continue; }
  // a) 嵌套双分支(压平空白匹配:`if (rand(K)==0) { A } else { B }`)
  const flat = bodyWork.replace(/\s+/g, ' ');
  const twoBranch = /if \(Main\.rand\.Next\((\d+)\) == 0\) \{ nPC\.AddBuff\((\d+|num\d+), (.+?)\); \} else \{ nPC\.AddBuff\((\d+|num\d+), (.+?)\); \}/.exec(flat);
  const nestedGate = /if \(Main\.rand\.Next\(\d+\)/.test(bodyWork);
  if (twoBranch && adds.length === 2) {
    const k = +twoBranch[1];
    const pairs = [[twoBranch[2], twoBranch[3], chanceOuter / k], [twoBranch[4], twoBranch[5], chanceOuter * (k - 1) / k]];
    // ★互斥组(2026-08-13 语义修正):原版 if/else 是"单掷骰二选一必中其一",
    //   两条独立掷骰会让双落空/双中——同型两条标同一 mut id,运行时单掷按累积概率选
    const mutId = ++mutSeq;
    for (const [buffS, dExprRaw, chance] of pairs) {
      const buffV = resolveBuff(buffS);
      if (buffV === null) { skipped.push([b.cond, `buff 变量不识别(:${srcLine}): AddBuff(${buffS}, …)`]); continue; }
      const dur = parseDur(dExprRaw.trim());
      if (!dur) { skipped.push([b.cond, `时长表达式不识别(:${srcLine}): AddBuff(${buffS}, ${dExprRaw})`]); continue; }
      for (const t of typeIds) (table[t] ??= []).push({ buff: buffV, chance, mut: mutId, src: srcLine, ...(gate ? { gate } : {}), ...dur });
    }
    continue;
  }
  if (nestedGate && adds.length > 1) { skipped.push([b.cond, `多 AddBuff+嵌套门(形状未识别,:${srcLine})`]); continue; }
  // b/c) 单 chance = 外层 × 体内单门
  let chance = chanceOuter;
  if (nestedGate) {
    const nc = /Main\.rand\.Next\((\d+)\) *== *0/.exec(bodyWork);
    const nc2 = /Main\.rand\.Next\((\d+)\) *!= *0/.exec(bodyWork);
    if (nc) chance *= 1 / +nc[1];
    else if (nc2) chance *= 1 - 1 / +nc2[1];
  }
  for (const a of adds) {
    const buff = a.buff;
    const dExpr = a.dExprRaw.trim();
    const dur = parseDur(dExpr);
    if (!dur) { skipped.push([b.cond, `时长表达式不识别(:${srcLine}): AddBuff(${buff}, ${dExpr})`]); continue; }
    for (const t of typeIds) {
      (table[t] ??= []).push({ buff, chance, src: srcLine, ...(gate ? { gate } : {}), ...dur });
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
