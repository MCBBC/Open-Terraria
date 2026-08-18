import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 160)));
p.on('console', m => { const t = m.text(); if (t.includes('GLSpriteLayer') || t.includes('Renderer]')) console.log('[log]', t.slice(0, 120)); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-mmc-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
// HUD 小地图区域采样(右上角) + 存在性检查
const hud = await p.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const c = r.canvas;
  const ctx = c.getContext('2d');
  // HUD 小地图框(ox=宽-296,oy=90 起 244²)中心采样
  const ox = c.width - 296, oy = 90;
  const pts = [];
  for (const [dx, dy] of [[100, 100], [50, 180], [200, 60]]) {
    const d = ctx.getImageData(ox + dx * 2, oy + dy * 2, 1, 1).data;  // DPR2
    pts.push([d[0], d[1], d[2]]);
  }
  return { pts, pixOK: !!r.minimap.pix, pixMB: (r.minimap.pix.length / 1048576).toFixed(0), hudCanvas: r['_mmHudCanvas'] ? [r['_mmHudCanvas'].width, r['_mmHudCanvas'].height] : null };
});
console.log('HUD:', JSON.stringify(hud));
// 开全屏地图 4s → 关 → 验证 GL 纹理释放
await p.evaluate(() => {
  const fm = window.__swGame.renderer.fullMap;
  fm.open = true; fm.zoom = 1.25; fm.zoomTarget = 1.25; fm.panX = 0; fm.panY = 0;
});
await new Promise(r => setTimeout(r, 2500));
const openState = await p.evaluate(() => ({
  mmTexAlive: !!window.__swGame.renderer.glfx,
  fogPix: !!window.__swGame.renderer['fogPix'],
}));
await p.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
await new Promise(r => setTimeout(r, 800));
const closed = await p.evaluate(() => {
  const r = window.__swGame.renderer;
  return { mm2d: r['_fm2dMap'] === null, alive: !!window.__swGame.running };
});
console.log('开图:', JSON.stringify(openState), '→ 关图:', JSON.stringify(closed));
await new Promise(r => setTimeout(r, 1500));
const fin = await p.evaluate(() => ({ alive: !!window.__swGame.running, tick: window.__swGame.tickCount, errs: (window.__swErrors ?? []).length }));
console.log('终态:', JSON.stringify(fin));
await b.close(); process.exit(0);
