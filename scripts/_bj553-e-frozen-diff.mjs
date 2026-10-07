/**
 * BJ553-e:鞭标记活体复验 v4(冻结靶净差分)。
 *  v3 定谳:①tid 可追敌稳定 ②recs=0=仪表盲区(BGL shim 自有 drawImage,不吃 2D 原型
 *  patch)③僵尸移动噪声压倒信号。本版:僵尸实例 patch fixedUpdate=noop 完全冻结 →
 *  48×48 屏域 ON/OFF 净差分(标记=中心 32×32 簇) + shim stats 快照对照。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, teleport,
  saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553e';
mkdirSync(OUT, { recursive: true });

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
  if (!e) return { why: 'no-zombie', tid: g.player.minionTargetId };
  const cam = g.camera;
  const cv = g.renderer.canvas;
  const [px, py] = cam.worldToScreen(e.cx, e.cy);
  const z = cam.zoom ?? 1;
  const R = Math.ceil(24 * z);
  const sx = Math.round(px) - R, sy = Math.round(py) - R, W = R * 2, H = R * 2;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(cv, sx, sy, W, H, 0, 0, W, H);
  const d = g2.getImageData(0, 0, W, H).data;
  return { why: null, data: Array.from(d),
    px: Math.round(px), py: Math.round(py), z, ex: Math.round(e.cx), ey: Math.round(e.cy),
    tid: g.player.minionTargetId, heldVid: null };
})()`;

const SHIMSTATS = `(() => {
  const g = window.__swGame;
  const r = g.renderer;
  // shim 挂点:ctx 在窗内换 shim;静态找 census/stats 挂点
  const out = {};
  for (const k of ['_bgl', 'bgl', 'gl', 'glfx']) {
    if (r[k] && r[k].stats) out[k] = { draws: r[k].stats.draws, fallback: r[k].stats.fallback ?? null };
  }
  out.ctxCtor = r.ctx?.constructor?.name ?? null;
  return out;
})()`;

function diffCount(a, b) {
  if (!a || !b || a.why || b.why || a.data.length !== b.data.length) return { ok: false };
  let n = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  const R = Math.sqrt(a.data.length / 4) | 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 30) {
      n++;
      const px = (i >> 2) % R, py = (i >> 2) / R | 0;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
  }
  return { ok: true, n, bbox: [minx, miny, maxx, maxy], R, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
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
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 100));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-zombie', sp.ok, JSON.stringify(sp).slice(0, 100));
  await pump(page, 20);   // 落地走稳

  // 冻结:实例 patch fixedUpdate=noop(管理器逐实体调用,实例属性胜原型)
  const frozen = await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    if (!z) return { ok: false };
    z.vx = 0; z.vy = 0;
    z.fixedUpdate = () => {};          // 实例级 noop
    g.player.minionTargetId = z.id;
    return { ok: true, id: z.id, cx: z.cx, cy: z.cy };
  });
  L.chk('freeze-zombie', frozen.ok, JSON.stringify(frozen).slice(0, 100));
  await pump(page, 10);
  const drift = await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    return { cx: z.cx, cy: z.cy, tid: g.player.minionTargetId, dead: z.dead };
  });
  L.chk('frozen-static', Math.abs(drift.cx - frozen.cx) < 0.01 && Math.abs(drift.cy - frozen.cy) < 0.01 && drift.tid >= 0,
    `drift=(${Math.abs(drift.cx - frozen.cx).toFixed(3)},${Math.abs(drift.cy - frozen.cy).toFixed(3)}) tid=${drift.tid}`);

  // shim 快照
  const ss1 = await page.evaluate(SHIMSTATS);
  L.say(`shim: ${JSON.stringify(ss1)}`);

  // 贴图预热(1 帧落表已证)
  await page.evaluate(() => window.__swGame.renderer.atlas.ensureVImage('vanilla/Extra_199.png'));
  await pump(page, 3);

  // 净差分:OFF(基线) → ON → OFF → ON,冻结域下 OFF/OFF 应≈0
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  const off1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const off2 = await page.evaluate(SAMPLE);
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
  });
  const on1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const on2 = await page.evaluate(SAMPLE);
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  const off3 = await page.evaluate(SAMPLE);
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
  });
  const on3 = await page.evaluate(SAMPLE);

  const dOff = diffCount(off1, off2);      // 底噪
  const dOnOff = diffCount(on1, off2);     // ON 信号
  const dOn2Off = diffCount(on2, off2);
  const dOff3 = diffCount(off3, off2);     // 复 OFF 归零
  const dOn3 = diffCount(on3, off2);       // 复 ON 复现
  L.say(`OFF/OFF=${dOff.ok ? dOff.n : 'x'}  ON/OFF=${dOnOff.ok ? JSON.stringify({ n: dOnOff.n, bbox: dOnOff.bbox, c: [dOnOff.cx, dOnOff.cy] }) : 'x'}  ON2/OFF=${dOn2Off.ok ? dOn2Off.n : 'x'}`);
  L.say(`reOFF/OFF=${dOff3.ok ? dOff3.n : 'x'}  reON/OFF=${dOn3.ok ? dOn3.n : 'x'}`);
  L.say(`zombie screen=(${off1.px},${off1.py}) zoom=${off1.z} sampleR=${Math.sqrt((off1.data?.length ?? 0) / 4) | 0}`);

  await saveCanvasShot(page, `${OUT}/bj553e-on.png`).catch(() => {});
  const ss2 = await page.evaluate(SHIMSTATS);
  L.say(`shim after: ${JSON.stringify(ss2)}`);

  L.chk('noise-floor-clean', dOff.ok && dOff.n < 20, `OFF/OFF=${dOff.ok ? dOff.n : 'x'}`);
  L.chk('marker-pixels-appear', dOnOff.ok && dOnOff.n > 200,
    `ON/OFF=${dOnOff.ok ? dOnOff.n : 'x'}（阈值 200;标记 zoom${off1.z}≈32×32=~1000px）`);
  L.chk('marker-reappears', dOn3.ok && dOn3.n > 200, `reON=${dOn3.ok ? dOn3.n : 'x'}`);

  writeFileSync(`${OUT}/bj553e-result.json`, JSON.stringify({ frozen, drift, dOff, dOnOff, dOn2Off, dOff3, dOn3, ss1, ss2 }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
