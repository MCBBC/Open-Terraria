// ★BJ78 WaterWaves 区 W1-W4 零语义补刀·像素对拍(?swperf=1 A/B;逐位一致性权威证据)
//
// 方法论 = scripts/_bj77-pixel-ab.mjs 模式(同 harness 逐字沿用):
//   同一会话停环(g.running=false)→ 冻结 performance.now/Date.now → 手动单帧
//   g.render()(animTick 钉住)→ 翻转 window.__swPerfFlags → 再渲染 →
//   主画布 RGBA 逐字节对比(md5+diff 计数,Node 侧)。
//   warmup 一帧吸收首帧 0.25s 波步离群,此后各帧 dt=0 波步序列一致。
// 断言(每场景):确定性自检(同 flag 两帧 diff==0)/flag on 与 off 逐字节一致/
//   翻回 off 恢复输出。场景:地表静立/海洋水边(waveQ=3 全链:sampleDisplace(W1)
//   +uploadWave(W2)+_step(W3)+updateWaterWaves(W4) 全部激活)/洞穴/海洋@waveQ0。
// 追加(本刀):第二页 ?wamp=2 URL——amp≠1 增益路径下(W1/W2 缓存读取面的值面)
//   ocean 场全帧 md5 对拍,证缓存读取与逐调用解析逐位同值。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj78-pixel-ab.mjs
import { createHash } from 'node:crypto';
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});

/** 页内 harness(冻结+快照+手动单帧+flag 翻面;与 _bj77-pixel-ab.mjs 逐字同式) */
async function installHarness(page) {
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__T0 = 8_640_000_000;
    performance.now = () => window.__T0;
    Date.now = () => window.__T0;
    let s = 0xb177 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const w = g.world.weather;
    if (w) { try { w.maxRaining = 0; w.raining = false; w.windSpeedCurrent = 0; } catch { /* 域缺字段 */ } }
    for (const k of ['critters', 'props', 'enemies', 'drops', 'projectiles']) {
      const b = g.entities?.[k];
      if (Array.isArray(b)) b.length = 0;
    }
    const oc = document.createElement('canvas');
    const octx = oc.getContext('2d', { willReadFrequently: true });
    window.__snapB64 = () => {
      const c = g.renderer.canvas;
      if (oc.width !== c.width || oc.height !== c.height) { oc.width = c.width; oc.height = c.height; }
      octx.clearRect(0, 0, oc.width, oc.height);
      octx.drawImage(c, 0, 0);
      const d = octx.getImageData(0, 0, oc.width, oc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);
    };
    window.__R = (tick) => {
      s = 0xb177 >>> 0;
      if (window.__ta) window.__ta.tick = 4242;
      const ww = window.__ww;
      if (ww && window.__waveSnap) {
        const sn = window.__waveSnap;
        ww._R = sn.R; ww._G = sn.G; ww._R2 = sn.R2; ww._G2 = sn.G2;
        ww.progress = sn.progress; ww._scrollX = sn.sx; ww._scrollY = sn.sy; ww._stepsLast = sn.st;
      }
      const t = g.renderer.animTick;
      g.renderer.animTick = tick;
      g.render();
      g.renderer.animTick = t;
    };
    import('/src/render/TileAnim.ts').then((m) => { window.__ta = m.tileAnim; });
    import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; });
    {
      const sky = g.renderer.sky;
      const proto = Object.getPrototypeOf(sky);
      const origDraw = proto.draw;
      sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
        return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
      };
    }
    import('/src/render/WaterWaves.ts').then((m) => {
      const ww = m.waterWaves;
      window.__ww = ww;
      window.__waveSnap = {
        R: ww.readGridR().slice(0), G: ww.readGridG().slice(0),
        R2: (ww._R2 ? ww._R2.slice(0) : ww.readGridR().slice(0)),
        G2: (ww._G2 ? ww._G2.slice(0) : ww.readGridG().slice(0)),
        progress: ww.progress, sx: ww._scrollX, sy: ww._scrollY, st: ww._stepsLast,
      };
    });
    try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
    window.__flag = (v) => window.__swPerfFlags.set(v);
    window.__flagGet = () => window.__swPerfFlags.get();
    const lc = document.createElement('canvas');
    const lctx = lc.getContext('2d', { willReadFrequently: true });
    window.__snapLightB64 = () => {
      const c = g.renderer.lightCanvas;
      if (!c) return '';
      if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
      lctx.clearRect(0, 0, lc.width, lc.height);
      lctx.drawImage(c, 0, 0);
      const d = lctx.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);
    };
  });
}

const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
const diffCount = (page) => async (a, b) => page.evaluate(({ x, y }) => {
  const dec = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const A = dec(x), B = dec(y);
  let n = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  const W = (window.__swGame.renderer.canvas.width) || 1;
  for (let i = 0; i < Math.min(A.length, B.length); i += 4) {
    if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2] || A[i + 3] !== B[i + 3]) {
      n++;
      const px = (i >> 2) % W, py = (i >> 2) / W | 0;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
  }
  return { n, len: A.length === B.length, bbox: [minX, minY, maxX, maxY] };
}, { x: a, y: b });

/** 场景对拍矩阵(与 _bj77-pixel-ab.mjs 逐字同式) */
async function scene(page, name, setup, { waveQ = null } = {}) {
  const dc = diffCount(page);
  await front(page);
  if (setup) await setup();
  await pump(page, 120, { clearEnemies: true });
  if (waveQ !== null) {
    await page.evaluate(async (q) => { const m = await import('/src/core/Options.ts'); m.options.data.waveQuality = q; }, waveQ);
    await pump(page, 30, { clearEnemies: true });
  }
  await page.evaluate(() => {
    window.__flag(false);
    window.__warm = window.__swGame.renderer.animTick + 9;
    for (const k of ['critters', 'props', 'enemies', 'drops', 'projectiles']) {
      const b = window.__swGame.entities?.[k];
      if (Array.isArray(b)) b.length = 0;
    }
  });
  await page.evaluate(() => { window.__R(window.__warm); });
  for (let i = 0; i < 240; i++) await page.evaluate(() => { window.__R(++window.__warm); });
  await sleep(30);
  const A1 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
  const A2 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
  await page.evaluate(() => { window.__flag(true); });
  const B1 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
  const B2 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
  await page.evaluate(() => { window.__flag(false); });
  const C1 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });

  const [lA1, lA2, lB1, lB2, lC1] = [A1[1], A2[1], B1[1], B2[1], C1[1]];
  const dl = await dc(lA1, lA2);
  L.chk(`[${name}] 光照图自检(lA1==lA2)`, dl.n === 0, `diff=${dl.n}`);
  const mLB1 = md5(lB1);
  const dlb = await dc(lA1, lB1);
  L.chk(`[${name}] 光照图 flag ON 逐位一致(lB1==lA1)`, md5(lA1) === mLB1 && dlb.n === 0, `diff=${dlb.n}`);
  const dlb2 = await dc(lA2, lB2);
  L.chk(`[${name}] 光照图 flag ON 连续帧一致(lB2==lA2)`, md5(lA2) === md5(lB2) && dlb2.n === 0, `diff=${dlb2.n}`);
  const dlc = await dc(lA1, lC1);
  L.chk(`[${name}] 光照图翻回恢复(lC1==lA1)`, md5(lA1) === md5(lC1) && dlc.n === 0, `diff=${dlc.n}`);

  const dSelf = await dc(A1[0], A2[0]);
  L.chk(`[${name}] 全帧确定性自检(A1==A2)`, dSelf.n === 0 && dSelf.len, `diff=${dSelf.n} lenEq=${dSelf.len}`);
  const dB1 = await dc(A1[0], B1[0]);
  L.chk(`[${name}] 全帧 flag ON 逐位一致(B1==A1)`, md5(A1[0]) === md5(B1[0]) && dB1.n === 0, `diff=${dB1.n}`);
  const dB2 = await dc(A2[0], B2[0]);
  L.chk(`[${name}] 全帧 flag ON 连续帧一致(B2==A2)`, md5(A2[0]) === md5(B2[0]) && dB2.n === 0, `diff=${dB2.n}`);
  const dC1 = await dc(A1[0], C1[0]);
  L.chk(`[${name}] 全帧翻回恢复(C1==A1)`, md5(A1[0]) === md5(C1[0]) && dC1.n === 0, `diff=${dC1.n}`);
}

/** 找水(地表列扫描;与 _bj77 同式) */
async function findWater(page) {
  return page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const y0 = Math.max(0, gl - 30), y1 = Math.min(st.h - 1, gl + 12);
    const runs = []; let rs = -1, rl = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let c = 0;
      for (let y = y0; y <= y1; y++) if (st.liquid[y * st.w + x] > 0) c++;
      if (c >= 8) { if (rs < 0) rs = x; rl++; } else if (rs >= 0) { if (rl >= 10) runs.push([rs, rs + rl - 1]); rs = -1; rl = 0; }
    }
    if (rs >= 0 && rl >= 10) runs.push([rs, rs + rl - 1]);
    return { runs, gl };
  });
}

try {
  // ================= 页 1:缺省 URL(W1/W2 amp=1 面) =================
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await installHarness(page);
  const water = await findWater(page);
  const dc = diffCount(page);

  // ① 地表静立(远离出生镇)
  await scene(page, 'surface', async () => {
    const s = await page.evaluate(() => {
      const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
      const x = Math.min(st.w - 40, Math.floor(g.player.cx / 16) + 60);
      return { wx: x * 16, wy: (gl - 4) * 16 };
    });
    await teleport(page, s.wx, s.wy);
    await pump(page, 30, { clearEnemies: true });
  });

  // ② 海洋干沙位(水在视口内、波链全激活:W1-W4 全跑;玩家站【干沙】不下水——
  //   站水里=游泳态 render 侧动画计数器=跨帧必漂,BJ77 移交件同款噪声源规避)
  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await scene(page, 'ocean', async () => {
      await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);
      await pump(page, 30, { clearEnemies: true });
    });
  } else L.say('ocean skipped: 无地表水体');

  // ③ 洞穴(暗光非全亮)
  await scene(page, 'cave', async () => {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__caveY = (Math.floor(g.world.rockLevel) + 30) * 16;
    });
    const cy = await page.evaluate(() => window.__caveY);
    const px = await page.evaluate(() => window.__swGame.player.cx);
    await teleport(page, px, cy);
  });

  // ④ 海滩 @ 波场 0 档(波模拟/全屏扭曲停机;W3 _step 停机面)
  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await scene(page, 'ocean-wave0', async () => {
      await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);
      await pump(page, 30, { clearEnemies: true });
    }, { waveQ: 0 });
    await page.evaluate(async () => { const m = await import('/src/core/Options.ts'); m.options.data.waveQuality = 3; });
  }

  // ================= 页 2:?wwarp=0(W1 bob 路径主场:sampleDisplace 逐格激活;
  //   定谳 VanillaLiquidRenderer.ts:639 waveOn=q>0 && !warpMode——GL warp 激活时
  //   逐格 bob 按设计关闭,W1 只在此配置逐格跑) =================
  {
    const pageB = await openPage(browser, { errors: L.fails });
    const bootB = await bootstrap(pageB, process.env.SW_ORIGIN);
    L.chk('bootstrap(wwarp=0)', bootB.ok, bootB.why ?? '');
    const uB = new URL(process.env.SW_ORIGIN);
    uB.searchParams.set('wwarp', '0');
    await pageB.evaluate((href) => { location.href = href; }, uB.toString());
    await new Promise((r) => setTimeout(r, 1500));
    const bridgeB = await pageB.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 120_000 }).then(() => true).catch(() => false);
    L.chk('带参重导航桥(wwarp=0)', bridgeB, '');
    const genB = await createGame(pageB, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
    L.chk('createGame(wwarp=0)', genB.ok, genB.why ?? '');
    await installHarness(pageB);
    const waterB = await findWater(pageB);
    if (waterB.runs.length) {
      const [w0, w1] = waterB.runs[0];
      await scene(pageB, 'ocean-bob(wwarp0)', async () => {
        await teleport(pageB, (w1 + 6) * 16, waterB.gl * 16 - 48);
        await pump(pageB, 30, { clearEnemies: true });
      });
    } else L.say('ocean-bob skipped: 无地表水体');
    await pageB.close().catch(() => { });
  }

  // ================= 页 3:?wamp=2(W1/W2 amp 缓存读取面的增益路径) =================
  // ★bootstrap 的 gotoApp 用裸 origin 重导航会洗掉查询参数——先正常 boot,
  //   再带参二次导航重等桥;参数生效以页内 waveAmpParam()===2 断言(真值面)。
  const page2 = await openPage(browser, { errors: L.fails });
  const boot2 = await bootstrap(page2, process.env.SW_ORIGIN);
  L.chk('bootstrap(wamp=2)', boot2.ok, boot2.why ?? '');
  const u2 = new URL(process.env.SW_ORIGIN);
  u2.searchParams.set('wamp', '2');
  await page2.evaluate((href) => { location.href = href; }, u2.toString());
  await new Promise((r) => setTimeout(r, 1500));
  const bridge2 = await page2.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 120_000 }).then(() => true).catch(() => false);
  L.chk('带参重导航桥(wamp=2)', bridge2, '');
  const ampReal = await page2.evaluate(async () => {
    const m = await import('/src/render/perfFlags.ts');
    return { search: location.search, amp: m.waveAmpParam() };
  });
  L.chk('?wamp=2 参数生效(缓存读取面=2)', ampReal.amp === 2 && ampReal.search.includes('wamp=2'), JSON.stringify(ampReal));
  const gen2 = await createGame(page2, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame(wamp=2)', gen2.ok, gen2.why ?? '');
  await installHarness(page2);
  const water2 = await findWater(page2);
  if (water2.runs.length) {
    const [w0, w1] = water2.runs[0];
    await scene(page2, 'ocean-wamp2', async () => {
      await teleport(page2, (w1 + 6) * 16, water2.gl * 16 - 48);
      await pump(page2, 30, { clearEnemies: true });
    });
    const flagRead = await page2.evaluate(() => ({ ampCache: window.__ww ? true : false }));
    L.chk('[wamp=2] harness 波纹单例在位', flagRead.ampCache, JSON.stringify(flagRead));
  } else L.say('ocean-wamp2 skipped: 无地表水体');

  // URL 读取面(★转正语义:缺省页=开;?swperf=1=开无操作;?swperf=0=豁免口关)
  const page3 = await openPage(browser, { errors: L.fails });
  const bootDefault = await bootstrap(page3, process.env.SW_ORIGIN);
  L.chk('bootstrap(读取面页)', bootDefault.ok, bootDefault.why ?? '');
  await page3.waitForFunction(() => (window).__swPerfFlags !== undefined, { timeout: 30_000 }).catch(() => { });
  const readDefault = await page3.evaluate(() => ({ get: (window).__swPerfFlags?.get() ?? null, search: location.search }));
  L.chk('缺省页 boot 读取面=get()===true(★转正缺省开)', readDefault.get === true, JSON.stringify(readDefault));
  const u0p = new URL(process.env.SW_ORIGIN);
  u0p.searchParams.set('swperf', '0');
  await page3.evaluate((href) => { location.href = href; }, u0p.toString());
  await new Promise((r) => setTimeout(r, 1500));
  await page3.waitForFunction(() => (window).__swPerfFlags !== undefined, { timeout: 30_000 }).catch(() => { });
  const readOff = await page3.evaluate(() => ({ get: (window).__swPerfFlags?.get() ?? null, search: location.search }));
  L.chk('?swperf=0 豁免口读取面=get()===false', readOff.get === false && readOff.search.includes('swperf=0'), JSON.stringify(readOff));
  const u1p = new URL(process.env.SW_ORIGIN);
  u1p.searchParams.set('swperf', '1');
  await page3.evaluate((href) => { location.href = href; }, u1p.toString());
  await new Promise((r) => setTimeout(r, 1500));
  await page3.waitForFunction(() => (window).__swPerfFlags !== undefined, { timeout: 30_000 }).catch(() => { });
  const readOn = await page3.evaluate(() => ({ get: (window).__swPerfFlags?.get() ?? null, search: location.search }));
  L.chk('?swperf=1 读取面=get()===true(合法无操作)', readOn.get === true, JSON.stringify(readOn));
  await page3.close().catch(() => { });

  L.say('ab-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
