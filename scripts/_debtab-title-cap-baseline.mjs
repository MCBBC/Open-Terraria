// ★债A 定量基线 v2（标题态,免进世界）:frameCap∈{60,120,0} 三档下
//   menuBg.tick 步进率 + 菜单时钟推进速度 + 单拍耗时 + 折算渲染 CPU%
// 每档重装干净插桩（orig 存全局,wrapper 每档重建——上一版 sticky patch bug 修复）。
import { launchBrowser, openPage, waitForBridge } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({ extraArgs: ["--disable-frame-rate-limit", "--disable-gpu-vsync"] });
const page = await openPage(browser, {});
await page.goto(`${ORIGIN}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
if (!(await waitForBridge(page, { timeout: 240000 }))) { console.log('bridge FAIL'); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));

async function measure(cap) {
  await page.evaluate((c) => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', c)), cap);
  await new Promise((r) => setTimeout(r, 500));
  const winMs = 6000;
  const r = await page.evaluate((winMs) => new Promise((res) => {
    const g = window.__swMenuBg;
    if (!g) { res({ err: 'no-menuBg' }); return; }
    // 每档重装干净插桩:orig 一次性存档,wrapper 现挂
    if (!g.__tickOrig) g.__tickOrig = g.tick;
    let tickN = 0, tickCost = 0;
    g.tick = (dt) => { const t0 = performance.now(); g.__tickOrig(dt); tickCost += performance.now() - t0; tickN++; };
    const t0clock = g.clockTime();
    let rafN = 0, stop = false;
    const cnt = () => { if (stop) return; rafN++; requestAnimationFrame(cnt); };
    requestAnimationFrame(cnt);
    setTimeout(() => {
      stop = true;
      g.tick = g.__tickOrig;   // 摘桩还净
      const clockDelta = ((g.clockTime() - t0clock) + 1) % 1;
      res({
        rafPs: Math.round(rafN / (winMs / 1000)),
        tickPs: tickN / (winMs / 1000),
        tickMs: tickN ? tickCost / tickN : 0,
        clockSpeed: clockDelta / (winMs / 1000),
      });
    }, winMs);
  }), winMs);
  if (r.err) { console.log(`[frameCap=${cap}]`, r.err); return; }
  const cpu = r.tickMs * r.tickPs / 10;   // ms/s → % (tickMs×tickPs=ms每秒;/1000×100)
  console.log(`[frameCap=${cap}] raf/s=${r.rafPs} menuBg.tick/s=${r.tickPs.toFixed(1)} avg=${r.tickMs.toFixed(2)}ms renderCPU%=${cpu.toFixed(2)} clock/s=${(r.clockSpeed * 1000).toFixed(2)}e-3`);
}

await measure(60);
await measure(120);
await measure(0);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', 60)));
await browser.close();
process.exit(0);
