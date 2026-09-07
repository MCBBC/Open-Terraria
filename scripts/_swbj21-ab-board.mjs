// SW-BJ21 A/B 对比图:烘焙域 直接合成(与实机同源——drawPlayer 单 drawImage 直绘该产物)
//  左=修复后(链回退 4_*) 右=旧态(模拟 `v??0` 直落男表);×6 整帧 + 胸区 ×12 特写;
//  红罩=旧态缺画(镂空)像素。输出 /tmp/swbj21/bj21-ab-board.png
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5212';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj21-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|知道/.test(x.textContent || ''));
  if (b) b.click();
});
const dataUrl = await page.evaluate(async () => {
  const pd = await import('/src/player/PaperDoll.ts');
  const uit = await import('/src/vui/assets/UITextures.ts');
  const U = uit.UITextures;
  const app = { name: '无名角色', hair: 73, skinVariant: 6,
    hairColor: { r: 89, g: 49, b: 157 }, skinColor: { r: 222, g: 202, b: 169 },
    eyeColor: { r: 205, g: 73, b: 116 }, shirtColor: { r: 156, g: 74, b: 195 },
    undershirtColor: { r: 208, g: 50, b: 119 }, pantsColor: { r: 164, g: 71, b: 161 },
    shoeColor: { r: 113, g: 24, b: 26 }, difficulty: 0 };
  const equip = { head: null, body: null, legs: null };
  const opt = { rows: { body: 0, legs: 0 } };
  const oHas = U.has.bind(U);
  const bake = async () => {
    pd.clearPaperDollCache();
    let d = null;
    for (let k = 0; k < 60 && !d; k++) { d = pd.compositePaperDoll(app, equip, opt); if (!d) await new Promise((r) => setTimeout(r, 250)); }
    return d;
  };
  const after = await bake();
  U.has = (n) => !/^Player_(4|10)_/.test(n) && oHas(n);   // 旧态:4/10 表不可见
  const before = await bake();
  U.has = oHas;
  if (!after || !before) return null;
  // 合成板
  const Z = 6, C = 12;
  const cv = document.createElement('canvas');
  cv.width = 40 * Z * 2 + 60; cv.height = 56 * Z + 20 + 26 * C;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const grad = c.createLinearGradient(0, 0, 0, cv.height);
  grad.addColorStop(0, '#7ec0ee'); grad.addColorStop(1, '#4a7fb5');
  c.fillStyle = grad; c.fillRect(0, 0, cv.width, cv.height);
  const drawFrame = (doll, ox, oy) => c.drawImage(doll, 0, 0, 40, 56, ox, oy, 40 * Z, 56 * Z);
  const o1 = 20, o2 = 40 * Z + 40, oY = 16;
  drawFrame(after, o1, oY);
  drawFrame(before, o2, oY);
  // 红罩:旧态透明 & 修复后不透明(镂空缺画)
  const ca = document.createElement('canvas'); ca.width = ca.height = 56; ca.getContext('2d').drawImage(after, 0, 0, 40, 56, 0, 0, 40, 56);
  const cb = document.createElement('canvas'); cb.width = cb.height = 56; cb.getContext('2d').drawImage(before, 0, 0, 40, 56, 0, 0, 40, 56);
  const da = ca.getContext('2d').getImageData(0, 0, 40, 56).data;
  const db = cb.getContext('2d').getImageData(0, 0, 40, 56).data;
  c.fillStyle = 'rgba(255,32,32,0.85)';
  const holes = [];
  for (let y = 0; y < 56; y++) for (let x = 0; x < 40; x++) {
    if (db[(y * 40 + x) * 4 + 3] === 0 && da[(y * 40 + x) * 4 + 3] > 0) {
      c.fillRect(o2 + x * Z, oY + y * Z, Z, Z);
      holes.push([x, y]);
    }
  }
  // 胸区特写:两列各 ×12(y 22..48)
  const CZ = 12, cy0 = 24, ch = 24;
  const crop = (sx, ox) => c.drawImage(cv, sx, oY + cy0 * Z, 40 * Z, ch * Z, ox, 56 * Z + 20, 40 * C, ch * C * (40 * C) / (40 * C));
  c.drawImage(cv, o1, oY + cy0 * Z, 40 * Z, ch * Z, o1, 56 * Z + 20, 40 * C, ch * C);
  c.drawImage(cv, o2, oY + cy0 * Z, 40 * Z, ch * Z, o2, 56 * Z + 20, 40 * C, ch * C);
  c.fillStyle = '#fff';
  c.font = 'bold 15px monospace';
  c.fillText('AFTER (SW-BJ21 fix: CopyVariant chain 6<-4)', o1, oY + 56 * Z + 14);
  c.fillText('BEFORE (v??0 male-sheet fallback)', o2, oY + 56 * Z + 14);
  return { url: cv.toDataURL('image/png'), holes };
});
if (!dataUrl || !dataUrl.url) { console.log('BAKE-FAIL'); await browser.close(); process.exit(1); }
writeFileSync('/tmp/swbj21/bj21-ab-board.png', Buffer.from(dataUrl.url.split(',')[1], 'base64'));
console.log('BOARD saved, hole px (before-transparent after-opaque):', JSON.stringify(dataUrl.holes));
await browser.close();
