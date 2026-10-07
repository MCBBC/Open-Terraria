// ★RAF-GPUCRASH 复现实验:验证「Chrome GPU 进程重启→vsync 对齐丢失→rAF 流超速双峰」假说。
// 只动本探针自己的 Chrome 实例,不碰用户日常 Chrome。
// 流程:进世界→基线采样 30s→chrome://gpucrash 崩 GPU 进程→等重启 15s→再采样 45s→对比形态。
import puppeteer from 'puppeteer-core';

const EXEC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4173';
const OUT_DIR = '/tmp/rafb-results';

const RECORDER = `(() => {
  const rec = { t: [], ts: [], n: 0, hidden: [] };
  window.__rafRec = rec;
  let last = null, lastTs = null;
  const tick = (t) => {
    const now = performance.now();
    if (last !== null) { rec.t.push(now - last); rec.ts.push(t - lastTs); }
    rec.n++;
    last = now; lastTs = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', () => rec.hidden.push([Math.round(performance.now()), document.visibilityState === 'hidden' ? 1 : 0]));
})();`;

function statsFrom(arr) {
  if (!arr.length) return { n: 0 };
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => +a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))].toFixed(2);
  const band = (lo, hi) => arr.filter((v) => v >= lo && v < hi).length;
  const bins = {};
  for (const v of arr) { const b = Math.min(26, Math.floor(v)); bins[b] = (bins[b] ?? 0) + 1; }
  const top = Object.entries(bins).map(([b, c]) => [+b, c]).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const total = a.reduce((s, v) => s + v, 0);
  return {
    n: arr.length,
    ratePerSec: +(arr.length / (total / 1000)).toFixed(1),
    p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95),
    frac4_7: +(band(4, 7) / arr.length).toFixed(4),
    frac8_10: +(band(8, 10) / arr.length).toFixed(4),
    fracLt1: +(arr.filter((v) => v < 1).length / arr.length).toFixed(4),
    topBins: top,
  };
}

async function sample(page, ms) {
  await page.evaluate(() => {
    const r = window.__rafRec;
    r.t.length = 0; r.ts.length = 0; r.hidden.length = 0;
  });
  await new Promise((r) => setTimeout(r, ms));
  return await page.evaluate(() => {
    const r = window.__rafRec;
    return { t: r.t.map((v) => +v.toFixed(3)), ts: r.ts.map((v) => +v.toFixed(3)), hidden: r.hidden.length, vis: document.visibilityState };
  });
}

// SW 首次注册的 controllerchange 会在页面加载后短时间内 reload——waitForFunction 撕页报
// "Waiting failed",统一带重试的进入流程。
async function enterWorld(browser, url, tag, worldSize = [4200, 1200]) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(RECORDER);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await new Promise((r) => setTimeout(r, 3000));
      await page.waitForFunction(() => !!document.querySelector('.sw-title-version'), { timeout: 180_000, polling: 500 });
      await new Promise((r) => setTimeout(r, 2000));
      await page.evaluate((sz) => { void window.__swFlow.newWorld('', sz[0], sz[1]); }, worldSize);
      await page.waitForFunction(() => !!(window.__swGame?.player && window.__swGame?.world), { timeout: 180_000, polling: 500 });
      await new Promise((r) => setTimeout(r, 2500));
      console.log(`${tag} world entered (attempt ${attempt})`);
      return page;
    } catch (e) {
      console.log(`${tag} entry attempt ${attempt} failed:`, String(e).slice(0, 140));
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return page;
}

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: false,
  defaultViewport: null,
  protocolTimeout: 600_000,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,900', '--window-position=60,60'],
});
console.log('UA:', await browser.userAgent());
try {
  const page = await enterWorld(browser, `${ORIGIN}/`, 'base');
  console.log('world entered');

  const base = await sample(page, 30_000);
  console.log('BASELINE:', JSON.stringify(statsFrom(base.t)));
  console.log('BASELINE_ts:', JSON.stringify(statsFrom(base.ts)));

  // 崩 GPU 进程(chrome://gpucrash)
  let crashed = false;
  try {
    await page.goto('chrome://gpucrash', { timeout: 15_000, waitUntil: 'commit' }).catch(() => {});
    crashed = true;
  } catch (e) {
    console.log('gpucrash navigate failed:', String(e).slice(0, 120));
  }
  console.log('GPU crash triggered:', crashed);
  await new Promise((r) => setTimeout(r, 15_000)); // GPU 进程自动重启+上下文恢复

  // gpucrash 导航撕掉了原页面 → 回游戏页重新进入(记录器随 evaluateOnNewDocument 重挂)
  let post;
  try {
    await page.close().catch(() => {});
    const page2 = await enterWorld(browser, `${ORIGIN}/`, 'post');
    post = await sample(page2, 45_000);
  } catch (e) {
    console.log('post-crash re-entry failed:', String(e).slice(0, 200));
  }
  if (post) {
    console.log('POST_CRASH:', JSON.stringify(statsFrom(post.t)));
    console.log('POST_CRASH_ts:', JSON.stringify(statsFrom(post.ts)));
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${OUT_DIR}/gpucrash.json`, JSON.stringify({ base, post }, null, 1));
  }
} catch (e) {
  console.log('FATAL:', e?.stack ?? String(e));
} finally {
  await browser.close();
}
process.exit(0);
