// ★BJ77 零语义优化层像素对拍(?swperf=1 A/B;逐位一致性权威证据)
//
// 方法论(同 scripts/_lightfast-opaque-ab.mjs 惯例):
//   同一会话停环(g.running=false)→ 冻结 performance.now/Date.now → 手动单帧
//   g.render()(animTick 钉住)→ 翻转 window.__swPerfFlags → 再渲染 →
//   主画布 RGBA 逐字节对比(md5+diff 计数,Node 侧)。
//   warmup 一帧吸收首帧 0.25s 波步离群(dt 大值),此后各帧 dt=0 波步序列一致。
// 断言(每场景):
//   ① 确定性自检:同 flag 连续两帧 diff==0(夹具自证,防"对拍红=场景噪声"误判)
//   ② flag on 与 off 逐字节一致(md5 相等 + 逐像素 diff==0)
//   ③ 翻回 off 恢复输出(快路径无隐藏状态污染)
//   ④ URL 读取面:?swperf=1 页 __swPerfFlags.get()===true(报告"读取面"证据)
// 场景:地表静立 / 海洋水边( liquids+波场+全屏扭曲全链) / 洞穴(暗光非全亮)。
// 运行:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs scripts/_bj77-pixel-ab.mjs
import { createHash } from 'node:crypto';
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  // ---- 找水(地表列扫描) ----
  const water = await page.evaluate(() => {
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

  // ---- 页内 harness:冻结 + 快照 + 手动单帧 + flag 翻面 ----
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__T0 = 8_640_000_000;
    performance.now = () => window.__T0;
    Date.now = () => window.__T0;
    // ★确定性加固:钉 Math.random(mulberry32;渲染路径确有 RNG 消费面)+
    //   清 critters/props + 停天气(天气生成面 = WeatherRenderer Math.random)
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
    window.__R = (tick) => {           // 手动单帧:钉 animTick → render
      s = 0xb177 >>> 0;                // 每帧重置 RNG 种子(帧内消费序恒定 → 帧间独立)
      // ★tileAnim.tick 钉帧:advanceAnim 每 render +1 → 动画植物(592 族)逐帧换帧
      //   = 跨帧对拍必漂。render 内自增确定性(+1)→ 钉同值即帧恒定。
      if (window.__ta) window.__ta.tick = 4242;
      // ★波场状态回卷:wave 网格每 render 步进一次(steps=1 恒定,dt=0 也步)——
      //   不回卷则逐帧漂移扭曲位移 → 任何跨帧对拍都必漂。回卷后每次 render 从
      //   同一状态步进同一次 = 演化序列一致。
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
    // 植物摇摆关(WindSway 全链 getWindCycle 门 → 草/树/藤摇动是逐帧相位动画)
    import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; });
    // ★天空 dt 冻结:sky.draw 由 Renderer 传硬编码 dtMs=16.7(Renderer.ts:3416)
    //   → 云漂移/灯笼/塔天空等 dt 积分器每 render 必进 = 跨帧对拍必漂。
    //   实例壳改传 dtMs=0(frames=0 → 一切 ×0 不积分;云态=定格,确定性成立)。
    {
      const sky = g.renderer.sky;
      const proto = Object.getPrototypeOf(sky);
      const origDraw = proto.draw;
      sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
        return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
      };
    }
    // 波场快照(waterWaves 单例私有态直取——探针取证面)
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
    // 持有物清空(动画帧 itemAnim 以 animTick 为相位——钉帧翻转面)
    try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
    window.__flag = (v) => window.__swPerfFlags.set(v);
    window.__flagGet = () => window.__swPerfFlags.get();
    // 光照图通道捕获(compositeLight 的直接产物;输入=冻结光照数组+窗口,零环境 RNG)
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

  // ---- 场景驱动 + 对拍矩阵 ----
  const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
  const diffCount = async (a, b) => page.evaluate(({ x, y }) => {
    const dec = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
    const A = dec(x), B = dec(y);
    let n = 0, first = -1;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    const W = (window.__swGame.renderer.canvas.width) || 1;
    for (let i = 0; i < Math.min(A.length, B.length); i += 4) {
      if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2] || A[i + 3] !== B[i + 3]) {
        n++;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (first < 0) first = i;
      }
    }
    return { n, first, len: A.length === B.length, bbox: [minX, minY, maxX, maxY] };
  }, { x: a, y: b });

  const scene = async (name, setup, { waveQ = null } = {}) => {
    await front(page);
    if (setup) await setup();
    await pump(page, 120, { clearEnemies: true });   // 光照收敛+物理稳定(冻结前)
    if (waveQ !== null) {
      await page.evaluate(async (q) => { const m = await import('/src/core/Options.ts'); m.options.data.waveQuality = q; }, waveQ);
      await pump(page, 30, { clearEnemies: true });
    }
    await page.evaluate(() => {
      window.__flag(false);
      window.__warm = window.__swGame.renderer.animTick + 9;
      // 泵会刷新 critters/props(沙滩蟹等)——冻结前再清一次(活体有 render 侧帧计数器)
      for (const k of ['critters', 'props', 'enemies', 'drops', 'projectiles']) {
        const b = window.__swGame.entities?.[k];
        if (Array.isArray(b)) b.length = 0;
      }
    });
    await page.evaluate(() => { window.__R(window.__warm); });   // warmup(吸收 dt 离群)
    // 小地图揭示饱和:揭示随渲染推进,先跑 240 帧到收敛(前缘清零后再对拍)
    for (let i = 0; i < 240; i++) await page.evaluate(() => { window.__R(++window.__warm); });
    await sleep(30);
    const A1 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
    const A2 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
    await page.evaluate(() => { window.__flag(true); });
    const B1 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
    const B2 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });
    await page.evaluate(() => { window.__flag(false); });
    const C1 = await page.evaluate(() => { window.__R(++window.__warm); return [window.__snapB64(), window.__snapLightB64()]; });

    // ---- 光照图通道(旗标直接产物;全场景必须逐位一致) ----
    const [lA1, lA2, lB1, lB2, lC1] = [A1[1], A2[1], B1[1], B2[1], C1[1]];
    const dl = await diffCount(lA1, lA2);
    L.chk(`[${name}] 光照图自检(lA1==lA2)`, dl.n === 0, `diff=${dl.n}`);
    const mL1 = md5(lA1), mLB1 = md5(lB1);
    const dlb = await diffCount(lA1, lB1);
    L.chk(`[${name}] 光照图 flag ON 逐位一致(lB1==lA1)`, mL1 === mLB1 && dlb.n === 0, `md5 ${mL1.slice(0, 8)} vs ${mLB1.slice(0, 8)} diff=${dlb.n}`);
    const dlb2 = await diffCount(lA2, lB2);
    L.chk(`[${name}] 光照图 flag ON 连续帧一致(lB2==lA2)`, md5(lA2) === md5(lB2) && dlb2.n === 0, `diff=${dlb2.n}`);
    const dlc = await diffCount(lA1, lC1);
    L.chk(`[${name}] 光照图翻回恢复(lC1==lA1)`, mL1 === md5(lC1) && dlc.n === 0, `diff=${dlc.n}`);

    // ---- 全帧通道(环境噪声可归零的场景必须逐位一致) ----
    const dSelf = await diffCount(A1[0], A2[0]);
    L.chk(`[${name}] 全帧确定性自检(A1==A2)`, dSelf.n === 0 && dSelf.len, `diff=${dSelf.n} lenEq=${dSelf.len} bbox=${JSON.stringify(dSelf.bbox)}`);
    const dB1 = await diffCount(A1[0], B1[0]);
    L.chk(`[${name}] 全帧 flag ON 逐位一致(B1==A1)`, md5(A1[0]) === md5(B1[0]) && dB1.n === 0, `diff=${dB1.n} bbox=${JSON.stringify(dB1.bbox)}`);
    const dB2 = await diffCount(A2[0], B2[0]);
    L.chk(`[${name}] 全帧 flag ON 连续帧一致(B2==A2)`, md5(A2[0]) === md5(B2[0]) && dB2.n === 0, `diff=${dB2.n}`);
    const dC1 = await diffCount(A1[0], C1[0]);
    L.chk(`[${name}] 全帧翻回恢复(C1==A1)`, md5(A1[0]) === md5(C1[0]) && dC1.n === 0, `diff=${dC1.n}`);
  };

  // ① 地表静立(远离出生镇——镇 NPC 有 render 侧状态化帧计数器,跨帧会换帧)
  await scene('surface', async () => {
    const s = await page.evaluate(() => {
      const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
      // 找出生点右侧 60 tile 外一块普通草地
      const x = Math.min(st.w - 40, Math.floor(g.player.cx / 16) + 60);
      return { wx: x * 16, wy: (gl - 4) * 16 };
    });
    await teleport(page, s.wx, s.wy);
    await pump(page, 30, { clearEnemies: true });
  });

  // ② 海洋水边(liquid+wave+warp 全链)
  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await scene('ocean', async () => {
      await teleport(page, ((w0 + w1) / 2) * 16, water.gl * 16 - 48);
    });
  } else L.say('ocean skipped: 无地表水体');

  // ③ 洞穴(暗光非全亮;rock 层下)
  await scene('cave', async () => {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__caveY = (Math.floor(g.world.rockLevel) + 30) * 16;
    });
    const cy = await page.evaluate(() => window.__caveY);
    const px = await page.evaluate(() => window.__swGame.player.cx);
    await teleport(page, px, cy);
  });

  // ④ 海滩 @ 波场 0 档(波模拟/全屏扭曲停机;液体渲染+光照合成全链保留,
  //    波场演化这一环境噪声源被移除。玩家站【干沙】不下水——游泳态有
  //    render 侧动画计数器,跨帧换帧)
  if (water.runs.length) {
    const [w0, w1] = water.runs[0];
    await scene('ocean-wave0', async () => {
      await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);
      await pump(page, 30, { clearEnemies: true });
    }, { waveQ: 0 });
    await page.evaluate(async () => { const m = await import('/src/core/Options.ts'); m.options.data.waveQuality = 3; });
  }

  // ④ URL 读取面:查询参数解析路径(独立轻页)
  const urlFlag = await page.evaluate(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('swperf', '1');
    return u.toString();
  });
  const page2 = await openPage(browser, { errors: L.fails });
  await page2.goto(urlFlag, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => { });
  await page2.waitForFunction(() => (window).__swPerfFlags !== undefined, { timeout: 30_000 }).catch(() => { });
  const urlRead = await page2.evaluate(() => ({ get: (window).__swPerfFlags?.get() ?? null })).catch(() => ({ get: 'eval-fail' }));
  L.chk('URL ?swperf=1 读取面', urlRead.get === true, JSON.stringify(urlRead));
  await page2.close().catch(() => { });

  L.say('ab-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
