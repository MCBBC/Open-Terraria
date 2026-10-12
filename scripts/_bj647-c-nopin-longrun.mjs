// ★BJ647-C 无 pin 长跑复验：有头实例自然态 180s——自动弹跳检测（y 振荡）+站桌检测
// （脚下 tile 18 占比）+昼/夜分窗统计。用户可同时亲眼看画面。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 1 }, args: ['--window-size=1530,960', '--window-position=30,30'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) { if (await page.evaluate(() => !!(window.__swGame?.renderer)).catch(() => false)) break; await new Promise((r) => setTimeout(r, 2000)); }
await new Promise((r) => setTimeout(r, 1500));
const b64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子' && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
// 自然态：无 pin。玩家站 NPC 旁不动（相机稳定,模拟用户挂机观察）。
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.options?.data && 'gameZoom' in g.options.data) g.options.data.gameZoom = 1.24;
  g.camera.zoom = 1.24; g.camera.zoomTarget = 1.24;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  g.player.x = n.cx - 60; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  window.__rows = [];
  const st = g.world.store;
  const foot = (nn) => {
    const tx = Math.floor(nn.cx / 16), ty = Math.floor((nn.y + nn.h + 2) / 16);
    const i = st.idx(Math.max(0, Math.min(st.w - 1, tx)), Math.max(0, Math.min(st.h - 1, ty)));
    return st.type[i];
  };
  window.__rec = setInterval(() => {
    for (const nn of g.entities.npcs) {
      if (!['witch_doctor', 'pirate'].includes(nn.npcKey) || nn.dead) continue;
      window.__rows.push({ t: g.tickCount, k: nn.npcKey, y: +nn.y.toFixed(1), g: nn.onGround ? 1 : 0, foot: foot(nn), sit: nn.sitting ? 1 : 0 });
    }
  }, 100);
});
console.log('180s natural-state long run started (window is live — watch it)');
await new Promise((r) => setTimeout(r, 60000));
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.995; });   // 推到夜末→翻转
console.log('forced near-dawn at 60s; watching flip');
await new Promise((r) => setTimeout(r, 120000));
await page.evaluate(() => clearInterval(window.__rec));
const rows = await page.evaluate(() => window.__rows);
console.log('rows:', rows.length);
// 弹跳检测：每 NPC 每 10s 窗内 y 极差 > 24px 且往复 ≥3 次
import·detect: {}
const byK = { witch_doctor: [], pirate: [] };
for (const r of rows) byK[r.k]?.push(r);
for (const [k, ser] of Object.entries(byK)) {
  const win = 100;   // 10s @100ms
  let bounces = 0;
  for (let s = 0; s + win < ser.length; s += win) {
    const seg = ser.slice(s, s + win);
    const ys = seg.map((r) => r.y);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    // 往复计数：跨中线的次数
    const mid = (lo + hi) / 2;
    let cross = 0, side = ys[0] > mid;
    for (const y of ys) { const cur = y > mid; if (cur !== side) { cross++; side = cur; } }
    if (hi - lo > 24 && cross >= 6) bounces++;
  }
  const tableTicks = ser.filter((r) => r.foot === 18).length;
  const sitTicks = ser.filter((r) => r.sit).length;
  console.log(`${k}: 10s-windows-with-bounce=${bounces}/${Math.floor(ser.length / win)}, on-table-rows=${tableTicks}/${ser.length}, sitting-rows=${sitTicks}`);
}
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
