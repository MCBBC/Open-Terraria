// 角色创建发型页端到端:遮罩出现/消失时长、贴图就绪时刻(验证并发懒载+分帧+转圈)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: process.env.SW_USERDIR ?? ('/tmp/cc-hair-' + (Date.now() % 100000)), args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等揭幕(splash 移除+菜单可点;全新 profile 需等 warm 全量)
for (let i = 0; i < 66; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const go = await page.evaluate(() => !document.getElementById('sw-splash') && !document.getElementById('sw-boot-prime') && !!document.querySelector('[data-act=sp]'));
  if (go) break;
  if (i === 65) {   // 超时兜底:开诊断面板抓 trace 再退
    await page.evaluate(() => window.__swAssetDiag && window.__swAssetDiag());
    await new Promise((r) => setTimeout(r, 500));
    const ta = await page.evaluate(() => document.querySelector('#sw-asset-diag textarea')?.value ?? '(无面板)');
    console.log('== 超时现场 trace(尾 40 行)==');
    console.log(ta.split('\n').slice(-40).join('\n'));
  }
}
const t0 = Date.now();
for (let i = 0; i < 10; i++) { try { await page.click('[data-act=sp]'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
// 单人模式 → 角色选择列表
for (let i = 0; i < 20; i++) { if (await page.$('[data-act=new]')) break; await new Promise((r) => setTimeout(r, 250)); }
await page.click('[data-act=new]');  // 新建角色 → CharCreation(默认信息页)
for (let i = 0; i < 20; i++) { if (await page.$('.sw-cc-tab[data-tab=hair]')) break; await new Promise((r) => setTimeout(r, 250)); }
await page.click('.sw-cc-tab[data-tab=hair]');   // 切到发型页
// 等发型网格
for (let i = 0; i < 20; i++) {
  if (await page.$('.sw-cc-hairgrid')) break;
  await new Promise((r) => setTimeout(r, 250));
}
const tGrid = Date.now();
let bakingSeen = false, thumbAt = 0, bakeGoneAt = 0;
for (let i = 0; i < 120; i++) {
  const s = await page.evaluate(() => ({
    baking: !!document.querySelector('.sw-cc-hair.baking'),
    thumb: !!document.querySelector('.sw-cc-hairbtn .sw-cc-thumb') &&
      [...document.querySelectorAll('.sw-cc-hairbtn .sw-cc-thumb')].some((t) => (t.style.backgroundImage || '').includes('url')),
    filled: [...document.querySelectorAll('.sw-cc-hairbtn .sw-cc-thumb')].filter((t) => (t.style.backgroundImage || '').includes('url')).length,
  }));
  if (s.baking && !bakingSeen) { bakingSeen = true; console.log(`+${((Date.now() - tGrid) / 1000).toFixed(1)}s 转圈遮罩出现`); }
  if (s.thumb && !thumbAt) { thumbAt = Date.now(); console.log(`+${((thumbAt - tGrid) / 1000).toFixed(1)}s 贴图开始上屏 (${s.filled}格)`); }
  if (bakingSeen && !s.baking && !bakeGoneAt) { bakeGoneAt = Date.now(); console.log(`+${((bakeGoneAt - tGrid) / 1000).toFixed(1)}s 遮罩撤除`); break; }
  if (!bakingSeen && s.thumb && !bakeGoneAt && i > 4) { bakeGoneAt = Date.now(); console.log(`+${((bakeGoneAt - tGrid) / 1000).toFixed(1)}s 无遮罩直接就绪`); break; }
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`总观测 ${(Date.now() - t0) / 1000}s | 遮罩出现=${bakingSeen} 贴图=${!!thumbAt}`);
await browser.close();
process.exit(0);
