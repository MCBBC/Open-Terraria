// ★闪屏 console 取证器（粘贴进游戏页 DevTools Console 一条式运行）
// 用法：进世界→站定到会闪的场景→粘贴本段→等 [wbBlink] ep#N 逐条出现（闪几次）→
//       跑 __wbBlink.stop() → 跑 copy(__wbBlink.report()) → 把剪贴板 JSON 发回。
// 分层判据：tile 页画布 cell α（烘焙真值）在而最终画布塌=GL 上传/段发射侧；
//           cell α 同塌=画布/烘焙侧；可见环出现占位对=wbake/预算占位族。
(() => {
  if (window.__wbBlink?.stop) window.__wbBlink.stop();
  const g = window.__swGame;
  if (!g?.chunks?.chunks) { console.warn('[wbBlink] __swGame 未就绪(需在世界内)'); return; }
  const chunks = g.chunks, rdr = g.renderer, cv = rdr.canvas;
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
  const CX = cv.width >> 1, CY = cv.height >> 1, S = 240;
  let ref = grab(cv, CX - S/2, CY - S/2, S, S);
  const calib = [];
  let th = 0, low = 0, epN = 0, t0 = performance.now(), lastMark = -1e9;
  const eps = [], path0 = { ...rdr.bglPathStats }, pathEp = { ...rdr.bglPathStats };
  const counters = () => ({
    workerAwaiting: chunks.workerAwaiting.size, pageCount: chunks.pageCount,
    chunksMap: chunks.chunks.size, dirtyQ: chunks.dirtyQueue.length,
    dT: chunks.glDirtyPagesT.size, dW: chunks.glDirtyPagesW.size,
    up: { ...rdr['_bglPageUploaded'] },
  });
  const pathDelta = (base) => { const o = {}; for (const k of Object.keys(rdr.bglPathStats)) { const d = rdr.bglPathStats[k] - (base[k] ?? 0); if (d > 0) o[k] = d; } return o; };
  const census = () => {
    const ccx = Math.floor(g.camera.x / 256), ccy = Math.floor(g.camera.y / 256);
    let tileA = 0, wallA = 0, n = 0, phN = 0, noPair = 0;
    const cells = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const p = chunks.chunks.get(key(ccx + dx, ccy + dy));
      if (!p) { noPair++; continue; }
      if (p.placeholder) { phN++; continue; }
      const pg = Math.floor(p.cell / 16);
      const tp = chunks['tilePages'][pg], wp = chunks['wallPages'][pg];
      if (tp) { const a = meanA(grab(tp, p.sx + 112, p.sy + 112, 32, 32)); tileA += a; if (cells.length < 4) cells.push({ c: [ccx+dx, ccy+dy], tileA: +a.toFixed(0) }); }
      if (wp) wallA += meanA(grab(wp, p.sx + 112, p.sy + 112, 32, 32));
      n++;
    }
    return { tileCellA: n ? +(tileA / n).toFixed(0) : -1, wallCellA: n ? +(wallA / n).toFixed(0) : -1, pairs: n, phN, noPair, cells };
  };
  const tick = () => {
    if (!window.__swGame || window.__swGame !== g) { console.warn('[wbBlink] 世界已退出,自动停止'); window.__wbBlink.stop(); return; }
    if (document.hidden) { window.__wbBlink._tm = setTimeout(tick, 60); return; }
    const d = diffOf(grab(cv, CX - S/2, CY - S/2, S, S), ref);
    if (th === 0) {
      calib.push(d);
      if (calib.length >= 160) {
        const s = [...calib].sort((a, b) => a - b);
        th = Math.max(22, s[Math.floor(s.length * 0.97)] * 1.7); low = th * 0.45;
        console.log(`[wbBlink] 监听中 th=${th.toFixed(1)}(p50=${s[Math.floor(s.length*0.5)].toFixed(1)})——等闪屏,别开背包/地图`);
      }
    } else if (d > th && performance.now() - lastMark > 120) {
      lastMark = performance.now();
      setTimeout(() => {
        const d2 = diffOf(grab(cv, CX - S/2, CY - S/2, S, S), ref);
        if (d2 > low) {   // 持续变化(开背包/场景变)→静默换基准,不算闪
          ref = grab(cv, CX - S/2, CY - S/2, S, S);
          return;
        }
        // 瞬态=真闪屏:三层同位取证
        const c = census();
        const fin = grab(cv, CX - S/2, CY - S/2, S, S);
        let lum = 0; for (let i = 0; i < fin.length; i += 4) lum += (fin[i] + fin[i+1] + fin[i+2]) / 3; lum /= fin.length / 4;
        const ep = { n: ++epN, tMs: Math.round(performance.now() - t0), diff: +d.toFixed(1),
          finLuma: Math.round(lum), cam: [Math.round(g.camera.x), Math.round(g.camera.y)], ...c, ...counters(),
          pathDelta: pathDelta(pathEp) };
        Object.assign(pathEp, rdr.bglPathStats);
        eps.push(ep);
        const side = c.tileCellA < 0 ? 'NO-PAIR' : (c.tileCellA < 96 && c.wallCellA > 200) ? 'CANVAS(tile层烘焙/画布)'
          : c.tileCellA < 96 ? 'CANVAS(墙tile同塌)' : (c.phN > 0 || c.noPair > 0) ? 'PLACEHOLDER' : 'GL/SEGMENT(页画布完好→查上传/发射)';
        ep.side = side;
        console.log(`[wbBlink] ep#${ep.n} t=${(ep.tMs/1000).toFixed(1)}s diff=${ep.diff} side=${side} tileCellA=${c.tileCellA} wallCellA=${c.wallCellA} pairs=${c.pairs} ph=${c.phN} noPair=${c.noPair} wA=${ep.workerAwaiting} dT=${ep.dT} pg=${ep.pageCount} up=${JSON.stringify(ep.up)} pathΔ=${JSON.stringify(ep.pathDelta)}`);
        ref = grab(cv, CX - S/2, CY - S/2, S, S);
      }, 300);
    }
    window.__wbBlink._tm = setTimeout(tick, 14);
  };
  window.__wbBlink = {
    episodes: eps,
    stop() { clearTimeout(window.__wbBlink._tm); console.log(`[wbBlink] 已停止,共 ${eps.length} 个 episode。跑 copy(__wbBlink.report()) 导出`); },
    report() { return JSON.stringify({ ver: 1, ua: navigator.userAgent, search: location.search, dpr: devicePixelRatio, cv: [cv.width, cv.height],
      install: { pageCount: counters(), pathTotalDelta: pathDelta(path0) }, episodes: eps, finalCounters: counters(), pathFinalDelta: pathDelta(path0) }, null, 1); },
    _tm: 0,
  };
  tick();
  console.log('[wbBlink] 已安装,校准中(2s)……之后每闪一次打印一条 ep# 行');
})();
