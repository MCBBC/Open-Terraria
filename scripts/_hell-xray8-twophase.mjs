// 分时段慢帧归因:sec<21 vs >=21 两组 + 「其他」拆解
import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('/tmp/hell-xray-cache.json', 'utf8'));
const { mainX, dict, chunks } = c;
const nameId = new Map(); dict.forEach((n, i) => nameId.set(n, i));
const RAF = nameId.get('FireAnimationFrame');
const rafs = mainX.filter(e => e[0] === RAF).map(e => e[1]).sort((a, b) => a - b);
const frameStarts = [rafs[0]];
for (let i = 1; i < rafs.length; i++) if (rafs[i] - rafs[i - 1] > 2500) frameStarts.push(rafs[i]);
const t0 = frameStarts[0];
const frames = [];
for (let i = 1; i < frameStarts.length; i++) frames.push({ t0: frameStarts[i - 1], t1: frameStarts[i], gap: frameStarts[i] - frameStarts[i - 1] });
const SPLIT = 21;
const slowFrames = frames.filter(f => f.gap > 12500);
const sfSorted = [...slowFrames].sort((a, b) => a.t0 - b.t0);
const slowAt = (ts) => { let lo = 0, hi = sfSorted.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; const f = sfSorted[m]; if (ts < f.t0) hi = m - 1; else if (ts >= f.t1) lo = m + 1; else return f; } return null; };
const main = chunks.filter(ch => ch.id === '0x7');
const nodes = new Map(); const parentOf = new Map();
for (const ch of main) for (const n of ch.nodes) {
  if (!nodes.has(n.id)) { nodes.set(n.id, n.f); if (n.parent != null) parentOf.set(n.id, n.parent); }
}
const short = (f) => { const s = dict[f] || '?'; const m = s.match(/^([$\w]+)@index-[\w.-]+:(\d+)/); return m ? m[1] + '@' + m[2] : s.slice(0, 44); };
const CAP = 25000;
const phase = (ts) => Math.floor((ts - t0) / 1e6) < SPLIT ? 0 : 1;
const fnAgg = [new Map(), new Map()], parAgg = [new Map(), new Map()];
let tot = [0, 0];
for (const ch of main) {
  const ss = ch.s, tds = ch.td;
  const suf = new Array(ss.length + 1).fill(0);
  for (let i = ss.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + (tds[i] ?? 0);
  for (let i = 0; i < ss.length; i++) {
    const d = tds[i] ?? 0; if (d <= 0) continue;
    const ts = ch.ts - suf[i + 1];
    const fr = slowAt(ts); if (!fr) continue;
    const p = phase(fr.t0);
    const dC = Math.min(d, CAP);
    const nid = ss[i];
    const fs2 = short(nodes.get(nid));
    fnAgg[p].set(fs2, (fnAgg[p].get(fs2) || 0) + dC); tot[p] += dC;
    let cur = parentOf.get(nid), g = 0, par = '(none)';
    while (cur != null && g++ < 20) { const pf = nodes.get(cur); const ps = dict[pf] || ''; if (ps && !ps.includes('|native')) { par = short(pf); break; } cur = parentOf.get(cur); }
    const key = fs2 + ' ⟵ ' + par;
    parAgg[p].set(key, (parAgg[p].get(key) || 0) + dC);
  }
}
for (const p of [0, 1]) {
  const sw = slowFrames.filter(f => phase(f.t0) === p);
  console.log('\n== 慢帧窗 phase' + p + ' (sec ' + (p ? '>=' : '<') + SPLIT + ') 窗数:', sw.length, '窗时:', (sw.reduce((a, f) => a + f.gap, 0) / 1000).toFixed(0) + 'ms 采样覆盖:', (tot[p] / 1000).toFixed(0) + 'ms ==');
  for (const [k, v] of [...fnAgg[p].entries()].sort((x, y) => y[1] - x[1]).slice(0, 16)) console.log('  ' + (v / 1000).toFixed(0).padStart(5) + 'ms', (100 * v / tot[p]).toFixed(1) + '%', k);
  console.log('  -- ×调用方 top10 --');
  for (const [k, v] of [...parAgg[p].entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) console.log('  ' + (v / 1000).toFixed(0).padStart(5) + 'ms', (100 * v / tot[p]).toFixed(1) + '%', k.slice(0, 110));
}
// 全 trace 自耗时 top60(修正版)——拆「其他」
const allFn = new Map(); let allTot = 0;
for (const ch of main) {
  const ss = ch.s, tds = ch.td;
  for (let i = 0; i < ss.length; i++) {
    const d = Math.min(tds[i] ?? 0, CAP); if (d <= 0) continue;
    const fs2 = short(nodes.get(ss[i]));
    allFn.set(fs2, (allFn.get(fs2) || 0) + d); allTot += d;
  }
}
console.log('\n== 全 trace 自耗时 top45(修正版,总 ' + (allTot / 1000).toFixed(0) + 'ms) ==');
for (const [k, v] of [...allFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 45)) console.log((v / 1000).toFixed(0).padStart(6) + 'ms', (100 * v / allTot).toFixed(1) + '%', k);
// 雪带自对齐:雪家族+液体+shine+minimap+light 每 2s 粗桶
const FAMS2 = [
  [/buildPrecipBatch|tryDrawPrecipGL|drawPrecipDust|makeSnow|updateWeather|precip|weather|Snow|snow/i, 'snow'],
  [/drawVanillaLiquids|drawLiquidBehind|emitLiquidGate|liquidCacheIsSolid|tileSolidLut|drawWaterfalls|findWaterfalls|raiseShimmer|drawLiquids@/i, 'liquid'],
  [/stampShineCell|shineChunkFingerprint|bakeShineChunk|scheduleShineBakes|drawTileShineGrid|uploadScratchBake|shineCell/i, 'shine'],
  [/drawMinimap|mmHudBlit|minimap/i, 'minimap'],
  [/lightAt|tickLighting|compositeLight|scanBiomeLight|send@656|compute@656|postMessage|HandlePostMessage/i, 'lightIO'],
  [/drawWindSwayTiles|sweep@58|swayBake|bakeChunkBody|drawChainPipeStack/i, 'swaybake'],
];
const famOf2 = (f) => { const s = dict[f] || ''; for (const [re, tag] of FAMS2) if (re.test(s)) return tag; return null; };
const secFam = new Map();
for (const ch of main) {
  const ss = ch.s, tds = ch.td;
  const suf = new Array(ss.length + 1).fill(0);
  for (let i = ss.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + (tds[i] ?? 0);
  for (let i = 0; i < ss.length; i++) {
    const d = Math.min(tds[i] ?? 0, CAP); if (d <= 0) continue;
    const fam = famOf2(nodes.get(ss[i])); if (!fam) continue;
    const ts = ch.ts - suf[i + 1];
    const sec = Math.floor((ts - t0) / 1e6);
    const k = sec + '|' + fam;
    secFam.set(k, (secFam.get(k) || 0) + d);
  }
}
console.log('\n== 签名家族每秒(ms): snow | liquid | shine | minimap | lightIO | swaybake ==');
const fams = ['snow', 'liquid', 'shine', 'minimap', 'lightIO', 'swaybake'];
const secs = [...new Set([...secFam.keys()].map(k => +k.split('|')[0]))].sort((a, b) => a - b);
for (const sec of secs) {
  const cells = fams.map(f => String(Math.round((secFam.get(sec + '|' + f) || 0) / 1000)).padStart(4)).join(' ');
  if (fams.every(f => !(secFam.get(sec + '|' + f) > 2000))) continue;
  console.log(String(sec).padStart(3), cells);
}
