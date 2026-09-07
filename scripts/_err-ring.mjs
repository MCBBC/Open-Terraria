// 读取页面的 __swErrors/__swErrorsFatal 原始栈(main.ts 错误环)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const LOG = fs.openSync('/tmp/err-ring.log', 'w');
const log = (s) => fs.writeSync(LOG, s + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/err-ring-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1600, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
const CDP = await page.createCDPSession();
await CDP.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp/err-ring-dl' }).catch(() => {});
page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });
// 保留 console(全部)
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') log(`[err] ${t.slice(0, 2500)}`); else if (t.startsWith('[ap]') || t.startsWith('[apc]') || t.startsWith('[inv-stack-full]')) log(`[lg] ${t.slice(0, 900)}`); });
await page.goto(host + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 8000));
for (let i = 0; i < 40; i++) {
  const ph = await page.evaluate(() => { const h = globalThis.__swAssetCache; return h && typeof h.state === 'function' ? h.state().phase : 'nohandle'; }).catch(() => 'x');
  if (ph === 'done' || (ph === 'nohandle' && i > 6)) break;
  await new Promise((r) => setTimeout(r, 3000));
}
log('assets-ready');
// 走角色+世界
const click = async (sel) => { const e = await page.$(sel); if (e) { await e.click(); await new Promise((r) => setTimeout(r, 900)); return true; } return false; };
if (!(await page.$('.sw-vsel'))) await click('[data-act="sp"]');
if (await page.$('.sw-vsel-empty')) { await click('[data-act="new"]'); await click('[data-act="create"]'); }
const playImgs = await page.$$('.sw-vsel .sw-vitem-btns img');
for (const img of playImgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_ButtonPlay')) { await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click(); break; }
}
await new Promise((r) => setTimeout(r, 1500));
log('world-list');
const importBtn = await page.$('[data-act="import"]');
if (importBtn) {
  await importBtn.click(); await new Promise((r) => setTimeout(r, 600));
  const fin = await page.$('.sw-vsel input[type=file]');
  if (fin) { await fin.uploadFile('/Users/vinlic/Downloads/天真的钴最高点.wld'); await new Promise((r) => setTimeout(r, 12000)); }
}
log('imported');
const items = await page.$$('.sw-vsel .sw-vitem');
if (items.length) {
  const imgs = await items[items.length - 1].$$('.sw-vitem-btns img');
  for (const img of imgs) {
    const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
    if (src.includes('UI_ButtonPlay')) { await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click(); break; }
  }
}
log('played-waiting');
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const ring = await page.evaluate(() => ({
      fatal: (window.__swErrorsFatal ?? []).slice(-4),
      all: (window.__swErrors ?? []).slice(-6),
    }));
    for (const e of ring.fatal) log(`FATAL ${e.t} ${e.msg} :: ${(e.stack ?? '').slice(0, 700)}`);
    for (const e of ring.all) log(`ERR ${e.t} ${e.msg} :: ${(e.stack ?? '').slice(0, 400)}`);
    const inGame = await page.evaluate(() => !!globalThis.__swGame);
    if (inGame) {
      log('IN-GAME');
      await new Promise((r2) => setTimeout(r2, 4000));
      // dump 玩家周围 ±120 格的非零格(按列聚合,找垂直连续段=截图金色链)
      try {
        const dump = await page.evaluate(() => {
          const g = globalThis.__swGame;
          const st = g.world.store;
          const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
          const cols = [];
          for (let dx = -20; dx < 80; dx++) {
            const x = px + dx;
            if (x < 0 || x >= st.w) continue;
            const runs = [];
            let cur = -1, start = -1;
            for (let dy = -60; dy < 40; dy++) {
              const y = py + dy;
              if (y < 0 || y >= st.h) continue;
              const i = y * st.w + x;
              const t = st.type[i];
              if (t !== cur) {
                if (cur !== 0 && start >= 0 && y - start >= 3) runs.push({ t: cur, y0: start, y1: y - 1 });
                cur = t; start = y;
              }
            }
            if (runs.length) cols.push({ x, runs });
          }
          return { px, py, cols: cols.filter((c) => c.runs.some((r) => r.t !== 1 && r.t !== 59 && r.t !== 0 && r.t !== 53)) };
        });
        log('DUMP px=' + dump.px + ',' + dump.py + ' cols=' + dump.cols.length);
        for (const c of dump.cols.slice(0, 40)) {
          log(`  x=${c.x}: ` + c.runs.map((r) => `t${r.t}@${r.y0}-${r.y1}`).join(' '));
        }
      } catch (e) { log('dump-err ' + e.message); }
      // 关欢迎弹窗(我已知晓)
      try {
        const btns = await page.$$('button, [class*=btn], [class*=dismiss]');
        for (const b of btns) {
          const t = await b.evaluate((e) => (e.textContent ?? '').trim());
          if (t === '我已知晓' || t.includes('知晓')) { await b.click(); log('dialog-dismissed'); break; }
        }
      } catch (e) { log('dismiss-err ' + e.message); }
      await new Promise((r2) => setTimeout(r2, 3000));
      await page.screenshot({ path: '/Users/vinlic/Downloads/verify-流浪汉舌-导入后.png' });
      log('SHOT-SAVED');
      break;
    }
  } catch (e) { log('eval-err ' + e.message); break; }
}
log('done');
await browser.close();
fs.closeSync(LOG);
