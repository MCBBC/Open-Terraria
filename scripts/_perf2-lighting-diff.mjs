// perf2 光照对账:比较两个 RUN_TAG 的 /tmp/perf2-lighting/<tag>/<scene>.json。
// 输出:①逐帧哈希序列是否全等(位等价证明)②均值/p50/p95 对照表③截图直方图
// 最大 bin 差。用法:node scripts/_perf2-lighting-diff.mjs before after
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [tagA, tagB] = process.argv.slice(2);
if (!tagA || !tagB) { console.error('usage: node scripts/_perf2-lighting-diff.mjs <tagA> <tagB>'); process.exit(64); }
const DIR = '/tmp/perf2-lighting';
let allEqual = true;

for (const scene of ['surface', 'cave']) {
  const fa = join(DIR, tagA, `${scene}.json`);
  const fb = join(DIR, tagB, `${scene}.json`);
  if (!existsSync(fa) || !existsSync(fb)) { console.log(`[${scene}] MISSING (${fa} / ${fb})`); allEqual = false; continue; }
  const a = JSON.parse(readFileSync(fa, 'utf8'));
  const b = JSON.parse(readFileSync(fb, 'utf8'));
  const ha = a.hashes, hb = b.hashes;
  let firstDiff = -1;
  const n = Math.min(ha.length, hb.length);
  for (let i = 0; i < n; i++) { if (ha[i] !== hb[i]) { firstDiff = i; break; } }
  const lenOk = ha.length === hb.length;
  const hashOk = lenOk && firstDiff === -1;
  if (!hashOk) allEqual = false;
  console.log(`[${scene}] region A=${JSON.stringify(a.region)} B=${JSON.stringify(b.region)}`);
  console.log(`  hash: ${hashOk ? 'EQUAL' : 'DIFF'} frames=${n}${firstDiff >= 0 ? ` firstDiff@${firstDiff} (${ha[firstDiff]} vs ${hb[firstDiff]})` : ''}${!lenOk ? ` len ${ha.length}!=${hb.length}` : ''}`);
  const row = (label, va, vb, unit = 'ms') => console.log(`  ${label.padEnd(22)} A=${va.toFixed(3)}${unit}  B=${vb.toFixed(3)}${unit}  Δ=${((vb - va) / va * 100).toFixed(1)}%`);
  row('cycle.mean', a.mean, b.mean);
  row('cycle.p50', a.p50, b.p50);
  row('cycle.p95', a.p95, b.p95);
  const segs = new Set([...Object.keys(a.seg ?? {}), ...Object.keys(b.seg ?? {})]);
  for (const s of [...segs].sort()) {
    const sa = a.seg?.[s]?.mean, sb = b.seg?.[s]?.mean;
    if (typeof sa === 'number' && typeof sb === 'number') row(`seg.${s}`, sa, sb);
  }
  // micro-bench 对照
  for (const k of new Set([...Object.keys(a.bench ?? {}), ...Object.keys(b.bench ?? {})])) {
    const ba = a.bench?.[k]?.perCallUs, bb = b.bench?.[k]?.perCallUs;
    if (typeof ba === 'number' && typeof bb === 'number') console.log(`  bench ${k.padEnd(18)} A=${ba.toFixed(3)}µs  B=${bb.toFixed(3)}µs  Δ=${((bb - ba) / ba * 100).toFixed(1)}%`);
  }
  // 截图直方图
  const sa = join(DIR, tagA, `${scene}.screenshot.json`);
  const sb = join(DIR, tagB, `${scene}.screenshot.json`);
  if (existsSync(sa) && existsSync(sb)) {
    const ja = JSON.parse(readFileSync(sa, 'utf8')), jb = JSON.parse(readFileSync(sb, 'utf8'));
    let maxDelta = 0, maxAt = -1, sumAbs = 0;
    for (let i = 0; i < 64; i++) {
      const d = Math.abs((ja.bins?.[i] ?? 0) - (jb.bins?.[i] ?? 0));
      if (d > maxDelta) { maxDelta = d; maxAt = i; }
      sumAbs += d;
    }
    const total = ja.bins?.reduce((s, v) => s + v, 0) ?? 1;
    console.log(`  screenshot hist: maxBinΔ=${maxDelta}${maxAt >= 0 ? `@bin${maxAt}` : ''} sumAbsΔ=${sumAbs} meanLuma ${ja.meanLuma?.toFixed(2)}→${jb.meanLuma?.toFixed(2)} (total px ${total})`);
  }
}
console.log(allEqual ? '\nVERDICT: hashes EQUAL — 逐位等价成立' : '\nVERDICT: hashes DIFF — 逐位等价不成立,禁止判优');
process.exit(allEqual ? 0 : 2);
