// 树冠-树干接缝实证探针 v2：按生物群系（草/腐化/猩红/丛林/雪/神圣）+棕榈
// 逐树采样冠底/干顶交界，检测全透明行与半透明缝线（亚像素相机相位矩阵）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860, deviceScaleFactor: 2 } });   // Retina DPR=2（用户环境）
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('树缝2');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (name, cond, extra) => { out.steps.push({ name, cond: !!cond, extra }); return !!cond; };
  try {
    const st = g.world.store;
    const T = 16;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const TREE = TILE_BY_KEY['tree'];
    const PALM = TILE_BY_KEY['v_323_palm_tree'] ?? -1;
    const GRASS_IDS = {
      jungle: TILE_BY_KEY['v_60_jungle_grass_block'],
      snow: TILE_BY_KEY['snow'],
      crimson: TILE_BY_KEY['v_199_crimson_grass_block'],
      corrupt: TILE_BY_KEY['v_23_corrupt_grass_block'],
      hallow: TILE_BY_KEY['v_109_hallowed_grass_block'],
      grass: TILE_BY_KEY['grass'],
    };
    const perBiome = {};
    const palms = [];
    const gl = Math.floor(g.world.groundLevel);
    for (let x = 5; x < st.w - 5; x++) {
      for (let y = 4; y < gl + 60; y++) {
        const i = st.idx(x, y);
        const t = st.type[i];
        if (t === PALM) {
          if (st.frameX[i] >= 88 && st.frameX[i] <= 132) palms.push({ x, y });
          break;
        }
        if (t === TREE && st.frameY[i] >= 198) {
          let biome = 'grass';
          for (let dy = 1; dy <= 20; dy++) {
            const g2 = st.type[st.idx(x, y + dy)];
            if (g2 === GRASS_IDS.jungle) { biome = 'jungle'; break; }
            if (g2 === GRASS_IDS.snow) { biome = 'snow'; break; }
            if (g2 === GRASS_IDS.crimson) { biome = 'crimson'; break; }
            if (g2 === GRASS_IDS.corrupt) { biome = 'corrupt'; break; }
            if (g2 === GRASS_IDS.hallow) { biome = 'hallow'; break; }
            if (g2 === GRASS_IDS.grass) break;
          }
          (perBiome[biome] ??= []).push({ x, y });
          break;
        }
      }
    }
    out.biomeCounts = Object.fromEntries(Object.entries(perBiome).map(([k, v]) => [k, v.length]));
    out.palmCount = palms.length;
    g.world.weather.windSpeedCurrent = 1;
    g.world.weather.windSpeedTarget = 1;
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    g.camera.zoom = 1.25;   // 用户默认档：最近邻+旋转=像素跳脱高发
    const z = 1.25;
    const fracOffs = [[0, 0], [0.3, 0.6], [0.7, 0.2], [0.5, 0.5], [0.1, 0.9], [0.9, 0.1]];
    const raf2 = async () => { await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r)); };
    const testTree = async (name, x, y) => {
      const pinX = x * T + 8, pinY = y * T + 4;
      const pin = (k) => {
        const o = fracOffs[k % fracOffs.length];
        g.player.x = pinX + o[0]; g.player.y = pinY + o[1];
        g.player.vx = 0; g.player.vy = 0;
      };
      pin(0);
      for (let i = 0; i < 50; i++) { pin(0); g.fixedUpdate(1 / 60); }
      let seamFrames = 0, worst = null;
      for (let f = 0; f < 48; f++) {
        for (let i = 0; i < 2; i++) { pin(f); g.fixedUpdate(1 / 60); }
        await raf2();
        pin(f);
        const sx0 = Math.round(g.camera.worldToScreen(x * T - 2, 0)[0]);
        let bad = 0;
        for (let py = y * T - 3; py <= y * T + 4; py++) {
          const sy = Math.round(g.camera.worldToScreen(0, py)[1]);
          if (sx0 < 0 || sy < 0 || sx0 + 20 * z > canvas.width || sy + 2 > canvas.height) continue;
          const img = ctx.getImageData(sx0, sy, 20 * z, 2).data;
          let opaque = 0, semi = 0, total = 0, mx = 0;
          for (let j = 3; j < img.length; j += 4) { total++; mx = Math.max(mx, img[j]); if (img[j] > 200) opaque++; else if (img[j] > 10) semi++; }
          const rel = py - y * T;
          const isGap = opaque / total === 0;
          const isSemiLine = rel >= -2 && rel <= 2 && opaque / total < 0.55 && mx < 250;
          if (isGap || isSemiLine) {
            bad++;
            if (!worst) worst = { rel, op: +(opaque / total).toFixed(2), semi: +(semi / total).toFixed(2), mx };
          }
        }
        if (bad > 0) seamFrames++;
      }
      ok(`${name}@(${x},${y}) 48 帧接缝无漏/无半透线`, seamFrames === 0,
        seamFrames ? `缝帧=${seamFrames} 首例=${JSON.stringify(worst)}` : '');
    };
    for (const [biome, list] of Object.entries(perBiome)) {
      for (const t of list.slice(0, 3)) await testTree(biome + '@1.25x-DPR2', t.x, t.y);
    }
    for (const t of palms.slice(0, 2)) await testTree('palm', t.x, t.y);
    ok('至少测到一棵树', Object.keys(perBiome).length > 0 || palms.length > 0, JSON.stringify(out.biomeCounts));
  } catch (err) { out.steps.push({ name: 'ERR ' + String(err && err.stack || err).slice(0, 300), cond: false }); }
  return out;
});

for (const s of res.steps) check(s.name, s.cond, s.extra ?? '');
console.log('BIOMES:', JSON.stringify(res.biomeCounts), 'palms:', res.palmCount);
check('页面零 JS 错误', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
