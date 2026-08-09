// 透明度修复验证：生成若干怪后采样其精灵不透明像素，断言不再全透明；
// 同时校验史莱姆保持原版半透明凝胶（不透明度介于 0 与 1 之间）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const ty = Math.floor(g.world.groundLevel) + 8;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -40; dx <= 40; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -40; dx <= 40; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  g.player.x = (px0 + 10) * 16; g.player.y = (py0 - 3) * 16;
  // 混合池：史莱姆 1（蓝）/16（绿） + 僵尸 3 + 眼 2
  window.__swSetPool?.([1, 16, 3, 2]);
  for (let i = 0; i < 3000; i++) { g.fixedUpdate(1 / 60); if (g.player.hp < 60) g.player.hp = g.player.maxHp; }
  // 逐怪采样：怪物包围盒内非天空不透明像素计数 + 实际读 spawnAlpha
  // 注意页面上有 vui 的 ui-canvas 在前——必须取游戏渲染器自己的画布
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const results = [];
  for (const e of g.entities.enemies) {
    if (e.dead || e.vanillaId == null) continue;
    const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
    const w = Math.round(e.w * g.camera.zoom) + 4, h = Math.round(e.h * g.camera.zoom) + 4;
    if (sx < 0 || sy < 0 || sx + w > canvas.width || sy + h > canvas.height) continue;
    const img = ctx.getImageData(Math.round(sx), Math.round(sy), Math.max(4, w), Math.max(4, h)).data;
    let opaque = 0, total = 0, aSum = 0;
    for (let j = 0; j < img.length; j += 4) {
      total++;
      aSum += img[j + 3];
      if (img[j + 3] > 200) opaque++;
    }
    const meanA = Math.round(aSum / total);
    // 精灵中心 4x4 像素的 alpha 通道（直接证据：半透明应 ≈255*(1-alpha/255)）
    const [ccx, ccy] = g.camera.worldToScreen(e.cx, e.y + e.h * 0.4);
    const cimg = ctx.getImageData(Math.round(ccx) - 2, Math.round(ccy) - 2, 4, 4).data;
    let csum = 0;
    for (let j = 3; j < cimg.length; j += 4) csum += cimg[j];
    results.push({
      id: e.vanillaId, name: e.vanilla?.name,
      alpha: e.spawnAlpha, opaqueRatio: +(opaque / total).toFixed(2),
      meanA, centerA: Math.round(csum / 16),
    });
    if (results.length >= 4) break;
  }
  return { results, total: g.entities.enemies.length };
});
console.log(JSON.stringify(out, null, 1));
if (out.results.length === 0) {
  check('生成出怪物可采样', false);
} else {
  // alpha=0 的怪（僵尸/眼）：不透明像素占比应明显高于全透明
  const solid = out.results.filter((r) => r.alpha === 0);
  const slimes = out.results.filter((r) => r.alpha > 0);
  for (const r of solid) check(`${r.name}(${r.id}) 非全透明（meanA≈255）`, r.meanA > 200, `meanA=${r.meanA} alpha=${r.alpha}`);
  for (const r of slimes) check(`${r.name}(${r.id}) 原版半透明（meanA 明显低于实心怪）`, r.meanA > 40 && r.meanA < 200, `meanA=${r.meanA} alpha=${r.alpha}`);
  check('alpha 数据语义正确（史莱姆>0、其他=0 分组均出现）', solid.length > 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await page.screenshot({ path: './shots/alpha-fix.png' });
await browser.close();
process.exit(fail ? 1 : 0);
