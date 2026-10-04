#!/usr/bin/env node
// ★诊断：静止时 hudRuns 1/3 帧击穿的归因（哪个签名分量在变）+ minimapRect 零值定位。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5211';
const log = (...a) => console.log('[mm-diag]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await (async () => {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 1200 });
    await godMode(page, true);
    await page.evaluate(() => { window.__swGame.renderer.mapStyle = 1; });
    await sleep(2500);

    const state = await page.evaluate(() => {
      const g = window.__swGame;
      const r = g.renderer;
      return {
        mapStyle: r.mapStyle, fullOpen: r.fullMap?.open, rect: { ...r.minimapRect },
        hasMinimap: !!r.minimap, mapVersion: r.minimap?.mapVersion,
        playerX: g.player.x, canvasW: (g.canvas ?? document.querySelector('canvas')).width,
        cssW: (g.canvas ?? document.querySelector('canvas')).clientWidth,
      };
    });
    log('STATE', JSON.stringify(state));

    // 90 帧逐帧采样签名分量
    const frames = await page.evaluate(() => new Promise((res) => {
      const g = window.__swGame;
      const r = g.renderer;
      const mm = r.minimap;
      const viewTiles = Math.max(40, Math.round(240 / r.minimapZoom));
      const px = g.player.cx / 16, py = g.player.cy / 16;
      const sx = Math.max(0, Math.min(mm.w - viewTiles, Math.floor(px - viewTiles / 2)));
      const sy = Math.max(0, Math.min(mm.h - viewTiles, Math.floor(py - viewTiles / 2)));
      const rows = [];
      let n = 0;
      const step = () => {
        rows.push({
          mv: mm.mapVersion, fs: r.fogBufSerial, dirty: mm.dirtyChunks.size,
          rects: mm.flushedPixelRects.length, sx, sy, px: +g.player.x.toFixed(2),
          exploredV: g.world.exploredVersion, exploredDirty: !!g.world.exploredDirty,
        });
        if (++n >= 90) { res(rows); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }));
    // 归因:哪些分量变了
    const mvChanges = frames.filter((f, i) => i && f.mv !== frames[i - 1].mv).length;
    const fsChanges = frames.filter((f, i) => i && f.fs !== frames[i - 1].fs).length;
    const dirtyNonZero = frames.filter((f) => f.dirty > 0).length;
    const rectsNonZero = frames.filter((f) => f.rects > 0).length;
    const expVChanges = frames.filter((f, i) => i && f.exploredV !== frames[i - 1].exploredV).length;
    const pxChanges = frames.filter((f, i) => i && f.px !== frames[i - 1].px).length;
    log('ATTR', JSON.stringify({ mvChanges, fsChanges, dirtyNonZero, rectsNonZero, expVChanges, pxChanges }));
    // mapVersion 变化帧的脏 chunk 坐标(前 5 帧):判窗口内外
    const dirtySamples = await page.evaluate(() => {
      const g = window.__swGame;
      const mm = g.renderer.minimap;
      const out = [];
      return new Promise((res) => {
        let n = 0;
        const viewTiles = Math.max(40, Math.round(240 / g.renderer.minimapZoom));
        const px = g.player.cx / 16, py = g.player.cy / 16;
        const sx = Math.max(0, Math.min(mm.w - viewTiles, Math.floor(px - viewTiles / 2)));
        const sy = Math.max(0, Math.min(mm.h - viewTiles, Math.floor(py - viewTiles / 2)));
        const step = () => {
          if (mm.dirtyChunks.size) {
            const chunks = [...mm.dirtyChunks].slice(0, 8).map((k) => {
              const cx = (k & 0xffff) << 16 >> 16, cy = (k >> 16) << 16 >> 16;
              return [cx * 200, cy * 200];   // CHUNK=200? 试探——矩形宽=CHUNK
            });
            out.push({ dirty: mm.dirtyChunks.size, chunks, win: [sx, sy, sx + viewTiles, sy + viewTiles] });
          }
          if (++n >= 240) res(out.slice(0, 6));
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    });
    log('DIRTY', JSON.stringify(dirtySamples));
    log('CHUNK_SIZE', JSON.stringify(await page.evaluate(() => {
      // CHUNK 常量确认
      return { CHUNKtry: window.__swGame.world.store.w, note: 'see dirtySamples rect coords' };
    })));
  } finally {
    await closeAllBrowsers();
  }
})().catch((e) => { console.error('[mm-diag] fatal:', e); process.exit(1); });
