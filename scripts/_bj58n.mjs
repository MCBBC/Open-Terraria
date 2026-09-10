/**
 * SW-BJ58 探针 N：带调用栈与源矩形的收口记录。
 * 探针 M 发现可疑家族:384x112 源 ×9 @(990,403..407) 等——但 M 未记源矩形/调用栈。
 * 本轮:6 帧、记录 (caller 链+源矩形+设备坐标+alpha+op),Node 侧对 6 连家族画像。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = [];
window.__bj58Install = () => {
  const recs = window.__bj58Recs;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58p) return 'already';
  proto.__bj58p = true;
  const oi = proto.drawImage;
  proto.drawImage = function (...a) {
    try {
      const cv = this.canvas;
      if (a[0] && a[0].width !== undefined && cv && cv.width >= 600 && recs.length < 120000) {
        const n = a.length;
        let sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0;
        if (n === 9) { [sx, sy, sw, sh, dx, dy] = a.slice(1, 7); }
        else { dx = a[1]; dy = a[2]; }
        const m = this.getTransform();
        const X = m.a * dx + m.c * dy + m.e, Y = m.b * dx + m.d * dy + m.f;
        if (X > 500 && X < 1100 && Y > 300 && Y < 480) {
          const st = new Error().stack.split('\\n');
          recs.push({ X: +X.toFixed(1), Y: +Y.toFixed(1), cvw: cv.width, cvh: cv.height,
            sx, sy, sw, sh, dw: n === 9 ? a[7] : sw, dh: n === 9 ? a[8] : sh,
            iw: a[0].width, ih: a[0].height, al: +this.globalAlpha.toFixed(2), op: this.globalCompositeOperation,
            c1: (st[2] || '').trim().slice(0, 110), c2: (st[3] || '').trim().slice(0, 90), c3: (st[4] || '').trim().slice(0, 90) });
        }
      }
    } catch (e) {}
    return oi.apply(this, a);
  };
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
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install()');
  await page.evaluate('window.__bj58Recs.length = 0');
  for (let i = 0; i < 6; i++) await nextFrame(page);
  const recs = await page.evaluate(() => window.__bj58Recs);
  writeFileSync(`${OUT}/n-recs.json`, JSON.stringify(recs));
  L.say(`records=${recs.length}`);
  await saveCanvasShot(page, `${OUT}/row-n.png`);
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
