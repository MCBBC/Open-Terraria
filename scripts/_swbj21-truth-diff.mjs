// SW-BJ21 定谳探针 v2:烘焙域 真值链 vs 现行链 逐像素差
//  真值 = 原版 PlayerDataInitializer.CopyVariant 链解析(5/6/7/9←4←0,11←10←0,其余←0)
//  喂给【同一个 compositePaperDoll】(monkey-patch UITextures.get/has — ESM 共享单例)
//  → 差 = 现行回退链缺画(镂空)像素。另截站立视觉图(地表日光,用户角色外观)。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj21';
mkdirSync(OUT, { recursive: true });
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

// ---- 烘焙差:current vs truth(链解析) ----
const diffBake = (app) => page.evaluate(async (a) => {
  const pd = await import('/src/player/PaperDoll.ts');
  const uit = await import('/src/vui/assets/UITextures.ts');
  const U = uit.UITextures;
  const oGet = U.get.bind(U), oHas = U.has.bind(U);
  const CHAIN = { 5: 4, 6: 4, 7: 4, 9: 4, 11: 10 };
  const m = (name) => /^Player_(\d+)_(\d+)\.png$/.exec(name);
  const chainName = (name) => {
    const mm = m(name);
    if (!mm) return name;
    const v = +mm[1], s = +mm[2];
    if (oHas(name)) return name;
    const mid = CHAIN[v];
    if (mid && oHas(`Player_${mid}_${s}.png`)) return `Player_${mid}_${s}.png`;
    return `Player_0_${s}.png`;
  };
  const equip = { head: null, body: null, legs: null };
  const bake = async () => {
    pd.clearPaperDollCache();
    let d = null;
    for (let k = 0; k < 60 && !d; k++) { d = pd.compositePaperDoll(a, equip); if (!d) await new Promise((r) => setTimeout(r, 250)); }
    return d;
  };
  const cur = await bake();
  if (!cur) return { err: 'current bake null' };
  U.get = (n) => oGet(chainName(n));
  U.has = (n) => oHas(chainName(n));
  const tru = await bake();
  U.get = oGet; U.has = oHas;
  if (!tru) return { err: 'truth bake null' };
  // 逐像素:truth 不透明 & current 透明 = 镂空;任一 RGBA 差 = diff
  const c1 = document.createElement('canvas'), c2 = document.createElement('canvas');
  c1.width = c2.width = cur.width; c1.height = c2.height = cur.height;
  const x1 = c1.getContext('2d', { willReadFrequently: true }), x2 = c2.getContext('2d', { willReadFrequently: true });
  x1.drawImage(cur, 0, 0); x2.drawImage(tru, 0, 0);
  const d1 = x1.getImageData(0, 0, cur.width, cur.height).data;
  const d2 = x2.getImageData(0, 0, tru.width, tru.height).data;
  let diff = 0, hole = 0; const holes = [];
  for (let y = 0; y < cur.height; y++) for (let x = 0; x < cur.width; x++) {
    const i = (y * cur.width + x) * 4;
    if (d1[i + 3] !== d2[i + 3] || d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2]) {
      diff++;
      if (d1[i + 3] === 0 && d2[i + 3] > 0) { hole++; if (holes.length < 10) holes.push([x, y % 56]); }
    }
  }
  return { diff, hole, holes, frames: cur.height / 56 };
}, app);

// 全体女变体 × 站立(整表 20 帧)
for (const v of [4, 5, 6, 7, 9]) {
  const app = { name: 'p', hair: 1, skinVariant: v,
    hairColor: { r: 255, g: 255, b: 0 }, skinColor: { r: 255, g: 0, b: 255 },
    eyeColor: { r: 0, g: 0, b: 0 }, shirtColor: { r: 255, g: 0, b: 0 },
    undershirtColor: { r: 0, g: 255, b: 0 }, pantsColor: { r: 0, g: 0, b: 255 },
    shoeColor: { r: 255, g: 255, b: 255 }, difficulty: 0 };
  const r = await diffBake(app);
  console.log(`VARIANT ${v}: ` + JSON.stringify(r));
}
// 用户角色(变体 6 + 发 73 + 原配色)双行模式(站/走 不等行路径) + 坐姿切片
const userApp = { name: '无名角色', hair: 73, skinVariant: 6,
  hairColor: { r: 89, g: 49, b: 157 }, skinColor: { r: 222, g: 202, b: 169 },
  eyeColor: { r: 205, g: 73, b: 116 }, shirtColor: { r: 156, g: 74, b: 195 },
  undershirtColor: { r: 208, g: 50, b: 119 }, pantsColor: { r: 164, g: 71, b: 161 },
  shoeColor: { r: 113, g: 24, b: 26 }, difficulty: 0 };
console.log('USER v6 rows{8,9}: ' + JSON.stringify(await page.evaluate(async (a) => {
  const pd = await import('/src/player/PaperDoll.ts');
  const uit = await import('/src/vui/assets/UITextures.ts');
  const U = uit.UITextures;
  const oGet = U.get.bind(U), oHas = U.has.bind(U);
  const chainName = (name) => {
    const mm = /^Player_(\d+)_(\d+)\.png$/.exec(name);
    if (!mm) return name;
    const v = +mm[1], s = +mm[2];
    if (oHas(name)) return name;
    return (v === 6 && oHas(`Player_4_${s}.png`)) ? `Player_4_${s}.png` : `Player_0_${s}.png`;
  };
  const equip = { head: null, body: null, legs: null };
  const opt = { rows: { body: 8, legs: 9 } };
  const bake = async () => {
    pd.clearPaperDollCache();
    let d = null;
    for (let k = 0; k < 60 && !d; k++) { d = pd.compositePaperDoll(a, equip, opt); if (!d) await new Promise((r) => setTimeout(r, 250)); }
    return d;
  };
  const cur = await bake(); if (!cur) return { err: 'cur null' };
  U.get = (n) => oGet(chainName(n)); U.has = (n) => oHas(chainName(n));
  const tru = await bake();
  U.get = oGet; U.has = oHas;
  if (!tru) return { err: 'tru null' };
  const c1 = document.createElement('canvas'), c2 = document.createElement('canvas');
  c1.width = c2.width = 40; c1.height = c2.height = 56;
  const x1 = c1.getContext('2d', { willReadFrequently: true }), x2 = c2.getContext('2d', { willReadFrequently: true });
  x1.drawImage(cur, 0, 0, 40, 56, 0, 0, 40, 56); x2.drawImage(tru, 0, 0, 40, 56, 0, 0, 40, 56);
  const d1 = x1.getImageData(0, 0, 40, 56).data, d2 = x2.getImageData(0, 0, 40, 56).data;
  let diff = 0, hole = 0; const holes = [];
  for (let y = 0; y < 56; y++) for (let x = 0; x < 40; x++) {
    const i = (y * 40 + x) * 4;
    if (d1[i + 3] !== d2[i + 3] || d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2]) {
      diff++;
      if (d1[i + 3] === 0 && d2[i + 3] > 0) { hole++; if (holes.length < 10) holes.push([x, y]); }
    }
  }
  return { diff, hole, holes };
}, userApp)));

// ---- 视觉截图:用户角色立于地表日光 ----
await page.evaluate(async (a) => {
  const g = window.__swGame, p = g.player;
  p.appearance = a;
  const pd = await import('/src/player/PaperDoll.ts');
  pd.clearPaperDollCache();
  g.world.clock.timeOfDay = 0.5;
  // 落地表:找出生点地表
  const st = g.world.store;
  const sx = g.world.spawnX ?? Math.floor(p.x / 16);
  let sy = 10;
  while (sy < st.height - 1 && !(st.flags[st.idx(sx, sy)] & 1)) sy++;
  p.x = (sx + 0.5) * 16 - p.w / 2; p.y = (sy - 4) * 16 - p.h;
  p.vx = 0; p.vy = 0; p.facing = 1;
  for (let dx = -3; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) st.setTileSilent(sx + dx, sy - dy, 0, 0, 0); // 清出站立空间
  g.camera.zoom = 8; g.camera.zoomTarget = 8;
}, userApp);
await sleep(2500);
{
  const clip = await page.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { x: Math.max(0, Math.round(sx - 170)), y: Math.max(0, Math.round(sy - 210)), width: 340, height: 420 };
  });
  await page.screenshot({ path: `${OUT}/bj21-user-stand.png`, clip });
  console.log('SHOT user-stand saved');
}
await browser.close();
