// 绿史莱姆路径深挖:贴图是否加载/e.key/实际绘制分支/两帧残影差分
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
  // 观测台
  const px0 = Math.floor(g.player.cx / 16);
  let surf = 8;
  while (surf < st.h - 20 && !st.isSolid(px0, surf)) surf++;
  const py0 = surf - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -60; dx <= 60; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -60; dx <= 60; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  g.player.x = (px0 + 30) * 16; g.player.y = (py0 - 4) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.world.clock.timeOfDay = 0.5;
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 1200 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { slime: 0 };
  slime.x = (px0 - 20) * 16; slime.y = (py0 - 6) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.hp = slime.maxHp ?? 999;
  if (g.player.hp < 60) g.player.hp = g.player.maxHp;
  for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
  // 贴图状态
  const atlas = ren.atlas;
  const imgState = {
    inVimages: atlas.vimages.has('vanilla/NPC_1.png'),
    failed: atlas.failedVImages?.().filter((f) => f.includes('NPC_1')) ?? [],
    pending: [...atlas._iconPending].filter((f) => f.includes('NPC_1')),
  };
  const r0 = atlas.vnpc(1, 0);
  const r0b = atlas.vnpc(1, 0); // 二次调用(懒加载后第二帧)
  await new Promise((r) => setTimeout(r, 400));
  const r0c = atlas.vnpc(1, 0); // 400ms 后
  // 史莱姆实体信息
  const einfo = {
    key: slime.key, vanillaId: slime.vanillaId,
    frames: slime.vanilla?.frames, aiStyle: slime.vanilla?.aiStyle,
    colorRGBA: slime.colorRGBA?.map((v) => Math.round(v)),
    animT: Math.round(slime.animT), squash: slime.squash,
  };
  // 渲染一帧并采史莱姆位置像素 + enemySprites 素材
  const spr = ren.assets?.enemySprites?.get(slime.key) ?? null;
  const sprInfo = spr ? { fw: spr.fw, fh: spr.fh, w: spr.canvas?.width, h: spr.canvas?.height } : null;
  // 两帧差分:帧 A 记录史莱姆位置像素 → 移走 → 渲染帧 B → 原位再采样
  const cv = ren.canvas;
  const cctx = cv.getContext('2d', { willReadFrequently: true });
  const snapAt = (wx, wy, n = 7) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const im = cctx.getImageData(Math.round(sx) - (n >> 1), Math.round(sy) - (n >> 1), n, n).data;
    let r = 0, gg = 0, b = 0;
    for (let j = 0; j < im.length; j += 4) { r += im[j]; gg += im[j + 1]; b += im[j + 2]; }
    const c = im.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c)];
  };
  g.render();
  const at1 = snapAt(slime.cx, slime.cy - slime.h / 2);
  const posA = { x: slime.cx, y: slime.cy };
  // 挪走到远处(屏幕外),渲染 5 帧
  slime.x = g.camera.x + 2400; slime.y = g.camera.y - 2400;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  for (let i = 0; i < 8; i++) { g.fixedUpdate(1 / 60); g.render(); }
  const at2 = snapAt(posA.x, posA.y - slime.h / 2);
  return { slime: 1, imgState, r0: r0 ? [r0.sx, r0.sy, r0.sw, r0.sh] : 'null', r0b: r0b ? 'hit' : 'null', r0c: r0c ? [r0c.sx, r0c.sy, r0c.sw, r0c.sh] : 'null', einfo, sprInfo, at1, at2, tintSize: ren.tintAtlas.size };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
