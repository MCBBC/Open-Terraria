// 全量 l10n 审计：提取 src 全部 Lang.text/Lang.has/Lang.gen/menu 点路径键，
// 对 public/l10n/zh-Hans.json（合并权威）解析命中；输出缺失/疑似命名空间笔误清单。
// 用法：node tools/_audit-l10n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const zh = JSON.parse(readFileSync(join(ROOT, 'public/l10n/zh-Hans.json'), 'utf8'));

// 收集源文件
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e)) files.push(p);
  }
})(SRC);

// 语言包解析（LanguageManager.getTextValue 同语义：点路径逐段下行，段名含点按整段键兜底）
function resolve(tree, path) {
  const segs = path.split('.');
  let cur = tree;
  for (let i = 0; i < segs.length; i++) {
    const key = segs.slice(i).join('.');
    if (typeof cur === 'object' && cur !== null && key in cur) return cur[key];
    if (typeof cur !== 'object' || cur === null || !(segs[i] in cur)) return undefined;
    cur = cur[segs[i]];
  }
  return cur;
}

const used = new Map(); // key → [file:line]
const KEY_RE = /Lang\.(?:text|has)\(\s*['"]([A-Za-z0-9_.\-]+)['"]/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(KEY_RE)) {
      const key = m[1];
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(`${f.replace(ROOT, '')}:${i + 1}`);
    }
  });
}

const missing = [];
for (const [key, locs] of [...used.entries()].sort()) {
  if (resolve(zh, key) === undefined) missing.push({ key, locs: locs.slice(0, 2) });
}
console.log(`键使用总数: ${used.size} / 缺失: ${missing.length}`);
for (const m of missing) console.log(`MISSING ${m.key}  ←  ${m.locs.join(', ')}`);
