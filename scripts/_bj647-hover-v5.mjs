// ★BJ647-B v5：自然态复现（不 pin NPC——pin 拖动=自造伪影嫌疑）+ 暗像素增量差分
// + hook 暗色 fillRect 捕获（caller 栈直定位）。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
const buf = readFileSync(WLD);
const b64 = buf.toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  const ready = await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子'
      && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

// 自然态：玩家静站 NPC 旁（不动），NPC 自由走动。白天化防夜晚敌怪干扰。
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 1500));

// hook：只记暗色 fillRect（rgb 各通道 <80 的 fillStyle）全帧（caller 栈）
await page.evaluate(() => {
  const g = window.__swGame;
  const mainCv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__rec = { log: [] };
  if (window.__hooked) return;
  window.__hooked = true;
  const FR = CanvasRenderingContext2D.prototype.fillRect;
  const shortStack = () => new Error().stack.split('\n').slice(2, 6).map((l) => l.trim().replace(/^at /, '').replace(/:\d+:\d+\)?$/, ''));
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (this.canvas === mainCv) {
      const f = String(this.fillStyle);
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(f) || /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(f);
      let r = 255, gg = 255, b = 255;
      if (m) {
        if (m[0].startsWith('#')) { r = parseInt(m[1], 16); gg = parseInt(m[2], 16); b = parseInt(m[3], 16); }
        else { r = +m[1]; gg = +m[2]; b = +m[3]; }
      } else if (f === '#000' || f === 'black') { r = gg = b = 0; }
      if (r < 80 && gg < 80 && b < 80) {
        window.__rec.log.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill: f, ga: +this.globalAlpha.toFixed(3), gco: this.globalCompositeOperation, t: performance.now(), st: shortStack() });
      }
    }
    return FR.call(this, x, y, w, h);
  };
});
console.log('hook installed');

// NPC 屏幕位（自然走动,每轮 grab）
const grab = () => page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1280, ch = g.renderer.canvas.clientHeight ?? 800;
  return { sx: Math.round((n.cx - cam.x) * z + cw / 2), sy: Math.round((n.cy - cam.y) * z + ch / 2), sitting: n.sitting ? 1 : 0 };
});
// 暗像素增量：hover on 帧 vs off 帧（同窗,1/2 抽样）
const grabDark = () => page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const o = document.createElement('canvas');
  o.width = cv.width; o.height = cv.height;
  o.getContext('2d').drawImage(cv, 0, 0);
  const d = o.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  // 返回暗像素清单（下采样 4）——Node 侧做差分
  const out = [];
  for (let y = 0; y < cv.height; y += 4) for (let x = 0; x < cv.width; x += 4) {
    const i = (y * cv.width + x) * 4;
    if (d[i] < 70 && d[i + 1] < 70 && d[i + 2] < 70) out.push(y * cv.width + x);
  }
  return { w: cv.width, h: cv.height, dark: out };
});
await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 500));
let hits = 0;
const report = [];
for (let k = 0; k < 25; k++) {
  const p = await grab();
  await page.mouse.move(p.sx, p.sy);
  await new Promise((r) => setTimeout(r, 160));
  const on = await grabDark();
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 160));
  const off = await grabDark();
  // on 相对 off 的暗像素增量（off 是参照：off 有而 on 无=消失;on 有而 off 无=新增）
  const onSet = new Set(on.dark);
  let added = 0, addedRows = {};
  for (const idx of on.dark) if (!offSetHas(off, idx)) { added++; const y = Math.floor(idx / on.w); addedRows[Math.floor(y / 40)] = (addedRows[Math.floor(y / 40)] || 0) + 1; }
  function offSetHas(off, idx) { return off.darkSet ? off.darkSet.has(idx) : (off.dark.indexOf(idx) >= 0); }
  // 修正：构造 set
  const offSet = new Set(off.dark);
  added = 0; const addedBoxes = {};
  for (const idx of on.dark) if (!offSet.has(idx)) { added++; const x = idx % on.w, y = Math.floor(idx / on.w); const key = Math.floor(x / 80) + ',' + Math.floor(y / 40); addedBoxes[key] = (addedBoxes[key] || 0) + 1; }
  const top = Object.entries(addedBoxes).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (added > 300) { hits++; report.push({ k, added, npc: [p.sx, p.sy], top }); }
}
console.log('v5 hits:', hits);
console.log(JSON.stringify(report.slice(0, 8), null, 1));
// 出现轮后：dump hook 暗色 fillRect（本会话累计,取最后 400 条）
const recs = await page.evaluate(() => window.__rec.log.slice(-400));
console.log('dark fillRects (last):', JSON.stringify(recs.slice(-30), null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
