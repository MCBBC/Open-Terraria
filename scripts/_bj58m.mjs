/**
 * SW-BJ58 探针 M：GL 层与全画布清点(同一帧内像素验证)。
 * 探针 L 教训:arms 场景漂移不可比。本轮:装备态单臂,同帧内:
 * ① 像素验证 row 在场(读可见画布盒) + 截图;
 * ② 深扫全部可达画布(含 renderer.glfx.canvas / glfx 内字段 /私有字段递归一层),
 *    读 row 盒像素 → 找精灵像素真正宿主;
 * ③ 2D hook 同帧在录(全方法)——若精灵在场而 2D 调用为零 → 非本 realm 2D 通道
 *   (GL/WebGL/Offscreen 实锤)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

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
  for (const name of METHODS) {
    const orig = proto[name];
    proto[name] = function (...a) {
      try {
        const cv = this.canvas;
        if (cv && cv.width >= 600 && recs.length < 60000) {
          const m = this.getTransform();
          let pts = [];
          if (name === 'drawImage') { const n = a.length; const dx = n === 9 ? a[5] : a[1], dy = n === 9 ? a[6] : a[2]; pts = [[m.a * dx + m.c * dy + m.e, m.b * dx + m.d * dy + m.f]]; }
          else if (name === 'putImageData') pts = [[a[1], a[2]]];
          else if (a.length >= 2 && typeof a[0] === 'number') pts = [[m.a * a[0] + m.c * a[1] + m.e, m.b * a[0] + m.d * a[1] + m.f]];
          else if ((name === 'fill' || name === 'stroke')) pts = [[m.e, m.f]];
          for (const [X, Y] of pts) {
            if (X > 500 && X < 1100 && Y > 300 && Y < 480) {
              recs.push({ m: name, X: +X.toFixed(1), Y: +Y.toFixed(1), fs: typeof this.fillStyle === 'string' ? this.fillStyle : 'obj', a0: a[0] && a[0].width !== undefined ? a[0].width + 'x' + a[0].height : '-', al: +this.globalAlpha.toFixed(2) });
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
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install()');
  await nextFrame(page);

  const dump = await page.evaluate(() => {
    const g = window.__swGame;
    const read = (cv, x, y, w, h) => {
      try {
        if (!cv || !cv.width) return { err: 'no-cv' };
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const cx = c2.getContext('2d', { willReadFrequently: true });
        cx.drawImage(cv, x, y, w, h, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, h).data;
        let hit = 0, nonBg = 0;
        for (let i = 0; i < d.length; i += 4) {
          if ((d[i] > 200 && d[i + 1] < 130) || (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 170)) hit++;
          if (d[i + 3] > 0) nonBg++;
        }
        return { hit, nonBg };
      } catch (e) { return { err: String(e).slice(0, 50) }; }
    };
    const out = { list: [] };
    const seen = new Set();
    const consider = (cv, tag) => {
      if (!cv || seen.has(cv)) return;
      seen.add(cv);
      out.list.push({ tag, w: cv.width, h: cv.height, ...read(cv, 500, 300, 600, 180) });
    };
    consider(g.renderer.canvas, 'renderer.canvas');
    consider(g.renderer.worldCanvas, 'worldCanvas');
    const scan = (obj, prefix, depth) => {
      if (!obj || depth > 2) return;
      for (const k of Object.keys(obj)) {
        let v;
        try { v = obj[k]; } catch (e) { continue; }
        if (!v) continue;
        if (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) consider(v, `${prefix}.${k}`);
        else if (typeof v === 'object' && (v.canvas instanceof HTMLCanvasElement)) consider(v.canvas, `${prefix}.${k}.canvas`);
        else if (typeof v === 'object' && depth < 2 && k.toLowerCase().match(/gl|fx|layer|map|fog|sky/)) scan(v, `${prefix}.${k}`, depth + 1);
      }
    };
    scan(g.renderer, 'renderer', 0);
    document.querySelectorAll('canvas').forEach((cv, i) => consider(cv, `dom[${i}]`));
    return out;
  });
  writeFileSync(`${OUT}/deep-canvas.json`, JSON.stringify(dump, null, 1));
  for (const c of dump.list) L.say(`${c.tag} (${c.w}x${c.h}): rowBox hit=${c.hit ?? c.err} nonBg=${c.nonBg ?? ''}`);
  await page.evaluate('window.__bj58Recs && (window.__bj58Recs.length = 0)');
  for (let i = 0; i < 3; i++) await nextFrame(page);
  const recs = await page.evaluate('window.__bj58Uninstall()');
  writeFileSync(`${OUT}/m-recs.json`, JSON.stringify(recs, null, 1));
  L.say(`2D rowBox 调用(3帧)=${(recs ?? []).length}`);
  const byM = {};
  for (const r of recs ?? []) { const k = `${r.m} fs=${r.fs} a0=${r.a0}`; byM[k] = (byM[k] ?? 0) + 1; }
  for (const [k, v] of Object.entries(byM).sort((a, b) => b[1] - a[1]).slice(0, 12)) L.say(`   ${v} × ${k}`);
  const after = await page.evaluate(() => {
    const g = window.__swGame;
    const c2 = document.createElement('canvas');
    c2.width = 600; c2.height = 180;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(g.renderer.canvas, 500, 300, 600, 180, 0, 0, 600, 180);
    const d = cx.getImageData(0, 0, 600, 180).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i + 1] < 130) || (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 170)) hit++;
    return hit;
  });
  L.say(`记录窗结束后 rowBox hit=${after}(在场性复核)`);
  await saveCanvasShot(page, `${OUT}/row-m.png`);
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
