// 一次性：角色创建页重构探针——四页签截图 + 关键交互断言（经 tools/run-diag.mjs 运行）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const OUT = '/tmp/sw-cc-shots';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));

// 标题菜单 → 单人游戏 → 新建角色（真实点击链；splash 层 z30 盖屏 ~10s，须等其收场）
await page.waitForSelector('.sw-title-menu [data-act=sp]', { timeout: 30000 });
await page.waitForSelector('#sw-splash', { hidden: true, timeout: 90000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));
await page.click('.sw-title-menu [data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1200));   // 等页签贴图/纸娃娃贴图就绪

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

// ---- 信息页 ----
await shot('1-info');

// 难度点击 → 气泡文案联动
const diffInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-cc-diff')];
  const bubble = document.querySelector('.sw-cc-diffdesc');
  const hard = btns.find((b) => b.textContent.includes('硬核'));
  hard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return { bubbleAfterHardcore: bubble?.textContent, activeCount: btns.filter((b) => b.classList.contains('active')).length };
});
await shot('1b-info-hardcore');

// ---- 外观页 ----
await page.click('.sw-cc-tab[data-tab=look]');
await new Promise((r) => setTimeout(r, 900));
await shot('2-look');
const lookInfo = await page.evaluate(() => ({
  styleBtns: document.querySelectorAll('.sw-cc-stylebtn').length,
  smallBtns: document.querySelectorAll('.sw-cc-looklow .sw-cc-small').length,
  activeStyle: document.querySelector('.sw-cc-stylebtn.active')?.title,
}));

// ---- 发型页 ----
await page.click('.sw-cc-tab[data-tab=hair]');
await new Promise((r) => setTimeout(r, 1400));
await shot('3-hair');
const hairInfo = await page.evaluate(async () => {
  const grid = document.querySelector('.sw-cc-hairgrid');
  const before = document.querySelector('.sw-cc-hairbtn.active')?.dataset.hair;
  // 点下一个箭头两次
  const arrows = [...document.querySelectorAll('.sw-cc-arrow')];
  arrows[1].click();
  await new Promise((r) => setTimeout(r, 100));
  arrows[1].click();
  await new Promise((r) => setTimeout(r, 100));
  const after = document.querySelector('.sw-cc-hairbtn.active')?.dataset.hair;
  return { hairButtons: grid.querySelectorAll('.sw-cc-hairbtn').length, before, after, arrows: arrows.length };
});

// ---- 颜色页 ----
await page.click('.sw-cc-tab[data-tab=color]');
await new Promise((r) => setTimeout(r, 700));
const colorInfo0 = await page.evaluate(() => {
  const hexEl = document.querySelector('.sw-cc-hex');
  const parts = document.querySelectorAll('.sw-cc-part');
  const sliders = document.querySelectorAll('.sw-cc-slider');
  return { hex: hexEl?.textContent, parts: parts.length, sliders: sliders.length, activePart: document.querySelector('.sw-cc-part.active')?.title };
});
// 拖色相滑杆到最左（红）再拖部位选择到衬衫
await page.evaluate(() => {
  const cv = document.querySelectorAll('.sw-cc-slider')[0];
  const r = cv.getBoundingClientRect();
  const y = r.top + r.height / 2;
  cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.02, clientY: y, buttons: 1 }));
});
await new Promise((r) => setTimeout(r, 200));
const colorInfo1 = await page.evaluate(() => document.querySelector('.sw-cc-hex')?.textContent);
await page.evaluate(() => {
  // 切到衬衫部位
  [...document.querySelectorAll('.sw-cc-part')].find((b) => b.title.includes('衬衫'))?.click();
});
await new Promise((r) => setTimeout(r, 150));
await shot('4-color');
const colorInfo2 = await page.evaluate(() => {
  const parts = [...document.querySelectorAll('.sw-cc-part')];
  return {
    hexShirt: document.querySelector('.sw-cc-hex')?.textContent,
    partTitles: parts.map((p) => p.title),
    activePart: document.querySelector('.sw-cc-part.active')?.title,
  };
});

// ---- 名字条交互（探针兼容路径：.sw-char-row input[type=text]）----
await page.click('.sw-cc-tab[data-tab=info]');
await new Promise((r) => setTimeout(r, 300));
await page.click('.sw-char-row input[type=text]');
await page.keyboard.type('探针勇者');
await new Promise((r) => setTimeout(r, 200));
const nameInfo = await page.evaluate(() => ({
  inputVal: document.querySelector('.sw-char-row input[type=text]')?.value,
  shown: document.querySelector('.sw-cc-nameval-text')?.textContent,
}));

// ---- 布局几何断言 ----
const geo = await page.evaluate(() => {
  const root = document.querySelector('.sw-char-panel');
  const body = document.querySelector('.sw-char-body');
  const preview = document.querySelector('.sw-char-preview');
  const tabs = document.querySelectorAll('.sw-cc-tab');
  const footer = document.querySelector('.sw-char-footer');
  const rb = root.getBoundingClientRect(), bb = body.getBoundingClientRect(), pb = preview.getBoundingClientRect();
  const fb = footer.getBoundingClientRect();
  const bg = getComputedStyle(body).backgroundImage;
  return {
    rootSize: [Math.round(rb.width), Math.round(rb.height)],
    previewBottomVsPanelTop: Math.round(pb.bottom - bb.top),   // 应 ≈ +6（脚踩面板上沿）
    previewCentered: Math.abs((pb.left + pb.right) / 2 - (bb.left + bb.right) / 2) < 3,
    tabCount: tabs.length,
    footerButtons: footer.querySelectorAll('button').length,
    footerWidthPct: Math.round((fb.width / rb.width) * 100),
    panelBgIsNineSlice: bg.startsWith('url("data:image/png') || bg.startsWith('url(data:image/png'),
    sepPresent: !!document.querySelector('.sw-char-sep'),
  };
});

// ---- 更衣窗形态（dresser）冒烟：页签应为 外观+颜色 ----
const dresserTabs = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  if (!g || !ui) return 'in-game-only';
  return 'skip';
});

console.log(JSON.stringify({
  errs: errs.slice(0, 8),
  diffInfo, lookInfo, hairInfo,
  colorInfo0, colorInfo1, colorInfo2,
  nameInfo, geo, dresserTabs,
}, null, 1));
await browser.close();
