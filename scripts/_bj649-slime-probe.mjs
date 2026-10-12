// ★BJ649：酷酷史莱姆 Slachi「被推出房间外弹跳」逐拍取证。
// 用户物证：behavior-log T01-50-17 town_slime_cool x 62438→62444 缓移、
// y 4304→4337→4304 慢抛物线（33px 振幅/300t）、wm=0 恒、g=0 全程、悬浮 home 上方 6 格。
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
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子' && g.entities?.npcs?.some((n) => n.npcKey === 'town_slime_cool'));
  }).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
// 场景：夜（用户日志 night）+玩家站 Slachi 旁静观（无 pin——自然态）
// ★BJ649 收口验证：把 Slachi 钉回物证位（行 272 平台顶,feet=4352,x≈3903 列），
// 玩家在旁（回家传送视野门压制）——观察修复后是否仍 0.02px/t 龟速原地蹦跳
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'town_slime_cool');
  g.world.clock.timeOfDay = 0.9;
  n.x = 3903 * 16 + 8 - n.w / 2; n.y = 272 * 16 - n.h;   // feet 恰贴平台顶
  n.vx = 0; n.vy = 0;
  g.player.x = n.cx + 40; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  window.__rows = [];
  const st = g.world.store;
  const pump = () => {
    if (!window.__capOn) return;
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'town_slime_cool');
    if (n2 && window.__rows.length < 4000) {
      const tx = Math.floor(n2.cx / 16), ty = Math.floor((n2.y + n2.h + 2) / 16);
      const ii = st.inBounds(tx, ty) ? st.idx(tx, ty) : -1;
      window.__rows.push({
        t: g.tickCount, x: +n2.cx.toFixed(1), y: +n2.y.toFixed(1), vy: +n2.vy.toFixed(2), vx: +n2.vx.toFixed(2),
        g: n2.onGround ? 1 : 0, wm: n2.walkMode, wT: n2.walkT, dir: n2.facing,
        foot: ii >= 0 ? st.type[ii] : -1, footXY: `${tx},${ty}`,
        wet: n2.wet ? 1 : 0, atk: n2.atkState, corn: n2.corneredT,
        home: n2.home ? `${n2.home.x},${n2.home.y}` : null,
      });
    }
    requestAnimationFrame(pump);
  };
  window.__capOn = true;
  requestAnimationFrame(pump);
});
await new Promise((r) => setTimeout(r, 20000));
await page.evaluate(() => { window.__capOn = false; });
const rows = await page.evaluate(() => window.__rows);
console.log('rows:', rows.length);
// 弹跳段：y 谷峰分析+离地时长
let segs = [];
let cur = [];
for (let i = 1; i < rows.length; i++) {
  cur.push(rows[i]);
  if (rows[i].g === 1 && rows[i - 1].g === 0) { segs.push(cur); cur = []; }
}
console.log('airborne segs:', segs.length);
for (const s of segs.slice(0, 6)) {
  const ys = s.map((r) => r.y);
  console.log(`  t=${s[0].t}..${s[s.length - 1].t} len=${s.length} yMin=${Math.min(...ys)} yMax=${Math.max(...ys)} vy0=${s[0].vy} footEnd=${s[s.length - 1].foot}`);
}
// 位置漂移
const xs = rows.map((r) => r.x);
const ys2 = rows.map((r) => r.y);
console.log(`x range: ${Math.min(...xs)}..${Math.max(...xs)}  y range: ${Math.min(...ys2)}..${Math.max(...ys2)}`);
console.log('first row:', JSON.stringify(rows[0]));
console.log('last row:', JSON.stringify(rows[rows.length - 1]));
// 中段抽样 20 拍细看
for (const r of rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 20)) === 0).slice(0, 20)) {
  console.log(`  t=${r.t} x=${r.x} y=${r.y} vy=${r.vy} vx=${r.vx} g=${r.g} wm=${r.wm} wT=${r.wT} foot=${r.foot}@${r.footXY} wet=${r.wet}`);
}
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
