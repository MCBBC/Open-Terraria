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

// ---- 更衣窗/理发窗形态（dresser/salon）：页内直构模块冒烟 ----
const modeInfo = await page.evaluate(async () => {
  const { CharCreation } = await import('/src/ui/CharCreation.ts');
  const root = document.getElementById('game-root');
  const base = { name: 't', hair: 3, skinVariant: 0,
    hairColor: { r: 200, g: 60, b: 60 }, skinColor: { r: 255, g: 125, b: 90 }, eyeColor: { r: 105, g: 90, b: 75 },
    shirtColor: { r: 175, g: 165, b: 140 }, undershirtColor: { r: 160, g: 180, b: 215 },
    pantsColor: { r: 255, g: 230, b: 175 }, shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 0 };
  const out = {};
  const newest = () => [...document.querySelectorAll('.sw-char-panel')].pop();
  const d = new CharCreation(root, { onCreate() {}, onCancel() {} }, { dresser: true, initial: { ...base } });
  const dPanel = newest();
  out.dresserTabs = [...dPanel.querySelectorAll('.sw-cc-tab')].map((b) => b.dataset.tab);
  dPanel.querySelector('.sw-cc-tab[data-tab=color]').click();
  await new Promise((r) => setTimeout(r, 150));
  out.dresserParts = dPanel.querySelectorAll('.sw-cc-part').length;        // 6（无头发）
  out.dresserBack = dPanel.querySelector('[data-act=back]').textContent;
  out.dresserCreate = dPanel.querySelector('[data-act=create]').textContent;
  d.close();
  const s = new CharCreation(root, { onCreate() {}, onCancel() {} }, { hairSalon: true, initial: { ...base }, priceOf: () => 1234 });
  const sPanel = newest();
  out.salonTabs = [...sPanel.querySelectorAll('.sw-cc-tab')].map((b) => b.dataset.tab);
  sPanel.querySelector('.sw-cc-tab[data-tab=color]').click();
  await new Promise((r) => setTimeout(r, 150));
  out.salonParts = sPanel.querySelectorAll('.sw-cc-part').length;          // 1（仅发色）
  out.salonBack = sPanel.querySelector('[data-act=back]').textContent;
  out.salonPriceBtn = sPanel.querySelector('[data-act=create]').textContent;
  window.__ccSalon = s;   // 保持打开供截图
  return out;
});
await new Promise((r) => setTimeout(r, 900));
await shot('5-salon');

console.log(JSON.stringify({
  errs: errs.slice(0, 8),
  diffInfo, lookInfo, hairInfo,
  colorInfo0, colorInfo1, colorInfo2,
  nameInfo, geo, modeInfo,
}, null, 1));
await browser.close();
