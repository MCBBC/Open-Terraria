// 一次性:面具 2112 头部渲染端到端（画面像素差 + compositePaperDoll 双证据）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const inv = g.player.inv;
  const mask = window.__swFlow.itemByKey('vi_2112_EyeMask');
  // 证据①:compositePaperDoll({head:154}) 成帧且与无装备帧像素不同
  const { compositePaperDoll } = await import('/src/player/PaperDoll.ts');
  const app = g.player.appearance ?? (await import('/src/player/Appearance.ts')).defaultAppearance();
  const bare = compositePaperDoll(app, {});
  let masked = compositePaperDoll(app, { head: 154 });
  if (!masked) {   // Armor_Head_154 懒加载首查触发后台加载——等就绪再合成
    await new Promise((r) => setTimeout(r, 900));
    masked = compositePaperDoll(app, { head: 154 });
  }
  const dollOk = { bareOk: !!bare, maskedOk: !!masked, w: masked?.width, h: masked?.height };
  let pixelDiff = -1;
  if (bare && masked && bare.width === masked.width && bare.height === masked.height) {
    const a = bare.getContext('2d').getImageData(0, 0, bare.width, bare.height).data;
    const b = masked.getContext('2d').getImageData(0, 0, masked.width, masked.height).data;
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff++;
    pixelDiff = diff;
  }
  // 证据②:游戏画面级——戴/不戴渲染两帧,主画布哈希差
  const canvas = g.renderer.canvas;
  const shot = async () => {
    g.fixedUpdate(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  };
  inv.armor[10] = null;
  const s1 = await shot();
  inv.armor[10] = { id: mask, stack: 1 };
  const s2 = await shot();
  inv.armor[10] = null;
  let sceneDiff = 0;
  const step = 40;
  for (let i = 0; i < s1.length; i += step) if (s1[i] !== s2[i]) sceneDiff++;
  return { mask, dollOk, pixelDiff, sceneDiff };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
