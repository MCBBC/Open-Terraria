// 烟囱消失二元取证:v1(干净重写)——每帧同时记录 游戏格子状态 + 像素不透明计数。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 确认烟囱格存在
  const cells = [];
  for (let x = 4130; x <= 4132; x++) for (let y = 434; y <= 437; y++) {
    const i = st.idx(x, y);
    if (st.type[i] > 0) cells.push({ x, y, t: st.type[i], fx: st.frameX[i], fy: st.frameY[i], fl: st.flags[i] });
  }
  if (!cells.length) return { fail: 'no chimney cells' };
  const GONE = 'GONE'; const OK = 'VISIBLE';

  // 暴露动画时钟
  try { const m = await import('/src/render/TileAnim.ts'); (window).__swTAmod = m.tileAnim; } catch {}

  // 传送玩家+相机收敛
  g.player.x = 4131 * 16 + 8; g.player.y = (437 - 2) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r) => setTimeout(r, 1800));

  // 相机换算屏幕坐标(用 renderer 真实 worldToScreen)
  const cam = g.camera;
  const [bx, by] = cam.worldToScreen
    ? cam.worldToScreen(4129 * 16, 434 * 16)
    : [(4129 * 16 - cam.x) * cam.zoom + 494, (434 * 16 - cam.y) * cam.zoom + 431];
  const bw = Math.ceil(54 * cam.zoom), bh = Math.ceil(54 * cam.zoom);
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  const ctx = cvs[0].getContext('2d', { willReadFrequently: true });

  // 连续采样 15s @30ms:游戏状态+绘制像素双轨
  const samples = [];
  for (let k = 0; k < 500; k++) {
    // 轨A:游戏数据
    const states = cells.map((c) => st.type[st.idx(c.x, c.y)]);
    // 轨B:像素 opaque 计数
    const imd = ctx.getImageData(bx, by, bw, bh);
    let opq = 0;
    for (let o = 3; o < imd.data.length; o += 4) if (imd.data[o] > 100) opq++;
    const tick = window.__swTAmod ? window.__swTAmod.tick : k;
    samples.push({
      k,
      gameAlive: states.every((t) => t > 0),
      stateHash: states.join(','),
      frameIdx: Math.floor(tick / 8) % 6,
      animPhase: tick % 8,
      opaque: opq,
      goneRender: opq < bw * bh * 0.10,
    });
    await new Promise((r) => setTimeout(r, 30));
  }

  // 分析
  const renderGone = samples.filter((s) => s.goneRender);
  const gameKilled = samples.filter((s) => !s.gameAlive);
  const sigSet = new Set(samples.map((s) => s.opaque));
  return {
    totalSamples: samples.length,
    renderGoneCount: renderGone.length,
    renderGoneFrames: renderGone.slice(0, 5).map((r) => ({ k: r.k, opaque: r.opaque })),
    gameKilledCount: gameKilled.length,
    distinctOpaqueVals: sigSet.size,
    opaqueRange: [Math.min(...samples.map(s=>s.opaque)), Math.max(...samples.map(s=>s.opaque))],
    stateConstant: new Set(samples.map(s=>s.stateHash)).size <= 1,
  };
});

console.log(JSON.stringify(out, null, 1));
fs.writeFileSync('/tmp/chimney-invisible.json', JSON.stringify(out));
await browser.close();
process.exit(out.renderGoneCount > 0 ? 0 : 1);
