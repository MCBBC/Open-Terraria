// ★BJ78 W1/W2/W4 分配面普查(实机直接物证;?swperf flag 关/开交替各 120 帧)
// 仪具:页内换全局构造器(URLSearchParams/Set)为计数子类——游戏模块在调用点解析
// 全局,替换后所有 new 落进计数器(值语义不变,仅计数)。读数取【同窗 off-on 差值】
// (页内还有域外每帧分配源:drawChunkGrid×2/drawAnimatedTileLayer×1/
// drawDummyTileAnim×1 各 1 次 URLSearchParams——登记不落刀,两臂对称抵消)。
// 场景(定谳 2026-09-14:VanillaLiquidRenderer.ts:639 waveOn = q>0 && !warpMode——
//   GL 全屏扭曲激活时逐格 bob 按设计关闭,sampleDisplace 只在 warp 关闭/不可用时
//   逐格触发=低配 CPU 渲染人群,正是本 flag 灰度对象):
//   A 默认页(GL warp 激活):W2 uploadWave 1/帧 + W4 Set 2/帧 的 off-on 差。
//   B ?wwarp=0 页(bob 路径激活):W1 sampleDisplace ≈表层水格数/帧 的 off-on 差。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=420000 scripts/_bj78-wave-census.mjs
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger, front, waitForBridge } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const FRAMES = 120;

/** 在页上安装计数仪具 */
async function installCounter(page) {
  const ok = await page.evaluate(() => {
    window.__alloc = { usp: 0, set: 0 };
    const RealUSP = URLSearchParams;
    window.URLSearchParams = class extends RealUSP {
      constructor(...a) { super(...a); window.__alloc.usp++; }
    };
    const RealSet = Set;
    window.Set = class extends RealSet {
      constructor(...a) { super(...a); window.__alloc.set++; }
    };
    return { ok: true };
  });
  return ok.ok;
}

/** 计一轮:3 采样窗中位(轮询 animTick 定界);W4 走调用窗内精确计数 */
async function countArms(page, flag) {
  await page.evaluate((v) => window.__swPerfFlags.set(v), flag);
  const samples = [];
  for (let s = 0; s < 3; s++) {
    const r = await page.evaluate((n) => new Promise((res) => {
      const g = window.__swGame;
      const t0 = g.renderer.animTick;
      window.__alloc.usp = 0; window.__alloc.set = 0;
      window.__w4 = { sets: 0, calls: 0 };
      const iv = setInterval(() => {
        if (g.renderer.animTick - t0 >= n) {
          clearInterval(iv);
          res({
            usp: window.__alloc.usp, set: window.__alloc.set, frames: g.renderer.animTick - t0,
            w4sets: window.__w4.sets, w4calls: window.__w4.calls,
          });
        }
      }, 25);
    }), FRAMES);
    samples.push(r);
  }
  return samples;
}

/** W4 精确仪具:包 updateWaterWaves 原型方法,调用窗内读 Set 计数(背景归零) */
async function installW4Probe(page) {
  return page.evaluate(async () => {
    const R = (await import('/src/render/Renderer.ts')).Renderer;
    if (window.__w4Installed) return { ok: true, note: 'already' };
    window.__w4Installed = true;
    window.__w4 = { sets: 0, calls: 0 };
    const proto = R.prototype;
    const oUW = proto.updateWaterWaves;
    proto.updateWaterWaves = function (...a) {
      const before = window.__alloc.set;
      window.__alloc.set = 0;
      try { return oUW.apply(this, a); }
      finally {
        window.__w4.sets += window.__alloc.set;
        window.__w4.calls++;
        window.__alloc.set = before;
      }
    };
    return { ok: true };
  });
}

/** 一个场景的完整对拍(焐热缓存 → off → on),返回 {offU,onU,offS,onS} */
async function census(page, water, label) {
  await page.evaluate(async (q) => { const m = await import('/src/core/Options.ts'); m.options.data.waveQuality = q; }, 3);
  const [w0, w1] = water.runs[0];
  await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);   // 干沙位:水在视口内
  await pump(page, 60, { clearEnemies: true });
  await front(page);
  await page.evaluate(async () => {
    const m = await import('/src/core/Options.ts');
    m.options.data.swayInWind = false;
    const w = window.__swGame.world.weather;
    if (w) { try { w.maxRaining = 0; w.raining = false; w.windSpeedCurrent = 0; } catch { /* 域缺字段 */ } }
  });
  // 先 ON 跑 60 帧把 waveAmpParam 缓存焐热(首调用构造 1 次,不入正式窗)
  await installW4Probe(page);
  await page.evaluate((v) => window.__swPerfFlags.set(v), true);
  await page.evaluate((n) => new Promise((res) => {
    const g = window.__swGame;
    const t0 = g.renderer.animTick;
    const iv = setInterval(() => { if (g.renderer.animTick - t0 >= n) { clearInterval(iv); res(); } }, 25);
  }), 60);
  const off = await countArms(page, false);
  const on = await countArms(page, true);
  await page.evaluate((v) => window.__swPerfFlags.set(v), false);
  const med = (xs, k) => xs.map((s) => s[k]).sort((a, b) => a - b)[1];
  const offU = med(off, 'usp') / FRAMES, onU = med(on, 'usp') / FRAMES;
  const offS = med(off, 'set') / FRAMES, onS = med(on, 'set') / FRAMES;
  // W4:调用窗内精确读数(每次 updateWaterWaves 的 Set 构造数,零背景)
  const w4per = (xs) => xs.map((s) => s.w4calls ? s.w4sets / s.w4calls : -1);
  const offW4 = w4per(off)[1], onW4 = w4per(on)[1];
  L.say(`[${label}] URLSearchParams/帧: off=${offU.toFixed(1)} on=${onU.toFixed(1)} delta=${(offU - onU).toFixed(1)}  (off ${JSON.stringify(off)})`);
  L.say(`[${label}] Set/帧(全域背景): off=${offS.toFixed(2)} on=${onS.toFixed(2)}`);
  L.say(`[${label}] W4 Set/updateWaterWaves 调用窗: off=${offW4?.toFixed(2)} on=${onW4?.toFixed(2)}`);
  return { offU, onU, offS, onS, offW4, onW4 };
}

try {
  // ================= 场景 B:?wwarp=0(bob 路径=W1 主场) =================
  // ★历史坑(已修,SW-BJ95 2026-09-16:bootstrap 现透传入口查询串)——旧版裸 origin 洗参,
  //   再带参二次导航重等桥(参数真在位由页内 location.search 断言)。
  const page0 = await openPage(browser, { errors: L.fails });
  const boot0 = await bootstrap(page0, process.env.SW_ORIGIN);
  L.chk('bootstrap(wwarp=0)', boot0.ok, boot0.why ?? '');
  const u0 = new URL(process.env.SW_ORIGIN);
  u0.searchParams.set('wwarp', '0');
  await page0.evaluate((href) => { location.href = href; }, u0.toString());
  await new Promise((r) => setTimeout(r, 1500));
  const bridge0 = await waitForBridge(page0, { timeout: 120_000 });
  L.chk('带参重导航桥(wwarp=0)', bridge0, '');
  const param0 = await page0.evaluate(() => location.search.includes('wwarp=0'));
  L.chk('?wwarp=0 参数在位', param0, '');
  const gen0 = await createGame(page0, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame(wwarp=0)', gen0.ok, gen0.why ?? '');
  const water0 = await page0.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const runs = []; let rs = -1, rl = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let c = 0;
      for (let y = Math.max(0, gl - 30); y <= gl + 12; y++) if (st.liquid[y * st.w + x] > 0) c++;
      if (c >= 8) { if (rs < 0) rs = x; rl++; } else if (rs >= 0) { if (rl >= 10) runs.push([rs, rs + rl - 1]); rs = -1; rl = 0; }
    }
    if (rs >= 0 && rl >= 10) runs.push([rs, rs + rl - 1]);
    return { runs, gl };
  });
  L.chk('找水(wwarp=0)', water0.runs.length > 0, JSON.stringify(water0.runs.slice(0, 2)));
  L.chk('计数仪具(wwarp=0)', await installCounter(page0), '');
  const b = await census(page0, water0, 'wwarp0-bob');
  L.chk('W1 sampleDisplace: off 每帧 >30(表层水格×bob 路径)', b.offU > 30, `offU=${b.offU}`);
  L.chk('W1 sampleDisplace: on 每帧差值 >25(缓存热后 bob 路径零构造)', b.offU - b.onU > 25, `delta=${(b.offU - b.onU).toFixed(1)}`);
  L.chk('W4 Set/updateWaterWaves 调用窗: off≥1.9 → on=0(每帧 2 常量表精确消除)', b.offW4 >= 1.9 && b.onW4 === 0, `off=${b.offW4} on=${b.onW4}`);

  // ================= 场景 A:默认页(GL warp 激活=W2 主场) =================
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap(gl)', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame(gl)', gen.ok, gen.why ?? '');
  const water = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const runs = []; let rs = -1, rl = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let c = 0;
      for (let y = Math.max(0, gl - 30); y <= gl + 12; y++) if (st.liquid[y * st.w + x] > 0) c++;
      if (c >= 8) { if (rs < 0) rs = x; rl++; } else if (rs >= 0) { if (rl >= 10) runs.push([rs, rs + rl - 1]); rs = -1; rl = 0; }
    }
    if (rs >= 0 && rl >= 10) runs.push([rs, rs + rl - 1]);
    return { runs, gl };
  });
  L.chk('找水(gl)', water.runs.length > 0, JSON.stringify(water.runs.slice(0, 2)));
  L.chk('计数仪具(gl)', await installCounter(page), '');
  const a = await census(page, water, 'gl-warp');
  L.chk('W2 uploadWave: off-on 差 ≥0.8(每帧 1 次解析被消除)', a.offU - a.onU >= 0.8, `delta=${(a.offU - a.onU).toFixed(2)}`);
  // W4 调用窗内精确读数(背景已归零,两场皆可断言)
  L.chk('W4 Set/updateWaterWaves 调用窗: off≥1.9 → on=0(GL 场同断言)', a.offW4 >= 1.9 && a.onW4 === 0, `off=${a.offW4} on=${a.onW4}`);

  L.say('census-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

