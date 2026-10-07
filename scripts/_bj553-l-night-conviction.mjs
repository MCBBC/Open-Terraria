/**
 * BJ553-l:昼夜光照定罪实验。
 *  定谳链:标记块在世界层内(6418)→ compositeLight(6612)全屏乘光;原版 1_2=接口层
 *  无光照。满光白昼已测 α=0.348 无畸变;本实验:同一冻结靶白昼/夜晚各测 ON/OFF 差分
 *  ——夜晚 Δ≈0=定罪「乘光压暗=用户不显示」。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock,
  godMode, clearEnemies, spawnEnemy, giveItems, saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553l';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553l = { renderCalls: 0 };
window.__bj553lInstall = async () => {
  const mod = await import('/src/render/Renderer.ts');
  const proto = mod.Renderer.prototype;
  if (!proto.__bj553lp) {
    proto.__bj553lp = true;
    const or_ = proto.render;
    proto.render = function (...a) { window.__bj553l.renderCalls++; return or_.apply(this, a); };
  }
  return 'ok';
};
window.__awaitRenders = async (n, timeoutMs = 15000) => {
  const start = window.__bj553l.renderCalls;
  const t0 = performance.now();
  while (window.__bj553l.renderCalls < start + n) {
    await new Promise((r) => requestAnimationFrame(r));
    if (performance.now() - t0 > timeoutMs) return { ok: false };
  }
  return { ok: true };
};
'ok';
`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
  if (!e) return { why: 'no-zombie' };
  const cam = g.camera;
  const cv = g.renderer.canvas;
  const [px, py] = cam.worldToScreen(e.cx, e.cy);
  const z = cam.zoom ?? 1;
  const R = Math.ceil(20 * z);
  const sx = Math.round(px) - R, sy = Math.round(py) - R, W = R * 2, H = R * 2;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(cv, sx, sy, W, H, 0, 0, W, H);
  return { why: null, data: Array.from(g2.getImageData(0, 0, W, H).data),
    px: Math.round(px), py: Math.round(py), z, tid: g.player.minionTargetId, R };
})()`;

function diff(a, b) {
  if (!a?.data || !b?.data || a.data.length !== b.data.length) return { ok: false };
  let n = 0, maxD = 0;
  const R = a.R;
  const alphas = [];
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 10) {
      n++;
      if (d > maxD) maxD = d;
      const bg = b.data[i + 1], fg = a.data[i + 1];
      if (178 - bg > 25) { const al = (fg - bg) / (178 - bg); if (al > 0.02) alphas.push(al); }
    }
  }
  alphas.sort((x, y) => x - y);
  return { ok: true, n, maxD, alphaMedian: alphas.length ? +alphas[Math.floor(alphas.length / 2)].toFixed(3) : null };
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
  await pump(page, 8);
  await page.evaluate(INSTALL);
  await page.evaluate(async () => { await window.__bj553lInstall(); });
  // 冻结僵尸+冻钟(帧动画相位恒定)
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    z.vx = 0; z.vy = 0; z.fixedUpdate = () => {};
    g.player.minionTargetId = z.id;
  });
  await freezeClock(page, { tod: 0.5 });     // 白昼正午(tod 0..1 归一,0=午夜 0.5=正午)
  await pump(page, 6);
  await page.evaluate(() => window.__awaitRenders(2));

  async function measure(tag) {
    await page.evaluate(() => window.__awaitRenders(3));
    const A = await page.evaluate(SAMPLE);
    await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
    await page.evaluate(() => window.__awaitRenders(3));
    const B = await page.evaluate(SAMPLE);
    await page.evaluate(() => {
      const g = window.__swGame;
      const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
      g.player.minionTargetId = z ? z.id : -1;
    });
    await page.evaluate(() => window.__awaitRenders(3));
    const C = await page.evaluate(SAMPLE);
    const r = diff(A, B);
    L.say(`${tag}: ON/OFF=${JSON.stringify(r)}（n=${r.n} maxΔ=${r.maxD} α=${r.alphaMedian}）`);
    return r;
  }

  const day = await measure('DAY(正午)');
  await clockSet(page, 0);            // 深夜 0 点(tod=0)
  await pump(page, 10);               // 光照图重算
  await page.evaluate(() => window.__awaitRenders(2));
  const night = await measure('NIGHT(午夜)');
  await saveCanvasShot(page, `${OUT}/bj553l-night.png`).catch(() => {});
  // 复照白昼(排除时序漂移)
  await clockSet(page, 0.5);
  await pump(page, 10);
  await page.evaluate(() => window.__awaitRenders(2));
  const day2 = await measure('DAY2(复照)');

  L.chk('day-marker-visible', day.ok && day.n > 40, `day n=${day.n}`);
  L.chk('night-marker-darkened', night.ok && night.n < Math.max(8, day.n / 4),
    `night n=${night.n} maxΔ=${night.maxD}（昼夜比 ${(night.n / Math.max(1, day.n)).toFixed(2)};≈0=定罪）`);
  writeFileSync(`${OUT}/bj553l-result.json`, JSON.stringify({ day, night, day2 }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
