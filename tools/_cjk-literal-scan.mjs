// 一次性:扫玩家可见的硬编码中文字符串(l10n 遗留审查)。正经状态机剥注释后取串。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 玩家可见面:UI 面板/vui/HUD 渲染/toast/chat。诊断日志与 worldgen 内部不列。
const TARGETS = [
  'src/ui', 'src/vui', 'src/render/Renderer.ts', 'src/core/Game.ts',
  'src/core/DebugSummonPanel.ts', 'src/core/Options.ts', 'src/core/Sfx.ts',
];
import { readdirSync, statSync } from 'node:fs';
function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
const files = [];
for (const t of TARGETS) {
  const p = join(ROOT, t);
  files.push(...(statSync(p).isDirectory() ? collect(p) : [p]));
}
/** 剥 // 与 /* *\/ 注释(保字符串字面量内的注释符) */
function stripComments(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i]; i++;
      }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
const hits = [];
for (const f of files) {
  const code = stripComments(readFileSync(f, 'utf8'));
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (/[一-鿿]/.test(m[2])) {
        hits.push(`${f.replace(ROOT + '/', '')}:${i + 1}: ${m[2].replace(/\n/g, ' ').slice(0, 70)}`);
      }
    }
  });
}
console.log(hits.join('\n'));
console.log('== 共', hits.length, '处(玩家可见面)');
