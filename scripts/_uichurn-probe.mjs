// DOM 图标解码恒定流回归探针(trace④根因):进世界→传送地牢(晚到表风暴期)
// →数 refreshAll 后的 <img> 新建数(应≈0:元素复用)与 dataURL 解码。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
let errs=0; p.on('console', m => { if(m.type()==='error') errs++; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i=0;i<60;i++){ await sleep(2000); if (await p.evaluate(()=>!!window.__swGame).catch(()=>false)) break; }
// 注入 <img> 创建计数器(监测 paintSlot 元素复用)
const base = await p.evaluate(() => {
  const imgs = document.querySelectorAll('.sw-root img, .sw-hotbar img, [class*="slot"] img').length;
  return { imgs };
});
// 触发 20 次 refreshAll(模拟 iconUiDirty 风暴)
const after = await p.evaluate(async () => {
  const ui = window.__swUI;
  const before = document.querySelectorAll('img').length;
  for (let i = 0; i < 20; i++) ui.refreshAll();
  await new Promise(r => setTimeout(r, 800));  // rAF 合并消化
  const g = window.__swGame;
  // 传地牢触发晚到表(原风暴场景)
  g.player.x = g.world.dungeonX*16; g.player.y = (g.world.dungeonY+20)*16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  await new Promise(r => setTimeout(r, 8000));
  return { alive: !!g.renderer, imgsNow: document.querySelectorAll('img').length, errs: 0 };
}).catch(e => ({ alive: false, err: String(e).slice(0,90) }));
console.log('refreshAll×20 + 地牢传送 8s:', JSON.stringify(after), 'console errors:', errs);
console.log(after.alive ? 'PASS' : 'FAIL');
await b.close(); process.exit(after.alive?0:1);
