// 贴图修复验证:导入原版 wld → 读档 → 类型采样断言 + 截图
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const LOG = fs.openSync('/tmp/img-verify.log', 'w');
const log = (s) => fs.writeSync(LOG, s + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/img-v-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1600, height: 900 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (/TypeError|RangeError|\[mem\]|worker|index/i.test(t)) log(`[c] ${t.slice(0, 200)}`); });
await page.goto(host + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 50; i++) {
  const ph = await page.evaluate(() => { const h = globalThis.__swAssetCache; return h && typeof h.state === 'function' ? h.state().phase : 'nohandle'; }).catch(() => 'x');
  if (ph === 'done' || (ph === 'nohandle' && i > 8)) break;
  await new Promise((r) => setTimeout(r, 3000));
}
log('assets-done');
const click = async (sel) => { const e = await page.$(sel); if (e) { await e.click(); await new Promise((r) => setTimeout(r, 900)); return true; } return false; };
if (!(await page.$('.sw-vsel'))) await click('[data-act="sp"]');
if (await page.$('.sw-vsel-empty')) { await click('[data-act="new"]'); await click('[data-act="create"]'); }
// 导入原版 wld
const importBtn = await page.$('[data-act="import"]');
if (importBtn) {
  await importBtn.click(); await new Promise((r) => setTimeout(r, 600));
  const fin = await page.$('.sw-vsel input[type=file]');
  if (fin) { await fin.uploadFile('/Users/vinlic/Downloads/天真的钴最高点.wld'); await new Promise((r) => setTimeout(r, 15000)); }
}
log('imported');
const items = await page.$$('.sw-vsel .sw-vitem');
log(`rows=${items.length}`);
if (items.length) {
  const imgs = await items[items.length - 1].$$('.sw-vitem-btns img');
  for (const img of imgs) {
    const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
    if (src.includes('UI_ButtonPlay')) { await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click(); break; }
  }
}
// 等进游戏
let inGame = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try { inGame = await Promise.race([
    page.evaluate(() => !!globalThis.__swGame && !!(globalThis.__swGame.world)),
    new Promise((res) => setTimeout(() => res(false), 25000)),
  ]); } catch { inGame = false; }
  if (inGame) break;
}
log(`inGame=${inGame}`);
if (inGame) {
  await new Promise((r) => setTimeout(r, 5000));
  // 类型采样:出生区地表物块(vanilla 雪原应见 snow/ice/stone 等 sheet 合理值——经稳定域)
  const sample = await page.evaluate(() => {
    const g = globalThis.__swGame;
    const st = g.world.store;
    const sx = g.world.spawnX, sy = g.world.spawnY;
    const counts = {};
    for (let dy = -30; dy < 20; dy++) for (let dx = -40; dx < 40; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
      const i = y * st.w + x;
      const t = st.type[i];
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { spawn: [sx, sy], top, name: g.world.name };
  });
  log('SAMPLE ' + JSON.stringify(sample));
  await page.screenshot({ path: '/tmp/verify-after-fix.png' });
  log('shot saved');
}
await browser.close();
fs.closeSync(LOG);
