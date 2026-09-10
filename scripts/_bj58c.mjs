/**
 * SW-BJ58 探针 C：行的绘制通道定谳（canvas vs DOM vs GL/Offscreen/putImageData）。
 * ① 长 settle(>1s 游戏时间)后 canvas shot + page shot 同帧对比（行在不在两层）;
 * ② 全通道 hook：2D drawImage / OffscreenCanvas drawImage / putImageData /
 *    pattern fillRect —— 记录主画布 row 盒(屏 680-940 × 370-410)与小画布全部调用;
 * ③ 行盒像素指纹（判行是否真的在 canvas 上）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, screenshot, saveCanvasShot, savePageShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = [];
window.__bj58Install = () => {
  const recs = window.__bj58Recs;
  const want = (cv, dx, dy) => {
    const w = cv.width, h = cv.height;
    if (w >= 1000 && h >= 600) {
      if (dx > 600 && dx < 1040 && dy > 330 && dy < 450) return true;          // 屏 row 盒
      const g = window.__swGame; const p = g && g.player;
      if (p && dx > p.cx - 520 && dx < p.cx + 520 && dy > p.cy - 240 && dy < p.cy + 240) return true;   // 世界盒
      return false;
    }
    return w * h <= 270 * 270;                                                  // 小画布全记
  };
  const mk = (proto, tag) => {
    if (!proto || proto.__bj58p) return;
    proto.__bj58p = true;
    const oi = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        if (a[0] && typeof a[0] === 'object' && want(this.canvas, a[a.length - 2] | 0, a[a.length - 1] | 0) && recs.length < 8000) {
          const st = new Error().stack.split('\\n');
          recs.push({ m: tag + '.drawImage', cv: this.canvas.width + 'x' + this.canvas.height,
            dx: a[a.length - 2], dy: a[a.length - 1],
            sx: a.length === 9 ? a[1] : 0, sy: a.length === 9 ? a[2] : 0, sw: a.length === 9 ? a[3] : 0, sh: a.length === 9 ? a[4] : 0,
            src: (a[0].width ?? '?') + 'x' + (a[0].height ?? '?'),
            alpha: +this.globalAlpha.toFixed(3),
            caller: (st[2] || '').trim().slice(0, 110), caller2: (st[3] || '').trim().slice(0, 90), caller3: (st[4] || '').trim().slice(0, 90) });
        }
      } catch (e) {}
      return oi.apply(this, a);
    };
    const op = proto.putImageData;
    proto.putImageData = function (...a) {
      try {
        if (want(this.canvas, a[1] | 0, a[2] | 0) && recs.length < 8000) {
          const st = new Error().stack.split('\\n');
          recs.push({ m: tag + '.putImageData', cv: this.canvas.width + 'x' + this.canvas.height, dx: a[1], dy: a[2],
            caller: (st[2] || '').trim().slice(0, 110), caller2: (st[3] || '').trim().slice(0, 90), caller3: (st[4] || '').trim().slice(0, 90) });
        }
      } catch (e) {}
      return op.apply(this, a);
    };
    const of = proto.fillRect;
    proto.fillRect = function (x, y, w, h) {
      try {
        if (this.fillStyle && typeof this.fillStyle === 'object' && want(this.canvas, x | 0, y | 0) && recs.length < 8000) {
          const st = new Error().stack.split('\\n');
          recs.push({ m: tag + '.fillRect[pattern]', cv: this.canvas.width + 'x' + this.canvas.height, dx: x, dy: y, sw: w, sh: h,
            caller: (st[2] || '').trim().slice(0, 110), caller2: (st[3] || '').trim().slice(0, 90), caller3: (st[4] || '').trim().slice(0, 90) });
        }
      } catch (e) {}
      return of.call(this, x, y, w, h);
    };
  };
  mk(CanvasRenderingContext2D.prototype, '2D');
  mk(globalThis.OffscreenCanvasRenderingContext2D?.prototype, 'OFF');
  return 'installed';
};
'ok';
`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 60, { clearEnemies: true });
  const iid5126 = await itemByVid(page, 5126);
  await page.evaluate((iid) => {
    const g = window.__swGame;
    g.player.inv.armor[3] = { id: iid, stack: 1 };
    g.player.facing = 1;
    g.player.vx = 0; g.player.vy = 0;
  }, iid5126);
  await pump(page, 120, { clearEnemies: true });   // 长 settle:排除渐显/计时器未到
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install()');
  for (let i = 0; i < 6; i++) await nextFrame(page);

  // 同帧双拍:canvas(纯画布) + page(含 DOM)
  await saveCanvasShot(page, `${OUT}/row-canvas.png`);
  await savePageShot(page, `${OUT}/row-page.png`);

  const recs = await page.evaluate(() => window.__bj58Recs);
  writeFileSync(`${OUT}/chan-recs.json`, JSON.stringify(recs, null, 2));
  const byCaller = {};
  for (const r of recs) byCaller[r.caller.slice(0, 70)] = (byCaller[r.caller.slice(0, 70)] ?? 0) + 1;
  L.say(`recs=${recs.length}`);
  L.say('callers: ' + JSON.stringify(byCaller, null, 1).slice(0, 1600));
  // 主画布 row 盒内的调用明细
  const main = recs.filter((r) => r.cv === '1280x800');
  L.say(`mainCanvasRowBox=${main.length}`);
  for (const r of main.slice(0, 20)) L.say(`  ${JSON.stringify(r).slice(0, 260)}`);

  await screenshot(page, 'bj58c-row', { time: 'day', wx: (await page.evaluate(() => window.__swGame.player.cx)), wy: (await page.evaluate(() => window.__swGame.player.cy)), w: 110, h: 70, onDark: 'auto' });
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
