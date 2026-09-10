/**
 * SW-BJ58 探针 D：变换感知 drawImage 取证。
 * 上一轮教训:probe C 只看【原始 dest 参数】——带世界/平移 transform 的调用原始
 * dx/dy 不落在 row 盒,全部漏记。本轮按【设备空间】(getTransform 展开后的
 * 画布坐标)过滤,并逐帧记录 row 盒像素指纹(判行是否每帧重画)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = [];
window.__bj58Fps = [];
window.__bj58Install = () => {
  const recs = window.__bj58Recs;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58p) return 'already';
  proto.__bj58p = true;
  const oi = proto.drawImage;
  proto.drawImage = function (...a) {
    try {
      if (a[0] && typeof a[0] === 'object') {
        const n = a.length;
        let dx = 0, dy = 0, dw = 0, dh = 0, sx = 0, sy = 0, sw = 0, sh = 0;
        if (n === 9) { [sx, sy, sw, sh, dx, dy, dw, dh] = a.slice(1); }
        else if (n === 5) { [dx, dy] = a.slice(1); }
        else if (n === 4) { [dx, dy, dw, dh] = a.slice(1); }
        const cv = this.canvas;
        if (cv && cv.width >= 1000) {
          const m = this.getTransform();
          const X = m.a * dx + m.c * dy + m.e;
          const Y = m.b * dx + m.d * dy + m.f;
          if (X > 660 && X < 980 && Y > 370 && Y < 420 && recs.length < 6000) {
            const st = new Error().stack.split('\\n');
            recs.push({ sx, sy, sw, sh, dx, dy, dw, dh, X: +X.toFixed(1), Y: +Y.toFixed(1),
              ta: +m.a.toFixed(3), td: +m.d.toFixed(3), te: +m.e.toFixed(1), tf: +m.f.toFixed(1),
              alpha: +this.globalAlpha.toFixed(3), op: this.globalCompositeOperation,
              src: (a[0].width ?? '?') + 'x' + (a[0].height ?? '?'),
              caller: (st[2] || '').trim().slice(0, 120), caller2: (st[3] || '').trim().slice(0, 100), caller3: (st[4] || '').trim().slice(0, 100) });
          }
        }
      }
    } catch (e) {}
    return oi.apply(this, a);
  };
  return 'installed';
};
window.__bj58RowFp = () => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  c2.width = 280; c2.height = 50;
  const cx = c2.getContext('2d', { willReadFrequently: true });
  cx.drawImage(cv, 660, 370, 280, 50, 0, 0, 280, 50);
  const d = cx.getImageData(0, 0, 280, 50).data;
  let fnv = 0x811c9dc5, hit = 0;
  for (let i = 0; i < d.length; i += 4) {
    const q = ((d[i] >> 5) << 10) | ((d[i + 1] >> 5) << 5) | (d[i + 2] >> 5);
    if ((d[i] > 200 && d[i + 1] < 130) || (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 170)) hit++;
    fnv ^= q; fnv = Math.imul(fnv, 0x01000193) >>> 0;
  }
  return { fnv, hit };
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

  // ---- 臂1:基线(无配件)行盒 12 帧指纹 ----
  await page.evaluate(() => { const g = window.__swGame; g.player.inv.armor[3] = null; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; });
  await pump(page, 30, { clearEnemies: true });
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install()');
  const fpNone = [];
  for (let i = 0; i < 12; i++) { await nextFrame(page); fpNone.push(await page.evaluate('window.__bj58RowFp()')); }
  writeFileSync(`${OUT}/fp-none.json`, JSON.stringify(fpNone, null, 2));
  L.say(`[none] rowBox hit/fnv: ${fpNone.map((f) => `${f.hit}/${f.fnv.toString(16).slice(0, 6)}`).join(' ')}`);

  // ---- 臂2:装备 5126 行盒 12 帧指纹 + 设备空间 draw 记录 ----
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 30, { clearEnemies: true });
  await page.evaluate('window.__bj58Recs.length = 0');
  const fpHoc = [];
  for (let i = 0; i < 12; i++) { await nextFrame(page); fpHoc.push(await page.evaluate('window.__bj58RowFp()')); }
  const recs = await page.evaluate(() => window.__bj58Recs);
  writeFileSync(`${OUT}/fp-hoc.json`, JSON.stringify(fpHoc, null, 2));
  writeFileSync(`${OUT}/dev-recs.json`, JSON.stringify(recs, null, 2));
  L.say(`[hoc] rowBox hit/fnv: ${fpHoc.map((f) => `${f.hit}/${f.fnv.toString(16).slice(0, 6)}`).join(' ')}`);
  L.say(`[hoc] device-space rowBox draws=${recs.length}`);
  const byC = {};
  for (const r of recs) { const k = (r.caller || '').replace(/^at /, '').slice(0, 60) + ' <- ' + (r.caller2 || '').replace(/^at /, '').slice(0, 50); byC[k] = (byC[k] ?? 0) + 1; }
  L.say('callers: ' + JSON.stringify(byC));
  await saveCanvasShot(page, `${OUT}/row-d.png`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
