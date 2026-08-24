// 一次性：角色创建页二轮重制探针——10 一级页签四页截图 + 几何断言（经 tools/run-diag.mjs 运行）
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_charcreation-remaster-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
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
await new Promise((r) => setTimeout(r, 1500));   // 等页签贴图/纸娃娃贴图就绪

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

// ---- 页1：信息（10 页签 + 名字条 + 难度列 + 气泡）----
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

// ---- 页2：服装（10 样式钮 + 分隔线 + 模板小钮）----
await page.click('.sw-cc-tab[data-tab=look]');
await new Promise((r) => setTimeout(r, 900));
await shot('2-look');
const lookInfo = await page.evaluate(() => ({
  styleBtns: document.querySelectorAll('.sw-cc-stylebtn').length,
  smallBtns: document.querySelectorAll('.sw-cc-looklow .sw-cc-small').length,
  sep: !!document.querySelector('.sw-cc-looksep'),
  activeStyle: document.querySelector('.sw-cc-stylebtn.active')?.title,
}));

// ---- 页3：发型 ----
await page.click('.sw-cc-tab[data-tab=hair]');
await new Promise((r) => setTimeout(r, 1400));
await shot('3-hair');
const hairInfo = await page.evaluate(async () => {
  const grid = document.querySelector('.sw-cc-hairgrid');
  const before = document.querySelector('.sw-cc-hairbtn.active')?.dataset.hair;
  const arrows = [...document.querySelectorAll('.sw-cc-arrow')];
  arrows[1].click();
  await new Promise((r) => setTimeout(r, 100));
  arrows[1].click();
  await new Promise((r) => setTimeout(r, 100));
  const after = document.querySelector('.sw-cc-hairbtn.active')?.dataset.hair;
  return { hairButtons: grid.querySelectorAll('.sw-cc-hairbtn').length, before, after, arrows: arrows.length };
});

// ---- 页4：发色页签（颜色页 = 三滑杆 + HEX + 三小钮，无部位选择行）----
await page.click('.sw-cc-tab[data-tab=hairColor]');
await new Promise((r) => setTimeout(r, 700));
const colorInfo0 = await page.evaluate(() => ({
  hex: document.querySelector('.sw-cc-hex')?.textContent,
  parts: document.querySelectorAll('.sw-cc-part').length,   // 应为 0（部位=页签）
  sliders: document.querySelectorAll('.sw-cc-slider').length,
  smalls: document.querySelectorAll('.sw-cc-colorlow .sw-cc-small').length,
}));
// 拖色相滑杆到最左（红）
await page.evaluate(() => {
  const cv = document.querySelectorAll('.sw-cc-slider')[0];
  const r = cv.getBoundingClientRect();
  const y = r.top + r.height / 2;
  cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 22 + 3 + 1, clientY: y, buttons: 1 }));
});
await new Promise((r) => setTimeout(r, 300));
await shot('4-color-hair');
const colorInfo1 = await page.evaluate(() => ({
  hexAfterDrag: document.querySelector('.sw-cc-hex')?.textContent,
}));
// 切到衬衫页签再截图
await page.click('.sw-cc-tab[data-tab=shirt]');
await new Promise((r) => setTimeout(r, 300));
await shot('4b-color-shirt');
const colorInfo2 = await page.evaluate(() => ({
  hexShirt: document.querySelector('.sw-cc-hex')?.textContent,
}));

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

// ---- 布局几何断言（对齐原版 BuildPage :203-247）----
const geo = await page.evaluate(() => {
  const root = document.querySelector('.sw-char-panel');
  const body = document.querySelector('.sw-char-body');
  const preview = document.querySelector('.sw-char-preview');
  const tabs = [...document.querySelectorAll('.sw-cc-tab')];
  const footer = document.querySelector('.sw-char-footer');
  const rb = root.getBoundingClientRect(), bb = body.getBoundingClientRect();
  const pb = preview.getBoundingClientRect(), fb = footer.getBoundingClientRect();
  const tabRects = tabs.map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.left - bb.left), Math.round(r.width), Math.round(r.height)]; });
  const diffs = document.querySelector('.sw-cc-diffs')?.getBoundingClientRect();
  const bubble = document.querySelector('.sw-cc-diffdesc')?.getBoundingClientRect();
  const namebar = document.querySelector('.sw-cc-namebar')?.getBoundingClientRect();
  const bg = getComputedStyle(body).backgroundImage;
  const tabIcons = tabs.map((t) => ({
    tab: t.dataset.tab,
    imgs: t.querySelectorAll('img').length,
    tinted: t.querySelectorAll('.sw-cc-tinted').length,
    tintedHasBg: [...t.querySelectorAll('.sw-cc-tinted')].every((e) => (e.style.backgroundImage || '').startsWith('url(')),
  }));
  return {
    bodySize: [Math.round(bb.width), Math.round(bb.height)],
    previewSize: [Math.round(pb.width), Math.round(pb.height)],
    previewBottomVsPanelTop: Math.round(pb.bottom - bb.top),   // 应 ≈ +2（脚踩面板上沿）
    previewCentered: Math.abs((pb.left + pb.right) / 2 - (bb.left + bb.right) / 2) < 3,
    tabCount: tabs.length,
    tabLefts: tabRects.map((x) => x[0]),                        // 期望 0,48,...,432（面板内）
    tabSize: tabRects[0] ? [tabRects[0][1], tabRects[0][2]] : null,
    tabIcons,
    footerButtons: footer.querySelectorAll('button').length,
    footerBtnHeight: Math.round(footer.querySelector('button').getBoundingClientRect().height),
    namebarSize: namebar ? [Math.round(namebar.width), Math.round(namebar.height)] : null,
    diffsSize: diffs ? [Math.round(diffs.width), Math.round(diffs.height)] : null,
    bubbleSize: bubble ? [Math.round(bubble.width), Math.round(bubble.height)] : null,
    panelBgIsNineSlice: bg.startsWith('url("data:image/png') || bg.startsWith('url(data:image/png'),
    sepPresent: !!document.querySelector('.sw-char-sep'),
  };
});

// ---- 更衣窗/理发窗形态（dresser/salon）：页签集 = 服装+六色 / 发型+发色 ----
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
  dPanel.querySelector('.sw-cc-tab[data-tab=skin]').click();
  await new Promise((r) => setTimeout(r, 200));
  out.dresserSkinHex = dPanel.querySelector('.sw-cc-hex')?.textContent;
  out.dresserBack = dPanel.querySelector('[data-act=back]').textContent;
  out.dresserCreate = dPanel.querySelector('[data-act=create]').textContent;
  out.dresserTabLefts = [...dPanel.querySelectorAll('.sw-cc-tab')].map((b) => Math.round(b.getBoundingClientRect().left - dPanel.querySelector('.sw-char-body').getBoundingClientRect().left));
  window.__ccDresser = d;   // 保持打开供截图
  return out;
});
await new Promise((r) => setTimeout(r, 900));
await shot('6-dresser');
await page.evaluate(() => window.__ccDresser?.close());
const modeInfo2 = await page.evaluate(async () => {
  const { CharCreation } = await import('/src/ui/CharCreation.ts');
  const root = document.getElementById('game-root');
  const base = { name: 't', hair: 3, skinVariant: 0,
    hairColor: { r: 200, g: 60, b: 60 }, skinColor: { r: 255, g: 125, b: 90 }, eyeColor: { r: 105, g: 90, b: 75 },
    shirtColor: { r: 175, g: 165, b: 140 }, undershirtColor: { r: 160, g: 180, b: 215 },
    pantsColor: { r: 255, g: 230, b: 175 }, shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 0 };
  const s = new CharCreation(root, { onCreate() {}, onCancel() {} }, { hairSalon: true, initial: { ...base }, priceOf: () => 1234 });
  const sPanel = [...document.querySelectorAll('.sw-char-panel')].pop();
  const out = {};
  out.salonTabs = [...sPanel.querySelectorAll('.sw-cc-tab')].map((b) => b.dataset.tab);
  sPanel.querySelector('.sw-cc-tab[data-tab=hairColor]').click();
  await new Promise((r) => setTimeout(r, 200));
  out.salonHex = sPanel.querySelector('.sw-cc-hex')?.textContent;
  out.salonBack = sPanel.querySelector('[data-act=back]').textContent;
  out.salonPriceBtn = sPanel.querySelector('[data-act=create]').textContent;
  out.salonTabLefts = [...sPanel.querySelectorAll('.sw-cc-tab')].map((b) => Math.round(b.getBoundingClientRect().left - sPanel.querySelector('.sw-char-body').getBoundingClientRect().left));
  window.__ccSalon = s;   // 保持打开供截图
  return out;
});
await new Promise((r) => setTimeout(r, 900));
await shot('5-salon');
await new Promise((r) => setTimeout(r, 900));
await shot('5-salon');
await page.evaluate(() => window.__ccSalon?.close());

console.log(JSON.stringify({
  errs: errs.slice(0, 8),
  diffInfo, lookInfo, hairInfo,
  colorInfo0, colorInfo1, colorInfo2,
  nameInfo, geo, modeInfo, modeInfo2,
}, null, 1));
await browser.close();
