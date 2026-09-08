// IIIII221 世界生成屏提示条 token 替换 headless 探针（④截图验证）。
// 流同 _preview-e2e（splash→单人→角色→世界→创建,小世界）;经 __swGenUi
// （mainFlow.ts:1082 探针句柄）轮询+快滚提示池,断言滚定文本零裸 {Token},
// 并对底部提示条截图（替换后含真实键位名 Ctrl/R·Ctrl）。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const OUT = process.env.I221_OUT ?? '/tmp/iii221-out';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));

let vselOk = false;
for (let i = 0; i < 20 && !vselOk; i++) {
  await page.click('[data-act=sp]').catch(() => {});
  vselOk = await page.waitForSelector('.sw-vsel', { timeout: 1600 }).then(() => true).catch(() => false);
}
if (!vselOk) { console.log('FAIL: 角色面板未出现'); console.log('errs:', errs.slice(0, 3)); await browser.close(); process.exit(1); }
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
await page.keyboard.type('iiii221tipsub');
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
  opts[0]?.click();   // 小世界
});
await new Promise((r) => setTimeout(r, 300));
await page.click('[data-act=create]');

// 等 __swGenUi 挂载（mainFlow.ts:1082）
const mounted = await page.waitForFunction(() => !!window.__swGenUi, { timeout: 30000 }).then(() => true).catch(() => false);
if (!mounted) { console.log('FAIL: __swGenUi 未挂载'); console.log('errs:', errs.slice(0, 3)); await browser.close(); process.exit(1); }

// 采样自然滚定条 + 快滚补样（addNewTip 是 UI 私有掷子,与 worldgen RNG 零共享）
const seen = new Set();
let smartCursorTip = null;
let stripped = false;
for (let round = 0; round < 90 && !smartCursorTip; round++) {
  const texts = await page.evaluate(() => {
    const ui = window.__swGenUi;
    if (!ui) return null;
    if (typeof ui.addNewTip === 'function') ui.addNewTip();   // 快滚（私有,UI 层）
    return (ui.tips ?? []).map((t) => t.text);
  });
  if (texts) for (const t of texts) {
    seen.add(t);
    if (/可切换光标模式/.test(t)) smartCursorTip = t;
  }
  // 命中 SmartCursor 条（或首轮有落定条）时截提示条带（实测渲染带 y≈560-700）
  if (smartCursorTip && !stripped) {
    stripped = true;
    const buf = await page.screenshot({ clip: { x: 0, y: 540, width: 1360, height: 200 } });
    writeFileSync(`${OUT}/tips-strip.png`, buf);
  }
  await new Promise((r) => setTimeout(r, 120));
}
// 全屏留档（生成屏中段）
const full = await page.screenshot();
writeFileSync(`${OUT}/gen-screen-full.png`, full);
const texts = [...seen];
const leaked = texts.filter((t) => /\{[A-Za-z]/.test(t));
console.log(JSON.stringify({
  tipCount: texts.length,
  smartCursorTip,
  sample: texts.slice(0, 6),
  leakedRawTokens: leaked.slice(0, 5),
  pageErrors: errs.slice(0, 3),
}, null, 2));
const ok = texts.length > 0 && leaked.length === 0 && smartCursorTip && /Ctrl/.test(smartCursorTip) && errs.length === 0;
console.log(ok
  ? `PASS: 提示条替换态（SmartCursor 条="${smartCursorTip}",零裸 token）`
  : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
