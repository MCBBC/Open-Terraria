// ★债A/债B 定谳探针 v2（退出世界内存案遗留两笔）：
//   债A 标题期循环构成与封顶状态：rAF 回调率 / menuBg.tick 步进率与单拍耗时 /
//        VUI 主循环 busy 份额（tickCost×tickRate 折算）
//   债B worker 生命周期表：CDP Target.getTargets(page session)——
//        标题-boot / 世界内 / 退出回标题 / 二次进世界 / 二次回标题 各相点名
// 纯只读观测(frameCap 硬化臂除外,毕后还原 60)。
import { launchBrowser, openPage, bootstrap, waitForGame, waitForBridge } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console]' + m.text().slice(0, 160)); });

const cdp = await page.createCDPSession();

/** worker 点名（type 含 worker 的 CDP target;url 末段=入口文件名） */
async function listWorkers(tag) {
  let rows = [];
  try {
    const r = await cdp.send('Target.getTargets');
    rows = r.targetInfos.filter((t) => t.type === 'worker' || t.type === 'shared_worker');
  } catch (e) { console.log(`[workers][${tag}] CDP err`, String(e).slice(0, 80)); }
  console.log(`[workers][${tag}] n=${rows.length}`);
  for (const t of rows) console.log(`   - ${t.url.replace(/[?#].*$/, '').split('/').slice(-2).join('/')}`);
  return rows.map((t) => t.url);
}

/** 标题/世界帧指标（winMs 窗）:
 *  rafPs=独立 rAF 链回调率; tick=menuBg.tick 步进数; tickMs=平均单拍耗时;
 *  renderCpu%=tickMs×tick 率折算的主线程渲染份额 */
async function frameMetrics(tag, winMs = 3000) {
  const r = await page.evaluate((winMs) => new Promise((res) => {
    const g = window.__swMenuBg;
    let tickN = 0, tickCost = 0;
    if (g && !g.__tickPatched) {
      const orig = g.tick.bind(g);
      g.tick = (dt) => { const t0 = performance.now(); orig(dt); tickCost += performance.now() - t0; tickN++; };
      g.__tickPatched = true;
    }
    let rafN = 0, stop = false;
    const cnt = () => { if (stop) return; rafN++; requestAnimationFrame(cnt); };
    requestAnimationFrame(cnt);
    setTimeout(() => {
      stop = true;
      const sec = winMs / 1000;
      res({ rafPs: Math.round(rafN / sec), tickN, tickMs: tickN ? tickCost / tickN : 0, hasMenuBg: !!g });
    }, winMs);
  }), winMs);
  const cpu = r.hasMenuBg ? (r.tickMs * r.tickN / winMs * 100) : 0;
  console.log(`[frame][${tag}] raf/s=${r.rafPs} menuBg.tick=${r.tickN}/${winMs}ms avg=${r.tickMs.toFixed(2)}ms 折算渲染CPU%=${cpu.toFixed(1)}`);
  return r;
}

console.log('=== 相0:冷启动标题 ===');
await page.goto(`${ORIGIN}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
if (!(await waitForBridge(page, { timeout: 240000 }))) { console.log('bridge FAIL'); process.exit(1); }
await bootstrap(page, ORIGIN, { clean: true });   // 清存储+重载（幂等,桥已在）
if (!(await waitForBridge(page, { timeout: 120000 }))) { console.log('bridge FAIL-2'); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
await listWorkers('title-boot');
await frameMetrics('title-boot');

console.log('=== 相1:进世界(direct small) ===');
await page.evaluate(() => void window.__swFlow.newWorld('05162020', 4200, 1200));
if (!(await waitForGame(page, { timeout: 180000 }))) { console.log('world FAIL'); process.exit(1); }
await new Promise((r) => setTimeout(r, 3000));
await listWorkers('in-world');
await frameMetrics('in-world');

console.log('=== 相2:退出回标题(quitToMenu 全链) ===');
await page.evaluate(() => window.__swFlow.quitToMenu());
await new Promise((r) => setTimeout(r, 3500));
console.log('__swGame after quit:', await page.evaluate(() => !!window.__swGame));
await listWorkers('title-after-quit');
await frameMetrics('title-after-quit');

console.log('=== 相3:再进世界(quickLoad) ===');
await page.evaluate(() => void window.__swFlow.quickLoad());
const ok2 = await waitForGame(page, { timeout: 180000 });
console.log('re-entry:', ok2 ? 'OK' : 'TIMEOUT');
await new Promise((r) => setTimeout(r, 3000));
await listWorkers('in-world-2nd');
if (ok2) {
  console.log('re-entry health:', JSON.stringify(await page.evaluate(() => {
    const g = window.__swGame;
    return { world: !!g?.world, player: !!g?.player, running: !!g?.running };
  })));
}

console.log('=== 相4:二次退出 + frameCap=0 硬化基线 ===');
await page.evaluate(() => window.__swFlow.quitToMenu());
await new Promise((r) => setTimeout(r, 3500));
await page.evaluate(() => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', 0)));
await new Promise((r) => setTimeout(r, 600));
await listWorkers('title-after-2nd-quit');
await frameMetrics('title-frameCap0', 4000);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', 60)));

console.log('pageerrors:', errs.length ? errs.slice(0, 10) : 'none');
await browser.close();
process.exit(0);
