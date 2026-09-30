// ★闪屏 console 取证器 v4（全幅降采样检测 + 画布普查 + 呈现层疑点收口）
// 用法：粘贴后正常玩 5 分钟（自动收卷）；每检出打印现场+环窗；随时 stop()；
//       最后 copy(__wbBlink.report()) 发回。
// v4 变化:主检测器=全幅 1/8 降采样 diff(封 v3 四角盒盲区)+DOM 画布普查+resize/dpr 监视。
(() => {
  if (window.__wbBlink?.stop) window.__wbBlink.stop();
  const g = window.__swGame;
  if (!g?.chunks?.chunks) { console.warn('[wbBlink] __swGame 未就绪(需在世界内)'); return; }
  const chunks = g.chunks, rdr = g.renderer, cv = rdr.canvas;
  // ---- DOM 画布普查 ----
  const canvases = [...document.querySelectorAll('canvas')];
  console.log('[wbBlink] DOM 画布普查:', canvases.map((c) => ({
    id: c.id || '(anon)', w: c.width, h: c.height,
    show: !!(c.offsetParent || c.getClientRects().length), z: getComputedStyle(c).zIndex,
  })));
  const key = (cx, cy) => ((cx & 0xffff) | ((cy & 0xffff) << 16));
  const scratch = document.createElement('canvas');
  const grab = (src, x, y, w, h) => {
    scratch.width = w; scratch.height = h;
    const sc = scratch.getContext('2d', { willReadFrequently: true });
    sc.drawImage(src, x, y, w, h, 0, 0, w, h);
    return sc.getImageData(0, 0, w, h).data;
  };
  const diffOf = (d, ref) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i]-ref[i]) + Math.abs(d[i+1]-ref[i+1]) + Math.abs(d[i+2]-ref[i+2]); return s / (d.length / 4); };
  const meanA = (d) => { let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return a / (d.length / 4); };
  // ---- 全幅 1/8 降采样 ----
  const DW = Math.max(64, cv.width >> 3), DH = Math.max(48, cv.height >> 3);
  const small = document.createElement('canvas'); small.width = DW; small.height = DH;
  const smctx = small.getContext('2d', { willReadFrequently: true });
  const fullSnap = () => { smctx.drawImage(cv, 0, 0, DW, DH); return smctx.getImageData(0, 0, DW, DH).data; };
  let ref = fullSnap();
  let lastRebase = performance.now();
  const ring = [];
  const RING_MAX = 240;
  let thFull = 0, thLow = 0, baseTileA = 0;
  const calib = [];
  let epN = 0, t0 = performance.now(), lastEp = -1e9, lastGlTile = 0, stallN = 0;
  const eps = [], path0 = { ...rdr.bglPathStats };
  let resizeN = 0, dpr0 = devicePixelRatio;
  window.addEventListener('resize', () => { resizeN++; }, { passive: true });
  const counters = () => ({
    workerAwaiting: chunks.workerAwaiting.size, pageCount: chunks.pageCount,
    chunksMap: chunks.chunks.size, dirtyQ: chunks.dirtyQueue.length,
    dT: chunks.glDirtyPagesT.size, dW: chunks.glDirtyPagesW.size,
    up: { ...rdr['_bglPageUploaded'] },
  });
  const cells9 = () => {
    const ccx = Math.floor(g.camera.x / 256), ccy = Math.floor(g.camera.y / 256);
    let tA = 0, wA = 0, n = 0, phN = 0, noPair = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const p = chunks.chunks.get(key(ccx + dx, ccy + dy));
      if (!p) { noPair++; continue; }
      if (p.placeholder) { phN++; continue; }
      const pg = Math.floor(p.cell / 16);
      const tp = chunks['tilePages'][pg], wp = chunks['wallPages'][pg];
      if (tp) tA += meanA(grab(tp, p.sx + 112, p.sy + 112, 32, 32));
      if (wp) wA += meanA(grab(wp, p.sx + 112, p.sy + 112, 32, 32));
      n++;
    }
    return { tileA: n ? +(tA / n).toFixed(0) : -1, wallA: n ? +(wA / n).toFixed(0) : -1, pairs: n, phN, noPair };
  };
  const census = () => {
    const ccx = Math.floor(g.camera.x / 256), ccy = Math.floor(g.camera.y / 256);
    let tA = 0, wA = 0, n = 0, phN = 0, noPair = 0; const cells = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const p = chunks.chunks.get(key(ccx + dx, ccy + dy));
      if (!p) { noPair++; continue; }
      if (p.placeholder) { phN++; continue; }
      const pg = Math.floor(p.cell / 16);
      const tp = chunks['tilePages'][pg], wp = chunks['wallPages'][pg];
      if (tp) { const a = meanA(grab(tp, p.sx + 112, p.sy + 112, 32, 32)); tA += a; if (cells.length < 4) cells.push({ c: [ccx+dx, ccy+dy], tileA: +a.toFixed(0) }); }
      if (wp) wA += meanA(grab(wp, p.sx + 112, p.sy + 112, 32, 32));
      n++;
    }
    return { tileCellA: n ? +(tA / n).toFixed(0) : -1, wallCellA: n ? +(wA / n).toFixed(0) : -1, pairs: n, phN, noPair, cells };
  };
  const sideOf = (c) => c.tileCellA < 0 ? 'NO-PAIR' : (c.tileCellA < 96 && c.wallCellA > 200) ? 'CANVAS(tile层烘焙/画布)'
    : c.tileCellA < 96 ? 'CANVAS(墙tile同塌)' : (c.phN > 0 || c.noPair > 0) ? 'PLACEHOLDER' : 'GL/SEGMENT(页画布完好→查上传/发射)';
  const record = () => {
    const d = diffOf(fullSnap(), ref);
    const now = performance.now();
    if (d < thLow && now - lastRebase > 2000) { ref = fullSnap(); lastRebase = now; }
    const c = cells9();
    const glTile = rdr.bglPathStats['world-gl-tile'] ?? 0;
    const e = { t: +(now - t0).toFixed(0), fullD: +d.toFixed(2), ...c,
      glTile, glTileDelta: glTile - lastGlTile,
      wA: chunks.workerAwaiting.size, dT: chunks.glDirtyPagesT.size, dW: chunks.glDirtyPagesW.size,
      pg: chunks.pageCount, dirtyQ: chunks.dirtyQueue.length, upT: rdr['_bglPageUploaded']?.t, upW: rdr['_bglPageUploaded']?.w,
      resizeN, dpr: devicePixelRatio, ps: { ...rdr.bglPathStats } };
    lastGlTile = glTile;
    ring.push(e); if (ring.length > RING_MAX) ring.shift();
    return e;
  };
  const dumpRing = (tag) => {
    const win = ring.slice(-36);
    console.log(`[wbBlink] ${tag} 环窗(每2样): t, fullD, tileA, wallA, phN, noPair, glTileΔ, wA, dT, pg, upT`);
    for (const e of win.filter((_, i) => i % 2 === 0)) console.log(`  t=${e.t} fullD=${e.fullD} tileA=${e.tileA} wallA=${e.wallA} ph=${e.phN} noPair=${e.noPair} glTileΔ=${e.glTileDelta} wA=${e.wA} dT=${e.dT} pg=${e.pg} upT=${e.upT}`);
  };
  const emit = (trig, e) => {
    lastEp = performance.now();
    const c = census();
    const ep = { n: ++epN, tMs: e.t, trig, fullD: e.fullD, ...c,
      wA: e.wA, dT: e.dT, dW: e.dW, pg: e.pg, up: { w: e.upW, t: e.upT }, glTileDelta: e.glTileDelta, side: '' };
    ep.side = sideOf(c);
    eps.push(ep);
    console.log(`[wbBlink] ep#${ep.n} t=${(e.t/1000).toFixed(1)}s trig=${trig} side=${ep.side} fullD=${e.fullD} tileCellA=${c.tileCellA} wallCellA=${c.wallCellA} pairs=${c.pairs} ph=${c.phN} noPair=${c.noPair} glTileΔ=${e.glTileDelta} wA=${e.wA} dT=${e.dT} pg=${e.pg} up=${JSON.stringify({ w: e.upW, t: e.upT })}`);
    dumpRing(`ep#${ep.n}`);
  };
  const tick = () => {
    if (!window.__swGame || window.__swGame !== g) { console.warn('[wbBlink] 世界已退出,自动停止'); window.__wbBlink.stop(); return; }
    if (document.hidden) { window.__wbBlink._tm = setTimeout(tick, 60); return; }
    const e = record();
    if (calib.length < 200) {
      calib.push(e);
      if (calib.length === 200) {
        const fd = calib.map((x) => x.fullD).sort((a, b) => a - b);
        const ta = calib.map((x) => x.tileA).filter((x) => x >= 0).sort((a, b) => a - b);
        thFull = Math.max(6, fd[Math.floor(fd.length * 0.99)] * 2.2);
        thLow = thFull * 0.4;
        baseTileA = ta.length ? ta[Math.floor(ta.length * 0.5)] : 0;
        console.log(`[wbBlink] 监听中 th=${thFull.toFixed(1)}(fullD-p50=${fd[Math.floor(fd.length*0.5)].toFixed(2)}) tileA基线=${Math.round(baseTileA)}——正常玩 5 分钟`);
        setTimeout(() => { window.__wbBlink.stop(); }, 300000);
      }
    } else {
      const now = performance.now();
      if (e.fullD > thFull && now - lastEp > 200) emit('fullDiff', e);
      else if (baseTileA > 0 && e.tileA >= 0 && e.tileA < baseTileA * 0.5 && now - lastEp > 200) emit('tileA塌', e);
      else if (e.glTileDelta === 0 && ++stallN >= 3 && now - lastEp > 200) { emit('tile发射停摆', e); stallN = 0; }
      else if (e.glTileDelta > 0) stallN = 0;
      if (devicePixelRatio !== dpr0) { console.log(`[wbBlink] dpr 变化 ${dpr0}→${devicePixelRatio}`); dpr0 = devicePixelRatio; }
    }
    window.__wbBlink._tm = setTimeout(tick, 14);
  };
  window.__wbBlink = {
    episodes: eps, ring,
    stop() { clearTimeout(window.__wbBlink._tm); console.log(`[wbBlink] 已停止,共 ${eps.length} 个 episode。跑 copy(__wbBlink.report()) 导出`); },
    report() { return JSON.stringify({ ver: 4, ua: navigator.userAgent, search: location.search, dpr: devicePixelRatio, cv: [cv.width, cv.height],
      th: thFull, base: { tileA: Math.round(baseTileA) }, resizeN,
      pathTotalDelta: (() => { const o = {}; for (const k of Object.keys(rdr.bglPathStats)) { const d = rdr.bglPathStats[k] - (path0[k] ?? 0); if (d > 0) o[k] = d; } return o; })(),
      episodes: eps, finalCounters: counters() }, null, 1); },
    _tm: 0,
  };
  tick();
  console.log('[wbBlink] v4 已安装(全幅降采样·5 分钟自动收卷)。');
})();
