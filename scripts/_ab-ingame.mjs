// A/B:硬刷进游戏 vs 正常进游戏——贴图加载状态对比(用户复现路径)
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOG = fs.openSync('/tmp/ab-ingame.log', 'w');
const log = (t) => fs.writeSync(LOG, t + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/ab-ing-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const CDP = await page.createCDPSession();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 120)}`));

async function importWorld() {
  const importBtn = await page.$('[data-act="import"]');
  if (!importBtn) return false;
  await importBtn.click();
  await new Promise((r) => setTimeout(r, 800));
  const fin = await page.$('.sw-vsel input[type=file]');
  if (!fin) return false;
  await fin.uploadFile(needInput(join(DOWNLOADS, '粗暴的椰子地段.wld')));
  await new Promise((r) => setTimeout(r, 15000));
  return true;
}

async function enterGame() {
  // 标题→单人→世界列表→play(与既有探针同链)
  await new Promise((r) => setTimeout(r, 1500));
  const click = async (sel) => { const e = await page.$(sel); if (e) { await e.click(); await new Promise((r) => setTimeout(r, 1200)); return true; } return false; };
  if (!(await page.$('.sw-vsel'))) await click('[data-act="sp"]');
  const items = await page.$$('.sw-vsel .sw-vitem');
  if (!items.length) { log('no-worlds'); return false; }
  const imgs = await items[0].$$('.sw-vitem-btns img');
  for (const img of imgs) {
    const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
    if (src.includes('UI_ButtonPlay')) { await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click(); break; }
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const ok = await page.evaluate(() => !!globalThis.__swGame && !!globalThis.__swGame.world).catch(() => false);
    if (ok) { log('IN-GAME'); return true; }
  }
  return false;
}
async function snap(tag) {
  await new Promise((r) => setTimeout(r, 8000));
  const s = await page.evaluate(() => {
    const g = globalThis.__swGame;
    const snap = globalThis.__swRenderLog?.snap?.() ?? {};
    const imgs = [...document.querySelectorAll('img')];
    return {
      vimages: snap.vimages, uiimages: snap.uiimages, chunkCached: snap.chunkCached,
      failedVImages: (snap.failedVImages ?? []).slice(0, 8), failedCount: (snap.failedVImages ?? []).length,
      domImgs: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  log(`${tag} ${JSON.stringify(s)}`);
  await page.screenshot({ path: `/tmp/ab-${tag}.png` });
}

// ===== 第一轮:正常进入(基线) =====
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
log('SW ok');
for (let i = 0; i < 60; i++) {
  const d = await page.evaluate(() => globalThis.__swAssetCache?.state?.().phase === 'done').catch(() => false);
  if (d) break;
  await new Promise((r) => setTimeout(r, 3000));
}
log('warm done');
await new Promise((r) => setTimeout(r, 2000));
await snap('1-normal-menu');   // ★主菜单即验(用户:错误在主菜单已复现)

// 退出回菜单(为第二轮准备)
await page.evaluate(() => { const b = document.querySelector('.sw-pause-panel .sw-pause-btn:last-child'); });
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 1000));
// 直接硬刷回标题(模拟用户 Cmd+Shift+R 后再进)
await CDP.send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 8000));
// 等 warm
for (let i = 0; i < 80; i++) {
  const d = await page.evaluate(() => globalThis.__swAssetCache?.state?.().phase === 'done').catch(() => false);
  if (d) break;
  await new Promise((r) => setTimeout(r, 3000));
}
log('hard-reload warm done');
await new Promise((r) => setTimeout(r, 2000));
await snap('2-hard-reload-menu');   // 主菜单阶段对照
await importWorld();
{
  const items = await page.$$('.sw-vsel .sw-vitem');
  if (items.length) {
    const imgs = await items[items.length - 1].$$('.sw-vitem-btns img');
    for (const img of imgs) {
      const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
      if (src.includes('UI_ButtonPlay')) { await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click(); break; }
    }
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const ok = await page.evaluate(() => !!globalThis.__swGame && !!globalThis.__swGame.world).catch(() => false);
    if (ok) break;
  }
}
await snap('3-hard-reload-ingame');   // 进游戏后对照
await new Promise((r) => setTimeout(r, 5000));
await snap('4-hard-reload-ingame-late');
await browser.close();
fs.closeSync(LOG);
