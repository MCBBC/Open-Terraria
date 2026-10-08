// ★liqp3 主循环矩形数学批量向量化+at() 算术化——像素 A/B+活机量化（2026-10-08 液体核
//  第三刀;_liqp2-ab 页内翻面范式同构）。
// 【仪表债继承（_liqp2-ab 头注 2026-10-08）】headless 主画布 GL preserveDrawingBuffer=
//  false → 异步读=黑屏;本探针快照仪=page.screenshot（合成页）+UI 噪声掩罩（同臂双截
//  差分 bbox 外扩+固定顶带）。语义红线主判据=node 账面/序列逐位
//  （tests/liquid-liqp3-rect-parity.test.ts）;本探针承载【活机冻结帧像素 A/B+量化】。
// A 臂=liqp3 关（现行链:逐格 4 次缩放乘加+at() 调用）;B 臂=liqP3SetForTest(true)
// （列/行共享 f64 LUT+增量下标+at() 算术化）。页内翻面;暂停态+波场定格（dt=0）+
// ?wwarp=0（GL 扭曲 uTime 墙钟噪声切除,与 _liqp2-ab 同判谳）双臂重放。
// 判据：
//   LA1 同帧 A≡B census n=0 @zoom=1（UI 掩罩外场景域逐位）;
//   LA2 同帧 A≡B census n=0 @zoom=1.3（分数 devSX 乘法 rounding+共享边分区 exercise
//       ——zoom=1 时 devSX=1 恒等,乘法面只在分数缩放下可达）;
//   LE1 活机量化 drawLiquids incl ms/帧+LE2 CDP aP self（双臂同窗）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=900000 scripts/_liqp3-ab.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { gotoApp } from '../tools/probe/lib/boot.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { front } from '../tools/probe/lib/browser.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

async function runViewport(vw, vh) {
  const browser = await launchBrowser({ viewport: { width: vw, height: vh } });
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // ★已知噪声过滤（仪表中立性）:探针场景搭建期 HalfBrickPass killTile 级联深度
    //  溢出优雅降级日志（双臂等频同坐标出现=场景半砖+运行期交互的既有行为,
    //  与液体渲染链无关;LA census n=0 实证渲染面零差）。
    if (/HalfBrickPass\] killTile 级联深度溢出/.test(m.text())) return;
    pageErrors.push('CONSOLE.error: ' + m.text());
  });
  const nav = await gotoApp(page, ORIGIN, { extraQuery: '?wwarp=0', tries: 20 });
  if (!nav) { chk(`gotoApp@${vw}x${vh}`, false, 'FAIL'); await browser.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261008 });
  chk(`createGame@${vw}x${vh}`, !!gen?.ok, gen?.why ?? '');
  await godMode(page, true);

  // ---- 场面:满视口水体（同 _liqp2-ab/_c7-liq-census 景——数据可比）----
  await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
    const surf = Math.floor(g.world.groundLevel);
    const px = Math.floor(g.player.cx / 16);
    const DIRT = window.__swTiles?.['dirt'] ?? 1;
    const SAND = window.__swTiles?.['sand'] ?? 53;
    const x0 = px - 50, x1 = px + 50, ry = surf - 6, depth = 44;
    for (let x = x0 - 6; x <= x1 + 6; x++) {
      for (let y = ry - 8; y <= ry + depth + 6; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
    }
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let d = 0; d < 3; d++) st.setTile(x, ry + depth + d, DIRT);
    for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
    for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + 30; y++) st.setLiquid(x, y, 255, 1);
    for (let x = x0 + 20; x < x0 + 32; x++) for (let y = ry + 10; y < ry + 18; y++) { st.setLiquid(x, y, 255, 2); st.setTile(x, y, 0); }
    for (let x = x1 - 16; x < x1 - 6; x++) for (let y = ry + 12; y < ry + 20; y++) { st.setLiquid(x, y, 255, 3); st.setTile(x, y, 0); }
    for (let i = 0; i < 14; i++) {
      const sx = x0 + 4 + i * 5;
      st.setTile(sx, ry + depth - 1, DIRT); st.setSlope(sx, ry + depth - 1, 1 + (i % 2));
      st.setTile(sx + 1, ry + depth - 1, DIRT); st.setSlope(sx + 1, ry + depth - 1, 2 - (i % 2));
    }
    for (let x = x0 + 6; x <= x0 + 26; x++) { st.setTile(x, ry + depth - 1, SAND); st.setHalfBrick(x, ry + depth - 1, true); }
    for (let x = x0 + 6; x <= x0 + 26; x++) st.setLiquid(x, ry + depth - 2, 255, 1);
    g.player.x = (x1 - 2) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    window.__vnow = performance.now();
    window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__swGame.frame(window.__vnow); } return window.__vnow; };
    window.__p3set = (v) => { window.__vlMod.liqP3SetForTest(v); };
    window.__renderState = () => {
      const r = g.renderer;
      return { inv: r._waveLiquidInView, accMode: r._accMode, path: r.bglPathUsed, zoom: g.camera.zoom };
    };
    window.__liqTimerWrap = () => {
      const r = g.renderer;
      if (r.__liqWrapped) return;
      const proto = Object.getPrototypeOf(r);
      const orig = proto.drawLiquids;
      window.__liqMs = 0; window.__liqN = 0;
      r.drawLiquids = function (...a) {
        const t0 = performance.now();
        const res = orig.apply(this, a);
        window.__liqMs += performance.now() - t0;
        window.__liqN++;
        return res;
      };
      r.__liqWrapped = true;
    };
    window.__perfWindow = (ms) => new Promise((res) => {
      let frames = 0;
      window.__liqMs0 = window.__liqMs; window.__liqN0 = window.__liqN;
      window.__frameMs = 0;
      const gf = window.__swGame.frame.bind(window.__swGame);
      const t0 = performance.now();
      const cnt = () => {
        window.__vnow += 16.6667;
        const tf = performance.now();
        gf(window.__vnow);
        window.__frameMs += performance.now() - tf;
        frames++;
        if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
        else res({ frames, liqMs: window.__liqMs - window.__liqMs0, liqN: window.__liqN - window.__liqN0, frameMs: window.__frameMs });
      };
      requestAnimationFrame(cnt);
    });
  });
  await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
  await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
  await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => {
    const ww = window.__wwMod.waterWaves;
    const origFrame = ww.frame.bind(ww);
    ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };   // 波场定格（对拍确定性）
  });
  await page.evaluate(() => { window.__liqTimerWrap(); });

  // 暖机+光照收敛（暂停前泵够——光照按帧收敛,过早暂停=截图黑场,_liqp2-ab 同口径）
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(25); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  }
  await page.evaluate(() => window.__drive(20));
  const st1 = await page.evaluate(() => window.__renderState());
  chk(`场面就绪@${vw}x${vh}(液体在视+acc 链)`, st1.inv === true, JSON.stringify(st1));

  // ---- LA:同帧配对对拍 ×K（渲染/跳帧交替——每臂保证至少一次真渲染）----
  const K = 3;
  async function pairedCensus(tag) {
    const pngA = [], pngB = [];
    await front(page);
    for (let k = 0; k < K; k++) {
      const v0 = await page.evaluate(() => window.__vnow);
      await page.evaluate(() => { window.__p3set(false); });
      await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
      pngA.push(await page.screenshot({ type: 'png' }));
      await page.evaluate(() => { window.__p3set(true); });
      await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
      pngB.push(await page.screenshot({ type: 'png' }));
    }
    // 噪声掩罩:同臂（false）双截差分 bbox 外扩 8px ∪ 固定顶带（y<115 HUD/toast 墙钟带）
    const snapArm = async () => {
      await front(page);
      const v0 = await page.evaluate(() => window.__vnow);
      await page.evaluate(() => { window.__p3set(false); });
      await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
      return page.screenshot({ type: 'png' });
    };
    const [n1, n2] = [await snapArm(), await snapArm()];
    const mask = await page.evaluate(async ({ d1, d2 }) => {
      const load = (d) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = d; });
      const [ia, ib] = await Promise.all([load(d1), load(d2)]);
      const cv = document.createElement('canvas');
      cv.width = ia.width; cv.height = ia.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const grab = (im) => { cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0); return cx.getImageData(0, 0, cv.width, cv.height).data; };
      const P = grab(ia), Q = grab(ib);
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (Math.abs(P[i] - Q[i]) || Math.abs(P[i + 1] - Q[i + 1]) || Math.abs(P[i + 2] - Q[i + 2]) || Math.abs(P[i + 3] - Q[i + 3])) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return x1 < 0 ? null : [Math.max(0, x0 - 8), Math.max(0, y0 - 8), Math.min(cv.width - 1, x1 + 8), Math.min(cv.height - 1, y1 + 8)];
    }, { d1: `data:image/png;base64,${n1.toString('base64')}`, d2: `data:image/png;base64,${n2.toString('base64')}` });
    const masks = [];
    if (mask) masks.push(mask);
    masks.push([0, 0, 10 ** 6, 114]);
    let tot = 0;
    const dets = [];
    for (let k = 0; k < K; k++) {
      const c = await page.evaluate(async ({ da, db, masks }) => {
        const load = (d) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = d; });
        const [ia, ib] = await Promise.all([load(da), load(db)]);
        const cv = document.createElement('canvas');
        cv.width = ia.width; cv.height = ia.height;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(ia, 0, 0);
        const da2 = cx.getImageData(0, 0, cv.width, cv.height);
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.drawImage(ib, 0, 0);
        const db2 = cx.getImageData(0, 0, cv.width, cv.height);
        const P = da2.data, Q = db2.data;
        let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          let skip = false;
          for (const m of masks) { if (x >= m[0] && x <= m[2] && y >= m[1] && y <= m[3]) { skip = true; break; } }
          if (skip) continue;
          const i = (y * cv.width + x) * 4;
          const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
          if (dd > 0) {
            n++; sum += dd; if (dd > maxd) maxd = dd;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        return { n, maxd, mean: n ? sum / n : 0, bbox: n ? [x0, y0, x1, y1] : null };
      }, { da: `data:image/png;base64,${pngA[k].toString('base64')}`, db: `data:image/png;base64,${pngB[k].toString('base64')}`, masks });
      tot += c.n;
      dets.push(`k${k}:n=${c.n},maxd=${c.maxd},bbox=${JSON.stringify(c.bbox)}`);
    }
    return { tot, dets, mask };
  }

  // LA1 @zoom=1（整数缩放域）
  const la1 = await pairedCensus('zoom1');
  console.log(`[mask@zoom1] UI noise bbox=${JSON.stringify(la1.mask)}`);
  chk(`LA1 同帧 A≡B census n=0 @zoom=1（UI 掩罩外场景域逐位;设备矩形逐位红线）@${vw}x${vh}`, la1.tot === 0, `${la1.dets.join(' ')} total=${la1.tot}`);

  // LA2 @zoom=1.3（分数 devSX/devSY 乘法 rounding+共享边 ceil/floor 分区 exercise;
  //   zoom/zoomTarget 直设跳缓动,相机重钉后泵帧稳定）
  await page.evaluate(() => {
    const g = window.__swGame;
    g.camera.zoom = 1.3; g.camera.zoomTarget = 1.3;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    window.__swGame._forceSceneRescan = true;
    window.__drive(30);
  });
  const zst = await page.evaluate(() => window.__renderState());
  const la2 = await pairedCensus('zoom1.3');
  console.log(`[mask@zoom1.3] UI noise bbox=${JSON.stringify(la2.mask)} zoom=${zst.zoom}`);
  chk(`LA2 同帧 A≡B census n=0 @zoom=1.3（分数变换乘法 rounding 域逐位）@${vw}x${vh}`, la2.tot === 0, `${la2.dets.join(' ')} total=${la2.tot}`);

  // ---- LE1:活机量化 drawLiquids incl（双臂同窗各 ~1.5s,@zoom=1.3 分数域）----
  const perfA = await page.evaluate(async () => { window.__p3set(false); const r = await window.__perfWindow(1500); return r; });
  const perfB = await page.evaluate(async () => { window.__p3set(true); const r = await window.__perfWindow(1500); return r; });
  const liqA = perfA.liqMs / Math.max(1, perfA.liqN), liqB = perfB.liqMs / Math.max(1, perfB.liqN);
  const frA = perfA.frameMs / Math.max(1, perfA.frames), frB = perfB.frameMs / Math.max(1, perfB.frames);
  console.log(`[LE1@${vw}] drawLiquids incl: A=${liqA.toFixed(3)}ms/f  B=${liqB.toFixed(3)}ms/f  (${(100 * (1 - liqB / Math.max(1e-9, liqA))).toFixed(1)}% 削减)  frameMs A=${frA.toFixed(2)} B=${frB.toFixed(2)}  frames A=${perfA.frames} B=${perfB.frames}`);

  // ---- LE2:CDP aP self（各 120 帧）----
  async function profileArm(on) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    await page.evaluate((on) => { window.__p3set(on); window.__drive(120); }, on);
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.detach();
    const selfUs = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const id = profile.samples[i];
      selfUs.set(id, (selfUs.get(id) || 0) + (timeDeltas(profile, i)));
    }
    function timeDeltas(pr, i) { return pr.timeDeltas[i] || 0; }
    const agg = {};
    for (const nd of profile.nodes) {
      const fn = nd.callFrame.functionName || '(anonymous)';
      const us = selfUs.get(nd.id) || 0;
      if (us > 0) agg[fn] = (agg[fn] || 0) + us;
    }
    return {
      total: [...selfUs.values()].reduce((a, b) => a + b, 0) / 1000,
      aP: (agg.drawVanillaLiquids || 0) / 1000, band: (agg.drawLiquidBehindTilesOnly || 0) / 1000,
      at: (agg.at || 0) / 1000, atM: (agg.atM || 0) / 1000, batQuad: (agg.batQuad || 0) / 1000,
    };
  }
  const profA = await profileArm(false);
  const profB = await profileArm(true);
  console.log(`[LE2@${vw}] aP self: A=${(profA.aP / 120).toFixed(3)}ms/f  B=${(profB.aP / 120).toFixed(3)}ms/f  (${(100 * (1 - profB.aP / Math.max(1e-9, profA.aP))).toFixed(1)}% 削减)  at闭包 A=${(profA.at / 120).toFixed(4)} B=${(profB.at / 120).toFixed(4)}  batQuad A=${(profA.batQuad / 120).toFixed(3)} B=${(profB.batQuad / 120).toFixed(3)}  profile-total A=${profA.total.toFixed(0)} B=${profB.total.toFixed(0)}`);

  if (pageErrors.length) { chk(`pageErrors@${vw}x${vh}`, false, pageErrors.slice(0, 2).join(' | ')); }
  await browser.close();
  return { liqA, liqB, profA: profA.aP / 120, profB: profB.aP / 120 };
}

const r1 = await runViewport(1280, 800);
const r2 = process.env.LIQP3_ONE === '1' ? null : await runViewport(1920, 945);

console.log('\n=== liqp3 A/B summary ===');
console.log(`1280x800: liqA=${r1.liqA.toFixed(3)} liqB=${r1.liqB.toFixed(3)} aP A=${r1.profA.toFixed(3)} B=${r1.profB.toFixed(3)}`);
if (r2) console.log(`1920x945: liqA=${r2.liqA.toFixed(3)} liqB=${r2.liqB.toFixed(3)} aP A=${r2.profA.toFixed(3)} B=${r2.profB.toFixed(3)}`);
console.log(`summary: ${results.every((r) => r.ok) ? 'ALL PASS' : 'HAS FAIL'} (${results.filter((r) => r.ok).length}/${results.length})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
