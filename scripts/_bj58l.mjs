/**
 * SW-BJ58 探针 L：全画布 API 全面监听(判别力收口)。
 * 已排除:drawImage(全画布全变换)/putImageData(盒过滤)/g.particles(fillRect 色块池)。
 * 本轮 patch 2D 原型【全部绘制方法】,按设备空间盒过滤 row 盒,装备/摘除两态对拍,
 * 计数差集=绘制通道定谳。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = null;
window.__bj58Install = () => {
  const recs = [];
  window.__bj58Recs = recs;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58p) return 'already';
  proto.__bj58p = true;
  const METHODS = ['drawImage', 'putImageData', 'fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'fillText', 'strokeText'];
  const dev = (ctx, x, y) => {
    const m = ctx.getTransform();
    return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  };
  for (const name of METHODS) {
    const orig = proto[name];
    proto[name] = function (...a) {
      try {
        const cv = this.canvas;
        if (cv && cv.width >= 1000 && recs.length < 60000) {
          const pts = [];
          if (name === 'fill' || name === 'stroke' || name === 'clearRect' || name === 'fillRect' || name === 'strokeRect') {
            if (a.length >= 2) pts.push(dev(this, a[0], a[1]));
          } else if (name === 'fillText' || name === 'strokeText') {
            pts.push(dev(this, a[1], a[2]));
          } else if (name === 'drawImage') {
            const n = a.length;
            const dx = n === 9 ? a[5] : a[1], dy = n === 9 ? a[6] : a[2];
            pts.push(dev(this, dx, dy));
          } else if (name === 'putImageData') {
            pts.push([a[1], a[2]]);
          }
          for (const [X, Y] of pts) {
            if (X > 640 && X < 1000 && Y > 350 && Y < 430) {
              recs.push({ m: name, X: +X.toFixed(1), Y: +Y.toFixed(1),
                fs: typeof this.fillStyle === 'string' ? this.fillStyle : 'obj',
                font: name.includes('Text') ? this.font : undefined,
                alpha: +this.globalAlpha.toFixed(2), op: this.globalCompositeOperation,
                a0: a[0] && a[0].width !== undefined ? a[0].width + 'x' + a[0].height : String(a[0]).slice(0, 20),
                args: a.length <= 4 ? a.map((v) => (typeof v === 'number' ? +v.toFixed(1) : typeof v === 'string' ? v.slice(0, 24) : typeof v)).join(',') : '' });
            }
          }
        }
      } catch (e) {}
      return orig.apply(this, a);
    };
  }
  return 'installed';
};
window.__bj58Uninstall = () => { const r = window.__bj58Recs; window.__bj58Recs = null; return r; };
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
  await page.evaluate(INSTALL);

  const arm = async (name, iid) => {
    await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = iid ? { id: iid, stack: 1 } : null; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid);
    await pump(page, 45, { clearEnemies: true });
    await page.evaluate('window.__bj58Install(); window.__bj58Recs && (window.__bj58Recs.length = 0)');
    for (let i = 0; i < 3; i++) await nextFrame(page);
    const recs = await page.evaluate('window.__bj58Uninstall()');
    writeFileSync(`${OUT}/all-api-${name}.json`, JSON.stringify(recs, null, 1));
    const byM = {};
    for (const r of recs ?? []) byM[`${r.m} fs=${r.fs} op=${r.op} a0=${r.a0 ?? ''}`] = (byM[`${r.m} fs=${r.fs} op=${r.op} a0=${r.a0 ?? ''}`] ?? 0) + 1;
    L.say(`[${name}] rowBox 调用=${(recs ?? []).length}`);
    for (const [k, v] of Object.entries(byM).sort((a, b) => b[1] - a[1]).slice(0, 14)) L.say(`   ${v} × ${k}`);
    return recs;
  };

  await arm('none', null);
  await arm('hoc', iid5126);
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
