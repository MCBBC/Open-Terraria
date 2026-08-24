// 拾取飘字计数探针（PopupText.NewText Item 分支对齐验证）：
// ①连拾 5 次土块 → 单条飘字 "土块 (5)"（合并计数,不重复多条）
// ②拾石头 → 独立第二条飘字（不同名共存）
// ③铜币×3 + 银币×1 → 跨面额合并 "1 银币 3 铜币" + 银档色
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5215';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
const clickRetry = async (sel, tries = 5) => {
  for (let i = 0; i < tries; i++) {
    try { await page.click(sel); return; } catch (e) { await new Promise(r => setTimeout(r, 600)); }
  }
  throw new Error('click failed: ' + sel);
};
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await clickRetry('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await clickRetry('.sw-char-row input[type=text]');
  await page.keyboard.type('计数');
  await new Promise(r => setTimeout(r, 200));
  await clickRetry('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await clickRetry('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await clickRetry('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const keys = window.__swItems;
  const findKey = (vid) => Object.keys(keys).find((k) => new RegExp(`^vi_${vid}_`).test(k));
  const dirt = findKey(2), stone = findKey(3), copper = findKey(71), silver = findKey(72);
  if (!dirt || !stone || !copper || !silver) return { fail: 'key missing', dirt, stone, copper, silver };
  const dirtId = keys[dirt];
  const labels = () => g.dmgNumbers.filter((d) => d.label).map((d) => ({ t: d.label, c: d.color, s: d.stack }));
  // 直接驱动被测单元 showPickupLabel（拾取物理/孤儿掉落无关——调用侧 picked=入包数
  // 已在 ItemDrop.ts 接线；此处验证合并/计数/钱币档位逻辑本身）
  // ①土块×5（逐次 1 个）
  for (let i = 0; i < 5; i++) g.showPickupLabel(dirt, 1);
  const afterDirt = labels();
  // ②石头×1（不同名共存）
  g.showPickupLabel(stone, 1);
  const afterStone = labels();
  // ③一次拾 3 个（新建即带计数）
  g.showPickupLabel(dirt, 3);
  const afterDirt3 = labels();
  // ④钱币跨面额合并
  g.showPickupLabel(copper, 3);
  const afterCopper = labels();
  g.showPickupLabel(silver, 1);
  const afterSilver = labels();
  return { afterDirt, afterStone, afterDirt3, afterCopper, afterSilver };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
const L = (arr) => arr ?? [];
const dirtLabel = L(res.afterDirt).find((l) => l.t.includes('(5)'));
const oneDirt = L(res.afterDirt).length === 1;
const stoneCoexist = L(res.afterStone).length === 2;
const dirt3 = L(res.afterDirt3).some((l) => l.t.includes('(8)'));   // 5+3 累计
const copperOk = L(res.afterCopper).some((l) => l.t.includes('3'));
const silverOk = L(res.afterSilver).some((l) => l.t.includes('银') && l.t.includes('3') && l.c === '#B5C0C1');
const ok = res && !res.fail && dirtLabel && oneDirt && stoneCoexist && dirt3 && copperOk && silverOk;
console.log(ok ? '✅ 拾取飘字合并计数全过' : '❌ 断言未过');
process.exit(ok ? 0 : 1);
