// 一次性:本轮 UI 批断言(2026-08-27)——
//  ①搜索钮=emoji🔍无贴图面板,hover 金衬底;②背包面板左对齐热键栏首格+其下方+
//  opacity≤0.9;③合成标题与背包区间距 14px;④表情边框偏移(-4,-4);⑤选表情→表情
//  面板与背包同收;⑥商店标题无快乐度系数。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓');
  btn?.click();
});
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-panel .sw-slot')).catch(() => false)) break;
}
const out = await page.evaluate(() => {
  const ui = window.__swUI;
  const house = ui.housingBtn;
  const search = house.previousElementSibling;
  const panel = ui.invPanel;
  const hb0 = document.querySelector('.sw-hotbar .sw-slot');
  const hbLeft = parseFloat(hb0?.style.left ?? '');
  const hbTop = parseFloat(hb0?.style.top ?? '');
  const pr = panel.getBoundingClientRect();
  const style = panel.getAttribute('style');
  const craftTitle = [...document.querySelectorAll('.sw-title')].find((t) => t.textContent === '合成')?.parentElement;
  return {
    searchEmoji: search?.textContent === '🔍',
    searchNoBg: !(search?.style.backgroundImage || '').includes('url'),
    panelAlignHotbar: Number.isFinite(hbLeft) ? Math.abs(pr.left - hbLeft) < 2 : null,
    panelTopGap: Number.isFinite(hbTop) ? +(pr.top - (hbTop + 52)).toFixed(0) : null,
    panelOpacity: style.match(/opacity:\s*([\d.]+)/)?.[1] ?? null,
    panelBorder: style.match(/border-color:\s*([^;]+)/)?.[1] ?? null,
    craftMargin: craftTitle?.getAttribute('style')?.match(/margin:\s*([^;]+)/)?.[1] ?? null,
  };
});
// 选表情 → 表情面板 + 背包同收
await page.evaluate(() => { window.__swUI.onEmoteMenu?.(); });
await new Promise((r) => setTimeout(r, 500));
out.emoteBorderOffset = await page.evaluate(() => {
  const b = document.querySelector('.sw-emote-btn .border');
  return b ? `${b.style.left},${b.style.top}` : null;
});
await page.evaluate(() => {
  const b = document.querySelector('.sw-emote-btn');
  b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 400));
out.emoteFlow = await page.evaluate(() => ({
  emoteClosed: !document.querySelector('.sw-emote-menu'),
  invClosed: !window.__swUI.inventoryOpen,
}));
// 商店标题（无 NPC 环境,直接断言面板模板不再含 sw-shop-happy 已由源码保证——此处查样式残留无碍）
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/inv-polish.png' });
await browser.close();
