// SW-BJ21 实机端到端:冷会话进世界(用户 .plr 外观 v6)——网络面预载 Player_4_*.png
//  + 实机 compositePaperDoll 非空(非 legacy 回退) + 实机画布上胸区含肤色像素
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj21-e2e-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
const reqs = new Set();
page.on('response', (r) => { const u = r.url(); if (/Player_\d+_\d+\.png/.test(u)) reqs.add(u.split('/').pop() + ' ' + r.status()); });
await page.goto('http://localhost:5212/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|知道/.test(x.textContent || ''));
  if (b) b.click();
  const p = window.__swGame.player;
  p.appearance = { name: '无名角色', hair: 73, skinVariant: 6,
    hairColor: { r: 89, g: 49, b: 157 }, skinColor: { r: 222, g: 202, b: 169 },
    eyeColor: { r: 205, g: 73, b: 116 }, shirtColor: { r: 156, g: 74, b: 195 },
    undershirtColor: { r: 208, g: 50, b: 119 }, pantsColor: { r: 164, g: 71, b: 161 },
    shoeColor: { r: 113, g: 24, b: 26 }, difficulty: 0 };
  p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
});
await sleep(3000);
const out = await page.evaluate(async () => {
  const pd = await import('/src/player/PaperDoll.ts');
  pd.clearPaperDollCache();
  const p = window.__swGame.player;
  let d = null;
  for (let k = 0; k < 60 && !d; k++) { d = pd.compositePaperDoll(p.appearance, { head: null, body: null, legs: null }); if (!d) await new Promise((r) => setTimeout(r, 250)); }
  // 实机画布胸区:玩家站姿,帧空间 (18..34, 22..36) 是否含非透明前景像素簇
  const g = window.__swGame, Z = Math.round(g.camera.zoom);
  await new Promise((r) => setTimeout(r, 800));
  const [axs, ays] = g.camera.worldToScreen(p.cx - p.facing * 2.5, p.y + p.h + (p.stepRenderY || 0));
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = 16 * Z; c2.height = 14 * Z;
  const cc = c2.getContext('2d', { willReadFrequently: true });
  cc.drawImage(cv, Math.round(axs) + 18 * Z, Math.round(ays) + (22 - 56) * Z, 16 * Z, 14 * Z, 0, 0, 16 * Z, 14 * Z);
  const dd = cc.getImageData(0, 0, 16 * Z, 14 * Z).data;
  let fg = 0; const bg = {};
  for (let i = 0; i < dd.length; i += 4) { const k = `${dd[i] >> 4},${dd[i + 1] >> 4},${dd[i + 2] >> 4}`; bg[k] = (bg[k] || 0) + 1; }
  const dom = Object.entries(bg).sort((a, b) => b[1] - a[1]);
  const bgKey = dom[0][0];
  for (let i = 0; i < dd.length; i += 4) if (`${dd[i] >> 4},${dd[i + 1] >> 4},${dd[i + 2] >> 4}` !== bgKey) fg++;
  return { dollBaked: !!d, dollFrames: d ? d.height / 56 : 0, chestDominant: bgKey, chestNonDominantPx: fg, domColors: dom.slice(0, 4) };
});
console.log('E2E ' + JSON.stringify(out));
console.log('PLAYER4_REQS ' + JSON.stringify([...reqs].filter((x) => /Player_4_|Player_6_/.test(x)).sort()));
console.log('ALL_REQ_COUNT ' + reqs.size);
await browser.close();
