// _glpar2-probe:GL/2D 背景/地图 同会话 A/B 对拍(冻结世界消除随机内容差异)
// 流程:载入存档 → 钉时钟+落点 → 暂停(冻结云/粒子/时间) → 采样(GL) →
// 运行时切 bgGlEnabled/mapGlEnabled → 采样(2D) → 逐点比对 = 纯后端差
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 140)));
p.on('console', m => { const t = m.text(); if (t.includes('GLSpriteLayer')) console.log('[gl]', t.slice(0, 120)); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 5000));
const ok = await p.evaluate(async () => {
  const r = await fetch('/tmp-glpar-world.json');
  if (!r.ok) return `fetch ${r.status}`;
  await window.__swFlow.loadJson(await r.text());
  return 'ok';
}).catch(e => String(e));
if (ok !== 'ok') { console.log('loadJson 失败:', ok); await b.close(); process.exit(1); }
for (let i = 0; i < 150; i++) {
  await new Promise(r => setTimeout(r, 2000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 6000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.75;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = true;                       // 冻结云/粒子/时间(A/B 两帧唯一变量=后端)
});
await new Promise(r => setTimeout(r, 2000));
const sample = (mode) => p.evaluate((m) => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx = c.getContext('2d');
  const region = m === 'map' ? 'full' : 'top';
  const GX = 96, GY = region === 'top' ? 30 : 54;
  const y1 = region === 'top' ? Math.floor(c.height * 0.55) : c.height;
  const out = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const x = Math.floor((i + 0.5) * c.width / GX);
    const y = Math.floor((j + 0.5) * y1 / GY);
    const d = ctx.getImageData(x, y, 1, 1).data;
    out.push(d[0], d[1], d[2], d[3]);
  }
  return out;
}, mode);

console.log('== A/B 地表背景(黄昏,暂停冻结) ==');
await p.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
await new Promise(r => setTimeout(r, 800));
const bgGL = await sample('surface');
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; });
await new Promise(r => setTimeout(r, 800));
const bg2D = await sample('surface');
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = true; });

console.log('== A/B 全屏地图(zoom1.25) ==');
await p.evaluate(() => {
  const fm = window.__swGame.renderer.fullMap;
  fm.open = true; fm.zoom = 1.25; fm.zoomTarget = 1.25; fm.panX = 0; fm.panY = 0;
});
await new Promise(r => setTimeout(r, 1000));
const mapGL = await sample('map');
await p.evaluate(() => { window.__swGame.renderer.mapGlEnabled = false; });
await new Promise(r => setTimeout(r, 800));
const map2D = await sample('map');

const compare = (name, A, B) => {
  const n = Math.min(A.length, B.length);
  let maxD = 0, sum = 0, over8 = 0, cnt = 0;
  for (let i = 0; i < n; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
    if (d > maxD) maxD = d;
    sum += d; cnt++;
    if (d > 8) over8++;
  }
  console.log(`${name}: ${cnt}点 | 最大Δ=${maxD} | 平均Δ=${(sum / cnt).toFixed(3)} | Δ>8=${(over8 / cnt * 100).toFixed(2)}%`);
};
console.log('\n---- 同会话 A/B 对拍 ----');
compare('#1 背景(地表·黄昏)', bgGL, bg2D);
compare('#2 全屏地图(zoom1.25)', mapGL, map2D);
await b.close(); process.exit(0);
