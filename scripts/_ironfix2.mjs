import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199/?vuidemo=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI?.ui?.current, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
const result = await page.evaluate(async () => {
  const { compositePaperDoll } = await import('/src/player/PaperDoll.ts');
  const { defaultAppearance } = await import('/src/player/Appearance.ts');
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const a = defaultAppearance('t');
  const iron = compositePaperDoll(a, { head: 2, body: 2, legs: 2 });
  const ctx = iron.getContext('2d');
  // 合成帧0 = 源贴图帧0 原样（盔甲不调色）→ 逐像素对比头部/躯干区域
  const headTex = await load('sprites/vanilla-ui/Armor_Head_2.png');
  const bodyTex = await load('sprites/vanilla-ui/Armor_Armor_2.png');
  if (!headTex || !bodyTex) return { fail: true, head: !!headTex, body: !!bodyTex };
  // 头盔：Armor_Head_2 帧0（0,0,40,56）
  const c1 = document.createElement('canvas'); c1.width = 40; c1.height = 56;
  const x1 = c1.getContext('2d'); x1.drawImage(headTex, 0, 0, 40, 56, 0, 0, 40, 56);
  // 身甲躯干格：复合网格 (0,0)（男 dy=0，torsoX=0 行0）
  const c2 = document.createElement('canvas'); c2.width = 40; c2.height = 56;
  const x2 = c2.getContext('2d'); x2.drawImage(bodyTex, 0, 0, 40, 56, 0, 0, 40, 56);
  const cmp = (cv) => {
    const A = ctx.getImageData(0, 0, 40, 56).data;
    const B = cv.getContext('2d').getImageData(0, 0, 40, 56).data;
    let hit = 0, miss = 0;
    for (let i = 0; i < A.length; i += 4) {
      const aOn = A[i + 3] > 40, bOn = B[i + 3] > 40;
      if (aOn && bOn) {
        const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        d < 30 ? hit++ : miss++;
      } else if (aOn !== bOn) miss++;
    }
    return { hit, miss };
  };
  return { headVs: cmp(c1), torsoVs: cmp(c2) };
});
console.log(JSON.stringify(result));
await browser.close();
