// ★世界原生房入住 + 旗布昼夜对拍(2026-10-05)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC, findTileBySheet, callGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const TODS = (process.env.FLAG_TODS || '0.5,0.625,0.6667,0.7,0.75,0.8125,0.9,0.0,0.25,0.3,0.32,0.3333')
  .split(',').map(Number);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

// 找世界原生房:先找桌(14)再找火把(4)备用
const tbl = await findTileBySheet(page, 14, { maxScan: 200000 });
console.log('TABLE', JSON.stringify(tbl));
if (!tbl || !tbl.x) { console.log('no worldgen table found'); process.exit(1); }

// 无家 guide 生成在桌旁,锚=桌位(入住轮 quickFindHome 自锚)
const npc = await spawnTownNPC(page, 'guide', { tx: tbl.x, ty: tbl.y - 1, home: null });
console.log('NPC', JSON.stringify(npc));
await page.evaluate((t) => {
  const n = window.__swGame.entities.npcs.find((x) => x.npcKey === 'guide');
  n.anchorTile = { x: t.x, y: t.y };   // homeTile 投影(地行)
}, tbl);
// 直调入驻轮(白天门:先把钟钉到正午)
const { freezeClock: fc } = await import('../tools/probe/lib/index.mjs');
await fc(page, { tod: 0.5 });
await new Promise((r) => setTimeout(r, 300));
const arr = await callGame(page, 'updateTownNpcArrival');
console.log('ARRIVAL', JSON.stringify(arr));
const home = await page.evaluate(() => {
  const n = window.__swGame.entities.npcs.find((x) => x.npcKey === 'guide');
  return { home: n?.home, anchor: n?.anchorTile, dead: n?.dead };
});
console.log('HOME', JSON.stringify(home));
if (!home.home) { console.log('guide not housed — abort'); process.exit(1); }

// 相机钉到 home, tod 扫描
await page.evaluate((h) => {
  const g = window.__swGame;
  g.player.x = h.x * 16; g.player.y = (h.y - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = h.x * 16; g.camera.y = h.y * 16;
}, home.home);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const tod of TODS) {
  await freezeClock(page, { tod });
  await sleep(900);
  const snap = await page.evaluate(async () => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, st = g.world.store;
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide');
    const { findBannerAnchorY } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    let px = null, lt = null, ltAir = null, anchor = null;
    if (n?.home) {
      anchor = findBannerAnchorY(st, n.home.x, n.home.y);
      if (anchor != null) {
        lt = r.lighting?.lightAt(n.home.x, anchor) ?? null;
        ltAir = r.lighting?.lightAt(n.home.x, anchor + 1) ?? null;
        const bx = n.home.x * 16 + 8, by = (anchor + 1) * 16 + 18;
        const [scx, scy] = cam.worldToScreen(bx, by);
        const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
        if (cv && cv.width) {
          const c2 = document.createElement('canvas');
          c2.width = cv.width; c2.height = cv.height;
          const ctx = c2.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(cv, 0, 0);
          const im = ctx.getImageData(Math.max(0, Math.round(scx) - 16), Math.max(0, Math.round(scy) - 20), 33, 41);
          let rs = 0, gs = 0, bs = 0, cnt = 0, w = 0;
          for (let k = 0; k < im.data.length; k += 4) {
            rs += im.data[k]; gs += im.data[k + 1]; bs += im.data[k + 2]; cnt++;
            if (im.data[k] >= 225 && im.data[k + 1] >= 225 && im.data[k + 2] >= 225) w++;
          }
          px = { mean: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)], white: +(w / cnt).toFixed(3) };
        }
      }
    }
    return { home: n?.home, anchor, lt, ltAir, px, tod: g.world.clock.timeOfDay };
  });
  await saveCanvasShot(page, `/tmp/flagnight10-t${String(tod).replace('.', '_')}.png`);
  console.log('TOD', tod, JSON.stringify(snap));
}
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
await browser.close();
