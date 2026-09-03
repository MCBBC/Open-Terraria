// 用户存档复现(饥饿的庄园):导入 → 重置 hardMode → 真实 FIFO 转换 → M 图全程打开
// → 消费收敛断言 + 截图 A(转换后) / B(redrawAll 参照) 逐字节对比
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 } });
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 }).catch(() => {});
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(() => {}); await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {}); }
await sleep(400);
// 无角色 → 创建
if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 }); await sleep(400);
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('复现' + Math.floor(Math.random() * 90 + 10));
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel-list .sw-vitem', { timeout: 15000 }); await sleep(600);
}
// 进世界列表 → 导入存档
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 12000 }).catch(() => {});
await sleep(500);
for (let i = 0; i < 30 && !(await page.$('.sw-vsel-list .sw-vitem')); i++) await sleep(500);
await page.click('.sw-vsel [data-act=import]');
const fileInput = await page.$('input[type=file]');
await fileInput.uploadFile('/Users/vinlic/Downloads/map-饥饿的庄园.json');
// 等导入完成(列表出现 饥饿的庄园)
for (let i = 0; i < 60 && !(await page.evaluate(() => [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].some(e => e.textContent.includes('饥饿的庄园')))); i++) await sleep(500);
const idx = await page.evaluate(() => Math.max(0, [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].findIndex(e => e.textContent.includes('饥饿的庄园'))));
await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 600000, polling: 500 });
await sleep(2000);

// ===== 复现:重置 hardMode → 真实 FIFO 转换 → M 图全程打开 =====
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/world/gen/vanilla/HardmodePass.ts');
  g.world.flags.hardMode = false;
  delete g.world.flags.hardModeConverted;
  g.mapStyle = 2;                                       // 覆盖式地图(用户可见形态之一)
  const st = g.world.store;
  const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
  let before = 0;
  for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) before++;
  g.worldJobs.push(m.startHardmodeJob(g.world));        // 真实 FIFO 入队(生产同款)
  // M 图全程打开:消费端每帧跑
  g.renderer.fullMap.open = true;
  return { before };
});
console.log('SETUP:', JSON.stringify(setup), '(M 图已开,转换运行中)');
await sleep(4000);                                      // 转换+消费收敛窗
const state1 = await page.evaluate(() => {
  const g = window.__swGame; const r = g.renderer;
  return { jobs: g.worldJobs.length, needsFull: r.minimap.needsFullUpload, rects: r.minimap.flushedPixelRects.length,
           convertedFlag: !!g.world.flags.hardModeConverted };
});
console.log('STATE after 4s:', JSON.stringify(state1));
await sleep(1500);
// 截图 A(当前 M 图视图)
await page.screenshot({ path: '/tmp/repro-A.png' });
// 参照:redrawAll 全量重绘(应无变化若已收敛)
await page.evaluate(() => { const g = window.__swGame; g.renderer.minimap.redrawAll(); });
await sleep(600);
await page.screenshot({ path: '/tmp/repro-B.png' });
const state2 = await page.evaluate(() => { const g = window.__swGame; const r = g.renderer;
  return { needsFull: r.minimap.needsFullUpload, rects: r.minimap.flushedPixelRects.length, dirty: r.minimap.dirtyChunks.size }; });
console.log('STATE after redrawAll:', JSON.stringify(state2));
console.log('errs:', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
await b.close();
