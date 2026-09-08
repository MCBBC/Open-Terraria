// ★SW-BN6 一次性诊断:variant 10 纸娃娃烘焙链就绪面逐通道核对
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const pd = await import('/src/player/PaperDoll.ts');
  const uit = await import('/src/vui/assets/UITextures.ts');
  const ap = await import('/src/player/Appearance.ts');
  const a = { ...pd.DOLL_APPEARANCE ?? { skinVariant: 10, hair: 15 } };
  // 触发加载:逐通道 query
  const rows = [];
  const need = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 15];
  for (const s of need) {
    const name = pd.variantSheetName ? pd.variantSheetName(10, s, (n) => uit.UITextures.has(n)) : `Player_10_${s}.png`;
    const has = uit.UITextures.has(name);
    const got = uit.UITextures.get(name);
    rows.push({ s, name, has, loaded: !!got });
  }
  // 烘焙尝试（variant 10 + 空/带甲）
  let bake = null, bakeErr = null;
  try { bake = pd.compositePaperDoll(pd.DOLL_APPEARANCE, { head: null, body: null, legs: null }); } catch (e) { bakeErr = String(e).slice(0, 120); }
  // 预载重试（等 2s）
  await new Promise((r) => setTimeout(r, 2000));
  let bake2 = null;
  try { bake2 = pd.compositePaperDoll(pd.DOLL_APPEARANCE, { head: null, body: null, legs: null }); } catch (e) { bakeErr = String(e).slice(0, 120); }
  return {
    maleIncludes10: ap.MALE_VARIANTS.includes(10),
    rows, bakeKind: bake ? bake.constructor.name : null, bake2Kind: bake2 ? bake2.constructor.name : null, bakeErr,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
