// P0-SHM 标注验证:进世界后
// ① domBreakdown 中不再有数千级图标 surface 计数类条目(改为可见画布计数个位数)
// ② Canvas2D SHM 后备不可直接读——用间接信号:glfx 上传列无周期尖峰(静态源缓存成立)
// ③ 控制台无 Canvas2D 警告刷屏
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5207') + '/?gpulog=1';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const logs = [], warns = [];
page.on('console', m => { const t = m.text(); if (t.includes('[gpulog]') || t.includes('驻留=')) logs.push(t); if (/Canvas2D/.test(t)) warns.push(t.slice(0, 100)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('shm');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
if (await page.$('.sw-vsel .sw-vitem')) {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
} else {
  await page.click('.sw-vsel [data-act=new]').catch(()=>{});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(()=>{});
  await page.click('[data-f=seed]'); await page.keyboard.type('12345');
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 8000));
// 打开背包触发 toDataURL 路径(图标首次消费)
await page.keyboard.press('e').catch(()=>{});
await new Promise(r => setTimeout(r, 2500));
const snap = await page.evaluate(() => window.__swGPULog?.budget?.() ?? null);
console.log('domSurfacesMB:', snap?.domSurfacesMB);
console.log('domBreakdown:', JSON.stringify(snap?.domBreakdown));
console.log('glLiveMB:', JSON.stringify(Object.fromEntries(Object.entries(snap?.glContexts ?? {}).map(([k,v])=>[k,v.liveTexturesMB]))));
console.log('Canvas2D warns:', warns.length, warns.slice(0,2));
const gpulogTail = logs.filter(l=>l.includes('gpulog')).slice(-2);
console.log('gpulog tail:', gpulogTail.join(' | ').slice(0, 300));
await browser.close();
