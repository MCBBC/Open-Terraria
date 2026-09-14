// FX24h 一次性探针：bake 面直测——
//  ① 直接调 tintedSprite(Extra_245 cell) 与 lerpSprite(NPC_668 cell) → 转储 bake 结果
//  ② 直接 drawImage fogImg cell 到独立 canvas → 看 fogImg 源内容
//  ③ 连续 bake 三个变体（模拟 red→fog→body 序）后复查既有条目是否被改写
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto(`${ORIGIN}/?play=small&fx24h=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1000));
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/NPC_668.png'));
  if (ok) break;
  await wait(300);
}
await wait(600);
const R = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const img668 = r.atlas.ensureVImage('vanilla/NPC_668.png');
  const fogImg = r.atlas.ensureVImage('vanilla/Extra_245.png');
  const out = { fogImgCtor: fogImg?.constructor?.name, fogW: fogImg?.width, fogH: fogImg?.height };
  const grab = (rect) => {
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 242;
    const cx2 = cv.getContext('2d');
    cx2.drawImage(rect.c, rect.x, rect.y, rect.w, rect.h, 0, 0, 220, 242);
    return cv.toDataURL('image/png');
  };
  // ② fogImg 源直绘
  const c0 = document.createElement('canvas');
  c0.width = 220; c0.height = 242;
  c0.getContext('2d').drawImage(fogImg, 436, 720, 220, 242, 0, 0, 220, 242);
  out.fogSrc = c0.toDataURL('image/png');
  // ③ 顺序 bake：red → fog → body(与 drawDeerclopsGlow/grid 同序) 后抓三个 rect
  const red = r.tintedSprite('probe-red', { img: img668, sx: 436, sy: 720, sw: 220, sh: 242 }, [40, 0, 0]);
  const fog = r.tintedSprite('probe-fog', { img: fogImg, sx: 436, sy: 720, sw: 220, sh: 242 }, [255, 30, 30]);
  const body = r.lerpSprite('probe-body', { img: img668, sx: 436, sy: 720, sw: 220, sh: 242 }, [50, 0, 160], 0);
  out.redRect = red ? { x: red.x, y: red.y } : null;
  out.fogRect = fog ? { x: fog.x, y: fog.y } : null;
  out.bodyRect = body ? { x: body.x, y: body.y } : null;
  if (red) out.redPng = grab(red);
  if (fog) out.fogPng = grab(fog);
  if (body) out.bodyPng = grab(body);
  return out;
});
// 保存三张
const fs = await import('node:fs');
for (const k0 of ['fogSrc', 'redPng', 'fogPng', 'bodyPng']) {
  if (R[k0]) fs.writeFileSync(`/tmp/fx24h-${k0}.png`, Buffer.from(R[k0].split(',')[1], 'base64'));
}
delete R.fogSrc; delete R.redPng; delete R.fogPng; delete R.bodyPng;
console.log(JSON.stringify(R, null, 1));
await browser.close();
