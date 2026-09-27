import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '?bglshim=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.player, { timeout: 120000 });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));
const out = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player; const r = g.renderer;
  p.inv.armor[3] = { id: window.__swFlow.itemByVid(492), stack: 1 };
  p.inv.dye[3] = { id: window.__swFlow.itemByVid(1007), stack: 1 };
  let wingImg = null;
  for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) { wingImg = r.atlas.ensureVImage('vanilla/Wings_1.png'); if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50)); }
  try { const w = g.world.weather; if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; } } catch { /* ignore */ }
  await new Promise((res) => setTimeout(res, 300));
  const proto = Object.getPrototypeOf(r);
  const wts = proto.wingTexSource;
  const calls = [];
  let frame = 0;
  proto.wingTexSource = function (img, sx, sy, sw, sh, dye, tint, v0) {
    const isWing = sw === 86 && sh === 62;
    const ret = wts.call(this, img, sx, sy, sw, sh, dye, tint, v0);
    if (isWing && calls.length < 400) {
      calls.push({ f: frame, sy, hit: ret === this.wingTintScratch, bucket: Math.floor(performance.now() / 200) });
    }
    return ret;
  };
  g.input.setVirtualAction('Jump', true);
  const t0 = performance.now();
  let holdY = null, holdX = null;
  while (performance.now() - t0 < 1500) {
    await new Promise((res) => requestAnimationFrame(res));
    const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
    if (!flyingNow) continue;
    if (holdY === null) { holdY = p.y; holdX = p.x; }
    p.y = holdY; p.x = holdX; p.vy = -0.5;
    frame++;
  }
  g.input.setVirtualAction('Jump', false);
  proto.wingTexSource = wts;
  // 汇总:每帧的 sy 序列 + hit 旗
  const perFrame = new Map();
  for (const c of calls) {
    if (!perFrame.has(c.f)) perFrame.set(c.f, []);
    perFrame.get(c.f).push(`${c.sy}(hit=${c.hit ? 1 : 0},b=${c.bucket})`);
  }
  const rows = [...perFrame.entries()].sort((a, b) => a[0] - b[0]).slice(0, 24).map(([f, arr]) => `${f}: ${arr.join(' | ')}`);
  return { totalWingCalls: calls.length, rows };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
