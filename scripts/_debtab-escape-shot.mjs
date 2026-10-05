// ★债A 逃生门+截图判别（vsync 解锁环境）:
//   1) ?menutickcap=0 逃生门 → frameCap=0 下 tick/s 应回 ~585（旧行为逐字节）
//   2) 标题屏截图×2（间隔 1s）——60fps 钳制下动画照常推进(云/星位移可见)
//   3) 进世界截图 1 张(全流程健康面)
import { launchBrowser, openPage, waitForBridge, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({ extraArgs: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const page = await openPage(browser, {});

async function tickRate(winMs = 4000) {
  return page.evaluate((winMs) => new Promise((res) => {
    const g = window.__swMenuBg;
    if (!g) { res({ err: 'no-menuBg' }); return; }
    if (!g.__tickOrig) g.__tickOrig = g.tick;
    let tickN = 0;
    g.tick = (dt) => { g.__tickOrig(dt); tickN++; };
    setTimeout(() => { g.tick = g.__tickOrig; res({ tickPs: tickN / (winMs / 1000) }); }, winMs);
  }), winMs);
}

// 1) 逃生门
console.log('=== 逃生门 ?menutickcap=0 + frameCap=0 ===');
await page.goto(`${ORIGIN}/?menutickcap=0&t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
if (!(await waitForBridge(page, { timeout: 240000 }))) { console.log('bridge FAIL'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', 0)));
await new Promise((r) => setTimeout(r, 500));
console.log('[escape] tick/s =', JSON.stringify(await tickRate()));

// 2) 默认钳制路径截图
console.log('=== 默认钳制路径(无旗) ===');
await page.goto(`${ORIGIN}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
if (!(await waitForBridge(page, { timeout: 120000 }))) { console.log('bridge FAIL-2'); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));
// 等向日葵幕撤除（过渡页三层图挂载后 500ms;冷 SW 缓存首访下载期可达数十秒）
await page.waitForFunction(() => !document.getElementById('sw-boot-prime'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', 0)));
await new Promise((r) => setTimeout(r, 500));
console.log('[clamped] tick/s =', JSON.stringify(await tickRate()));
await page.screenshot({ path: '/tmp/debtab-title-0.png' });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: '/tmp/debtab-title-1s.png' });

// 3) 进世界健康面
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
console.log('createGame:', gen.ok ? `${gen.w}x${gen.h}` : gen.why);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => m.options.set('frameCap', 60)));
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: '/tmp/debtab-inworld.png' });
const health = await page.evaluate(() => {
  const g = window.__swGame;
  return { world: !!g?.world, player: !!g?.player, running: !!g?.running };
});
console.log('in-world health:', JSON.stringify(health));
await browser.close();
process.exit(0);
