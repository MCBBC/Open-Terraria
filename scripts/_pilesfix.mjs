// 沙漠石堆 187 贴图错位修复·终版探针（2026-08-17）：
// ①扫自然 187 簇（fresh 世界=原始换带帧 fx2808+；用户存量档=零帧）
// ②传送+渲染，recording-ctx 逐格断言：带帧格走分带换算（sx=带内列偏移）；
//   零帧化后（=用户档形态）整段 run 模数切块 sx 循环 [0,18,36]（旧逻辑 36 重复）
// ③像素层：3×2 六格哈希 ≥4 种（塌碎时几乎全同）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
// TownNPC.socialUpdate 中性桩（并行会话半成品，见 _alchemyfix 注释）
await page.evaluateOnNewDocument(() => {
  const poll = () => {
    if (window.__swGame) {
      import('/src/entities/TownNPC.ts').then((m) => {
        if (m?.TownNPC && typeof m.TownNPC.prototype.socialUpdate !== 'function') {
          m.TownNPC.prototype.socialUpdate = function () { return false; };
        }
      }).catch(() => {});
      return;
    }
    setTimeout(poll, 20);
  };
  poll();
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { drawVanillaCell } = await import('/src/render/VanillaTiler.ts');
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const PILE = TILE_BY_KEY['v_187_decos_3x2_group_2'];
  const atlas = g.renderer.atlas ?? g.atlas;
  const def = TILE_DEFS[PILE];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ---- ① 找最长同型零散 run（4 邻接连通簇；天然可能带帧或零帧——fresh 小世界应为带帧） ----
  let best = null;
  const seen = new Set();
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== PILE || seen.has(i)) continue;
      const cells = [];
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const ci = st.idx(cx, cy);
        if (cx < 0 || cy < 0 || cx >= st.w || cy >= st.h || seen.has(ci)) continue;
        if (!st.flags[ci] || st.type[ci] !== PILE) continue;
        seen.add(ci); cells.push([cx, cy]);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      const w = Math.max(...cells.map(c => c[0])) - Math.min(...cells.map(c => c[0])) + 1;
      if (!best || cells.length > best.cells.length) best = { cells, w, x: Math.min(...cells.map(c => c[0])), y: Math.min(...cells.map(c => c[1])) };
    }
  }
  if (!best) return { noPile: true };

  // ---- ② 传送 + 等（渲染+素材懒加载） ----
  p.x = best.x * 16 + 24; p.y = (best.y + 1) * 16 - p.h; p.vx = 0; p.vy = 0;
  await wait(1500);

  const draw1 = (x, y) => {
    const i = st.idx(x, y);
    const calls = [];
    drawVanillaCell({ drawImage: (_im, sx, sy) => calls.push([sx, sy]) }, atlas,
      187, 'style', def.vanilla.fw, def.vanilla.fh, st, x, y, PILE,
      (t) => t === PILE, 0, 0, st.frameX[i], st.frameY[i]);
    return calls[0] ?? null;
  };
  // 底行逐格 recording（按 x 升序，跨整个 run）
  const bottomRow = [];
  const yB = best.y + 1;
  for (let x = best.x; x < best.x + best.w; x++) {
    if (st.type[st.idx(x, yB)] === PILE) bottomRow.push({ x, r: draw1(x, yB), fx: st.frameX[st.idx(x, yB)] });
  }
  const naturalRects = bottomRow.map(c => c.r);

  // ---- ③ 零帧化（用户存量档形态）→ invalidate → 再 recording ----
  for (const [cx, cy] of best.cells) {
    const ci = st.idx(cx, cy);
    st.frameX[ci] = 0; st.frameY[ci] = 0;
  }
  const cc = g.renderer.chunkCache ?? g.renderer.chunks;
  if (cc?.invalidateAll) cc.invalidateAll();
  else for (const k of Object.keys(g.renderer)) { const v = g.renderer[k]; if (v?.invalidateAll) v.invalidateAll(); }
  await wait(1000);
  const zeroRects = bottomRow.map(c => draw1(c.x, yB));

  // ---- ④ 像素层（零帧轮） ----
  const cam = g.camera, cv = g.renderer.canvas;
  const spx = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const hash = (d) => { let h = 0; for (let i = 0; i < d.length; i += 12) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; return h; };
  const pixCells = [];
  for (let dx = 0; dx < Math.min(best.w, 6); dx++) {
    for (let dy = 0; dy < 2; dy++) {
      const [sx, sy] = spx((best.x + dx) * 16 + 2, (best.y + dy) * 16 + 2);
      pixCells.push(hash(g.renderer.ctx.getImageData(sx, sy, 8, 8).data));
    }
  }
  return {
    cluster: { x: best.x, y: best.y, w: best.w, n: best.cells.length },
    rawFxs: bottomRow.map(c => c.fx).slice(0, 9),
    naturalRects, zeroRects,
    zeroSxCycle: zeroRects.map(r => (r ? r[0] : null)),
    pixDistinct: new Set(pixCells).size, pixN: pixCells.length,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
const sx = (out.zeroSxCycle ?? []).filter(v => v !== null);
const cycleOK = sx.length >= 4 && sx.every((v, i) => v === (i % 3) * 18);
await browser.close();
process.exit(errors.length || !cycleOK || (out.pixDistinct ?? 0) < 4 ? 1 : 0);
