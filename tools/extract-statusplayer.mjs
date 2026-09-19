// 从 Terarria1457 Projectile.StatusPlayer 提取"敌对弹幕命中 → 玩家 debuff"表。
// ★BJ183 2026-09-20 基准对齐 1456→1457(新增 1117→399 / 1122→400 两型)。
// 语义基准:Projectile.cs:12123-12404(StatusPlayer),两处调用点:
//   Damage_EVP      :14846-14945(Hurt>0 且未死 → StatusPlayer;Damage_EVP 门禁
//                     :14852 要求 hostile——此路径弹体恒 hostile)
//   SelfHurtPlayers :15104-15134(爆炸/非 hostile 弹自伤路径,无 hostile 门;
//                     1456 旧名 BombsHurtPlayers:13944)
// 每块形状:`if (type == N [&& 掷骰/!hostile]) { ApplyBuffTo(player, B, D) | 嵌套 if 链 }`。
// 本方法与 StatusNPC 不同——无 ai[] 门,全部条件可编码,故提取目标 = 零跳过。
//
// 产物 AST(src/data/vanilla-statusplayer.json),节点语义:
//   { b, d }            ApplyBuffTo(player, b, d) 叶子(d 见下)
//   { g: [atom], t, e } 单门:全部 atom 成立走 t,否则 e(可缺)
//   { i: [arm], e }     if/else-if 链:依序找首个 gate 全成的 arm,全落空走 e
//   { a: [node] }       顺序全执行(同型多块/多 ApplyBuffTo)
//   arm = { g: [atom], t }
//   atom = { r: [K,"eq"|"ne"|"ge",阈值?] }  Main.rand.Next(K) ==0 / !=0 / >=n
//        | { expert: 1 }                    Main.expertMode
//        | { hostile: 0 }                   !hostile
//        | { frozen: 0 }                    !player.frozen
//   d = 常量(tick) | { n: [a,b] }(Next(a,b)) | { n: [a,b], m: 60 }(60×Next(a,b))
// 与 extract-projstatus.mjs(StatusNPC 扁平 chance 表)不同:本方法大量嵌套 else-if
// 链与顺序掷骰(348 三级 Frozen 门 = 逐条独立 Next),扁平 chance 无法表达时序,
// 故用 AST。Next(a,b) 含头不含尾——durMax = b-1 由运行时掷骰自然兑现。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SRC = join(ROOT, '..', 'Terarria1457', 'Terraria', 'Projectile.cs');
const OUT = join(ROOT, 'src', 'data', 'vanilla-statusplayer.json');
const AUDIT = process.argv.includes('--audit'); // 自审计:不写文件,stdout 出计数+跳过

// ---- 提取完成的硬预期(源码漂移护栏):原版 1.4.5.7 恰好 50 型/44 块/零跳过 ----
// (1.4.5.6 为 48/42;1457 新增 1117/1122 两型,BJ183 对拍定谳)
const EXPECT_TYPES = 50;
const EXPECT_BLOCKS = 44;

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);

// ---- 定位 StatusPlayer 方法体 ----
const start = lines.findIndex((l) => l.includes('public void StatusPlayer('));
if (start < 0) throw new Error('StatusPlayer not found');
let end = start + 1, depth = 0, began = false;
for (let i = start + 1; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
  if (lines[i].includes('{')) began = true;
  if (began && depth === 0) { end = i; break; }
}
const body = lines.slice(start, end + 1);
console.log(`StatusPlayer: lines ${start + 1}-${end + 1} (${body.length} 行)`);

// ---- 顶层 if / else-if 块切分(方法体 depth==1 处,条件须含 type 谓词) ----
const blocks = [];
let cur = null, d = 0;
for (const line of body) {
  const t = line.trim();
  if (d === 1 && /^(?:else )?if \(type\b/.test(t)) {
    cur = { cond: /^(?:else )?if \((.+)\)$/.exec(t)[1], bodyLines: [] };
    blocks.push(cur);
  }
  if (cur) cur.bodyLines.push(line);
  d += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  if (cur && d <= 1 && line.includes('}')) cur = null;
}
console.log(`顶层条件块: ${blocks.length}`);

// ---- 条件解析 → { typeIds, atoms } ----
// requireType:顶层块条件必须含 type 谓词;嵌套 if 条件(纯掷骰/expert/!frozen)无 type
const skipped = [];
function parseCond(cond, where, requireType = false) {
  const ids = [];
  let s = ' ' + cond + ' ';
  // 区间谓词先行摘除(type >= A && type <= B)
  s = s.replace(/\s*type >= (\d+) && type <= (\d+)\s*/g, (_m, a, b) => {
    for (let t = +a; t <= +b; t++) ids.push(t);
    return ' ';
  });
  // 等值谓词(可 || 连列)
  s = s.replace(/\s*type == (\d+)\s*/g, (_m, n) => { ids.push(+n); return ' '; });
  const atoms = [];
  for (const raw of s.split(/&&|\|\|/)) {
    const a = raw.trim();
    if (!a) continue;
    let m;
    if ((m = /^Main\.rand\.Next\((\d+)\) == (\d+)$/.exec(a))) atoms.push({ r: [+m[1], 'eq', +m[2]] });
    else if ((m = /^Main\.rand\.Next\((\d+)\) != (\d+)$/.exec(a))) atoms.push({ r: [+m[1], 'ne', +m[2]] });
    else if ((m = /^Main\.rand\.Next\((\d+)\) >= (\d+)$/.exec(a))) atoms.push({ r: [+m[1], 'ge', +m[2]] });
    else if (a === 'Main.expertMode') atoms.push({ expert: 1 });
    else if (a === '!hostile') atoms.push({ hostile: 0 });
    else if (a === '!player.frozen') atoms.push({ frozen: 0 });
    else throw new Error(`未知条件原子 "${a}" @ ${where}`);
  }
  if (requireType && !ids.length) throw new Error(`无 type 谓词 @ ${where}`);
  return { typeIds: [...new Set(ids)], atoms };
}

// ---- 时长解析 → number | { n:[a,b] } | { n:[a,b], m:60 } ----
function parseDur(expr) {
  const e = expr.trim();
  let m;
  if ((m = /^(\d+)$/.exec(e))) return +m[1];
  if ((m = /^Main\.rand\.Next\((\d+), (\d+)\)$/.exec(e))) return { n: [+m[1], +m[2]] };
  if ((m = /^60 \* Main\.rand\.Next\((\d+), (\d+)\)$/.exec(e))) return { n: [+m[1], +m[2]], m: 60 };
  return null;
}

// ---- 语句序列解析(递归;lines 为块体行,首行须为 '{') ----
function parseSeq(ls, where) {
  // ls[0].trim() === '{',末行 '}'。单语句体直接压平(省 JSON 噪音)
  const inner = ls.slice(1, ls.length - 1);
  const stmts = parseStmts(inner, 0, inner.length, where);
  return stmts.length === 1 ? stmts[0] : { a: stmts };
}
function parseStmts(ls, from, to, where) {
  const out = [];
  let i = from;
  while (i < to) {
    const t = ls[i].trim();
    let m;
    if ((m = /^ApplyBuffTo\(player, (\d+), (.+)\);$/.exec(t))) {
      const dur = parseDur(m[2]);
      if (dur === null) throw new Error(`时长表达式不识别: ${m[2]} @ ${where}`);
      out.push({ b: +m[1], d: dur });
      i++;
      continue;
    }
    if ((m = /^(?:else )?if \((.+)\)$/.exec(t))) {
      // 收集同一 if/else-if 链的所有臂
      const arms = [];
      let elseBody = null;
      let j = i;
      while (j < to) {
        const tj = ls[j].trim();
        let cm;
        if ((cm = /^(?:else )?if \((.+)\)$/.exec(tj))) {
          const cond = cm[1];
          // 体 = 下一行 '{' 起至配平 '}'
          let k = j + 1, dep = 0, started = false;
          for (; k < to; k++) {
            dep += (ls[k].match(/\{/g) ?? []).length - (ls[k].match(/\}/g) ?? []).length;
            if (ls[k].includes('{')) started = true;
            if (started && dep === 0) break;
          }
          arms.push({ cond, body: ls.slice(j + 1, k + 1) });
          j = k + 1;
          // 链尾判断:下一行是 'else if' / 'else' 则续;否则断
          if (j < to && /^\}?\s*else if /.test(ls[j])) { /* 续臂 */ }
          else if (j < to && ls[j].trim() === 'else') {
            // else 体 = 再下一行 '{' 起至配平
            let k2 = j + 1, dep2 = 0, started2 = false;
            for (; k2 < to; k2++) {
              dep2 += (ls[k2].match(/\{/g) ?? []).length - (ls[k2].match(/\}/g) ?? []).length;
              if (ls[k2].includes('{')) started2 = true;
              if (started2 && dep2 === 0) break;
            }
            elseBody = ls.slice(j + 1, k2 + 1);
            j = k2 + 1;
            break;
          } else break;
        } else break;
      }
      // 生成节点:多臂 → { i:[arm] }(+可选 e);单臂 → { g, t }(+可选 e)
      if (arms.length === 1) {
        const atoms = parseCond(arms[0].cond, where);
        const node = { g: atoms.atoms, t: parseSeq(arms[0].body, where) };
        if (elseBody) node.e = parseSeq(elseBody, where);
        out.push(node);
      } else {
        const node = { i: arms.map((a) => ({ g: parseCond(a.cond, where).atoms, t: parseSeq(a.body, where) })) };
        if (elseBody) node.e = parseSeq(elseBody, where);
        out.push(node);
      }
      i = j;
      continue;
    }
    throw new Error(`未识别语句 "${t}" @ ${where}`);
  }
  return out;
}

// ---- 逐块解析 → 汇表 ----
const table = {};
let blockOk = 0;
for (const b of blocks) {
  const where = `cond "${b.cond.slice(0, 50)}"`;
  try {
    const { typeIds, atoms } = parseCond(b.cond, where, true);
    // 块体 = cond 行之后的 '{...}' 整体(parseSeq 摘首尾花括号)
    const node = parseSeq(b.bodyLines.slice(1), where);
    if (atoms.length) node.g = atoms; // 外层条件门(掷骰/!hostile)
    for (const t of typeIds) (table[t] ??= []).push(node);
    blockOk++;
  } catch (e) {
    skipped.push([b.cond.slice(0, 90), e.message]);
  }
}

const types = Object.keys(table).length;
console.log(`提取: ${types} 型号 / ${blockOk} 块解析成功 / ${skipped.length} 跳过`);
for (const [c, why] of skipped) console.log(`  SKIP ${c}  ← ${why}`);

// ---- 护栏:类型数/块数/零跳过,任一不符即非零退出 ----
const drift = [];
if (types !== EXPECT_TYPES) drift.push(`型号 ${types} ≠ ${EXPECT_TYPES}`);
if (blockOk !== EXPECT_BLOCKS) drift.push(`块数 ${blockOk} ≠ ${EXPECT_BLOCKS}`);
if (skipped.length) drift.push(`跳过 ${skipped.length} ≠ 0`);
if (drift.length) {
  console.error('DRIFT: ' + drift.join('; '));
  process.exitCode = 1;
}

if (AUDIT) {
  process.stdout.write(JSON.stringify({
    types, blocks: blockOk, skipped: skipped.length,
    perType: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.length])),
  }));
} else if (!drift.length) {
  // 单块型直接压平数组(AST 顶层本就是 {a:[...]})
  const flat = {};
  for (const [k, v] of Object.entries(table)) flat[k] = v.length === 1 ? v[0] : { a: v };
  // ---- StatusPvP 重放补丁(BJ183 2026-09-20):本提取器语义域 = StatusPlayer,
  //      但 1127 (月球领主炎弹) 的【PvP 命中】走 StatusPvP(1457 :11761,ApplyBuffTo
  //      (player, 397, 300) @:12017)——PC57 案此前手并入表,重产即失。按 npcdrops
  //      1457 补丁先例在此重放,重跑不丢(1456 StatusPvP 同值)。
  flat['1127'] = { b: 397, d: 300 };
  writeFileSync(OUT, JSON.stringify(flat, null, 1) + '\n');
  console.log(`写入 ${OUT}`);
}
