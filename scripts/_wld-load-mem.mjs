// 大世界导入+读档全链内存探针(2026-09-07):复现 preview「坚持很久仍崩」。
// 链:5201 私有实例 → 世界列表导入 .wld(worker)→ Play 读档 → CDP 逐秒采样
// JSHeap+Renderer 内存,捕获 target crashed。崩点=最后一条阶段日志。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, '天真的钴最高点.wld'));
const host = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const LOG = fs.openSync('/tmp/wld-mem.log', 'w');
const log = (s) => fs.writeSync(LOG, s + '\n');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/wld-mem-prof-' + Date.now() % 100000,
  args: ['--no-proxy-server', '--js-flags=--max-old-space-size=4096'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const CDP = await page.createCDPSession();
await CDP.send('Performance.enable').catch(() => {});
let crashed = false;
page.on('error', (e) => { crashed = true; log(`PAGE-ERROR ${e.message}`); });
browser.on('targetcrashed', (e) => { crashed = true; log(`TARGET-CRASHED ${JSON.stringify(e)}`); });
page.on('pageerror', (e) => { log(`PAGE-EXC ${e.message}`); log(`PAGE-EXC-STACK ${(e.stack ?? '').split('\n').slice(0, 10).join(' \u00b7 ')}`); });
page.on('console', (m) => {
  const t = m.text();
  if (/TypeError|RangeError|FATAL|crash/i.test(t)) {
    log(`[EXC] ${t.slice(0, 300)}`);
    try { log(`[EXC-STACK] ${m.stackTrace().slice(0, 6).map((f) => `${(f.url || '').split('/').pop()}:${f.lineNumber}`).join(' | ')}`); } catch {}
  } else if (/worker|settle|load|world|error|apc|\[ap\]/i.test(t) && t.length < 200) log(`[c] ${t.slice(0, 200)}`);
});

log('T0 goto');
await page.goto(host + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 全局 rejection/错误原始栈捕获(main.ts 包装会截栈,这里拿第一手)
await page.evaluate(() => {
  const w = window;
  w.__uhr = [];
  window.addEventListener('unhandledrejection', (e) => {
    w.__uhr.push('UHR: ' + String(e.reason?.stack ?? e.reason).slice(0, 900));
  });
  window.addEventListener('error', (e) => {
    w.__uhr.push('ERR: ' + (e.error?.stack ?? e.message).slice(0, 900));
  });
});
// 资产暖完
for (let i = 0; i < 60; i++) {
  const ph = await page.evaluate(() => {
    const h = globalThis.__swAssetCache;
    return h && typeof h.state === 'function' ? h.state().phase : 'nohandle';
  }).catch(() => 'eval-err');
  if (ph === 'done' || ph === 'nohandle' && i > 8) break;
  await new Promise((r) => setTimeout(r, 3000));
}
log('T1 assets done');

// 内存采样器(每 2s)
let sampling = true;
(async () => {
  while (sampling && !crashed) {
    try {
      const m = await CDP.send('Performance.getMetrics');
      const get = (n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
      log(`MEM heap=${Math.round(get('JSHeapUsedSize') / 1e6)}MB total=${Math.round(get('JSHeapTotalSize') / 1e6)}MB`);
    } catch { /* crashed */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
})();

// 进标题→单人→角色列表(造角色如空)
const click = async (sel) => { const e = await page.$(sel); if (e) { await e.click(); await new Promise((r) => setTimeout(r, 900)); return true; } return false; };
if (!(await page.$('.sw-vsel'))) {
  await click('[data-act="sp"]');
}
if (await page.$('.sw-vsel-empty')) {
  await click('[data-act="new"]');
  await click('[data-act="create"]');
  log('T2 char created');
}
log('T3 char list ready');

// 世界列表面板:角色行 Play
const playImgs = await page.$$('.sw-vsel .sw-vitem-btns img');
for (const img of playImgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_ButtonPlay')) {
    await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
    break;
  }
}
await new Promise((r) => setTimeout(r, 1200));
log('T4 world list');

// 导入 .wld(footer 导入钮 → uploadFile)
const importBtn = await page.$('[data-act="import"]');
if (importBtn) {
  await importBtn.click();
  await new Promise((r) => setTimeout(r, 600));
  const fin = await page.$('.sw-vsel input[type=file]');
  if (fin) {
    log('T5 uploading wld');
    await fin.uploadFile(WLD);
    // 导入(worker parse+落库)——等待 toast/列表项
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const n = (await page.$$('.sw-vsel .sw-vitem')).length;
      if (n > 0 && i > 3) { log(`T6 import done items=${n} t=${i * 2}s`); break; }
      if (crashed) break;
    }
  }
}
if (crashed) { log('CRASHED-DURING-IMPORT'); await browser.close(); fs.closeSync(LOG); process.exit(0); }

// Play 导入的世界(最后一行)
const items = await page.$$('.sw-vsel .sw-vitem');
log(`T7 rows=${items.length}`);
if (items.length) {
  // 最后一行(刚导入)的 Play 钮
  const imgs = await items[items.length - 1].$$('.sw-vitem-btns img');
  for (const img of imgs) {
    const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
    if (src.includes('UI_ButtonPlay')) {
      log('T8 play clicked');
      await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
      break;
    }
  }
}
// 读档阶段等待(最多 6 分钟)——进度文本采样
let lastPhase = '';
for (let i = 0; i < 180; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  if (crashed) { log('CRASHED-DURING-LOAD'); break; }
  try {
    const ph = await page.evaluate(() => {
      const g = globalThis;
      const txt = document.querySelector('.sw-progress-label, .sw-prog-label')?.textContent ?? '';
      const inGame = !!(g.__swGame || document.querySelector('canvas.game, #game-canvas'));
      return { txt, inGame };
    });
    if (ph.txt !== lastPhase) { lastPhase = ph.txt; log(`PHASE ${ph.txt || '(none)'}`); }
    const uhr = await page.evaluate(() => window.__uhr ?? []).catch(() => []);
    while (uhr.length) { log(String(uhr.shift()).split('\n').join(' | ').slice(0, 600)); }
    if (ph.inGame) { log('IN-GAME'); break; }
  } catch { break; }
}
log(`END crashed=${crashed}`);
sampling = false;
await browser.close();
fs.closeSync(LOG);
