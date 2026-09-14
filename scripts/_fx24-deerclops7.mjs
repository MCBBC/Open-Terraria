// FX24g 一次性探针：浏览器侧 NPC_668.png 与磁盘文件对账——
//  ① fetch 网络版 → 尺寸/像素指纹  ② vimages ImageBitmap → 尺寸/像素指纹  ③ 与磁盘 base64 对比
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto(`${ORIGIN}/?play=small&fx24g=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1000));
// 触发 668 贴图加载（召唤一只）
await page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div').click();
  g.summonPanel?.close();
});
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/NPC_668.png'));
  if (ok) break;
  await new Promise((r0) => setTimeout(r0, 300));
}
const diskB64 = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites/vanilla/NPC_668.png').toString('base64');
const R = await page.evaluate(async (diskLen) => {
  const out = {};
  // ① 网络版
  const resp = await fetch('sprites/vanilla/NPC_668.png', { cache: 'no-store' });
  const blob = await resp.blob();
  const bm1 = await createImageBitmap(blob);
  out.net = { w: bm1.width, h: bm1.height, blobSize: blob.size };
  const c1 = document.createElement('canvas');
  c1.width = bm1.width; c1.height = bm1.height;
  const x1 = c1.getContext('2d', { willReadFrequently: true });
  x1.drawImage(bm1, 0, 0);
  const d1 = x1.getImageData(436, 720, 220, 242).data;
  let op1 = 0; for (let i = 3; i < d1.length; i += 4) if (d1[i] > 0) op1++;
  out.net.cell2_3_opaque = op1;
  // 采样格 (2,3) 的 RGB 直方 top（查紫色）
  const hist = {};
  for (let i = 0; i < d1.length; i += 4) {
    if (d1[i + 3] === 0) continue;
    const k = `${d1[i] >> 5},${d1[i + 1] >> 5},${d1[i + 2] >> 5}`;
    hist[k] = (hist[k] ?? 0) + 1;
  }
  out.net.cell2_3_hist = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // ② vimages ImageBitmap（渲染实际用的）
  const img2 = window.__swGame.renderer.atlas.ensureVImage('vanilla/NPC_668.png');
  out.mem = { w: img2.width, h: img2.height, ctor: img2.constructor?.name };
  const c2 = document.createElement('canvas');
  c2.width = img2.width; c2.height = img2.height;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.drawImage(img2, 0, 0);
  const d2 = x2.getImageData(436, 720, 220, 242).data;
  let op2 = 0; for (let i = 3; i < d2.length; i += 4) if (d2[i] > 0) op2++;
  out.mem.cell2_3_opaque = op2;
  const hist2 = {};
  for (let i = 0; i < d2.length; i += 4) {
    if (d2[i + 3] === 0) continue;
    const k = `${d2[i] >> 5},${d2[i + 1] >> 5},${d2[i + 2] >> 5}`;
    hist2[k] = (hist2[k] ?? 0) + 1;
  }
  out.mem.cell2_3_hist = Object.entries(hist2).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // ③ SW 缓存版（若有）
  if (window.caches?.keys) {
    const keys = await caches.keys();
    out.swKeys = keys;
    for (const k0 of keys) {
      const c0 = await caches.open(k0);
      const r0 = await c0.match('sprites/vanilla/NPC_668.png');
      if (r0) {
        const b0 = await r0.blob();
        const bm0 = await createImageBitmap(b0);
        out.sw = { cache: k0, w: bm0.width, h: bm0.height, blobSize: b0.size };
      }
    }
  }
  out.diskLen = diskLen;
  return out;
}, diskB64.length);
console.log(JSON.stringify(R, null, 1));
await browser.close();
