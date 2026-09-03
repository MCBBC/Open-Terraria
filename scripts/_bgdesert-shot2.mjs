// 复用已就绪的5203页面状态——但每次探针都重开浏览器,所以这里独立重跑:进世界→传送→全页截图+二分
// (与 _bgdesert-mounds-probe.mjs 同流程,仅截图方式改全页)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const OUT = process.env.SW_OUT ?? '/Users/vinlic/.claude/jobs/4a66e745/tmp';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(async () => { try { localStorage.clear(); const dbs = indexedDB.databases ? await indexedDB.databases() : []; for (const d of dbs) indexedDB.deleteDatabase(d.name); } catch {} });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.mouse.click(8, 8);
for (let i = 0; i < 6 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-char-row input[type=text]'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('bgprobe');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]').catch(()=>{});
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await page.click('[data-f=seed]');
await page.keyboard.type('1247539775');
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 420000, polling: 1000 });
for (let t = 0; t < 400; t++) {
  await page.evaluate(() => { const g = window.__swGame; if (g?.world) for (let i = 0; i < 120; i++) { try { g.fixedUpdate(1/60); } catch { break; } } }).catch(()=>{});
  const ok = await page.evaluate(() => {
    const g = window.__swGame; if (!g?.world?.store) return null;
    const st = g.world.store, w = st.w, h = st.h, ty = st.type;
    const keys = window.__swTiles ?? {}; const SAND = keys['v_53_sand_block'] ?? 53;
    let best = -1, bestN = -1;
    for (let x = 60; x < w - 60; x += 4) { let n = 0; for (let y = 60; y < (g.world.groundLevel|0)+80 && y < h; y++) if (ty[x+y*w] === SAND) n++; if (n > bestN) { bestN = n; best = x; } }
    if (bestN < 60) return false;
    let py = 250; while (py < h - 10 && !st.isSolid(2537, py)) py++;
    g.player.x = 2537*16+8; g.player.y = (py-6)*16; g.player.vx = 0; g.player.vy = 0;
    if (g.world.clock) g.world.clock.timeOfDay = 0.5;
    return true;
  });
  if (ok) break;
}
await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 180; i++) { try { g.fixedUpdate(1/60); } catch { break; } } });
const dims = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  return cs.map(c => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, id: c.id, cls: c.className }));
});
console.log('canvas dims:', JSON.stringify(dims));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/p2-full.png` });
console.log('full shot saved');
await browser.close();
console.log('DONE');
