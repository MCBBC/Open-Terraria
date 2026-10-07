/**
 * BJ556:鞭标记亮/暗背景对比探针（用户复报「BJ553 后白天非常暗几乎不可见」）。
 *  定谳面:BJ553 探针(_bj553-l)冻结靶=暗底场景（maxΔ=163 全来自暗桶）——亮地表
 *  背景（雪/绿草/亮怪身）未测。本探针昼/夜 × 亮怪(Ice Slime 204)/僵尸(3) 双靶,
 *  按【OFF 帧 bg 亮度分桶】统计标记像素 Δ——判别读数=亮桶(≥180)平均 Δ 的符号:
 *  原版语义（XNA AlphaBlend One/InvSrcAlpha）= 亮化覆盖层（亮桶 Δ>0,亮底饱和白）;
 *  单笔 source-over（canvas src.rgb×α 双乘）= 暗影（亮桶 Δ<0）。
 *  另:flushTrailShade(7f) 前后合成状态残留运行时审计（globalAlpha/CompositeOp）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock,
  godMode, clearEnemies, spawnEnemy, giveItems, saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj556';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj556 = { renders: 0, residue: [] };
window.__bj556Install = async () => {
  const mod = await import('/src/render/Renderer.ts');
  const proto = mod.Renderer.prototype;
  if (!proto.__bj556p) {
    proto.__bj556p = true;
    const orR = proto.render;
    proto.render = function (...a) { window.__bj556.renders++; return orR.apply(this, a); };
    // 7f 状态残留审计：flushTrailShade 返回后主画布状态应为 save 前基线
    const orF = proto.flushTrailShade;
    proto.flushTrailShade = function (...a) {
      const ctx = this.ctx;
      const before = { ga: ctx.globalAlpha, op: ctx.globalCompositeOperation };
      const r = orF.apply(this, a);
      const after = { ga: ctx.globalAlpha, op: ctx.globalCompositeOperation };
      if (before.ga !== after.ga || before.op !== after.op) {
        window.__bj556.residue.push({ before, after });
      }
      return r;
    };
  }
  return 'ok';
};
window.__awaitRenders = async (n, timeoutMs = 15000) => {
  const start = window.__bj556.renders;
  const t0 = performance.now();
  while (window.__bj556.renders < start + n) {
    await new Promise((r) => requestAnimationFrame(r));
    if (performance.now() - t0 > timeoutMs) return { ok: false };
  }
  return { ok: true };
};
'ok';
`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.__bj556tag);
  if (!e) return { why: 'no-target' };
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
  const R = a.R;
  const buckets = { bright: [], mid: [], dark: [] };
  let maxD = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = a.data[i] - b.data[i], dg = a.data[i + 1] - b.data[i + 1], db = a.data[i + 2] - b.data[i + 2];
    const d = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    if (d <= 10) continue;
    maxD = Math.max(maxD, d);
    const bgL = 0.299 * b.data[i] + 0.587 * b.data[i + 1] + 0.114 * b.data[i + 2];
    const dL = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
    const bg = b.data[i + 1];
    const key = bg >= 180 ? 'bright' : bg >= 80 ? 'mid' : 'dark';
    buckets[key].push({ bg: Math.round(bgL), d: +dL.toFixed(1), signed: +(0.299 * dr + 0.587 * dg + 0.114 * db).toFixed(1) });
  }
  const summ = {};
  for (const k of Object.keys(buckets)) {
    const arr = buckets[k];
    if (!arr.length) { summ[k] = { n: 0 }; continue; }
    const mean = arr.reduce((s, x) => s + x.signed, 0) / arr.length;
    summ[k] = { n: arr.length, meanSignedD: +mean.toFixed(1),
      bgMin: Math.min(...arr.map((x) => x.bg)), bgMax: Math.max(...arr.map((x) => x.bg)) };
  }
  return { ok: true, n: buckets.bright.length + buckets.mid.length + buckets.dark.length,
    maxD, R, buckets: summ };
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
  await page.evaluate(INSTALL);
  await page.evaluate(async () => { await window.__bj556Install(); });

  async function stageTarget(vid) {
    const spot = await page.evaluate(() => {
      const g = window.__swGame;
      return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
    });
    const sp = await spawnEnemy(page, vid, spot.x + 48, spot.y - 8);
    L.chk(`spawn-${vid}`, sp.ok, sp.why ?? '');
    await pump(page, 8);
    await page.evaluate((vid) => {
      const g = window.__swGame;
      // 钉最新生成的同 vid 靶
      const pool = (g.entities.enemies ?? []).filter((en) => en.vanillaId === vid);
      const e2 = pool[pool.length - 1];
      e2.vx = 0; e2.vy = 0; e2.fixedUpdate = () => {};
      e2.__bj556tag = true;
      g.player.minionTargetId = e2.id;
    }, vid);
    await freezeClock(page, { tod: 0.5 });
    await pump(page, 6);
    await page.evaluate(() => window.__awaitRenders(2));
  }

  async function measure(tag) {
    await page.evaluate(() => window.__awaitRenders(3));
    const A = await page.evaluate(SAMPLE);
    await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
    await page.evaluate(() => window.__awaitRenders(3));
    const B = await page.evaluate(SAMPLE);
    await page.evaluate(() => {
      const g = window.__swGame;
      const e = (g.entities.enemies ?? []).find((en) => en.__bj556tag);
      g.player.minionTargetId = e ? e.id : -1;
    });
    await page.evaluate(() => window.__awaitRenders(3));
    const C = await page.evaluate(SAMPLE);
    const r = diff(A, B);
    L.say(`${tag}: ${JSON.stringify(r.buckets)} maxΔ=${r.maxD} n=${r.n}`);
    return r;
  }

  const results = {};
  for (const vid of [204, 3]) {   // 亮怪 Ice Slime 优先,僵尸对照
    await clearEnemies(page);
    await stageTarget(vid);
    results[`day_${vid}`] = await measure(`DAY(正午) vid=${vid}`);
    await clockSet(page, 0);
    await pump(page, 10);
    await page.evaluate(() => window.__awaitRenders(2));
    results[`night_${vid}`] = await measure(`NIGHT(午夜) vid=${vid}`);
    await clockSet(page, 0.5);
    await pump(page, 10);
    await page.evaluate(() => window.__awaitRenders(2));
    results[`day2_${vid}`] = await measure(`DAY2(复照) vid=${vid}`);
    await saveCanvasShot(page, `${OUT}/bj556-${vid}.png`).catch(() => {});
  }
  results.residue = await page.evaluate(() => window.__bj556.residue);
  L.say(`7f-residue: ${JSON.stringify(results.residue)}`);
  L.chk('no-7f-state-residue', results.residue.length === 0, 'flushTrailShade 前后状态漂移');
  writeFileSync(`${OUT}/bj556-result.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
