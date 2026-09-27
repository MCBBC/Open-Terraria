// ★翼染冻结·截图证据（2026-09-27）：飞行中每 ~350ms 抓玩家区 PNG×5,直接目检翼帧。
//  运行: SW_ORIGIN=http://localhost:5228 node tools/run-diag.mjs --timeout=300000 scripts/_wing-dye-shots.mjs <leg> <outdir>
//  leg ∈ plain_default / dye_default / plain_noshim / dye_noshim
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const ONLY = process.argv.slice(4).find((a) => !a.startsWith('--')) || 'dye_default';
const OUTDIR = process.argv.slice(4).find((a) => a.startsWith('/')) || `/tmp/wing-shots-${ONLY}`;
const LEGS = {
  plain_default: { mode: '', dye: false },
  dye_default: { mode: '', dye: true },
  plain_noshim: { mode: '?bglshim=0', dye: false },
  dye_noshim: { mode: '?bglshim=0', dye: true },
};
const leg = LEGS[ONLY];
if (!leg) { console.error('bad leg'); process.exit(64); }
mkdirSync(OUTDIR, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + leg.mode);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.player, { timeout: 120000 });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));

const shots = await page.evaluate(async (dyeOn) => {
  const g = window.__swGame;
  const p = g.player;
  const cam = g.camera;
  const r = g.renderer;
  p.inv.armor[3] = { id: window.__swFlow.itemByVid(492), stack: 1 };
  if (dyeOn) p.inv.dye[3] = { id: window.__swFlow.itemByVid(1007), stack: 1 };
  let wingImg = null;
  for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) {
    wingImg = r.atlas.ensureVImage('vanilla/Wings_1.png');
    if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50));
  }
  try {
    const w = g.world.weather;
    if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; }
  } catch { /* ignore */ }
  await new Promise((res) => setTimeout(res, 300));
  g.input.setVirtualAction('Jump', true);
  const lc = document.createElement('canvas');
  lc.width = 480; lc.height = 320;   // 120×80 设备px ×4 放大
  const lx = lc.getContext('2d', { willReadFrequently: true });
  const out = [];
  const t0 = performance.now();
  let holdY = null, holdX = null, lastShot = -1e9, k = 0;
  while (performance.now() - t0 < 3200 && k < 5) {
    await new Promise((res) => requestAnimationFrame(res));
    const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
    if (!flyingNow) continue;
    if (holdY === null) { holdY = p.y; holdX = p.x; }
    p.y = holdY; p.x = holdX; p.vy = -0.5;
    const now = performance.now();
    if (now - lastShot < 350) continue;
    lastShot = now;
    const [sx, sy] = cam.worldToScreen(p.cx, p.y + 8);
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.clearRect(0, 0, lc.width, lc.height);
    lx.imageSmoothingEnabled = false;
    lx.drawImage(r.canvas, Math.round(sx - 60), Math.round(sy - 40), 120, 80, 0, 0, 480, 320);
    out.push({ t: Math.round(now - t0), wf: p.wingFrame, png: lc.toDataURL('image/png') });
    k++;
  }
  g.input.setVirtualAction('Jump', false);
  return out;
}, leg.dye);
shots.forEach((s, i) => {
  writeFileSync(`${OUTDIR}/shot${i}_t${s.t}_wf${s.wf}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
});
console.log(JSON.stringify({ leg: ONLY, outdir: OUTDIR, shots: shots.map((s) => ({ t: s.t, wf: s.wf })) }, null, 1));
await browser.close();
process.exit(0);
