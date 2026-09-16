// ★FX53 全量普查②（重写版）：原版尘站提取——按【目标 id】定位 `type == N` 条件行，
//  花括号配平取整块,块内收集 Dust.NewDust/Direct/Perfect 站（顶层参切分,type=第4参）
//  + for 循环标记（频率线索）。用法: node tools/_fx53-vanilla-dust-scan.mjs [cs路径] <id...>
import fs from 'node:fs';

const argv = process.argv.slice(2);
let file = '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria/Projectile.cs';
let ids = [];
for (const a of argv) {
  if (a.endsWith('.cs')) file = a;
  else ids.push(...a.split(',').map(Number).filter(Number.isFinite));
}
const lines = fs.readFileSync(file, 'utf8').split('\n');

const methodAt = [];
lines.forEach((ln, i) => {
  const m = ln.match(/^\t(?:public|private|internal)\s+(?:async\s+)?[\w<>\[\],\s]+\s(AI_[\w]+|Update|Kill)\(/);
  if (m) methodAt.push({ line: i + 1, name: m[1] });
});
const methodOf = (no) => {
  let cur = null;
  for (const m of methodAt) { if (m.line > no) break; cur = m; }
  return cur ? `${cur.name}@${cur.line}` : '?';
};

/** 顶层参切分（配平 (),[],string） */
function topArgs(src) {
  const args = [];
  let depth = 0, cur = '', str = false;
  for (const ch of src) {
    if (str) { cur += ch; if (ch === '"') str = false; continue; }
    if (ch === '"') { str = true; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/** 从行内 call 起点提取调用源文（配平到闭括号） */
function readCall(i, startIdx) {
  let depth = 0, j = startIdx, src = '';
  while (i < lines.length) {
    const ln = lines[i];
    while (j < ln.length) {
      const ch = ln[j];
      src += ch;
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) return src; }
      j++;
    }
    src += ' ';
    i++; j = 0;
  }
  return src;
}

const out = {};
for (const id of ids) {
  const recs = [];
  const typeRe = new RegExp(`(?:else\\s+)?if\\s*\\([^()]*\\btype\\s*==\\s*${id}\\b`);
  for (let i = 0; i < lines.length; i++) {
    if (!typeRe.test(lines[i])) continue;
    // 花括号配平：从本行起找块体
    let depth = 0, started = false, end = i;
    for (let j = i; j < lines.length && j < i + 400; j++) {
      const ln = lines[j];
      for (const ch of ln) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }
      if (started && depth <= 0) { end = j; break; }
      end = j;
    }
    // 块内收集尘站
    for (let k = i; k <= end; k++) {
      const dm = lines[k].match(/Dust\.(NewDust|NewDustDirect|NewDustPerfect)\s*\(/);
      if (!dm) continue;
      const startIdx = lines[k].indexOf(dm[0]);
      const src = readCall(k, startIdx);
      const inner = src.slice(src.indexOf('(') + 1, src.lastIndexOf(')'));
      const args = topArgs(inner);
      const loop = /^(\t|\s)*for\s*\(/.test(lines[Math.max(0, k - 1)]) || /\bfor\s*\(\s*int\b/.test(lines[Math.max(0, k - 1)]);
      recs.push({
        method: methodOf(k), line: k + 1, dust: dm[1],
        type: args[3] ?? '?', alpha: args[6] ?? '', scale: args[8] ?? '',
        loopHeader: loop ? lines[Math.max(0, k - 1)].trim().slice(0, 80) : null,
        cond: lines[i].trim().slice(0, 110),
        call: lines[k].trim().slice(0, 150),
      });
    }
  }
  out[id] = recs;
}
console.log(JSON.stringify(out));
