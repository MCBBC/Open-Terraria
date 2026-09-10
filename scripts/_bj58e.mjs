/**
 * SW-BJ58 探针 E：全量 drawImage 记录(设备空间,无盒过滤)→ Node 侧找行。
 * 前 D 轮教训:主画布上无任何 dest 落行盒的 2D 调用 → 行必经"中间画布合成"或
 * 非常规通道。本轮全记录两帧,Node 侧按设备盒 (660-980, 370-420) 过滤。
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
  let cid = 0;
  const ids = new WeakMap();
  const cvId = (cv) => { let v = ids.get(cv); if (v === undefined) { v = ++cid; ids.set(cv, v); } return v; };
  const mk = (proto, tag) => {
    if (!proto || proto.__bj58p) return;
    proto.__bj58p = true;
    const oi = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        if (a[0] && typeof a[0] === 'object' && recs.length < 120000) {
          const n = a.length;
          let dx = 0, dy = 0, dw = 0, dh = 0, sx = 0, sy = 0, sw = 0, sh = 0;
          if (n === 9) { [sx, sy, sw, sh, dx, dy, dw, dh] = a.slice(1); }
          else if (n === 5) { [dx, dy] = a.slice(1); }
          else if (n === 4) { [dx, dy, dw, dh] = a.slice(1); }
          const m = this.getTransform();
          const X = m.a * dx + m.c * dy + m.e;
          const Y = m.b * dx + m.d * dy + m.f;
          const cv = this.canvas;
          const st = new Error().stack.split('\\n');
          recs.push([cvId(cv), cv.width, cv.height, tag,
            +X.toFixed(1), +Y.toFixed(1),
            sx, sy, sw, sh, dw, dh,
            (a[0].width ?? -1), (a[0].height ?? -1),
            +this.globalAlpha.toFixed(2), this.globalCompositeOperation.slice(0, 12),
            (st[2] || '').trim().slice(30, 100), (st[3] || '').trim().slice(30, 95)]);
        }
      } catch (e) {}
      return oi.apply(this, a);
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
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install()');
  await page.evaluate('window.__bj58Recs.length = 0');
  for (let i = 0; i < 2; i++) await nextFrame(page);
  const recs = await page.evaluate(() => window.__bj58Recs);
  L.say(`total records=${recs.length}`);
  writeFileSync(`${OUT}/all-recs.json`, JSON.stringify(recs));   // 紧凑格式

  // Node 侧过滤:设备盒 (660-980, 370-420)
  const hit = recs.filter((r) => r[4] > 660 && r[4] < 980 && r[5] > 370 && r[5] < 420);
  L.say(`deviceBox hits=${hit.length}`);
  const byKey = {};
  for (const r of hit) {
    const k = `cv${r[0]}(${r[1]}x${r[2]})${r[3]} src=${r[12]}x${r[13]} ${String(r[16]).split(' ').slice(0, 2).join(' ').replace('at ', '')} <- ${String(r[17]).split(' ').slice(0, 2).join(' ').replace('at ', '')}`;
    byKey[k] = (byKey[k] ?? 0) + 1;
  }
  L.say('families: ' + JSON.stringify(byKey, null, 1));
  writeFileSync(`${OUT}/box-hits.json`, JSON.stringify(hit, null, 1));
  // 也看主画布(大概率 cv1)附近更大盒的调用量核对
  const main = recs.filter((r) => r[1] >= 1000);
  L.say(`mainCanvas records=${main.length}`);
  await saveCanvasShot(page, `${OUT}/row-e.png`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
