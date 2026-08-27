// 一次性:每座雕像的线缆连通分量 + 分量内电源审计
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1200, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const { parseWld } = await import('/src/wld/WldParser.ts');
  const buf = new Uint8Array(await (await fetch('/_ftw.wld?nc=' + Date.now())).arrayBuffer());
  const w = parseWld(buf);
  const t = w.tiles;
  const idx = (x, y) => y * w.tilesWide + x;
  const X0 = 3820, X1 = 3920, Y0 = 395, Y1 = 470;
  // 收集雕像(顶格,2×3)
  const statues = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const i = idx(x, y);
    if (t.active[i] && t.type[i] === 105 && t.frameY[i] === 0) statues.push({ x, y });
  }
  // 全局四色分量(预计算,懒泛洪+缓存)
  const compCache = new Map();
  const componentOf = (sx, sy, bit) => {
    const start = idx(sx, sy);
    const key = bit + ':' + start;
    if (compCache.has(key)) return compCache.get(key);
    if (!(t.wire[start] & bit)) { const r = { size: 0, sources: [], cells: 0 }; compCache.set(key, r); return r; }
    const seen = new Set([start]); const q = [start];
    let sources = [];
    while (q.length) {
      const k = q.pop(); const x = k % w.tilesWide, y = (k / w.tilesWide) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w.tilesWide || ny >= w.tilesHigh) continue;
        const nk = idx(nx, ny);
        if (seen.has(nk)) continue;
        if (!(t.wire[nk] & bit)) continue;
        seen.add(nk); q.push(nk);
      }
    }
    const res = { size: seen.size, sources: [] };
    for (const k of seen) {
      const x = k % w.tilesWide, y = (k / w.tilesWide) | 0;
      const i2 = idx(x, y);
      if (t.active[i2] && [144, 207, 136, 42, 4].includes(t.type[i2])) res.sources.push(`${x},${y}(t${t.type[i2]})`);
    }
    compCache.set(key, res);
    return res;
  };
  const rows = [];
  for (const s of statues) {
    // 雕像 6 格中每格的线缆 → 分量
    const parts = [];
    let best = null;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = s.x + dx, y = s.y + dy;
      for (const [bit, name] of [[1, 'R'], [2, 'B'], [4, 'G'], [8, 'Y']]) {
        if (!(t.wire[idx(x, y)] & bit)) continue;
        const c = componentOf(x, y, bit);
        parts.push(`${name}@${dx},${dy}(sz${c.size}${c.sources.length ? '⚡' + c.sources.join('/') : ''})`);
        if (!best || c.size > best.size) best = { name, ...c };
      }
    }
    rows.push({ statue: `(${s.x},${s.y})`, wires: parts.join(' ') || '无线', bestSource: best ? (best.sources.length ? '有电源' : '无电源') : '-' });
  }
  return { statueCount: statues.length, rows };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
