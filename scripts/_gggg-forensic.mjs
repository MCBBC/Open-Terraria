// GGGG 取证：seed 12345 小世界 —— 树底地面格分类直方图（JS 生成各 pass 快照 vs x86 金标）
// 判据：逐列扫树干(sheet 5)最低格 yb（列内 ≥2 格才算干列），取 (x, yb+1) 分类。
// x86 从不站 73/3；JS ~23 列站 = 无根树。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.launch({
  protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

// x86 金标字节（只读）传入浏览器解析
const wldBytes = readFileSync('/tmp/vserver86/s12345.wld');
const bufB64 = Buffer.from(wldBytes).toString('base64');

const out = await page.evaluate(async (seedText, b64) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const wld = await import('/src/wld/WldParser.ts');
  const SHEET = new Int16Array(tiles.TILE_DEFS.length).fill(-1);
  for (let i = 0; i < tiles.TILE_DEFS.length; i++) {
    const s = tiles.TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }

  /** 列扫：返回 Map<x, {yb, gKey, gFx}>（干列 = 列内 ≥2 个活性 sheet5 格） */
  const scanCols = (w, h, getActive, getSheet, getFx) => {
    const m = new Map();
    for (let x = 0; x < w; x++) {
      let yb = -1, cnt = 0;
      for (let y = 0; y < h; y++) {
        if (getActive(x, y) && getSheet(x, y) === 5) { yb = y; cnt++; }
      }
      if (yb < 0 || cnt < 2) continue;
      const gA = yb + 1 < h ? getActive(x, yb + 1) : false;
      const gS = yb + 1 < h ? getSheet(x, yb + 1) : -1;
      m.set(x, { yb, gKey: gA ? String(gS) : 'air', gFx: yb + 1 < h && gA ? getFx(x, yb + 1) : -1 });
    }
    return m;
  };
  const histOf = (m) => {
    const h = new Map();
    for (const v of m.values()) h.set(v.gKey, (h.get(v.gKey) ?? 0) + 1);
    return Object.fromEntries([...h.entries()].sort((a, b) => Number(a[0].split('|')[0] ?? 0) - 0 || a[0] < b[0] ? (a[0] < b[0] ? -1 : 1) : 0));
  };

  // ---- x86 金标 ----
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const w = wld.parseWld(bytes);
  const wt = w.tiles;
  const x86Cols = scanCols(w.tilesWide, w.tilesHigh,
    (x, y) => wt.active[y * w.tilesWide + x] === 1,
    (x, y) => wt.type[y * w.tilesWide + x],
    (x, y) => wt.frameX[y * w.tilesWide + x]);
  const x86 = { n: x86Cols.size, hist: histOf(x86Cols), bad: [...x86Cols.entries()].filter(([, v]) => v.gKey === '73' || v.gKey === '3').map(([x, v]) => ({ x, ...v })) };

  // ---- JS 生成（关键 pass 后快照列表）----
  const SNAP = ['栽树', '炼金草药', '地表植物', '藤蔓', '地表花', '地表蘑菇'];
  const snapList = [];
  const snapNames = [];
  const world = await mod.generateWorld({
    width: 4200, height: 1200, seedText, name: 'gggg',
    onWorldPartial: (wd, idx, name) => {
      if (!SNAP.includes(name)) return;
      const st = wd.store;
      // 只扫表面带 y<worldSurface+60（干列必在）
      const gs = mod.lastGenState();
      const yLim = Math.min(st.h, Math.floor(gs.worldSurface) + 60);
      snapList.push(scanCols(st.w, yLim,
        (x, y) => st.flags[st.idx(x, y)] !== 0,
        (x, y) => SHEET[st.type[st.idx(x, y)]],
        (x, y) => st.frameX[st.idx(x, y)]));
      snapNames.push(name);
    },
  });
  const st = world.store;
  const gs = mod.lastGenState();
  const yLim = Math.min(st.h, Math.floor(gs.worldSurface) + 60);
  const finalCols = scanCols(st.w, yLim,
    (x, y) => st.flags[st.idx(x, y)] !== 0,
    (x, y) => SHEET[st.type[st.idx(x, y)]],
    (x, y) => st.frameX[st.idx(x, y)]);
  const final = {
    n: finalCols.size, hist: histOf(finalCols),
    bad: [...finalCols.entries()].filter(([, v]) => v.gKey === '73' || v.gKey === '3').map(([x, v]) => ({ x, ...v })),
  };

  // bad 列在各快照的状态（yb 与地面分类）
  const badTrace = final.bad.map(({ x }) => {
    const row = { x, stages: [] };
    for (const snap of snapList) {
      const v = snap.get(x);
      row.stages.push(v ? `${v.yb}/${v.gKey}` : 'nocol');
    }
    const fv = finalCols.get(x);
    row.stages.push(`${fv.yb}/${fv.gKey}`);
    return row;
  });

  // 干底格±2 纵向剖面（最终态）——首 8 个 bad 列
  const cellDump = final.bad.slice(0, 8).map(({ x }) => {
    const v = finalCols.get(x);
    const rows = [];
    for (let dy = 2; dy >= -2; dy--) {
      const y = v.yb + dy;
      const i = st.idx(x, y);
      rows.push(`y${y}: s${st.flags[i] ? SHEET[st.type[i]] : -1}${st.flags[i] ? '' : '!'} fx${st.flags[i] ? st.frameX[i] : -1}`);
    }
    return { x, yb: v.yb, cells: rows };
  });

  return { x86, final, snapNames, snapHists: snapList.map((m) => histOf(m)), badTrace, cellDump };
}, '12345', bufB64);

console.log('== x86 金标 s12345.wld ==');
console.log('干列数:', out.x86.n, '| 地面直方图:', JSON.stringify(out.x86.hist));
console.log('73/3 垫底:', out.x86.bad.length);
console.log();
console.log('== JS 最终态（修复前基线）==');
console.log('干列数:', out.final.n, '| 地面直方图:', JSON.stringify(out.final.hist));
console.log('73/3 垫底:', out.final.bad.length, '→ 列:', out.final.bad.map((b) => b.x).join(','));
console.log();
console.log('== bad 列逐快照轨迹（yb/地面类；nocol=该时点无干列）==');
for (const t of out.badTrace.slice(0, 30)) console.log(t.x, ':', t.stages.join(' -> '));
console.log();
console.log('== bad 列最终态剖面（干底±2）==');
for (const c of out.cellDump) console.log('x=' + c.x, 'yb=' + c.yb, JSON.stringify(c.cells));
console.log();
console.log('快照数:', out.snapNames.length, JSON.stringify(out.snapNames));
out.snapNames.forEach((n, i) => console.log('  ', n, '->', JSON.stringify(out.snapHists[i])));
if (errs.length) console.log('页面错误:', errs.slice(0, 10));
await browser.close();
