// 精确归因 v2:样本时间回推+伪巨段过滤+慢帧窗归因×家族/调用方+每秒×家族+worker busy
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
const slowFrames = frames.filter(f => f.gap > 12500);
console.log('slow frames:', slowFrames.length, 'slow time:', (slowFrames.reduce((a, f) => a + f.gap, 0) / 1000).toFixed(0) + 'ms');
// 慢帧窗前缀加速
const sfSorted = [...slowFrames].sort((a, b) => a.t0 - b.t0);
const slowAt = (ts) => { let lo = 0, hi = sfSorted.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; const f = sfSorted[m]; if (ts < f.t0) hi = m - 1; else if (ts >= f.t1) lo = m + 1; else return f; } return null; };

const main = chunks.filter(ch => ch.id === '0x7');
const nodes = new Map(); const parentOf = new Map();
for (const ch of main) for (const n of ch.nodes) {
  if (!nodes.has(n.id)) { nodes.set(n.id, n.f); if (n.parent != null) parentOf.set(n.id, n.parent); }
}
const short = (f) => { const s = dict[f] || '?'; const m = s.match(/^([$\w]+)@index-[\w.-]+:(\d+)/); return m ? m[1] + '@' + m[2] : s.slice(0, 40); };
const FAM = [
  [/stampShineCell|shineChunkFingerprint|bakeShineChunk|scheduleShineBakes|findWaterfalls|drawTileShineGrid|shineCell|uploadScratchBake/, 'shine高光chunk'],
  [/drawVanillaLiquids|drawLiquidBehind|emitVanillaLiquidGate|emitLiquidGate|liquidCacheIsSolid|tileSolidLut|drawWaterfalls|findWaterfalls|raiseShimmer/, '液体liquids'],
  [/drawWindSwayTiles|swayBake|bakeChunkBody|drawChainPipeStack|sweep@58|drawTileFlames|undergroundTile|overgroundTile|tileSolidLut/, 'sway/演化演化'],
  [/drawMinimap|mmHudBlit|minimap/, 'minimap小地图'],
  [/^postMessage|^HandlePostMessage|lightAt|tickLighting|compositeLight|scanBiomeLight|send@656|compute@656/, 'lightWorker IO/光照'],
  [/buildPrecipBatch|tryDrawPrecipGL|drawPrecipDust|makeSnow|updateWeather|precip|weather|snow|Snow|tint/i, '雪三件套'],
  [/^MinorGC|^MajorGC|^V8\.GC|^CppGC|garbage collector|Scavenger|MarkTransitive|Sweep|DeoptimizeCode|BytecodeBudget|StackGuard|HandleInterrupts/, 'GC/JVM杂'],
  [/mossUpdate|growUpdate|hardUpdateWorld|grassGrowth|growGrass|evolution|Evolution|updateWorld|plantAlch|vine|grow[A-Z]|check[A-Z]|spread[A-Z]|kill[A-Z]/, 'WorldEvolution演化'],
  [/^drawImage@/, 'drawImage@native'],
  [/^texImage2D|^bindTexture|^bindSampler|^uploadRaw|^uploadWave|^compose@|clearRect|^fillText|quadSprite|resolveTex|flushAcc/, 'canvas/GL低层'],
  [/^render@|^drawVanillaCell|^drawVanilla[A-Z]|bglStageGrid|bgl|^drawTownNPC|^frame@|^loop@|^fixedUpdate|^update@|^step@|^each@|equipStatsKey/, '主循环/主渲染'],
];
const famOf = (f) => { const s = dict[f] || '?'; for (const [re, tag] of FAM) if (re.test(s)) return tag; return short(f) === '?' ? '?' : '其他'; };
// 样本时间回推:样本 i 的 ts = ch.ts - Σ_{j>i}(td[j])
const CAP = 25000; // 伪巨段上限
const secFam = new Map();
const slowFam = new Map();
const slowFn = new Map();
const slowPar = new Map();
let totSlowSamp = 0, totSamp = 0, capCut = 0;
for (const ch of main) {
  const ss = ch.s, tds = ch.td;
  // 后缀和
  const suf = new Array(ss.length + 1).fill(0);
  for (let i = ss.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + (tds[i] ?? 0);
  for (let i = 0; i < ss.length; i++) {
    const d = tds[i] ?? 0;
    if (d <= 0) continue;
    const dC = Math.min(d, CAP); if (d > CAP) capCut += d;
    const ts = ch.ts - suf[i + 1];          // 样本起点≈ch.ts-其后所有 delta
    totSamp += dC;
    const nid = ss[i];
    const f = nodes.get(nid);
    const fam = famOf(f);
    const sec = Math.floor((ts - t0) / 1e6);
    let m = secFam.get(sec); if (!m) secFam.set(sec, m = new Map());
    m.set(fam, (m.get(fam) || 0) + dC);
    if (ts >= t0) {
      const fr = slowAt(ts);
      if (fr) {
        totSlowSamp += dC;
        slowFam.set(fam, (slowFam.get(fam) || 0) + dC);
        const fs2 = short(f);
        slowFn.set(fs2, (slowFn.get(fs2) || 0) + dC);
        // JS 调用方
        let cur = parentOf.get(nid), g = 0, par = '(none)';
        while (cur != null && g++ < 20) { const pf = nodes.get(cur); const ps = dict[pf] || ''; if (ps && !ps.includes('|native')) { par = short(pf); break; } cur = parentOf.get(cur); }
        const key = fs2 + ' ⟵ ' + par;
        slowPar.set(key, (slowPar.get(key) || 0) + dC);
      }
    }
  }
}
console.log('total sampled(capped):', (totSamp / 1000).toFixed(0) + 'ms, capCut:', (capCut / 1000).toFixed(0) + 'ms, covered in slowWins:', (totSlowSamp / 1000).toFixed(0) + 'ms / ' + (slowFrames.reduce((a, f) => a + f.gap, 0) / 1000).toFixed(0) + 'ms');
console.log('\n== 慢帧窗自耗时×函数 top22 ==');
for (const [k, v] of [...slowFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 22)) console.log((v / 1000).toFixed(0).padStart(6) + 'ms', (100 * v / totSlowSamp).toFixed(1) + '%', k);
console.log('\n== 慢帧窗自耗时×函数⟵调用方 top16 ==');
for (const [k, v] of [...slowPar.entries()].sort((x, y) => y[1] - x[1]).slice(0, 16)) console.log((v / 1000).toFixed(0).padStart(6) + 'ms', (100 * v / totSlowSamp).toFixed(1) + '%', k.slice(0, 120));
console.log('\n== 慢帧窗自耗时×家族 ==');
for (const [k, v] of [...slowFam.entries()].sort((x, y) => y[1] - x[1])) console.log((v / 1000).toFixed(0).padStart(6) + 'ms', (100 * v / totSlowSamp).toFixed(1) + '%', k);
// 每秒×家族(重命名短)
const famNames = ['shine高光chunk', '液体liquids', 'sway/演化演化', 'minimap小地图', 'lightWorker IO/光照', '雪三件套', 'GC/JVM杂', 'WorldEvolution演化', 'drawImage@native', 'canvas/GL低层', '主循环/主渲染', '其他', '?'];
console.log('\n== 每秒×家族(ms,截断25ms) ==');
const idxOf = new Map(famNames.map((f, i) => [f, i]));
console.log('sec ' + famNames.map((f, i) => String(i).padStart(3)).join('') + '  tot');
const secs = [...secFam.keys()].sort((a, b) => a - b);
for (const sec of secs) {
  const m = secFam.get(sec);
  let tot = 0; for (const v of m.values()) tot += v;
  if (tot < 150000) continue;
  const cells = famNames.map(f => String(Math.round((m.get(f) || 0) / 1000)).padStart(3)).join('');
  console.log(String(sec).padStart(3) + ' ' + cells + ' ' + (tot / 1000).toFixed(0));
}
// worker busy-only
for (const pid of ['0xa', '0x9', '0xc']) {
  const ws = chunks.filter(ch => ch.id === pid);
  const busy = new Map();
  for (const ch of ws) {
    const ss = ch.s, tds = ch.td;
    const suf = new Array(ss.length + 1).fill(0);
    for (let i = ss.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + (tds[i] ?? 0);
    for (let i = 0; i < ss.length; i++) {
      const d = Math.min(tds[i] ?? 0, CAP); if (d <= 0) continue;
      const nid = ss[i];
      const fnm = dict[(ws[0], nid)] || '';
      // 用 nodes 查
      const f = (wnodesOf(ws).get(nid) || '');
      if (/\(idle\)/.test(f)) continue;
      const ts = ch.ts - suf[i + 1];
      const sec = Math.floor((ts - t0) / 1e6);
      busy.set(sec, (busy.get(sec) || 0) + d);
    }
  }
  const rows = [...busy.entries()].sort((a, b) => a[0] - b[0]).map(([s, d]) => s + ':' + (d / 1000).toFixed(0)).join(' ');
  console.log('\nworker', pid, 'busy(ms/s):', rows.slice(0, 500));
}
function wnodesOf(ws) { const m = new Map(); for (const ch of ws) for (const n of ch.nodes) if (!m.has(n.id)) m.set(n.id, dict[n.f] || ''); return m; }
