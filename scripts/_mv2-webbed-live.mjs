// MV2 债①真机物证探针（2026-10-06）：真实 Game 主循环（dt=1/60/帧）下 buff 98
// 生命周期取证——对照 _mv-runaway-census.mjs 的 dt=1 时间膨胀伪影。
// 方法：不手动步进,由游戏自身 rAF 驱动;施加 webbed 3s,每 250ms 采样存活态。
// 判据：~3.0s 内持续 true,随后 false（原版逐拍倒计时,无"~1t 摘除者"）。
// 运行:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_mv2-webbed-live.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&swperf=0&mv2live=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1200));
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }

const res = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const out = { samples: [], dtObserved: [] };
  // 观察 10 帧真实 dt（证明主循环 dt≈1/60,非探针手动 dt=1）
  let last = performance.now();
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    const now = performance.now();
    out.dtObserved.push(+(now - last).toFixed(1));
    last = now;
  }
  // 施加 webbed 3s（原版吐网中位量级），主循环自然驱动
  p.buffs.apply?.(98, 3);
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 100));
  for (let i = 0; i < 20; i++) {
    out.samples.push({ ms: Math.round(performance.now() - t0), alive: p.buffs.has?.(98) ?? false, vx: +p.vx.toFixed(2) });
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
});
const lastAlive = Math.max(...res.samples.filter((s) => s.alive).map((s) => s.ms), -1);
const firstDead = res.samples.find((s) => !s.alive)?.ms ?? null;
console.log('=== real-loop dt (ms) ===');
console.log(JSON.stringify(res.dtObserved));
console.log('=== buff98 lifecycle (main loop driven) ===');
for (const s of res.samples) console.log(`${s.ms}ms alive=${s.alive} vx=${s.vx}`);
console.log(`=== verdict: lastAlive=${lastAlive}ms firstDead=${firstDead}ms (expected ~3000ms 期满, 非 ~16ms 即摘) ===`);
console.log('=== pageerrors ===');
console.log(JSON.stringify(errors.slice(0, 5)));
await browser.close();
process.exit(0);
