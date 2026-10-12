// ★BJ647-C：白天转换窗口逐拍——巫医「上下弹跳」+「站桌」取证。
// 采样：夜(0.96)→日翻转全程逐拍 y/vy/onGround/wm/sitPose/脚下格 tile。
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
// pin 态（复现用户观察的弹跳/站桌画面）；夜末起跑
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.options?.data && 'gameZoom' in g.options.data) g.options.data.gameZoom = 1.24;
  g.camera.zoom = 1.24; g.camera.zoomTarget = 1.24;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.995;
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  window.__cap = { on: true, rows: [] };
  const pump = () => {
    if (!window.__cap.on) return;
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    const p2 = g.entities.npcs.find((x) => x.npcKey === 'pirate');
    const st = g.world.store;
    const foot = (nn) => {
      const tx = Math.floor(nn.cx / 16), ty = Math.floor((nn.y + nn.h + 2) / 16);
      const i = st.idx(Math.max(0, Math.min(st.w - 1, tx)), Math.max(0, Math.min(st.h - 1, ty)));
      return `${st.type[i]}@${tx},${ty}`;
    };
    window.__cap.rows.push({
      t: g.tickCount, day: g.world.clock.isDay ? 1 : 0,
      w: { y: +n2.y.toFixed(1), vy: +n2.vy.toFixed(2), g: n2.onGround ? 1 : 0, wm: n2.walkMode, sit: n2.sitting ? 1 : 0, foot: foot(n2) },
      p: { y: +p2.y.toFixed(1), vy: +p2.vy.toFixed(2), g: p2.onGround ? 1 : 0, wm: p2.walkMode, sit: p2.sitting ? 1 : 0, foot: foot(p2) },
    });
    if (window.__cap.rows.length > 4000) window.__cap.rows.shift();
    setTimeout(pump, 33);
  };
  pump();
});
await new Promise((r) => setTimeout(r, 35000));   // 覆盖夜→日翻转
await page.evaluate(() => { window.__cap.on = false; });
const rows = await page.evaluate(() => window.__cap.rows);
console.log('rows:', rows.length);
// 分析：弹跳（y 振荡 ≥3 次 ≥8px）与站桌（foot tile=18）
const bounceSeg = [];
let run = [];
for (let i = 1; i < rows.length; i++) {
  const dy = Math.abs(rows[i].w.y - rows[i - 1].w.y);
  if (dy > 6) run.push({ i, dy: +dy.toFixed(1), t: rows[i].t, y: rows[i].w.y, g: rows[i].w.g });
  else { if (run.length >= 3) bounceSeg.push(run); run = []; }
}
if (run.length >= 3) bounceSeg.push(run);
console.log('witch bounce segs (≥3 jumps):', bounceSeg.length);
for (const s of bounceSeg.slice(0, 4)) {
  console.log(' seg t=' + s[0].t + '..' + s[s.length - 1].t + ' jumps=' + s.length);
  for (const e of s.slice(0, 14)) console.log('   t=' + e.t + ' y=' + e.y + ' dy=' + e.dy + ' g=' + e.g);
}
// 站桌时段
let onTable = 0, onTableRows = [];
for (const r of rows) {
  if (r.w.foot.startsWith('18@') || r.p.foot.startsWith('18@')) { onTable++; onTableRows.push(r); }
}
console.log('on-table rows:', onTable);
for (const r of onTableRows.slice(0, 10)) console.log('  t=' + r.t + ' day=' + r.day + ' wFoot=' + r.w.foot + ' pFoot=' + r.p.foot + ' wY=' + r.w.y + ' pY=' + r.p.y);
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
