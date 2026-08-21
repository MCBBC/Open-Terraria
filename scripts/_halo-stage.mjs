// 阶段插桩:hook 渲染器关键方法,每帧 diff 画布,定位方片引入点。
// 触发:同世界同位置,时间 0.715(报告3),轮询 240 帧检测方片特征
// (大面积均匀半透明区),命中即 dump 各阶段快照。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('console', (m) => { const t = m.text(); if (t.includes('[stage]')) console.log('PAGE:', t.slice(0, 400)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world)) {
    if (Date.now() - t0 > 120000) return { fatal: 'timeout' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.715;
  g.player.x = 2221 * 16; g.player.y = 233 * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  await new Promise((res) => setTimeout(res, 1200));
  // hook:在 compositeLight 前后与 drawScreenFilterChain 前后抓画布指纹
  const rd = g.renderer;
  const marks = [];
  const grab = (tag) => {
    const cv = rd.canvas;
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    marks.push({ tag, png: c.toDataURL('image/png') });
  };
  const origComposite = rd.compositeLight.bind(rd);
  let phase = 'before-composite';
  rd.compositeLight = function (...a) {
    phase = 'pre-composite';
    grab('pre-composite');
    const r = origComposite(...a);
    grab('post-composite');
    phase = 'post-composite';
    return r;
  };
  const origChain = rd.drawScreenFilterChain.bind(rd);
  rd.drawScreenFilterChain = function (...a) {
    grab('pre-filterchain');
    const r = origChain(...a);
    grab('post-filterchain');
    return r;
  };
  // 跑 240 帧,检测方片(用简化版:画面中部存在 200×200 均匀亮度平台+直边)
  const cv = rd.canvas;
  const ctx = cv.getContext('2d');
  let hit = false;
  for (let f = 0; f < 240 && !hit; f++) {
    marks.length = 0;
    g.frame(performance.now());
    const img = ctx.getImageData(300, 250, 600, 400).data;
    // 均匀平台检测:行内 300px 段方差极小
    const W = 600;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    for (let y = 0; y < 400; y += 20) {
      for (let x = 0; x < 280; x += 20) {
        const a = lum(x, y), b = lum(x + 300, y), m1 = lum(x + 100, y), m2 = lum(x + 200, y);
        if (Math.abs(m1 - m2) < 4 && Math.abs(m1 - a) > 18 && Math.abs(m1 - b) > 18) { hit = true; break; }
      }
      if (hit) break;
    }
  }
  if (!hit) return { noHit: true };
  return { hit: true, shots: marks.map((m) => ({ tag: m.tag, png: m.png })) };
}, { timeout: 300000 });
if (r.shots) {
  const fs = await import('node:fs');
  r.shots.forEach((m, i) => fs.writeFileSync(`/tmp/halo-stage-${i}-${m.tag}.png`, Buffer.from(m.png.split(',')[1], 'base64')));
  console.log('shots saved');
} else console.log(JSON.stringify(r));
await browser.close();
