// ★liqp2 P1 扫描承载面提速——像素 A/B+活机量化（2026-10-08 液体核第二刀;_c7-ab 页内翻面范式）。
// 【★仪表债登记（2026-10-08 本刀实测,后续会话必读）】本探针的 LA 像素 census 在本机
//  headless 环境【不可用作像素证据】:①GL 主画布 preserveDrawingBuffer=false——
//  drawImage/toDataURL 异步读=黑屏（实证 rgbA=0,0,0）;②setRenderMode(true) CPU 路+
//  page.screenshot 合成页仍=世界黑场（光照/呈现链未见于截图,仅 UI 层可见）。
//  c7 探针同款 LA「n=0」实为黑对黑。语义红线改由【node 同实例账面逐位】承载:
//  tests/liquid-liqp2-p1-parity.test.ts（__liqPrepSnapshotForTest 23 数组直比+T4
//  LUT 注错证红——C7 刀同款单位测判别力范式）。页内 SetForTest 翻面对活帧渲染的
//  可达性亦未定谳（LUT 注错+快照在活帧下 level 全零与 324 次 calls 并存,疑云未解;
//  __vlMod 动态 import 与游戏图同 URL——同实例论与观察矛盾,登记未决）。
//  活机量化口径=?liqp2-profile.mjs boot-per-arm（URL 旗=模块 init 读,无翻面环节,
//  实证 aP self 0.80→0.535ms/f @1280 探针视口）。
// A 臂=liqp2 关（现行链:闭包 at/逐格除法/五函数调用）;B 臂=liqp2 开（LUT+边界外提+
//  增量下标+单形 atM）。页内 liqP2SetForTest 翻面;暂停态=渲染纯函数,同 vnow 序列双臂重放。
// 判据：
//   LA  同帧 A≡B census n=0（逐位——语义红线:bg 账终值与全窗重读逐位一致;非 0 即病）;
//   LB  双分辨率补拍（1280×800 与 1920×945 两档各 3 对）;
//   LC  变异判别力:tests/liquid-liqp2-p1-parity.test.ts T4（node 账面注错证红）;
//   LE  活机量化:drawLiquids 包装 ms/帧 + CDP aP self（双臂同窗;★见上仪表债——
//       配对数受翻面可达性未定谳影响,采信 _liqp2-profile.mjs boot-per-arm 口径）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=900000 scripts/_liqp2-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { gotoApp } from '../tools/probe/lib/boot.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { front } from '../tools/probe/lib/browser.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

async function runViewport(vw, vh, pairs) {
  const browser = await launchBrowser({ viewport: { width: vw, height: vh } });
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
  // ★?wwarp=0 census 确定性:GL 全屏水扭曲 uTime 走墙钟（1920 实证同臂双截全水面
  //  漂移 bbox=[0,0,1218,944]）——本 A/B 语义面（P1 扫描+prep+主循环）与 warp 正交,
  //  关扭曲换整幅逐位稳定。gotoApp 带参直启（_c13c-ab FB 判谳:带参 boot 链手工引导）。
  const nav = await gotoApp(page, ORIGIN, { extraQuery: '?wwarp=0', tries: 20 });
  if (!nav) { chk(`gotoApp@${vw}x${vh}`, false, 'FAIL'); await browser.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261008 });
  chk(`createGame@${vw}x${vh}`, !!gen?.ok, gen?.why ?? '');
  await godMode(page, true);

  // ---- 场面:满视口水体（同 _c7-liq-census v2 景）----
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
    // ★GL 主画布 preserveDrawingBuffer=false——异步快照=黑屏（本案实证 rgbA=0,0,0）。
    //  快照必须同任务读:__capOn 时 drive 内每帧渲染后立即 drawImage 到 2D 离屏。
    window.__capCv = document.createElement('canvas');
    window.__capCtx = window.__capCv.getContext('2d', { willReadFrequently: true });
    window.__capOn = false;
    window.__drive = (n) => {
      for (let i = 0; i < n; i++) {
        window.__vnow += 16.6667; g.frame(window.__vnow);
        if (window.__capOn) {
          const c = g.renderer.canvas;
          if (window.__capCv.width !== c.width || window.__capCv.height !== c.height) { window.__capCv.width = c.width; window.__capCv.height = c.height; }
          window.__capCtx.drawImage(c, 0, 0);
        }
      }
      return window.__vnow;
    };
    window.__p2set = (v) => { window.__vlMod.liqP2SetForTest(v); };
    window.__renderState = () => {
      const r = g.renderer;
      return { inv: r._waveLiquidInView, accMode: r._accMode, path: r.bglPathUsed };
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

  // 暖机+光照收敛（★暂停前必须泵够——光照引擎按帧收敛,过早暂停=世界全黑
  //  截图黑场,本案实证;census v2 暖机 200 帧同口径）
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(25); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  }
  await page.evaluate(() => window.__drive(20));
  const st1 = await page.evaluate(() => window.__renderState());
  chk(`场面就绪@${vw}x${vh}(液体在视+acc 链)`, st1.inv === true, JSON.stringify(st1));

  async function snapFin() {
    return page.evaluate(() => {
      const c = window.__capCv;   // 同任务捕获的 2D 离屏（非 GL 主画布——异步读=黑屏）
      const lc = document.createElement('canvas');
      lc.width = c.width; lc.height = c.height;
      const lx = lc.getContext('2d', { willReadFrequently: true });
      lx.drawImage(c, 0, 0);
      const d = lx.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return { w: c.width, h: c.height, b64: btoa(bin) };
    });
  }
  async function census(aFin, bFin) {
    return page.evaluate(({ a, b }) => {
      const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
      const P = dec(a.b64), Q = dec(b.b64);
      let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      const W = a.w;
      for (let i = 0; i < P.length; i += 4) {
        const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
          Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
        if (dd > 0) {
          n++; sum += dd;
          if (dd > maxd) maxd = dd;
          const px = (i >> 2) % W, py = (i >> 2) / W | 0;
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
      }
      return { n, maxd, mean: n ? sum / n : 0, bbox: n ? [x0, y0, x1, y1] : null };
    }, { a: aFin, b: bFin });
  }

  // ---- LA/LB:同帧配对对拍 ×K（K=3 渲染/跳帧交替——每臂保证至少一次真渲染）----
  // ★快照仪=page.screenshot（合成页;GL 主画布 preserveDrawingBuffer=false——
  //   drawImage/异步读=黑屏,本案实证 rgbA=0,0,0。_liqgl-ab 同款仪）。
  // ★UI 噪声掩罩:页内左上 HUD 盒（实证 bbox≈[0,0,891,101]）含墙钟驱动重绘,
  //   同臂双截也漂——先同臂双截求噪声 bbox（外扩 8px）作掩罩,A≡B 判定只在
  //   掩罩外做（场景域）。census=页内 PNG 原生解码像素直比。
  const K = 3;
  let tot = 0;
  const dets = [];
  const pngA = [], pngB = [];
  await front(page);
  for (let k = 0; k < K; k++) {
    const v0 = await page.evaluate(() => window.__vnow);
    await page.evaluate(() => { window.__p2set(false); });
    await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
    pngA.push(await page.screenshot({ type: 'png' }));
    await page.evaluate(() => { window.__p2set(true); });
    await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
    pngB.push(await page.screenshot({ type: 'png' }));
  }
  // 噪声掩罩:同臂（false）双截差分 bbox 外扩 8px
  const snapArm = async () => {
    await front(page);
    const v0 = await page.evaluate(() => window.__vnow);
    await page.evaluate(() => { window.__p2set(false); });
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
  // 掩罩集=同臂噪声 bbox(外扩 8px) ∪ 固定顶带（y<115=天空+热栏+欢迎 toast 墙钟
  //   淡出带——本景水面线在 y≥300,顶带无水体;k0 实证 toast 淡出 maxd=1 噪声）
  const masks = [];
  if (mask) masks.push(mask);
  masks.push([0, 0, 10 ** 6, 114]);
  console.log(`[mask] UI noise bbox=${JSON.stringify(mask)}`);
  // PNG 像素比（掩罩集外）
  for (let k = 0; k < K; k++) {
    const c = await page.evaluate(async ({ da, db, masks }) => {
      const load = (d) => new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = rej;
        im.src = d;
      });
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
  chk(`LA 同帧 A≡B census n=0（UI 掩罩外场景域逐位;P1 账终值语义红线）@${vw}x${vh}`, tot === 0, `${dets.join(' ')} total=${tot}`);

  // ---- LE1:活机量化 drawLiquids incl（双臂同窗各 ~1.5s）----
  const perfA = await page.evaluate(async () => { window.__p2set(false); const r = await window.__perfWindow(1500); return r; });
  const perfB = await page.evaluate(async () => { window.__p2set(true); const r = await window.__perfWindow(1500); return r; });
  const liqA = perfA.liqMs / Math.max(1, perfA.liqN), liqB = perfB.liqMs / Math.max(1, perfB.liqN);
  const frA = perfA.frameMs / Math.max(1, perfA.frames), frB = perfB.frameMs / Math.max(1, perfB.frames);
  console.log(`[LE1@${vw}] drawLiquids incl: A=${liqA.toFixed(3)}ms/f  B=${liqB.toFixed(3)}ms/f  (${(liqB / Math.max(1e-9, liqA)).toFixed(3)}x)  frameMs A=${frA.toFixed(2)} B=${frB.toFixed(2)}  frames A=${perfA.frames} B=${perfB.frames}`);

  // ---- LE2:CDP aP self（各 120 帧）----
  async function profileArm(on) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    await page.evaluate((on) => { window.__p2set(on); window.__drive(120); }, on);
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.detach();
    const selfUs = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const id = profile.samples[i];
      selfUs.set(id, (selfUs.get(id) || 0) + (profile.timeDeltas[i] || 0));
    }
    const agg = {};
    for (const nd of profile.nodes) {
      const fn = nd.callFrame.functionName || '(anonymous)';
      const us = selfUs.get(nd.id) || 0;
      if (us > 0) agg[fn] = (agg[fn] || 0) + us;
    }
    const total = [...selfUs.values()].reduce((a, b) => a + b, 0) / 1000;
    return { total, aP: (agg.drawVanillaLiquids || 0) / 1000, band: (agg.drawLiquidBehindTilesOnly || 0) / 1000, at: (agg.at || 0) / 1000, tileSolidLut: (agg.tileSolidLut || 0) / 1000, atM: (agg.atM || 0) / 1000 };
  }
  const profA = await profileArm(false);
  const profB = await profileArm(true);
  console.log(`[LE2@${vw}] aP self: A=${(profA.aP / 120).toFixed(3)}ms/f  B=${(profB.aP / 120).toFixed(3)}ms/f  (${(100 * (1 - profB.aP / Math.max(1e-9, profA.aP))).toFixed(1)}% 削减)  at闭包 A=${(profA.at / 120).toFixed(3)} atM B=${(profB.atM / 120).toFixed(3)}  tileSolidLut A=${(profA.tileSolidLut / 120).toFixed(3)}  profile-total A=${profA.total.toFixed(0)} B=${profB.total.toFixed(0)}`);
  chk(`LE aP self 改善 @${vw}x${vh}（B<A）`, profB.aP < profA.aP, `${(100 * (1 - profB.aP / Math.max(1e-9, profA.aP))).toFixed(1)}% self 削减`);

  if (pageErrors.length) { chk(`pageErrors@${vw}x${vh}`, false, pageErrors.slice(0, 2).join(' | ')); }
  await browser.close();
  return { liqA, liqB, profA: profA.aP / 120, profB: profB.aP / 120 };
}

const r1 = await runViewport(1280, 800);
const r2 = process.env.LIQP2_ONE === '1' ? null : await runViewport(1920, 945);

console.log('\n=== liqp2 A/B summary ===');
console.log(`1280x800: liqA=${r1.liqA.toFixed(3)} liqB=${r1.liqB.toFixed(3)} aP A=${r1.profA.toFixed(3)} B=${r1.profB.toFixed(3)}`);
if (r2) console.log(`1920x945: liqA=${r2.liqA.toFixed(3)} liqB=${r2.liqB.toFixed(3)} aP A=${r2.profA.toFixed(3)} B=${r2.profB.toFixed(3)}`);
console.log(`summary: ${results.every((r) => r.ok) ? 'ALL PASS' : 'HAS FAIL'} (${results.filter((r) => r.ok).length}/${results.length})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
