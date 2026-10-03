// 按秒分桶自耗时(0x7)+慢帧窗采样归因+worker 剖面
import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('/tmp/hell-xray-cache.json', 'utf8'));
const { mainX, dict, chunks } = c;
const nameId = new Map(); dict.forEach((n, i) => nameId.set(n, i));
const RAF = nameId.get('FireAnimationFrame');
const rafs = mainX.filter(e => e[0] === RAF).map(e => e[1]).sort((a, b) => a - b);
const frameStarts = [rafs[0]];
for (let i = 1; i < rafs.length; i++) if (rafs[i] - rafs[i - 1] > 2500) frameStarts.push(rafs[i]);
const t0 = frameStarts[0];

// 帧窗表(用于慢帧窗归因)
const frames = [];
for (let i = 1; i < frameStarts.length; i++) frames.push({ t0: frameStarts[i - 1], t1: frameStarts[i], gap: frameStarts[i] - frameStarts[i - 1] });
const slowFrames = frames.filter(f => f.gap > 12500);
console.log('slow frames:', slowFrames.length, 'total slow time:', (slowFrames.reduce((a, f) => a + f.gap, 0) / 1000).toFixed(0) + 'ms');

// 0x7 采样:按秒桶 + 慢帧窗聚合
const main = chunks.filter(ch => ch.id === '0x7');
const nodes = new Map(); const parentOf = new Map();
for (const ch of main) for (const n of ch.nodes) {
  if (!nodes.has(n.id)) { nodes.set(n.id, n.f); if (n.parent != null) parentOf.set(n.id, n.parent); }
}
const short = (f) => { const s = dict[f] || '?'; const m = s.match(/^([$\w]+)@index-[\w.-]+:(\d+)/); return m ? m[1] + '@' + m[2] : s.replace(/@.*$/, '@?').slice(0, 44); };
const jsAncestor = (id) => { let cur = parentOf.get(id), g = 0; while (cur != null && g++ < 20) { const f = nodes.get(cur); const s = dict[f] || ''; if (s && !s.includes('|native')) return short(f); cur = parentOf.get(cur); } return '(none)'; };
const TOP = new Set(['stampShineCell', 'drawVanillaLiquids', 'drawImage', 'drawLiquidBehindTilesOnly', 'drawWindSwayTiles', 'mmHudBlit', 'drawMinimap', 'postMessage', 'sweep', 'render', 'fixedUpdate', 'flushAcc', 'drawTileFlames', 'shineChunkFingerprint', 'texImage2D', 'uploadWave', 'drawChainPipeStack', 'MinorGC', 'MajorGC', 'drawTownNPC', 'clearRect', 'drawLiquidBehindSolidTiles', 'lightAt', 'send', 'equipStatsKey', 'bakeChunkBody', 'drawVanillaDustPass', 'buildPrecipBatch', 'updateWeather', 'drawTownNPC']);
// 分类器:把每个采样节点归入家族
const FAM = [
  [/stampShineCell|shineChunkFingerprint|bakeShineChunk|ensureEntry.*640|scheduleShineBakes|findWaterfalls|drawTileShineGrid|shineCell/, 'shine(高光chunk)'],
  [/drawVanillaLiquids|drawLiquidBehind|emitVanillaLiquidGate|emitLiquidGate|liquidCacheIsSolid|tileSolidLut@6032|drawLiquids@|drawWaterfalls|liquid[A-Z]/, 'liquids(液体)'],
  [/^drawImage@/, 'drawImage@native(其余)'],
  [/^texImage2D|^bindTexture|^bindSampler|^uploadRaw|^uploadWave|^compose@|^upload/, 'GL upload/tex'],
  [/^postMessage|^HandlePostMessage/, 'postMessage(worker IO)'],
  [/drawMinimap|mmHudBlit|minimap/, 'minimap'],
  [/drawWindSwayTiles|sweep@58|swayBake|bakeChunkBody|drawChainPipeStack/, 'sway/bake chunk'],
  [/lightAt|tickLighting|compositeLight|scanBiomeLight|send@656|compute@656/, 'light(光照)'],
  [/buildPrecipBatch|tryDrawPrecipGL|drawPrecipDust|makeSnow|updateWeather|precip|weather|snow/i, 'snow三件套(precip/weather)'],
  [/^MinorGC|^MajorGC|^V8\.GC|^CppGC|garbage collector|Scavenger|MarkTransitive|Sweep/, 'GC'],
  [/^clearRect/, 'clearRect'],
  [/^render@|^drawTileFlames|flushAcc|finishAccFrame|resolveTex|quadSprite|drawVanillaCell|bglStageGrid|bgl/, 'render 主路径(其余)'],
  [/fixedUpdate|^update@|^frame@|^loop@|^step@/, 'update 逻辑'],
  [/^drawTownNPC|^equipStatsKey|^each@|^fillText|^drawVanilla[A-Z]/, 'NPC/other draw'],
];
const famOf = (f) => { const s = dict[f] || '?'; for (const [re, tag] of FAM) if (re.test(s)) return tag; return 'other(' + short(f).slice(0, 24) + ')'; };
// 按秒×家族
const secFam = new Map();
// 慢帧窗×家族
const slowFam = new Map(); let slowFamTotal = 0;
// 帧窗二分
let fi = 0;
const slowAt = (ts, delta) => { for (const f of slowFrames) { if (ts >= f.t0 && ts < f.t1) { return f; } } return null; };
const slowIdx = slowFrames.map(f => f);
for (const ch of main) {
  for (let i = 0; i < ch.s.length; i++) {
    const d = ch.td[i] ?? 0; if (d <= 0) continue;
    // 采样时间 = chunk.ts 近似 + 前序 delta 累计?简化:chunk.ts 代表整 chunk 窗口,单样本时间≈chunk.ts 按序累加
    const node = ch.s[i];
    const fam = famOf(node);
    const sec = Math.floor((ch.ts - t0) / 1e6);
    let m = secFam.get(sec); if (!m) secFam.set(sec, m = new Map());
    m.set(fam, (m.get(fam) || 0) + d);
  }
}
const fams = [...new Set([...secFam.values()].flatMap(m => [...m.keys()]))];
const showFams = fams.filter(f => !f.startsWith('other('));
console.log('\n== 每秒×家族(ms) ==  家族:', showFams.join(' | '));
const header = 'sec  ' + showFams.map((f, i) => String(i).padStart(3)).join('');
console.log(header);
const secs = [...secFam.keys()].sort((a, b) => a - b);
for (const sec of secs) {
  const m = secFam.get(sec);
  const tot = [...m.values()].reduce((a, b) => a + b, 0) / 1000;
  if (tot < 200) continue;
  const cells = showFams.map(f => String(Math.round((m.get(f) || 0) / 1000)).padStart(3)).join(' ');
  console.log(String(sec).padStart(3), ' ' + cells, ' tot=' + tot.toFixed(0));
}
// 慢帧窗归因(准确版:对每个慢帧窗,把窗内采样 delta 归家族)
console.log('\n== 慢帧窗(>12.5ms)内采样归因 top ==');
const sf = new Map();
let totSlow = 0;
for (const ch of main) {
  let ts = ch.ts;
  const tds = ch.td, ss = ch.s;
  // chunk 内按 delta 累计时间轴(首样本 ts≈chunk.ts-td[0]?)
  for (let i = 0; i < ss.length; i++) {
    const d = tds[i] ?? 0;
    ts += (i === 0 ? 0 : (tds[i - 1] ?? 0));
    if (d <= 0) continue;
    for (const f of slowFrames) {
      if (ts >= f.t0 && ts < f.t1) {
        const fam = famOf(ss[i]);
        sf.set(fam, (sf.get(fam) || 0) + d); totSlow += d;
        break;
      }
    }
  }
}
for (const [f, d] of [...sf.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)) console.log((d / 1000).toFixed(0).padStart(6) + 'ms ' + (100 * d / totSlow).toFixed(1) + '%', f);
// worker 剖面
for (const pid of ['0xa', '0x9', '0xc', '0x8']) {
  const ws = chunks.filter(ch => ch.id === pid);
  if (!ws.length) continue;
  const wnodes = new Map(); const wpar = new Map();
  for (const ch of ws) for (const n of ch.nodes) { if (!wnodes.has(n.id)) { wnodes.set(n.id, n.f); if (n.parent != null) wpar.set(n.id, n.parent); } }
  const wself = new Map(); let wt = 0;
  const wsec = new Map();
  for (const ch of ws) for (let i = 0; i < ch.s.length; i++) {
    const d = ch.td[i] ?? 0; if (d <= 0) continue;
    wself.set(ch.s[i], (wself.get(ch.s[i]) || 0) + d); wt += d;
    const sec = Math.floor((ch.ts - t0) / 1e6);
    wsec.set(sec, (wsec.get(sec) || 0) + d);
  }
  const wfn = new Map();
  for (const [nid, us] of wself) { const f = short(wnodes.get(nid)); const a = wfn.get(f) || { n: 0, us: 0 }; a.n++; a.us += us; wfn.set(f, a); }
  console.log('\n== worker', pid, 'chunks:', ws.length, 'sampled:', (wt / 1000).toFixed(0) + 'ms ==');
  for (const [f, a] of [...wfn.entries()].sort((x, y) => y[1].us - x[1].us).slice(0, 10)) console.log('  ' + (a.us / 1000).toFixed(0).padStart(6) + 'ms n=' + String(a.n).padStart(6), f.slice(0, 90));
  const secRow = [...wsec.entries()].sort((a, b) => a[0] - b[0]).map(([s2, d]) => s2 + ':' + (d / 1000).toFixed(0)).join(' ');
  console.log('  per-sec(ms):', secRow.slice(0, 600));
}
