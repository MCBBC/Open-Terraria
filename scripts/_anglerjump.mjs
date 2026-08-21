// 渔夫跳跃复现 v3：水池场景——6/11 深水柱 + 强制行走，测跳出火箭
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.debugSpawnNpc(369, 1, false);
  await wait(500);
  const a = (g.entities.npcs ?? []).find(n => n.vanillaId === 369);
  if (!a) return { noAngler: true };
  const surf = Math.floor(g.world.groundLevel);
  const heightAt = (x) => { let y = surf - 30; while (y < st.h - 200 && !st.isSolid(x, y)) y++; return y; };
  let flatX = -1, flatY = -1;
  const sx = Math.floor(g.player.x / 16);
  for (let x = sx - 60; x < sx + 60 && flatX < 0; x++) {
    const y = heightAt(x);
    let flat = true;
    for (let k = 0; k < 16; k++) if (heightAt(x + k) !== y) { flat = false; break; }
    if (flat) { flatX = x; flatY = y; }
  }
  if (flatX < 0) return { noFlat: true };
  // 左半平地 8 格 + 右半 6 格深水池（壁：池底+两壁实心）
  for (let dx = -2; dx < 16; dx++) {
    for (let dy = -9; dy < 0; dy++) st.setTile(flatX + dx, flatY + dy, 0);
    st.setTile(flatX + dx, flatY, 1);
  }
  for (let dx = 8; dx < 14; dx++) {
    st.setTile(flatX + dx, flatY, 1);
    for (let dy2 = -6; dy2 < 0; dy2++) {
      st.setTile(flatX + dx, flatY + dy2, 0);
      st.liquid[st.idx(flatX + dx, flatY + dy2)] = 150;   // 满 6 格水
      st.liquidType[st.idx(flatX + dx, flatY + dy2)] = 1;
    }
  }
  // 池右壁
  st.setTile(flatX + 14, flatY, 1); st.setTile(flatX + 14, flatY - 1, 1);
  a.x = (flatX + 1) * 16; a.y = (flatY - 3) * 16; a.vx = 0; a.vy = 0;
  a.walkMode = 1; a.walkT = 900; a.facing = 1;
  const samples = [];
  const y0 = a.y;
  const t0 = performance.now();
  while (performance.now() - t0 < 12000) {
    samples.push({ y: a.y, vy: +a.vy.toFixed(2), wet: !!a.wet, x: Math.round(a.x) });
    await wait(40);
  }
  const vyMin = Math.min(...samples.map(s => s.vy));
  const maxRise = Math.round(y0 - Math.min(...samples.map(s => s.y)));
  const jumpSegs = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].vy < -6 && samples[i - 1].vy >= -6) {
      jumpSegs.push({ x: samples[i].x, vy: samples.slice(i, i + 14).map(s => s.vy).join('→') });
    }
  }
  return {
    flatX, flatY, vyMin: +vyMin.toFixed(1), maxRisePx: maxRise, maxRiseTiles: +(maxRise / 16).toFixed(1),
    jumpSegs: jumpSegs.slice(0, 4), wetN: samples.filter(s => s.wet).length,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length ? 1 : 0);
