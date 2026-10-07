/**
 * BJ553-k:标记视觉强度量化+发布站对拍(SW_ORIGIN 参数化)。
 *  冻结靶 ON/OFF 等真渲染帧采样,量化:差分像素数(低阈 10)、最大 Δ、
 *  有效 α 估算(α=Δ/(178−bg),原版期望 0.349)、标记 bbox。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553k';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553k = { renderCalls: 0 };
window.__bj553kInstall = async () => {
  const mod = await import('/src/render/Renderer.ts');
  const proto = mod.Renderer.prototype;
  if (!proto.__bj553kp) {
    proto.__bj553kp = true;
    const or_ = proto.render;
    proto.render = function (...a) { window.__bj553k.renderCalls++; return or_.apply(this, a); };
  }
  return 'ok';
};
window.__awaitRenders = async (n, timeoutMs = 15000) => {
  const start = window.__bj553k.renderCalls;
  const t0 = performance.now();
  while (window.__bj553k.renderCalls < start + n) {
    await new Promise((r) => requestAnimationFrame(r));
    if (performance.now() - t0 > timeoutMs) return { ok: false };
  }
  return { ok: true };
};
'ok';
`;

const FREEZE = `(() => {
  const g = window.__swGame;
  const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
  if (!z) return { ok: false };
  z.vx = 0; z.vy = 0; z.fixedUpdate = () => {};
  g.player.minionTargetId = z.id;
  return { ok: true, id: z.id, cx: z.cx, cy: z.cy };
})()`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
  if (!e) return { why: 'no-zombie' };
  const cam = g.camera;
  const cv = g.renderer.canvas;
  const [px, py] = cam.worldToScreen(e.cx, e.cy);
  const z = cam.zoom ?? 1;
  const R = Math.ceil(32 * z);
  const sx = Math.round(px) - R, sy = Math.round(py) - R, W = R * 2, H = R * 2;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(cv, sx, sy, W, H, 0, 0, W, H);
  return { why: null, data: Array.from(g2.getImageData(0, 0, W, H).data),
    px: Math.round(px), py: Math.round(py), z, tid: g.player.minionTargetId, R };
})()`;

function analyze(on, off) {
  if (!on?.data || !off?.data || on.data.length !== off.data.length) return { ok: false };
  const R = on.R;
  let n10 = 0, maxD = 0, alphaSum = 0, alphaN = 0;
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  const alphas = [];
  for (let i = 0; i < on.data.length; i += 4) {
    const dr = Math.abs(on.data[i] - off.data[i]);
    const dg = Math.abs(on.data[i + 1] - off.data[i + 1]);
    const db = Math.abs(on.data[i + 2] - off.data[i + 2]);
    const d = dr + dg + db;
    if (d > 10) {
      n10++;
      if (d > maxD) maxD = d;
      const px = (i >> 2) % R, py = (i >> 2) / R | 0;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
      // 有效 α(用 G 通道;标记乘色 178)
      const bg = off.data[i + 1], fg = on.data[i + 1];
      if (178 - bg > 25) { const a = (fg - bg) / (178 - bg); if (a > 0.02) { alphas.push(a); alphaSum += a; alphaN++; } }
    }
  }
  alphas.sort((a, b) => a - b);
  return { ok: true, n10, maxD, bbox: [minx, miny, maxx, maxy], R,
    alphaMedian: alphaN ? +alphas[Math.floor(alphaN / 2)].toFixed(3) : null,
    alphaMean: alphaN ? +(alphaSum / alphaN).toFixed(3) : null, alphaN };
}

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
  await pump(page, 30);
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, '');
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 48, spot.y);
  L.chk('spawn-zombie', sp.ok, '');
  await pump(page, 10);
  await page.evaluate(INSTALL);
  await page.evaluate(async () => { await window.__bj553kInstall(); });
  const fr = await page.evaluate(FREEZE);
  L.chk('freeze', fr.ok, JSON.stringify(fr).slice(0, 80));
  await pump(page, 6);
  await page.evaluate(() => window.__awaitRenders(2));

  await page.evaluate(() => window.__awaitRenders(3));
  const A = await page.evaluate(SAMPLE);   // ON
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  await page.evaluate(() => window.__awaitRenders(3));
  const B = await page.evaluate(SAMPLE);   // OFF
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
  });
  await page.evaluate(() => window.__awaitRenders(3));
  const C = await page.evaluate(SAMPLE);   // 复 ON

  const anOn = analyze(A, B);
  const anRe = analyze(C, B);
  const anNoise = analyze(B, C); // 跨态反向=同量
  L.say(`ORIGIN=${process.env.SW_ORIGIN}`);
  L.say(`ON/OFF: ${JSON.stringify(anOn)}`);
  L.say(`reON/OFF: n10=${anRe.ok ? anRe.n10 : 'x'} alphaMedian=${anRe.ok ? anRe.alphaMedian : 'x'}`);
  L.say(`zombie screen=(${A.px},${A.py}) zoom=${A.z}（期望 bbox ≈ 中心±8×zoom,α≈0.349）`);
  await saveCanvasShot(page, `${OUT}/bj553k-on-${(process.env.SW_ORIGIN ?? '').includes('sandbox') ? 'live' : 'dev'}.png`).catch(() => {});
  L.chk('marker-rendered', anOn.ok && anOn.n10 > 40, `n10=${anOn.ok ? anOn.n10 : 'x'}`);
  L.chk('marker-alpha-vanilla-parity', anOn.ok && anOn.alphaMedian != null && anOn.alphaMedian > 0.22 && anOn.alphaMedian < 0.5,
    `α=${anOn.ok ? anOn.alphaMedian : 'x'}（原版 0.349;<0.22=过淡=用户「看不见」面）`);
  writeFileSync(`${OUT}/bj553k-result-${(process.env.SW_ORIGIN ?? '').includes('sandbox') ? 'live' : 'dev'}.json`,
    JSON.stringify({ anOn, anRe }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
