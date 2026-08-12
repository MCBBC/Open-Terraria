// 发光蘑菇株破坏掉落探针（scripts/_glowshroom-probe.mjs）
// 断言 v_71 破坏走原版 case 71/72 掷骰：只掉 发光蘑菇(vi_183)/蘑菇草种子，
// 概率约 48.75%/2.5%，其余无掉落；不掉 place_ 物品/木头。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') errs.push(`console.${t}: ` + m.text().slice(0, 200)); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('蘑菇探针');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
try {
  await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 420000 });
} catch (e) {
  console.log('等待进世界超时,已捕获诊断:', JSON.stringify(errs.slice(-10), null, 2));
  await page.screenshot({ path: '/tmp/glowshroom-stuck.png' });
  throw e;
}
await new Promise(r => setTimeout(r, 1500));

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const tiles = window.__swTiles;
  const id71 = tiles['v_71_mushroom_plant'];
  const st = g.world.store;
  const x = g.world.spawnX, y = g.world.spawnY - 4;
  const counts = {};
  const N = 400;
  for (let k = 0; k < N; k++) {
    st.setTile(x, y, id71, 0, 0);
    const before = g.entities.drops.length;
    g.breakTile(x, y);
    const after = g.entities.drops;
    const dropped = after.length > before ? after[after.length - 1] : null;
    // ItemDrop 存的是内部 item id → 反查 key
    let key = null;
    if (dropped) {
      const found = Object.entries(window.__swItems).find(([, iid]) => iid === dropped.itemId ?? dropped.id);
      key = found ? found[0] : 'unknown:' + JSON.stringify(Object.keys(dropped));
    }
    counts[key ?? 'none'] = (counts[key ?? 'none'] ?? 0) + 1;
    if (dropped) { after.pop(); }
  }
  return { counts, id71 };
});
console.log(JSON.stringify(res, null, 2));

const c = res.counts;
const out = { errs };
out.shroom = c['vi_183_glowing_mushroom'] ?? 0;
out.seeds = c['mushroom_grass_seeds'] ?? 0;
out.none = c['none'] ?? 0;
out.unexpected = Object.fromEntries(Object.entries(c).filter(([k]) =>
  k !== 'vi_183_glowing_mushroom' && k !== 'mushroom_grass_seeds' && k !== 'none'));
let ok = true;
if (out.unexpected && Object.keys(out.unexpected).length) { ok = false; console.log('✗ 出现意外掉落:', out.unexpected); }
if (out.shroom < 150 || out.shroom > 250) { ok = false; console.log('✗ 发光蘑菇计数异常(期望 ~195):', out.shroom); }
if (out.seeds < 3 || out.seeds > 25) { ok = false; console.log('✗ 种子计数异常(期望 ~10):', out.seeds); }
if (out.none < 150 || out.none > 250) { ok = false; console.log('✗ 无掉落计数异常(期望 ~195):', out.none); }
if (errs.length) { ok = false; console.log('✗ 页面错误:', errs.slice(0, 3)); }
console.log(ok ? '✓ 发光蘑菇掉落分布符合 case 71/72' : '✗ 探针失败');
await browser.close();
process.exit(ok ? 0 : 1);
