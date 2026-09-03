// IIII220 批取证仪⑤：x86 dmlog vs JS dmlog 段账对齐（rc 累计口径）。
// 用法：node tools/_iii220segcmp.mjs
import { readFileSync } from 'node:fs';
const OUT = process.env.SW_I220_OUT ?? '/tmp/iii220-out';
const x86 = readFileSync(`${OUT}/x86-dmlog.txt`, 'utf8').split('\n');
const js = readFileSync(`${OUT}/js-dmlog220.txt`, 'utf8').split('\n');

// 每侧抽取（tag, key, rc）：rc 取行内 rc=NNN（x86 行尾 rc=累计；JS 段行 rc=rollN）
const parse = (lines, tags) => {
  const rows = [];
  for (const l of lines) {
    const m = l.match(/^(\S+)\s+(.*)$/);
    if (!m) continue;
    const tag = m[1], rest = m[2];
    if (!tags.test(tag)) continue;
    const rm = rest.match(/rc=(\d+)/);
    rows.push({ tag, rest: rest.replace(/rc=\d+/, '').trim(), rc: rm ? Number(rm[1]) : -1 });
  }
  return rows;
};
const xrows = parse(x86, /^(TICE|LTRK|STRK|CAMP|MINE|MAHOG|SOK|swordAttempts|iceCount|campCount|trapCount|treeCount|longTrackCount|stdTrackCount|deadCount|deadCands|CHEST|CAND|TPFP|TPFS)$/);
const jrows = parse(js, /^(TICE|LTRK|STRK|CAMP|MINE|MAHOG|SOK|swordAttempts|iceCount|campCount|trapCount|treeCount|longTrackCount|stdTrackCount|deadCount|deadCands|CHEST|CAND|TPFP|TPFS)$/);
console.log(`x86 rows=${xrows.length}  JS rows=${jrows.length}`);
// 首差：逐行对齐 tag+rest（rc 另比对）
let i = 0;
const n = Math.min(xrows.length, jrows.length);
for (; i < n; i++) {
  const a = xrows[i], b = jrows[i];
  if (a.tag !== b.tag || a.rest !== b.rest) {
    console.log(`首差行 ${i}: x86=[${a.tag}] ${a.rest} (rc=${a.rc})  vs  JS=[${b.tag}] ${b.rest} (rc=${b.rc})`);
    console.log(`  x86 ctx: ${xrows.slice(Math.max(0, i - 3), i + 3).map((r) => `${r.tag}(${r.rest})`).join(' | ')}`);
    console.log(`  JS  ctx: ${jrows.slice(Math.max(0, i - 3), i + 3).map((r) => `${r.tag}(${r.rest})`).join(' | ')}`);
    break;
  }
  // rc 差监视（段界行）
}
if (i >= n) console.log(`前 ${n} 行 tag+rest 全同`);
// rc 序列对比（前 40 行）
console.log('\nrc 序列（x86 | JS | Δ）前 60 行:');
for (let k = 0; k < Math.min(60, n); k++) {
  const a = xrows[k], b = jrows[k];
  const d = (a.rc >= 0 && b.rc >= 0) ? b.rc - a.rc : '';
  console.log(`  ${String(k).padStart(3)} ${a.tag.padEnd(6)} ${a.rest.padEnd(28)} rc=${String(a.rc).padStart(10)} | ${b.tag.padEnd(6)} ${b.rest.padEnd(28)} rc=${String(b.rc).padStart(10)} Δ=${d}`);
}
