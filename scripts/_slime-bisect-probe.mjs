// 二分定位:手动复现绘制序列 vs drawEnemy 实际 worldCanvas 产物
// 变体 A:只本体 / B:本体+染色 / C:对照理论
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 280000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ren = g.renderer;
  const atlas = ren.atlas;
  for (let i = 0; i < 50 && !atlas.vimages.has('vanilla/NPC_1.png'); i++) { atlas.vnpc(1, 0); await new Promise((r) => setTimeout(r, 100)); }
  const frame = atlas.vnpc(1, 0);
  if (!frame) return { frame: 'null' };
  const tinted = ren.tintedSprite('npc1probe', frame, [0, 80, 255, 100]);
  // 手动复现(40×30 透明画布,贴图 32×26 居中)
  const tmp = document.createElement('canvas'); tmp.width = 40; tmp.height = 30;
  const tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 4, 2, 32, 26);   // 本体 α=1 对照
  const body1 = tc.getImageData(15, 12, 5, 5).data;
  // A:本体 ×0.314
  tc.clearRect(0, 0, 40, 30); tc.globalAlpha = 0.314;
  tc.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 4, 2, 32, 26);
  const a1 = tc.getImageData(15, 12, 5, 5).data;
  // B:A + 染色 ×0.392
  tc.globalAlpha = 0.392;
  tc.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, 4, 2, 32, 26);
  tc.globalAlpha = 1;
  const b1 = tc.getImageData(15, 12, 5, 5).data;
  const avg = (d) => { let r = 0, gg = 0, b = 0, a = 0; for (let j = 0; j < d.length; j += 4) { r += d[j]; gg += d[j + 1]; b += d[j + 2]; a += d[j + 3]; } const c = d.length / 4; return [Math.round(r / c), Math.round(gg / c), Math.round(b / c), Math.round(a / c)]; };
  ren.tintAtlas.drop(`npc1probe|${frame.sx},${frame.sy},${frame.sw},${frame.sh}|0,80,248`);
  // ---- 实机对照:搭台放史莱姆,读 worldCanvas ----
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let surf = 8;
  while (surf < st.h - 20 && !st.isSolid(px0, surf)) surf++;
  const py0 = surf - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -60; dx <= 60; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -60; dx <= 60; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 3000 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { frame: 'ok', slime: 0, body: avg(body1), A: avg(a1), B: avg(b1) };
  slime.x = (px0 - 14) * 16; slime.y = (py0 - 3) * 16;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  slime.hp = slime.maxHp ?? 999;
  for (let k = 0; k < 10; k++) {
    g.player.x = slime.cx + 120; g.player.y = slime.y; g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp;
    slime.vx = 0; slime.vy = 0;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const wcv = ren.worldCanvas;
  const [sx, sy] = g.camera.worldToScreen(slime.cx, slime.cy - slime.h / 2);
  g.render();
  const wc = wcv.getContext('2d').getImageData(Math.round(sx) - 2, Math.round(sy) - 2, 5, 5).data;
  // 只本体对照:临时关染色
  const keep = slime.colorRGBA;
  slime.colorRGBA = null;
  g.render();
  const wcBody = wcv.getContext('2d').getImageData(Math.round(sx) - 2, Math.round(sy) - 2, 5, 5).data;
  slime.colorRGBA = keep;
  g.render();
  return {
    frame: 'ok', slime: 1,
    srcTexel: avg(body1),
    manualA_body0314: avg(a1),
    manualB_plusTint0392: avg(b1),
    world_full: avg(wc),
    world_bodyOnly: avg(wcBody),
    scale: slime.vanillaScale,
    vanillaScaleInDef: slime.vanilla?.scale ?? null,
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
