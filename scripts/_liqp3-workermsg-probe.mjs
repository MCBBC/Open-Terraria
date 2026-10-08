// ★液体核第三刀·worker 消息面探查（2026-10-08）——postMessage 面构成测量:
//  【背景】Windows 实机 trace:postMessage 面 ~40ms/s（waveWorker 场消息 bytes=12MB/
//  6253 条+lightWorker）。本探针在 Mac 活机量化【结构化克隆成本 vs 载荷】构成:
//   ①主线程 postMessage 同步成本（=结构化克隆+入队;transferable 化消息≈所有权
//     转移,同步成本应≈0——R3-F2/C9d2 判例已收面）——Worker.prototype.postMessage
//     包裹（实例方法经原型解析=已建 worker 也被包;按 msg.op 分派标记）。
//   ②收达侧 handler 成本（onmessage 链包裹——反序列化成本在 handler 前=不可包,
//     落在收包 task 内,输出注明口径）。
//   ③语义账面:wwWorkerStats/lightWorkerStats 差分（posted/fields/bytes/fmt/
//     quietSkips;lw posted/results/skipped）。
//  【红线】场数据语义面（exportFieldDelta 编码/注入批语义）只探不硬改——本探针
//  零生产代码触碰,纯观察。
//  场景=水体活跃（injectWash 每帧持续注入——静默窗跳发不触发=消息面满载,与
//  Windows「水体多+活跃」工况同构）。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=900000 scripts/_liqp3-workermsg-probe.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { gotoApp } from '../tools/probe/lib/boot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const FRAMES = Number(process.env.WM_FRAMES || 900);   // 900 帧 ≈ 15s 活跃工况

const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

for (const arm of ['base', 'lightworker']) {
  const q = arm === 'lightworker' ? '?lightworker=1' : '';
  const nav = await gotoApp(page, ORIGIN, { extraQuery: q, tries: 20 });
  if (!nav) { console.log(`[${arm}] gotoApp FAIL`); continue; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261008 });
  console.log(`[${arm}] createGame:`, gen?.ok, gen?.why ?? '');
  await godMode(page, true);

  await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
    const surf = Math.floor(g.world.groundLevel);
    const px = Math.floor(g.player.cx / 16);
    const DIRT = window.__swTiles?.['dirt'] ?? 1;
    const x0 = px - 50, x1 = px + 50, ry = surf - 6, depth = 44;
    for (let x = x0 - 6; x <= x1 + 6; x++) for (let y = ry - 8; y <= ry + depth + 6; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let d = 0; d < 3; d++) st.setTile(x, ry + depth + d, DIRT);
    for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
    for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + 30; y++) st.setLiquid(x, y, 255, 1);
    g.player.x = (x1 - 2) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    window.__vnow = performance.now();
    window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__swGame.frame(window.__vnow); } return window.__vnow; };
  });
  await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));

  // ---- 仪表:postMessage 原型包裹（已建实例同样命中）+ 收达 handler 链包裹 ----
  await page.evaluate(() => {
    window.__msgStat = { post: {}, recv: {} };
    const payloadBytes = (v, d = 0) => {
      let n = 0;
      const walk = (o, dep) => {
        if (!o || dep > 5) return;
        if (o instanceof ArrayBuffer) { n += o.byteLength; return; }
        if (ArrayBuffer.isView(o)) { n += o.buffer ? o.buffer.byteLength : 0; return; }
        if (Array.isArray(o)) { for (const e of o) walk(e, dep + 1); return; }
        if (typeof o === 'object') { for (const k in o) walk(o[k], dep + 1); }
      };
      walk(v, d);
      return n;
    };
    const OrigPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (msg, transfer) {
      const t0 = performance.now();
      const r = OrigPost.call(this, msg, transfer);
      const dt = performance.now() - t0;
      const op = msg && typeof msg === 'object' ? String(msg.op ?? '?') : '?';
      const s = (window.__msgStat.post[op] ??= { n: 0, bytes: 0, ms: 0, xfer: 0 });
      s.n++; s.bytes += payloadBytes(msg); s.ms += dt;
      if (transfer && transfer.length) s.xfer++;
      return r;
    };
    window.__wrapRecv = (w, tag) => {
      if (!w || w.__recvWrapped) return;
      const orig = w.onmessage;
      if (!orig) return;
      const s = (window.__msgStat.recv[tag] ??= { n: 0, ms: 0, bytes: 0 });
      w.onmessage = (ev) => {
        const t0 = performance.now();
        orig(ev);
        s.n++; s.ms += performance.now() - t0;
        s.bytes += payloadBytes(ev.data);
      };
      w.__recvWrapped = true;
    };
  });

  // 暖机（worker spawn/纹理/光照收敛）
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(25); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  }
  await page.evaluate(() => { window.__drive(20); });

  // 收达包裹（spawn 后）+ 基线采样
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__wrapRecv(window.__wwMod.waterWaves._ww, 'waveField');
    window.__wrapRecv(g.lighting?._lw?.worker, 'lightResult');
    window.__wwStat0 = window.__wwMod.wwWorkerStats();
    window.__t0 = performance.now();
    window.__f0 = window.__vnow;
  });

  // ---- 活跃工况驱动:每帧持续 wash 注入（3 源）→ 注入批非空+场活跃=逐帧消息 ----
  await page.evaluate(async ({ FRAMES }) => {
    const g = window.__swGame;
    const ww = window.__wwMod.waterWaves;
    const surf = Math.floor(g.world.groundLevel);
    const px = Math.floor(g.player.cx / 16);
    const ry = surf - 6;
    const t0 = performance.now();
    for (let i = 0; i < FRAMES; i++) {
      ww.injectWash((px - 30) * 16, (ry + 10) * 16, 6, 6, 0.6, -0.4, 1);
      ww.injectWash((px + 10) * 16, (ry + 18) * 16, 8, 4, -0.5, 0.5, 1);
      ww.injectWash((px + 35) * 16, (ry + 6) * 16, 4, 8, 0.3, 0.8, 1);
      window.__vnow += 16.6667;
      g.frame(window.__vnow);
    }
    window.__driveWall = performance.now() - t0;
  }, { FRAMES });

  const out = await page.evaluate(() => {
    const dt = (performance.now() - window.__t0) / 1000;
    const ww1 = window.__wwMod.wwWorkerStats();
    const w0 = window.__wwStat0;
    const lw = window.__swGame.lighting?._lw;
    const lwStat = lw ? null : null;   // lightWorkerStats 经模块 import 取（下 evaluate）
    return {
      wallSec: dt, driveWallMs: window.__driveWall,
      post: window.__msgStat.post, recv: window.__msgStat.recv,
      wwDelta: {
        posted: ww1.posted - w0.posted, fields: ww1.fields - w0.fields,
        bytes: ww1.bytes - w0.bytes, quietSkips: ww1.quietSkips - w0.quietSkips,
        fmt: {
          full: ww1.fmt.full - w0.fmt.full, delta: ww1.fmt.delta - w0.fmt.delta,
          f32: ww1.fmt.f32 - w0.fmt.f32,
        },
        on: ww1.on, falls: ww1.falls - w0.falls, resyncs: ww1.resyncs - w0.resyncs,
      },
      hasLightWorker: !!(window.__swGame.lighting?._lw?.worker),
    };
  });
  const lwDelta = await page.evaluate(async () => {
    try {
      const m = await import('/src/lighting/LightWorkerLink.ts');
      const s1 = m.lightWorkerStats();
      return { on: s1.on, posted: s1.posted, results: s1.results, falls: s1.falls, skipped: s1.skipped, lagMs: s1.lagMs };
    } catch (e) { return { err: String(e) }; }
  });

  // 构成表输出
  console.log(`\n[${arm}] wall=${out.wallSec.toFixed(1)}s driveWall=${out.driveWallMs.toFixed(0)}ms frames=${FRAMES} lightWorker=${out.hasLightWorker}`);
  const sec = out.wallSec;
  let totPostMs = 0, totPostN = 0, totBytes = 0;
  for (const [op, s] of Object.entries(out.post)) {
    totPostMs += s.ms; totPostN += s.n; totBytes += s.bytes;
    console.log(`  post ${op.padEnd(10)} n=${String(s.n).padEnd(6)} (${(s.n / sec).toFixed(1)}/s)  bytes=${(s.bytes / 1048576).toFixed(2)}MB (${(s.bytes / sec / 1024).toFixed(1)}KB/s)  postMs=${s.ms.toFixed(2)} (${(s.ms / sec).toFixed(2)}ms/s, avg ${(s.ms / Math.max(1, s.n) * 1000).toFixed(1)}µs/msg)  xfer=${s.xfer}`);
  }
  console.log(`  post TOTAL          n=${totPostN}  postMs=${totPostMs.toFixed(2)} → ${(totPostMs / sec).toFixed(2)}ms/s 主线程同步成本`);
  for (const [tag, s] of Object.entries(out.recv)) {
    console.log(`  recv ${tag.padEnd(10)} n=${s.n} (${(s.n / sec).toFixed(1)}/s)  handlerMs=${s.ms.toFixed(2)} (${(s.ms / sec).toFixed(2)}ms/s, avg ${(s.ms / Math.max(1, s.n) * 1000).toFixed(1)}µs/msg)  payload=${(s.bytes / 1048576).toFixed(2)}MB`);
  }
  console.log(`  wwStat Δ: posted=${out.wwDelta.posted} fields=${out.wwDelta.fields} bytes=${(out.wwDelta.bytes / 1048576).toFixed(2)}MB quietSkips=${out.wwDelta.quietSkips} fmt=${JSON.stringify(out.wwDelta.fmt)} falls=${out.wwDelta.falls} resyncs=${out.wwDelta.resyncs} on=${out.wwDelta.on}`);
  console.log(`  lwStat: ${JSON.stringify(lwDelta)}`);
  if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | ')); break; }
}

await browser.close();
console.log('\n[done] 构成口径:postMs=postMessage 同步段(克隆+入队);recv handlerMs=收达 JS handler(反序列化在 handler 前=口径外,落收包 task);transferable 化消息 postMs 应≈0(所有权转移)。');
process.exit(0);
