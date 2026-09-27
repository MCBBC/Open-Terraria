// ★翼扑·真实 rAF 时序探针（2026-09-27）:不手动步进,真实 rAF 驱动,虚拟跳键起飞,
// 采样 6s 内翼区像素 hash + wingFrame。对照手动 1:1 步进（已证活）分离时序域回归。
// 运行: SW_ORIGIN=http://localhost:5227 node tools/run-diag.mjs --timeout=300000 scripts/_wing-flap-real.mjs [mode]
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const MODE = process.argv[2] || 'default';
const QS = MODE === 'noshim' ? '?bglshim=0' : MODE === 'nobgl' ? '?bgl=0' : '';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + String(e.message).slice(0, 140)));
await bootstrap(page, ORIGIN + QS);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.player, { timeout: 120000 });

await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const cam = g.camera;
  const r = g.renderer;
  const hash32 = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };

  // 装翼
  p.inv.armor[3] = { id: window.__swFlow.itemByVid(492), stack: 1 };
  let wingImg = null;
  for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) {
    wingImg = r.atlas.ensureVImage('vanilla/Wings_1.png');
    if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50));
  }
  // 天气冻结（真实 rAF 下云雨仍是运动源,钉死）
  try {
    const w = g.world.weather;
    if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; }
  } catch { /* ignore */ }

  // 真实 rAF 跑 12t 让 wingTime 回满
  await new Promise((res) => setTimeout(res, 250));
  const wtMax = Math.round(p.wingTime);
  g.input.setVirtualAction('Jump', true);

  // 采样 6 秒:每 ~80ms 抓一帧 hash+wingFrame+飞行旗
  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 256;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  const samples = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    await new Promise((res) => requestAnimationFrame(res));
    const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
    if (!flyingNow) continue;
    const z = cam.zoom || 1;
    const [sx, sy] = cam.worldToScreen(p.cx, p.y + 8);
    const w = Math.round(150 * z), h = Math.round(70 * z);
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.clearRect(0, 0, lc.width, lc.height);
    lx.drawImage(r.canvas, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h, 0, 0, w, h);
    samples.push({
      t: Math.round(performance.now() - t0),
      wf: p.wingFrame, wt: Math.round(p.wingTime), vy: +p.vy.toFixed(2),
      hash: hash32(lx.getImageData(0, 0, w, h).data),
    });
  }
  g.input.setVirtualAction('Jump', false);
  // 翼区 hash 是否长期停驻:找最长连续同 hash 游程
  let run = 1, best = 1, bestAt = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].hash === samples[i - 1].hash) { run++; if (run > best) { best = run; bestAt = samples[i].t; } }
    else run = 1;
  }
  return {
    wtMax, samples: samples.length,
    wfDistinct: new Set(samples.map((s) => s.wf)).size,
    hashDistinct: new Set(samples.map((s) => s.hash)).size,
    maxSameHashRun: { len: best, atMs: bestAt },
    head: samples.slice(0, 10),
    tail: samples.slice(-6),
  };
});

console.log(JSON.stringify({ MODE, out, pageErrors: pageErrors.slice(0, 8) }, null, 1));
await browser.close();
process.exit(0);
