// 探针 6：地图交互回归——拖动不误触传送、点击仍能传送、地图打开时不触发主角动作
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`); ok ? pass++ : fail++; };

// ---- 打开地图（真实点击小地图）----
const rect = await page.evaluate(() => {
  const r = window.__swGame.renderer.minimapRect;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
});
await page.mouse.move(rect.x, rect.y);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 100));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 1200));

// 1) 打开点击不误触传送
check('打开点击不误触传送', await page.evaluate(() => window.__swGame.renderer.tpMark === null));

// 2) 拖动 150px 不触发传送
const panBefore = await page.evaluate(() => window.__swGame.renderer.fullMap.panX);
await page.mouse.move(640, 400);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 120));
await page.mouse.move(790, 550, { steps: 8 });
await new Promise((r) => setTimeout(r, 200));
const dragTp = await page.evaluate(() => window.__swGame.renderer.tpMark);
await page.mouse.up();
await new Promise((r) => setTimeout(r, 200));
const panAfter = await page.evaluate(() => window.__swGame.renderer.fullMap.panX);
check('拖动生效（pan 变化）', Math.abs(panAfter - panBefore) > 50);
check('拖动不误触传送预选', dragTp === null && (await page.evaluate(() => window.__swGame.renderer.tpMark)) === null);

// 3) 地图打开期间按住鼠标不触发挖掘/挥剑
await page.evaluate(() => { window.__swGame.mining = null; });
await page.mouse.move(700, 450);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 600));
const actions = await page.evaluate(() => ({
  mining: window.__swGame.mining !== null,
  swing: window.__swGame.swing !== null,
}));
await page.mouse.up();
check('地图打开时按住鼠标不挖掘', !actions.mining);
check('地图打开时按住鼠标不挥剑', !actions.swing);

// 4) 原地点击（<6px）→ 预选传送点
await page.mouse.down();
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
const tp1 = await page.evaluate(() => window.__swGame.renderer.tpMark);
check('原地点击预选传送点', tp1 !== null);

// 5) 同点再点 → 传送（地图关闭）
await page.mouse.down();
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
const final = await page.evaluate(() => ({
  open: window.__swGame.renderer.fullMap.open,
  tpMark: window.__swGame.renderer.tpMark,
}));
check('同点二次点击传送并关图', final.open === false && final.tpMark === null);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
