// 史莱姆染色修复验证:
// 1) 修复前后主画布史莱姆中心色 vs 原版手算期望(D×0.417+(48.9,80.3,148.8))
// 2) TintAtlas 同键重复 bake 幂等性(scratch 清除验证)
// 3) 染色不溢出轮廓(盒角=背景)
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
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ren = g.renderer;
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
  const pinX = (px0 - 8) * 16, pinY = (py0 - 4) * 16;
  g.player.x = pinX; g.player.y = pinY;
  g.camera.x = pinX; g.camera.y = pinY;
  g.world.clock.timeOfDay = 0.5;
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 3000 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { slime: 0 };
  slime.x = (px0 - 16) * 16; slime.y = (py0 - 4) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.ai0 = -1120;   // 钳住 hop
  slime.hp = slime.maxHp ?? 999;
  const pinX2 = slime.cx + 120, pinY2 = slime.y;
  g.player.x = pinX2; g.player.y = pinY2;
  g.player.hp = g.player.maxHp;
  g.camera.x = slime.cx; g.camera.y = slime.cy;
  await new Promise((r) => setTimeout(r, 400));   // 贴图懒加载+渲染稳定
  // 每帧钉住玩家(相机跟随玩家)防击退,同步钉史莱姆防漂移
  for (let k = 0; k < 6; k++) {
    g.player.x = pinX2; g.player.y = pinY2; g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp;
    slime.vx = 0; slime.vy = 0;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const cv = ren.canvas;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const sample = (wx, wy, n = 5) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const im = ctx.getImageData(Math.round(sx) - (n >> 1), Math.round(sy) - (n >> 1), n, n).data;
    let r = 0, gg = 0, b = 0;
    for (let j = 0; j < im.length; j += 4) { r += im[j]; gg += im[j + 1]; b += im[j + 2]; }
    const c = im.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c)];
  };
  // 背景天空(史莱姆正上方 60px 处,同高度)
  const sky = sample(slime.cx, slime.cy - 60, 9);
  // 修复后史莱姆中心
  g.render();
  const center = sample(slime.cx, slime.cy - slime.h / 2, 5);
  // 原版期望:D×0.417 + (48.9, 80.3, 148.8)(白剪影×正午光)
  const expect = [sky[0] * 0.417 + 48.9, sky[1] * 0.417 + 80.3, sky[2] * 0.417 + 148.8].map((v) => Math.round(v));
  // 染色旧写法对照模拟(lighter 时代):α 饱和 → (49,129,255) 恒定(乘正午光)
  const oldExpect = [49, 129, 255];
  // 盒角(轮廓外):应=天空
  const corner = sample(slime.x - 6, slime.y - 6, 5);
  // TintAtlas 幂等性:同键 bake 3 次后像素逐位不变
  const renAny = ren;
  const src = ren.atlas.vnpc(1, 0);   // DrawRect 本身即 frame 形参(img/sx/sy/sw/sh)
  const readRect = (t) => {
    const c2 = t.c.getContext('2d');
    const d = c2.getImageData(t.x, t.y, t.w, t.h).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
    return h;
  };
  const t1 = renAny.tintedSprite('idemtest', src, [0, 80, 255]);
  renAny.tintAtlas.drop('idemtest|0,0,32,26|0,80,248');
  const t2 = renAny.tintedSprite('idemtest', src, [0, 80, 255]);
  renAny.tintAtlas.drop('idemtest|0,0,32,26|0,80,248');
  const t3 = renAny.tintedSprite('idemtest', src, [0, 80, 255]);
  const idem = { h1: t1 ? readRect(t1) : null, h2: t2 ? readRect(t2) : null, h3: t3 ? readRect(t3) : null };
  renAny.tintAtlas.drop('idemtest|0,0,32,26|0,80,248');
  return {
    slime: 1,
    colorRGBA: slime.colorRGBA?.map((v) => Math.round(v)),
    spawnAlpha: slime.spawnAlpha,
    sky, center, expect, oldExpect, corner,
    idem, tintSize: ren.tintAtlas.size,
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: './shots/slime-tint-fixed.png' });
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
