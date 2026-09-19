// ★perf-textbake 2026-09-19 A/B 对拍探针(染色结果缓存 vs 逃生门旧路径)。
// 同一构建,A/B 由 URL 切:?textbakecache=0 = 修前(旧共享 scratch 逐帧重染),缺省 = 修后。
// 产出:
//  ① 台架计时:12+ 行 infoCtx fixture,infoAccs.draw ×900 μs/call 统计(before vs after);
//  ② 活体 rAF:240 帧帧距统计(信息栏实装);
//  ③ 像素金标:同 fixture 同渐变底,两阶段台架画布 toDataURL 逐字节相等(变异复核
//     =若相等断言红,则缓存路径产物与旧两 blit 不同形——不落刀判据);
//  ④ 缓存稳态:tintCount 120 帧零增长(修后每帧零重染);修前 tintCount≡0;
//  ⑤ 截图 /tmp/perf1-textbake.png(修后)/ /tmp/perf1-textbake-before.png(修前)。
// DPR 环境变量:1(pixel 档)/2(hidpi 档,Mac Retina 域)各跑一轮。
import puppeteer from 'puppeteer-core';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5274';
const DPR = Number(process.env.DPR ?? 1);
const MODES = (process.env.MODES ?? 'before,after').split(',');
const GOLDEN_PATH = process.env.GOLDEN_PATH ?? `/tmp/ptc-golden-dpr${DPR}.json`;

const boot = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
  await new Promise((r) => setTimeout(r, 800));
  await page.click('[data-act=sp]');
  await page.waitForSelector('.sw-vsel', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 600));
  if (!(await page.$('.sw-vsel .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
    await page.keyboard.type('PTC探针');
    await new Promise((r) => setTimeout(r, 200));
    await page.click('[data-act=create]');
    await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
  }
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 600));
  if (!(await page.$('.sw-vsel .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
    await page.click('[data-f=seed]');
    await page.keyboard.type('12345');
    await new Promise((r) => setTimeout(r, 300));
    await page.click('[data-act=create]');
  }
  await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 600000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => {
    const g = window.__swGame;
    try { g.closeNpcDialog?.(true); } catch { /* 无对话 */ }
    g.renderer.playerInventory = false;
    g.renderer.mapStyle = 0;
  });
  await new Promise((r) => setTimeout(r, 600));
};

// 信息行源:12 件信息饰品 vid(InfoAccs.ts:41-69 映射表)
const INFO_VIDS = [17, 393, 18, 3096, 3120, 3037, 3084, 3095, 3118, 3099, 3102, 3119];

const grantInfoAccs = (page) => page.evaluate((vids) => {
  const g = window.__swGame;
  const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
  const it = window.__swItems ?? {};
  vids.forEach((vid, i) => {
    const k = vk[vid];
    if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 };
  });
}, INFO_VIDS);

// 台架:12+ 行 fixture + 渐变对抗底(非纯白,B 项参与混色)
const benchScript = () => {
  const g = window.__swGame;
  const W = 460, H = 900;
  const infoCtx = {
    gates: { accWatch: 3, accDepthMeter: 3, accCompass: 3, accFishFinder: true, accWeatherRadio: true,
      accCalendar: true, accThirdEye: true, accJarOfSouls: true, accCritterGuide: true, accStopwatch: true,
      accOreFinder: true, accDreamCatcher: true },
    mainTime: 27000, dayTime: true,
    weather: { storming: true, maxRaining: 1, cloudBGActive: 0, numClouds: 0, windSpeedCurrent: 2, sandstorm: false, globalTimeSec: 0 },
    moonPhase: 0, bloodMoon: false, eclipse: false,
    fishingText: '钓鱼信息:海洋捕获 Long Fisher 123 号——附近没有特殊鱼类在活动(215px 钳制用超长中文混排 EN 文本)',
    oreText: null, rareText: '稀有生物:雪原狼 Green 88', rareVid: null,
    enemyCount: 3, killText: null, dps: 1234, mph: 42,
    centerX: 2100, bottomY: 331 * 16, worldSurface: 331, rockLevel: 427, maxTilesX: 4200, maxTilesY: 1200,
  };
  const mkBench = () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#808080'); gr.addColorStop(1, '#102040');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    return cv;
  };
  // 暖机(含烘焙/染色缓存预热)
  const warm = mkBench(); const wc = warm.getContext('2d');
  for (let i = 0; i < 30; i++) g.renderer.infoAccs.draw(wc, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
  // 计时 3 轮 ×300(计时轮单独画布,排除金标画布状态干扰)
  const samples = [];
  const tcv = mkBench(); const tc = tcv.getContext('2d');
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 300; i++) {
      const t0 = performance.now();
      g.renderer.infoAccs.draw(tc, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
      samples.push(performance.now() - t0);
    }
  }
  samples.sort((a, b) => a - b);
  const q = (p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
  // 金标画布(hoveredRow=1 → 第二行 0.34 压暗参与金标)
  const gold = mkBench(); const gc = gold.getContext('2d');
  g.renderer.infoAccs.draw(gc, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
  const rows = g.renderer.infoAccs.state.rows;
  const colorCount = { gold: 0, grayed: 0, normal: 0, clamped: 0 };
  gc.font = '14px "Fusion Pixel 12px", monospace';
  for (const r of rows) {
    if (r.gold) colorCount.gold++; else if (r.grayed) colorCount.grayed++; else colorCount.normal++;
    if (gc.measureText(r.text).width > 215) colorCount.clamped++;
  }
  return {
    rows: rows.length, rowTexts: rows.map((r) => r.text), colorCount,
    usMean: samples.reduce((a, b) => a + b, 0) / samples.length * 1000,
    usP50: q(0.5) * 1000, usP95: q(0.95) * 1000,
    goldUrl: gold.toDataURL('image/png'),
  };
};

const rafStats = (page) => page.evaluate(() => new Promise((res) => {
  const deltas = [];
  let last = performance.now(), n = 0;
  const tick = (t) => {
    deltas.push(t - last); last = t;
    if (++n >= 240) {
      const s = [...deltas].sort((a, b) => a - b);
      res({
        mean: deltas.reduce((a, b) => a + b, 0) / deltas.length,
        p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1],
      });
    } else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

const statsNow = (page) => page.evaluate(async () => {
  const m = await import('/src/vui/draw/MouseTextBake.ts');
  return m.bakeStats();
});

const waitFrames = (page, n) => page.evaluate((k) => new Promise((res) => {
  let c = 0;
  const tick = () => { if (++c >= k) res(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), n);

let pass = 0, fail = 0;
const check = (name, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const results = {};
for (const mode of MODES) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: DPR },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = mode === 'before' ? ORIGIN + '/?dev=1&textbakecache=0' : ORIGIN + '/?dev=1';
  await boot(page, url);
  await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 600000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1500));
  const frz = await freezeClock(page, { tod: 0.5 });
  check(`[${mode}/dpr${DPR}] 时钟冻结`, frz.ok === true, JSON.stringify(frz));
  await grantInfoAccs(page);
  await new Promise((r) => setTimeout(r, 1200));
  const liveRows = await page.evaluate(() => window.__swGame.renderer.infoAccs.state.rows.length);
  check(`[${mode}/dpr${DPR}] 活体信息行 ≥8`, liveRows >= 8, `rows=${liveRows}`);
  const bench = await page.evaluate(benchScript);
  check(`[${mode}/dpr${DPR}] 台架 12+ 行`, bench.rows >= 12, `rows=${bench.rows} 色域=${JSON.stringify(bench.colorCount)}`);
  check(`[${mode}/dpr${DPR}] 钳制行(sX<1)在域`, bench.colorCount.clamped >= 1, `clamped=${bench.colorCount.clamped}`);
  const raf = await rafStats(page);
  const s0 = await statsNow(page);
  await waitFrames(page, 120);
  const s1 = await statsNow(page);
  check(`[${mode}/dpr${DPR}] bakeStats 模块实例同源(命中 app 缓存)`, s1.count > 0 || s1.tintCount > 0, JSON.stringify(s1));
  if (mode === 'before') {
    check(`[before/dpr${DPR}] 缓存旁路(tintCount≡0)`, s1.tintCount === 0, `tint=${s1.tintCount} gate=${s1.tintCacheOn}`);
  } else {
    // 稳态判据:120 帧实况(实况文本自然演化会新增键)后,固定 fixture 键仍全命中
    // ——单帧重画零新增条目(=零重染;实况键增长本身=内容寻址语义,LRU 有界)
    const tintDelta = await page.evaluate(() => (async () => {
      const m = await import('/src/vui/draw/MouseTextBake.ts');
      const g = window.__swGame;
      const W = 460, H = 900;
      const infoCtx = {
        gates: { accWatch: 3, accDepthMeter: 3, accCompass: 3, accFishFinder: true, accWeatherRadio: true,
          accCalendar: true, accThirdEye: true, accJarOfSouls: true, accCritterGuide: true, accStopwatch: true,
          accOreFinder: true, accDreamCatcher: true },
        mainTime: 27000, dayTime: true,
        weather: { storming: true, maxRaining: 1, cloudBGActive: 0, numClouds: 0, windSpeedCurrent: 2, sandstorm: false, globalTimeSec: 0 },
        moonPhase: 0, bloodMoon: false, eclipse: false,
        fishingText: '钓鱼信息:海洋捕获 Long Fisher 123 号——附近没有特殊鱼类在活动(215px 钳制用超长中文混排 EN 文本)',
        oreText: null, rareText: '稀有生物:雪原狼 Green 88', rareVid: null,
        enemyCount: 3, killText: null, dps: 1234, mph: 42,
        centerX: 2100, bottomY: 331 * 16, worldSurface: 331, rockLevel: 427, maxTilesX: 4200, maxTilesY: 1200,
      };
      const before = m.bakeStats().tintCount;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      g.renderer.infoAccs.draw(cv.getContext('2d'), W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
      return m.bakeStats().tintCount - before;
    })());
    check(`[after/dpr${DPR}] 稳态零重染(120 帧实况后固定键单帧零新增)`, tintDelta === 0, `delta=${tintDelta}`);
    check(`[after/dpr${DPR}] 逃生门关(新路径默认开)`, s1.tintCacheOn === true);
    check(`[after/dpr${DPR}] tint 条目 ≤256 上界`, s1.tintCount <= 256, `tint=${s1.tintCount}`);
  }
  const shot = mode === 'before' ? '/tmp/perf1-textbake-before.png' : '/tmp/perf1-textbake.png';
  await page.screenshot({ path: shot });
  results[`${mode}@dpr${DPR}`] = { bench: { ...bench, goldUrl: undefined }, raf, s1, goldUrl: bench.goldUrl, errors: errors.slice(0, 5), shot };
  console.log(`[${mode}/dpr${DPR}] 台架 μs/call mean=${bench.usMean.toFixed(1)} p50=${bench.usP50.toFixed(1)} p95=${bench.usP95.toFixed(1)}`);
  console.log(`[${mode}/dpr${DPR}] rAF ms mean=${raf.mean.toFixed(2)} p50=${raf.p50.toFixed(2)} p95=${raf.p95.toFixed(2)} max=${raf.max.toFixed(2)}`);
  await browser.close();
}
// 像素金标:before vs after 台架画布逐字节相等(同 DPR 域内)
if (MODES.length === 2) {
  const a = results[`before@dpr${DPR}`], b = results[`after@dpr${DPR}`];
  check(`dpr${DPR} 像素金标:修前两 blit ≡ 修后缓存单源(逐字节)`, a.goldUrl === b.goldUrl,
    `len ${a.goldUrl.length} vs ${b.goldUrl.length}`);
}
await (await import('node:fs/promises')).writeFile(GOLDEN_PATH, JSON.stringify({
  dpr: DPR, modes: MODES,
  gold: Object.fromEntries(MODES.map((m) => [m, results[`${m}@dpr${DPR}`]?.goldUrl?.slice(0, 64) ?? null])),
  bench: Object.fromEntries(MODES.map((m) => [m, results[`${m}@dpr${DPR}`]?.bench ?? null])),
  raf: Object.fromEntries(MODES.map((m) => [m, results[`${m}@dpr${DPR}`]?.raf ?? null])),
}, null, 1));
console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
