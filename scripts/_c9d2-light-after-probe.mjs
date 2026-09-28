// ★C9d2 二期·AFTER 探针:灰度差量臂（?lightdelta=1）与 Layer 1 臂（缺省）的
// 字节/帧、池化命中、形态计数、健康度对账。
import { launchBrowser, openPage, bootstrap, createGame, nextFrame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});

async function arm(tag, url) {
  const page = await openPage(browser, {});
  const warns = [];
  page.on('console', (m) => {
    const t = m.text?.() ?? '';
    if (/LightWorker|lightdelta|lightworker/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 160));
  });
  page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 160)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) { console.log(`[${tag}] bootstrap FAIL`); await page.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { console.log(`[${tag}] createGame FAIL`); await page.close(); return null; }
  for (let i = 0; i < 60; i++) await nextFrame(page);   // warmup→live + 首锚

  // 阶段1:静置 60 帧
  const s1 = await page.evaluate(async () => (await import('/src/lighting/LightWorkerLink.ts')).lightWorkerStats());
  for (let i = 0; i < 60; i++) await nextFrame(page);
  const s1b = await page.evaluate(async () => (await import('/src/lighting/LightWorkerLink.ts')).lightWorkerStats());
  // 阶段2:小步移动 60 次（±2 格 teleport=区域平移 → 暴露带 delta）
  for (let i = 0; i < 60; i++) {
    await page.evaluate((k) => {
      const g = window.__swGame;
      g.player.x += (k % 2 === 0 ? 2 : -2) * 16;
    }, i);
    await nextFrame(page);
  }
  const s2b = await page.evaluate(async () => (await import('/src/lighting/LightWorkerLink.ts')).lightWorkerStats());
  // 阶段3:写面 30 帧（挖/放=原语写 → 日志格 delta）
  for (let i = 0; i < 30; i++) {
    await page.evaluate((k) => {
      const g = window.__swGame;
      const st = g.world.store;
      const px = Math.floor(g.player.x / 16) + 4, py = Math.floor(g.player.y / 16) - 2 + (k % 3);
      st.setTile(px, py, k % 2 === 0 ? 5 : 0);
    }, i);
    await nextFrame(page);
  }
  await nextFrame(page);
  const s2 = await page.evaluate(async () => (await import('/src/lighting/LightWorkerLink.ts')).lightWorkerStats());
  // 验收③:主线程残部计量——delta 模式 buildWorkerTiles（几何,免切片）与
  // encodeDelta（暴露带编码）逐项计时,对照 BEFORE 的 buildSlice 0.1ms+克隆 0.1ms
  const timing = await page.evaluate(async () => {
    const WPp = await import('/src/lighting/LightWorkerProtocol.ts');
    const g = window.__swGame;
    const L = g.lighting;
    const lw = L._lw;
    if (!lw) return null;
    const times1 = [], times2 = [];
    const enc = new WPp.LightDeltaEncoder();
    const st = g.world.store;
    const rx = L.rx, ry = L.ry, rw = L.rw, rh = L.rh;
    // 平移 2 格的几何帧 + 空日志编码（模拟移动帧编码成本）
    const reg = WPp.sliceGeometry(st, rx + 2, ry, rw, rh);
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      lw.buildWorkerTiles(rx + 2, ry, rw, rh);
      times1.push(performance.now() - t0);
    }
    enc.adoptFull(lw.buildSlice(st, rx, ry, rw, rh));
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      enc.encodeDelta(st, reg, []);
      times2.push(performance.now() - t0);
    }
    const med = (a) => +a.sort((x, y) => x - y)[a.length >> 1].toFixed(3);
    return { planTilesP50ms: med(times1), encodeDeltaP50ms: med(times2) };
  });
  const phase = (a, b) => ({ posted: b.posted - a.posted, full: b.fmt.full - a.fmt.full, delta: b.fmt.delta - a.fmt.delta, bytes: b.tileBytes - a.tileBytes });
  console.log(`[${tag}] idle60=`, JSON.stringify(phase(s1, s1b)), `move60=`, JSON.stringify(phase(s1b, s2b)), `write30=`, JSON.stringify(phase(s2b, s2)));
  await page.close();
  const frames = 91;   // 阶段2+3 的 send 帧（阶段1 另计）
  const tileBytesDelta = s2.tileBytes - s1.tileBytes;
  const __out = {
    tag,
    idle: { posted1: s1.posted, results1: s1.results, fmt1: s1.fmt, bytes1: s1.tileBytes },
    run: { frames, fmtDelta: s2.fmt.delta - s1.fmt.delta, fmtFull: s2.fmt.full - s1.fmt.full },
    stats: s2,
    tileMBpsRun: +(tileBytesDelta / frames / 1048576 * 60).toFixed(3),
    idleDeltaMBps: +( (s1.tileBytes) / Math.max(1, s1.posted) / 1048576 * 60).toFixed(3),
    healthy: s2.falls === 0 && s2.skipped === 0 && Math.abs(s2.posted - s2.results) <= 2,
    warns: warns.slice(0, 6),
  };
  __out.timing = timing;
  return __out;
}

console.error('[probe] arm layer1 starting (首臂烧暖)');
const poolArm = await arm('layer1', `${ORIGIN}/?pbust=${Date.now()}`);
console.error('[probe] arm layer1 done, arm delta starting');
const deltaArm = await arm('delta', `${ORIGIN}/?lightdelta=1&pbust=${Date.now()}`);
console.error('[probe] both arms done');
console.log('[c9d2-after]', JSON.stringify({ deltaArm, poolArm }, null, 1));
process.exit(deltaArm && poolArm && deltaArm.healthy && poolArm.healthy ? 0 : 1);
