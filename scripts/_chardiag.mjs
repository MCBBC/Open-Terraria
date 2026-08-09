// 捏人系统逐控件诊断
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR:', m.text().slice(0, 200)); });
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI?.ui?.current?.constructor?.name === 'TitleState', { timeout: 120000 });
const ui = await page.evaluate(() => window.innerWidth / window.__swVUI.ui.getDimensions().width);
const click = async (x, y) => page.mouse.click(Math.round(x * ui), Math.round(y * ui));
// 标题→单人→新建
await click(480, 228);
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'UICharacterSelectState', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 700));
await click(274, 463);
await page.waitForFunction(() => window.__swVUI.ui.current?.constructor?.name === 'UICharacterCreationState', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));

const dumpAppearance = () => page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  return { hair: st.appearance.hair, skinVariant: st.appearance.skinVariant,
    hairColor: st.appearance.hairColor, category: st.activeCategory, colorKey: st.activeColor };
});
console.log('初始:', JSON.stringify(await dumpAppearance()));

// 1. 取色器图标 → color 视图
await click(200 + 14 + 180 + 2 * 38 + 19, 80 + 14 + 36 + 19);
await new Promise((r) => setTimeout(r, 300));
console.log('点取色器后:', JSON.stringify(await dumpAppearance()));

// 2. HSL 滑条拖动（色相滑条在内容区 y0+44+15 附近）
const before = await dumpAppearance();
await page.mouse.move(Math.round((214 + 20) * ui), Math.round((80 + 14 + 44 + 44 + 15) * ui));
await page.mouse.down();
await new Promise((r) => setTimeout(r, 100));
await page.mouse.move(Math.round((214 + 160) * ui), Math.round((80 + 14 + 44 + 44 + 15) * ui), { steps: 5 });
await new Promise((r) => setTimeout(r, 100));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 200));
const after = await dumpAppearance();
console.log('滑条拖动 前后 hairColor:', JSON.stringify(before.hairColor), '→', JSON.stringify(after.hairColor));

// 3. 发型页签 → 点第一个发型按钮
await click(214 + 180 + 2 * 90 + 22, 118);
await new Promise((r) => setTimeout(r, 500));
await click(214 + 30, 80 + 14 + 44 + 30 + 30);
await new Promise((r) => setTimeout(r, 300));
console.log('发型点击后:', JSON.stringify(await dumpAppearance()));

// 4. 衣服页签 → 点第 3 个样式
await click(214 + 180 + 90 + 22, 118);
await new Promise((r) => setTimeout(r, 400));
await click(214 + 2 * 66 + 22, 80 + 14 + 44 + 44 + 40);
await new Promise((r) => setTimeout(r, 300));
console.log('衣服点击后:', JSON.stringify(await dumpAppearance()));

// 5. 随机按钮（衣服页底 rand at left=80）
await click(214 + 80 + 16, 80 + 14 + 44 + 190 + 16);
await new Promise((r) => setTimeout(r, 300));
console.log('随机后:', JSON.stringify(await dumpAppearance()));

// 6. 名字框聚焦 + 输入
await click(214 + 180 + 160, 193);
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.type('勇者甲');
await new Promise((r) => setTimeout(r, 200));
console.log('名字:', await page.evaluate(() => window.__swVUI.ui.current.appearance.name));

// 7. 预览纸娃娃是否在渲染（像素采样 ui-canvas 左侧预览区）
const px = await page.evaluate(() => {
  const c = document.getElementById('ui-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  // 预览区逻辑坐标 (234..293, 174..232) × scale 1.333 → 物理
  let n = 0;
  for (let y = 232; y < 310; y += 2) for (let x = 312; x < 392; x += 2) {
    const i = (y * c.width + x) * 4;
    if (d[i + 3] > 0 && (Math.abs(d[i] - d[i + 1]) > 15 || Math.abs(d[i + 1] - d[i + 2]) > 15)) n++;
  }
  return n;
});
console.log('预览区彩色像素:', px);
await browser.close();
