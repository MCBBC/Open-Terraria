// IIII255 门控画布 α 精读 + 波场位移读数（ON 臂,快）
// 设备坐标锚定:门控画布实测池塘水条带 = tile3509 左缘 device x=467, 每 tile 32px, 水行顶 y=406
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=300000 scripts/_iii255-alphamap.mjs
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5304';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii255a]', ...a);

const seedDef = (json) => {
  globalThis.__swSeededPut = new Promise((res) => {
    try {
      const req = indexedDB.open('sandboxworld', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(json, 'sandboxworld.quicksave');
          tx.oncomplete = () => { db.close(); res(); };
          tx.onerror = () => { db.close(); res(); };
          tx.onabort = () => { db.close(); res(); };
        } catch { db.close(); res(); }
      };
      req.onerror = () => res();
    } catch { res(); }
  });
};

const saveJsonTxt = fs.readFileSync('/Users/vinlic/Downloads/map-Starter_World (30).json', 'utf8');
const browser = await launchBrowser({ errors: [] });
const page = await openPage(browser, { errors: [] });
page.__probeOrigin = ORIGIN;
await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
await cleanStorage(page, {});
await gotoApp(page, ORIGIN, { extraQuery: '?slopewave=1', tries: 30 });
await waitForBridge(page, { timeout: 240000 });
await front(page);
await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
for (let k = 0; k < 10; k++) {
  const r = await page.evaluate(() => {
    if (!window.__swFlow?.quickLoad) return 'no-flow';
    void window.__swFlow.quickLoad();
    return 'dispatched';
  }).catch(() => 'err');
  if (r === 'dispatched') break;
  await sleep(3000);
}
for (let i = 0; i < 240; i++) {
  await sleep(1000);
  if (await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break;
}
await dismissWelcome(page).catch(() => {});
await godMode(page, true);
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
await sleep(1200);
await camSnapToTile(page, 3517, 394, { player: false });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
await page.evaluate(() => {
  const g = window.__swGame;
  g.__iii251Pin = { x: 3517 * 16, y: 394 * 16 };
  if (!g.__iii251PinLoop) {
    g.__iii251PinLoop = true;
    const loop = () => {
      const g2 = window.__swGame;
      if (g2?.__iii251Pin && g2.camera) { g2.camera.x = g2.__iii251Pin.x; g2.camera.y = g2.__iii251Pin.y; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
});
await sleep(2000);

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ww = await import('/src/render/WaterWaves.ts');
  const wwc = g.renderer.waterWarp;
  let snap = null;
  if (!wwc.__iii255a) {
    wwc.__iii255a = true;
    const oEF = wwc.endFgPass.bind(wwc);
    wwc.endFgPass = (ctx) => {
      try {
        const gc = wwc.gateCanvas();
        if (gc) { const c2 = document.createElement('canvas'); c2.width = gc.width; c2.height = gc.height; c2.getContext('2d').drawImage(gc, 0, 0); snap = c2; }
      } catch { }
      oEF(ctx);
    };
  }
  await new Promise((r) => setTimeout(r, 700));
  // 波源注入(同 verify:池心)后等传播
  try { ww.queueRipple(3513 * 16 + 8, 394 * 16 + 8, 2.5); } catch { }
  await new Promise((r) => setTimeout(r, 500));
  const res2 = { gateW: snap ? snap.width : 0 };
  if (snap) {
    const x2 = snap.getContext('2d', { willReadFrequently: true });
    // tile→device 映射(tile3509 左缘 467, 32px/tile, 水行顶 406)
    const tx2d = (t) => 467 + (t - 3509) * 32;
    const pt = (x, y) => x2.getImageData(x, y, 1, 1).data;
    // α ASCII 图:x 425..900 step 3, y 400..442 step 3(覆盖 mark1/half/mark2)
    const lines = [];
    const head = '     ' + Array.from({ length: (900 - 425) / 3 }, (_, i) => {
      const dx = 425 + i * 3;
      const t = 3509 + (dx - 467) / 32;
      return (Math.abs(dx - 467) % 96 < 3) ? '|' : ' ';
    }).join('');
    for (let y = 400; y < 442; y += 3) {
      let line = `y${String(y).padStart(3)} `;
      for (let x = 425; x < 900; x += 3) {
        const a = x2.getImageData(x, y, 1, 1).data[3];
        line += a === 0 ? '.' : a < 3 ? '1' : a < 10 ? '+' : a < 100 ? 'x' : '#';
      }
      lines.push(line);
    }
    res2.map = lines.join('\n');
    res2.points = {
      mark1_tri: [pt(460, 410)[3], pt(450, 415)[3], pt(440, 408)[3]],
      mark2_tri: [pt(875, 410)[3], pt(860, 420)[3], pt(878, 408)[3]],
      half_rect: [pt(770, 412)[3], pt(760, 410)[3]],
      pond: [pt(600, 420)[3], pt(650, 430)[3]],
      col3520: [pt(830, 420)[3]],
    };
  }
  // 波场位移读数(四点)
  const disp = {};
  for (const [k, tx] of Object.entries({ mark1: 3508, half: 3518, flat: 3513, mark2: 3521 })) {
    const d = [0, 0];
    ww.waterWaves.sampleDisplace(tx * 16 + 8, 394 * 16 + 8, d);
    disp[k] = [+d[0].toFixed(3), +d[1].toFixed(3)];
  }
  res2.disp = disp;
  const dbg = ww.waterWaves.debug();
  res2.waveDbg = dbg;
  return res2;
});
log('gateW:', out.gateW);
log('points:', JSON.stringify(out.points));
log('disp:', JSON.stringify(out.disp));
log('waveDbg:', JSON.stringify(out.waveDbg));
log('GATE ALPHA MAP (x425..900 step3 → tile3509@467, 32px/tile; y400..442 step3):\n' + out.map);
process.exit(0);
