// SW-BJ61 归因：暗态下黄亮团是谁画的（一次性）——drawImage/fillRect 录制
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame, giveItems, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const DY = 366;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  const pick = await giveItems(page, [{ vid: 3509, slot: 0 }], { select: 0 });
  L.chk('铜镐入槽', pick.ok, JSON.stringify(pick.failed));

  await page.evaluate((dy) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (let x = 40; x <= 90; x++) for (let y = 108 + dy; y <= 140 + dy; y++) {
      const i = st.idx(x, y);
      st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
      st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
    }
    for (let x = 42; x <= 88; x++) st.setTileSilent(x, 132 + dy, 1, 0, 0);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      st.setTileSilent(58 + i, 128 + dy + j, 21, i * 18, j * 18);
    }
    g.chunks.markDirtyArea(40, 108 + dy, 90, 140 + dy);
    const pl = g.player;
    pl.x = 54 * 16; pl.y = (132 + dy) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
    g.world.chests.push({ x: 58, y: 128 + dy, items: Array(40).fill(null), frame: 0 });
  }, DY);
  await pump(page, 60);
  await page.evaluate(() => { window.__swGame.input.keys.add('ControlLeft'); });
  await page.evaluate((dy) => {
    const g = window.__swGame, c = g.camera;
    g.input.mouseX = Math.round((56 * 16 + 8 - c.x) * c.zoom + c.viewW / 2);
    g.input.mouseY = Math.round((132 + dy) * 16 + 8 - c.y) * c.zoom + c.viewH / 2;
  }, DY);
  await pump(page, 10);

  // 录制补丁：主画布 + ui-canvas 一起录
  await page.evaluate(() => {
    window.__recs = [];
    for (const cv of [document.querySelector('#game-root canvas'), document.getElementById('ui-canvas')]) {
      if (!cv) continue;
      const ctx = cv.getContext('2d');
      if (!ctx || ctx.__bj61patched) continue;
      ctx.__bj61patched = true;
      const tag = cv.id || 'main';
      const oDraw = ctx.drawImage.bind(ctx);
      ctx.drawImage = function (img, ...rest) {
        try {
          let dx = null, dy = null, dw = null, dh = null;
          if (rest.length >= 4 && typeof rest[rest.length - 4] === 'number') {
            const k = rest.length; dx = rest[k - 4]; dy = rest[k - 3]; dw = rest[k - 2]; dh = rest[k - 1];
          } else if (rest.length >= 2) { dx = rest[0]; dy = rest[1]; }
          const t = this.getTransform();
          const cw = this.canvas.width, ch = this.canvas.height;
          if (dx != null && dx < cw * 0.75 && dy != null && dy < ch * 0.45 && dx > cw * 0.2) {
            window.__recs.push({
              tag, kind: 'drawImage',
              src: (img && (img.__srcName || (img.src ? String(img.src).slice(-70) : img.width + 'x' + img.height))) || String(img),
              dx: Math.round(dx), dy: Math.round(dy), dw: dw == null ? null : Math.round(dw), dh: dh == null ? null : Math.round(dh),
              t: [Math.round(t.a * 100) / 100, Math.round(t.d * 100) / 100, Math.round(t.e), Math.round(t.f)],
              alpha: Math.round(this.globalAlpha * 100) / 100,
              caller: (new Error().stack.split('\n')[2] || '').trim().replace(/^at /, '').slice(0, 100),
            });
          }
        } catch (e) { /* noop */ }
        return oDraw(img, ...rest);
      };
      const oFill = ctx.fillRect.bind(ctx);
      ctx.fillRect = function (x, y, w, h) {
        try {
          const cw = this.canvas.width, ch = this.canvas.height;
          if (x < cw * 0.75 && y < ch * 0.45 && x > cw * 0.2) {
            window.__recs.push({
              tag: this.canvas.id || 'main', kind: 'fillRect', style: String(this.fillStyle),
              dx: Math.round(x), dy: Math.round(y), dw: Math.round(w), dh: Math.round(h),
              caller: (new Error().stack.split('\n')[2] || '').trim().replace(/^at /, '').slice(0, 100),
            });
          }
        } catch (e) { /* noop */ }
        return oFill(x, y, w, h);
      };
    }
    return 'patched';
  });
  window_rec_marker: {
    await page.evaluate(() => { window.__recs.length = 0; });
    await nextFrame(page);
    await nextFrame(page);
  }
  const recs = await page.evaluate(() => { const r = window.__recs.slice(); window.__recs.length = 0; return r; });
  console.log('RECS n=', recs.length);
  const audit = await page.evaluate((dy) => {
    const g = window.__swGame, c = g.camera;
    const cv = window.__swGame.renderer.canvas;
    const ctx = cv.getContext('2d');
    const canvases = [...document.querySelectorAll('#game-root canvas')].map((k) => ({
      w: k.width, h: k.height, id: k.id || '(none)', cls: k.className,
    }));
    const S = (wx, wy) => [Math.round((wx - c.x) * c.zoom + cv.width / 2),
                           Math.round((wy - c.y) * c.zoom + cv.height / 2)];
    const px = (wx, wy) => {
      const [sx, sy] = S(wx, wy);
      const d = ctx.getImageData(sx, sy, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    return {
      canvases,
      cvWH: [cv.width, cv.height],
      cam: { x: c.x, y: c.y, zoom: c.zoom, viewW: c.viewW, viewH: c.viewH },
      sc: { showing: g.smartCursor.showing, x: g.smartCursor.x, y: g.smartCursor.y },
      chestPx: px(58 * 16 + 8, (128 + dy) * 16 + 8),
      boxPx: px(55 * 16 + 8, (132 + dy) * 16 + 8),
      floorPx: px(70 * 16 + 8, (132 + dy) * 16 + 8),
      chestScreen: S(58 * 16 + 8, (128 + dy) * 16 + 8),
      lightChest: g.lighting.lightAt(58, 128 + dy),
    };
  }, DY);
  console.log('AUDIT', JSON.stringify(audit, null, 1));
  // 火把归因：放置后 pump → wanted/keys/光照/错误环
  await page.evaluate(() => {
    window.__errs = [];
    window.addEventListener('error', (e) => window.__errs.push(String(e.message).slice(0, 200)));
  });
  await page.evaluate((dy) => {
    const g = window.__swGame, st = g.world.store;
    st.setTileSilent(61, 131 + dy, 4, 0, 0);
    g.chunks.markDirtyArea(59, 129 + dy, 63, 133 + dy);
  }, DY);
  await pump(page, 30);
  await page.evaluate(() => { window.__swGame.input.keys.add('ControlLeft'); });
  await pump(page, 10);
  const torchAudit = await page.evaluate((dy) => {
    const g = window.__swGame;
    return {
      wanted: g.smartCursor.wanted, showing: g.smartCursor.showing,
      keys: [...g.input.keys],
      lightChest: g.lighting.lightAt(58, 128 + dy),
      lightTorch: g.lighting.lightAt(61, 131 + dy),
      errs: window.__errs,
    };
  }, DY);
  console.log('TORCH', JSON.stringify(torchAudit, null, 1));
  const seen = new Map();
  for (const r of recs) {
    const k = r.kind + '|' + (r.src || r.style) + '|' + r.caller;
    const e = seen.get(k) ?? { n: 0, sample: r };
    e.n++;
    seen.set(k, e);
  }
  for (const [k, e] of seen) console.log('---', e.n, 'x', k, '\n', JSON.stringify(e.sample));
  await page.screenshot({ path: '/tmp/probe-out/_bj61/who-dark.png' });
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
