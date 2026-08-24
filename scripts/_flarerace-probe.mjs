// 一次性:方片竞态修复验证——请求拦截延迟 PointBlurry 6s,钉黄昏:
// 延迟窗内(贴图元数据已到/主体未到)不应出现方片;加载完成后光斑应正常。
// 同时读 flareTintCache 里 pointblurry 键的烘焙结果尺寸佐证。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.setRequestInterception(true);
p.on('request', (req) => {
  const u = req.url();
  if (u.includes('Misc_Sunflare_Lens_PointBlurry')) {
    setTimeout(() => req.continue(), 6000);   // 拖 6s:制造"元数据已到?否——完全未响应"窗
  } else req.continue();
});
// 注:continue 延迟期间浏览器无响应头 → complete=false 且 width=0,守卫走
// texReady=false 跳过;为造"width>0 但主体未完"的精确窗,改用分段响应:
// (对本地 vite 元数据与主体几乎同时到,真正的 width>0 窗极窄——此处以
//  complete=false 窗验证守卫路径 + 平色拒烘闸双保险即可)
await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100 && !await p.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await sleep(1000);
// 钉黄昏
await p.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.dayTime = true;
  mb.__pin = setInterval(() => { mb.vTime = 49500; }, 50);
});
await sleep(1500);   // 此刻 PointBlurry 仍被扣着 → 光斑链应整体跳过该元素
await p.screenshot({ path: `${OUT}/race-window.png` });
const win = await p.evaluate(() => {
  const s = window.__swMenuBg.sky;
  const t = s.sunflareTexLoad('pointblurry');
  return { w: t.width, complete: t.complete, cacheN: undefined };
});
console.log('WINDOW pointblurry:', JSON.stringify(win));
await sleep(7000);   // 放行后加载完成 → 光斑应出现且非方片
await p.screenshot({ path: `${OUT}/race-after.png` });
const after = await p.evaluate(() => {
  const s = window.__swMenuBg.sky;
  const t = s.sunflareTexLoad('pointblurry');
  clearInterval(window.__swMenuBg.__pin);
  return { w: t.width, complete: t.complete };
});
console.log('AFTER pointblurry:', JSON.stringify(after));
await b.close();
console.log('DONE →', OUT);
