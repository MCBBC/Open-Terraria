/**
 * SW-BJ58 探针 H：烘焙现行(g.chunks 直驱)。
 * ① 定位精灵所在 chunk 页/cell:直读各 chunk cell 像素,找橙斑;
 * ② g.chunks.markDirtyArea + flushDirty(64) 现行重烘,全量记录页画布 drawImage,
 *    抓烘焙期画精灵的调用栈(定谳元凶);
 * ③ A/B:摘除配件重烘同 chunk,页上橙斑是否不再出现。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = [];
window.__bj58Install = () => {
  const recs = window.__bj58Recs;
  let cid = 0;
  const ids = new WeakMap();
  const cvId = (cv) => { let v = ids.get(cv); if (v === undefined) { v = ++cid; ids.set(cv, v); } return v; };
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58p) return 'already';
  proto.__bj58p = true;
  const oi = proto.drawImage;
  proto.drawImage = function (...a) {
    try {
      if (a[0] && typeof a[0] === 'object' && recs.length < 240000) {
        const n = a.length;
        let dx = 0, dy = 0, dw = 0, dh = 0, sx = 0, sy = 0, sw = 0, sh = 0;
        if (n === 9) { [sx, sy, sw, sh, dx, dy, dw, dh] = a.slice(1); }
        else if (n === 5) { [dx, dy] = a.slice(1); }
        else if (n === 4) { [dx, dy, dw, dh] = a.slice(1); }
        const m = this.getTransform();
        const X = m.a * dx + m.c * dy + m.e, Y = m.b * dx + m.d * dy + m.f;
        const cv = this.canvas;
        const st = new Error().stack.split('\\n');
        recs.push([cvId(cv), cv.width, cv.height,
          +X.toFixed(1), +Y.toFixed(1), dx, dy,
          sx, sy, sw, sh, dw, dh, (a[0].width ?? -1), (a[0].height ?? -1),
          +this.globalAlpha.toFixed(2),
          (st[2] || '').trim().slice(30, 110), (st[3] || '').trim().slice(30, 100), (st[4] || '').trim().slice(30, 100), (st[5] || '').trim().slice(30, 100)]);
      }
    } catch (e) {}
    return oi.apply(this, a);
  };
  return 'installed';
};
/** 读全部 chunk cell 像素,回报含橙斑的 cell(页画布标识+cell 原点+橙斑计数) */
window.__bj58ScanPages = () => {
  const g = window.__swGame;
  const cc = g.chunks;
  const out = [];
  const seen = new Set();
  for (const [key, pair] of cc.chunks) {
    const cv = pair.tile;
    const id = (cv.__id = cv.__id || (++seen.size + Math.random()));
    const c2 = document.createElement('canvas');
    c2.width = 256; c2.height = 256;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, pair.sx, pair.sy, 256, 256, 0, 0, 256, 256);
    const d = cx.getImageData(0, 0, 256, 256).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i + 1] < 130) || (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 170)) hit++;
    out.push({ key, sx: pair.sx, sy: pair.sy, w: cv.width, h: cv.height, hit });
  }
  return out;
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

  const scan = await page.evaluate('window.__bj58ScanPages()');
  const hot = scan.filter((s) => s.hit > 30).sort((a, b) => b.hit - a.hit).slice(0, 12);
  L.say(`chunks=${scan.length} 橙斑热点(>30): ${JSON.stringify(hot)}`);
  writeFileSync(`${OUT}/pages-scan.json`, JSON.stringify(scan, null, 1));

  // ---- 现行重烘:记录 flushDirty 期间页画布 drawImage ----
  await page.evaluate('window.__bj58Recs.length = 0');
  const flushed = await page.evaluate(() => {
    const g = window.__swGame;
    g.chunks.markDirtyArea(2096, 256, 2130, 280);
    const n = g.chunks.flushDirty(64, 500);
    return { n, dirty: g.chunks.dirtyQueue.length };
  });
  L.say(`flushDirty: ${JSON.stringify(flushed)}`);
  const recs = await page.evaluate(() => window.__bj58Recs);
  writeFileSync(`${OUT}/flush-recs.json`, JSON.stringify(recs));
  L.say(`records during flush=${recs.length}`);
  const from = {};
  for (const r of recs) {
    if (r[1] >= 512) {   // 页画布(≥512)
      const k = `cv${r[0]}(${r[1]}x${r[2]}) src=${r[13]}x${r[14]} rect=(${r[7]},${r[8]},${r[9]},${r[10]}) ${String(r[16]).split('/').pop()?.slice(0, 34)} <- ${String(r[17]).split('/').pop()?.slice(0, 26)} <- ${String(r[18]).split('/').pop()?.slice(0, 24)}`;
      from[k] = (from[k] ?? 0) + 1;
    }
  }
  const top = Object.entries(from).sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [k, v] of top) L.say(`PAGE ${v} × ${k}`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
