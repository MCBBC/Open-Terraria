// 宝箱贴图诊断：载入地图 → 找一个宝箱 → dump tile 数据 + 渲染帧参数
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const json = fs.readFileSync('/Users/vinlic/Downloads/map-荒唐的墓穴丛林.json', 'utf8');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });
const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  await new Promise((r) => setTimeout(r, 1500));
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  // 找宝箱：扫几个已知 chest 坐标 + 周围
  const chestIds = [];
  const seen = new Set();
  for (const c of g.world.chests.slice(0, 5)) {
    const sample = [];
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
      const i = st.idx(x, y);
      const t = st.type[i];
      if (t === 0) continue;
      const d = g.tileByKey && null;
      const name = (await import('/src/data/tiles.ts')).TILE_DEFS[t]?.key;
      sample.push({ x, y, t, fx: st.frameX[i], fy: st.frameY[i], name });
      if (!seen.has(t)) { seen.add(t); chestIds.push({ t, name, fx: st.frameX[i], fy: st.frameY[i] }); }
    }
    void sample;
  }
  // 渲染参数：autotiler 对该 tile 的帧选择
  // dump 一个 v_467 实例的全部 4 格帧数据
  const dump = [];
  outer2:
  for (let y = 0; y < st.h; y += 3) {
    for (let x = 0; x < st.w; x += 3) {
      const i = st.idx(x, y);
      if (st.type[i] !== 175) continue;
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= st.w || yy >= st.h) continue;
        const ii = st.idx(xx, yy);
        if (st.type[ii] !== 175) continue;
        dump.push({ x: xx, y: yy, fx: st.frameX[ii], fy: st.frameY[ii] });
      }
      if (dump.length) break outer2;
    }
  }
  return { chestTiles: chestIds, dump };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
