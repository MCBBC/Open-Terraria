// ★FX53 全量普查①（重写版）：本仓敌方弹幕 id 全集——括号配平的顶层参切分,
//  按五个出口的签名位取 projId：spawnHostileProj@6 / shoot@6 / shootDart@7 /
//  new Arrow@6 / new Dart@5。三元/变量参如实记录 ctx（不做猜解析）。
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith('.ts')) files.push(p);
  }
})(SRC);

const ENEMY_FILES = /entities\/(Enemy|bossAI|fighterFamilies|mechQueen)/;
const found = new Map();
const add = (id, file, line, ctx, exit) => {
  if (!Number.isInteger(id) || id <= 0) return;
  if (!found.has(id)) found.set(id, []);
  found.get(id).push({ file: path.relative(SRC, file), line, exit, ctx: ctx.replace(/\s+/g, ' ').trim().slice(0, 200) });
};

/** 从 ( 起配平读取完整调用源文 */
function readCall(lines, i, startIdx) {
  let depth = 0, j = startIdx, src = '';
  while (i < lines.length) {
    const ln = lines[i];
    let str = false;
    while (j < ln.length) {
      const ch = ln[j];
      if (str) { src += ch; if (ch === '"' && ln[j - 1] !== '\\') str = false; j++; continue; }
      if (ch === '"') str = true;
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

function topArgs(src) {
  const args = [];
  let depth = 0, cur = '', str = false;
  for (const ch of src) {
    if (str) { cur += ch; if (ch === '"') str = false; continue; }
    if (ch === '"') { str = true; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

const SHAPES = [
  { re: /\bspawnHostileProj\(/g, idx: 6, exit: 'spawnHostileProj' },
  { re: /[^.\w]shoot\(/g, idx: 6, exit: 'shoot' },
  { re: /\bshootDart\(/g, idx: 7, exit: 'shootDart' },
  { re: /\bnew Arrow\(/g, idx: 6, exit: 'new Arrow' },
  { re: /\bnew Dart\(/g, idx: 5, exit: 'new Dart' },
];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    for (const sh of SHAPES) {
      sh.re.lastIndex = 0;
      let m;
      while ((m = sh.re.exec(ln))) {
        const src = readCall(lines, i, m.index);
        const args = topArgs(src.slice(src.indexOf('(') + 1, src.lastIndexOf(')')));
        const raw = args[sh.idx];
        if (raw == null) continue;
        if (/^\d+$/.test(raw)) add(+raw, file, i + 1, ln, sh.exit);
        else add(-1, file, i + 1, `[${sh.exit} 非字面参: ${raw}] ` + ln, sh.exit);
      }
    }
  }
}

const out = {};
for (const [id, recs] of [...found.entries()].sort((a, b) => a[0] - b[0])) {
  out[id] = recs.filter(r => ENEMY_FILES.test(r.file) || r.ctx.includes('非字面参'));
}
console.log(JSON.stringify(out));
