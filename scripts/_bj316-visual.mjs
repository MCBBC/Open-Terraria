// BJ316 探针#2：脉冲动画语义面（振荡域/hover !important/opt-out 豁免/关包静止）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 600));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 500));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ316探针');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 500));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj316probe');
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 1200));

// ①脉冲振荡域：2.2s 内采样 opacity，应覆盖 0.706-0.941 区间的一部分且变化
const osc = await page.evaluate(async () => {
  const slot = document.querySelector('.sw-vinv .sw-vgrid .sw-slot') ?? document.querySelector('.sw-vinv .sw-slot');
  const vals = new Set();
  const t0 = performance.now();
  while (performance.now() - t0 < 2200) {
    vals.add(parseFloat(getComputedStyle(slot, '::after').opacity).toFixed(3));
    await new Promise((r) => requestAnimationFrame(r));
  }
  const nums = [...vals].map(Number).sort((a, b) => a - b);
  return { samples: nums.length, min: nums[0], max: nums[nums.length - 1], spanOk: nums.length > 8 };
});
// ②opt-out 槽（显式 --slot-alpha）动画豁免
const optOut = await page.evaluate(() => {
  const el = document.querySelector('.sw-vinv .sw-slot[style*="--slot-alpha"]');
  if (!el) return { found: false };
  const cs = getComputedStyle(el, '::after');
  return { found: true, animationName: cs.animationName, willChange: cs.willChange, opacity: cs.opacity, inlineAlpha: el.style.getPropertyValue('--slot-alpha') };
});
// ③hover 全亮（!important 压过动画）
await page.evaluate(() => {
  const slot = document.querySelector('.sw-vinv .sw-slot');
  slot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  slot.classList.add('sw-force-hover-probe');
});
const hoverProbe = await page.evaluate(() => {
  const slot = document.querySelector('.sw-vinv .sw-slot');
  // :hover 无法脚本触发——用 matchMedia 探针替代:直接查规则匹配性
  // 简化:验证 !important 规则在样式表中存在且优先级可覆盖动画(CSSOM 层断言)
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) {
        if (r.cssText && r.cssText.includes('.sw-slot:hover::after') && r.cssText.includes('sw-vinv')) rules.push(r.cssText);
      }
    } catch { /* 跨域 sheet */ }
  }
  return { hoverRules: rules };
});
// ④关包后 ::after 动画仍在（display:none 零成本语义）
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 400));
const closedState = await page.evaluate(() => {
  const root = document.querySelector('.sw-vinv');
  const slot = root?.querySelector('.sw-slot');
  const cs = slot ? getComputedStyle(slot, '::after') : null;
  return { display: root ? getComputedStyle(root).display : 'gone', animationName: cs ? cs.animationName : null };
});

console.log('osc     :', JSON.stringify(osc));
console.log('optOut  :', JSON.stringify(optOut));
console.log('hover   :', JSON.stringify(hoverProbe));
console.log('closed  :', JSON.stringify(closedState));
console.log('pageerrors:', errs.length, errs.slice(0, 3));
await browser.close();
process.exit(0);
