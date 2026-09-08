// IIIII221 干净单条截图：清空 tips → addNewTip 一次 → 等 0.8s（appear 动画落定）
// → 截提示条带。需要已挂载 __swGenUi 的生成屏（复用 _iiii221-tipsub 导航流）。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const OUT = process.env.I221_OUT ?? '/tmp/iii221-out';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.bringToFront();   // 无头 rAF 节流解除（_iii216-seedicon 先例）
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
let vselOk = false;
for (let i = 0; i < 20 && !vselOk; i++) {
  await page.click('[data-act=sp]').catch(() => {});
  vselOk = await page.waitForSelector('.sw-vsel', { timeout: 1600 }).then(() => true).catch(() => false);
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('提示替换探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 400));
await page.click('[data-f=seed]');
await page.keyboard.type('iiii221tipshot');
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
  opts[0]?.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.click('[data-act=create]');
const mounted = await page.waitForFunction(() => !!window.__swGenUi, { timeout: 30000 }).then(() => true).catch(() => false);
if (!mounted) { console.log('FAIL: __swGenUi 未挂载'); await browser.close(); process.exit(1); }

// 快滚到 SmartCursor 条出现在 tips 集合,然后清空重加单条
let text = null;
for (let i = 0; i < 120 && !text; i++) {
  text = await page.evaluate(() => {
    const ui = window.__swGenUi;
    if (!ui) return null;
    if (typeof ui.addNewTip === 'function') ui.addNewTip();
    const hit = (ui.tips ?? []).map((t) => t.text).find((t) => /可切换光标模式/.test(t));
    if (!hit) return null;
    ui.tips.length = 0;            // 清空(仅留目标单条,防并行随机条同位叠画)
    ui.tips.push({ text: hit, spawnTime: ui.time - 2 });   // num=2s=稳态居中(排除锚动画边界)
    // 摘除 state 子元素（header/bar;定谳:预览面板不在此树,居中短 tip 仍被其
    // 遮挡——215b 自定预览的既有层叠,非本批替换层问题,工件以长 tip 探出端为准）
    try { ui.removeAllChildren(); } catch { /* 容错 */ }
    return hit;
  });
  await new Promise((r) => setTimeout(r, 100));
}
if (!text) { console.log('FAIL: 120 轮未滚到 SmartCursor 条'); await browser.close(); process.exit(1); }
const pump1 = await page.evaluate(() => window.__swGenUi?.time ?? -1);
await new Promise((r) => setTimeout(r, 1500));
const pump2 = await page.evaluate(() => window.__swGenUi?.time ?? -1);
const diag = await page.evaluate(() => {
  const ui = window.__swGenUi;
  return { mounted: !!ui, time: ui?.time, tips: ui ? ui.tips.map((t) => ({ text: t.text.slice(0, 24), spawnTime: t.spawnTime })) : null,
    inGame: !!window.__swGame };
});
const full = await page.screenshot();
writeFileSync(`${OUT}/tips-centered-full.png`, full);
const buf = await page.screenshot({ clip: { x: 0, y: 520, width: 1360, height: 240 } });
writeFileSync(`${OUT}/tips-centered.png`, buf);
console.log(JSON.stringify({ ok: true, tip: text, pumpRate: (pump2 - pump1).toFixed(3) + '/1.5s', diag }, null, 2));
console.log('PASS: 单条居中截图 ' + OUT + '/tips-centered.png');
await browser.close();
process.exit(0);
