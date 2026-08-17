// 用户标记树取证：重建“模型根基”世界（seed 1814620304 大型），找玩家旁两棵
// “泥土下再一格放铅矿”标记的树，全量取证（帧/半砖/坡/墙/液体/邻域）+ 逐帧接缝解剖。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 900000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
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
  await page.keyboard.type('树取');
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
  await page.click('.sw-wc-panel input[data-f=seed]');
  await page.keyboard.type('1814620304');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    (opts.find((o) => o.textContent.includes('大')) ?? opts[2]).click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 8400, { timeout: 800000, polling: 1500 });
await new Promise(r => setTimeout(r, 4000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (n, c, e) => { out.steps.push({ n, c: !!c, e }); return !!c; };
  try {
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const st = g.world.store;
    const T = 16;
    const TREE = TILE_BY_KEY['tree'];
    const LEAD = TILE_BY_KEY['ore_lead'];
    const DIRT = TILE_BY_KEY['dirt'];
    out.worldCheck = { w: st.w, h: st.h, seed: g.world.seed };
    // 传送到报告玩家位
    g.player.x = 5251 * T + 8; g.player.y = 572 * T + 8;
    for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
    // 找铅矿（玩家 ±120 列、地表±80 行内）
    const leads = [];
    for (let dx = -120; dx <= 120; dx++) {
      const x = 5251 + dx;
      if (x < 5 || x >= st.w - 5) continue;
      for (let dy = -80; dy <= 80; dy++) {
        const y = 572 + dy;
        if (y < 5 || y >= st.h - 5) continue;
        if (st.type[st.idx(x, y)] === LEAD) {
          // 向上找树：ore → (+1..3) 应有 dirt → grass → trunk... → marker
          let ty = y - 1, dirtSeen = 0, grassY = -1, markerY = -1, trunkTopY = -1;
          for (let k = 0; k < 12; k++, ty--) {
            const t = st.type[st.idx(x, ty)];
            if (t === DIRT) { dirtSeen++; continue; }
            if (t === TREE) {
              trunkTopY = ty;
              // 继续向上到 marker（fy>=198）
              for (let m = ty; m > ty - 8; m--) {
                if (st.type[st.idx(x, m)] === TREE && st.frameY[st.idx(x, m)] >= 198) { markerY = m; break; }
                if (st.type[st.idx(x, m)] !== TREE) break;
              }
              break;
            }
            break;
          }
          if (markerY > 0) leads.push({ x, oreY: y, dirtSeen, markerY, trunkTopY });
        }
      }
    }
    ok('找到铅矿标记树 ≥2', leads.length >= 2, JSON.stringify(leads));
    out.leads = leads;
    // 逐树全量取证 + 接缝逐帧解剖（zoom 1.27=报告值 + DPR2 + 多相机相位）
    g.camera.zoom = 1.27;
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const dumpAround = (tree, camOff) => {
      const B = (tree.markerY + 1) * T;
      g.player.x = tree.x * T + 8 + camOff[0]; g.player.y = B - 20 + camOff[1];
      g.player.vx = 0; g.player.vy = 0;
      for (let i = 0; i < 50; i++) g.fixedUpdate(1 / 60);
      const rows = [];
      for (let py = B - 6; py <= B + 12; py++) {
        const sy = Math.round(g.camera.worldToScreen(0, py)[1]);
        const sx0 = Math.round(g.camera.worldToScreen(tree.x * T - 2, 0)[0]);
        const d = ctx.getImageData(sx0, sy, Math.round(20 * 1.27), 1).data;
        let op = 0, semi = 0, n = 0;
        for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 200) op++; else if (d[j] > 10) semi++; }
        rows.push({ rel: py - B, op: +(op / n).toFixed(2), semi: +(semi / n).toFixed(2) });
      }
      return rows;
    };
    out.trees = [];
    for (const tree of leads.slice(0, 2)) {
      const i0 = st.idx(tree.x, tree.markerY);
      // 邻域取证：marker ±3 行 × ±2 列的 type/half/slope/wall/liquid
      const hood = [];
      for (let dy = -4; dy <= 4; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = tree.x + dx, yy = tree.markerY + dy;
        const i = st.idx(xx, yy);
        const key = TILE_BY_KEY ? undefined : undefined;
        hood.push(`${dx},${dy}:t${st.type[i]}f${st.frameX[i]},${st.frameY[i]}h${st.half[i] ? 1 : 0}s${st.slope[i]}w${st.wall[i]}l${st.liquid[i]}`);
      }
      // 干列帧
      const pieces = [];
      for (let dy = 1; dy <= 6; dy++) pieces.push(`${st.frameX[st.idx(tree.x, tree.markerY + dy)]},${st.frameY[st.idx(tree.x, tree.markerY + dy)]}`);
      // 接缝逐帧（真实微摆）
      const fr = [];
      for (let f = 0; f < 24; f++) {
        for (let i = 0; i < 3; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
        await raf(); await raf();
        fr.push(dumpAround(tree, [0, 0]));
      }
      // 相机亚像素相位 ×4
      const phases = {};
      for (const [ox, oy] of [[0.3, 0.6], [0.7, 0.2], [0.5, 0.5], [0.1, 0.9]]) {
        for (let i = 0; i < 10; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
        await raf(); await raf();
        phases[`${ox},${oy}`] = dumpAround(tree, [ox, oy]);
      }
      // 汇总坏行
      const badRows = (rows) => rows.filter((r) => r.rel >= -3 && r.rel <= 4 && (r.op === 0 || (r.op < 0.55 && r.op + r.semi < 0.9)));
      const badFrames = fr.filter(badRows().length ? badRows : () => false);
      out.trees.push({
        tree, pieces, hood,
        badFrameCount: fr.map(badRows).filter((b) => b.length > 0).length,
        sampleBad: badFrames.length ? badRows(fr.find((r) => badRows(r).length) ?? fr[0]) : null,
        phasesBad: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, badRows(v).length])),
      });
    }
  } catch (err) { out.steps.push({ n: 'ERR ' + String(err && err.stack || err).slice(0, 500), c: false }); }
  return out;
});
for (const s of res.steps) console.log((s.c ? 'PASS' : 'FAIL') + ':', s.n, s.e ?? '');
console.log('leads:', JSON.stringify(res.leads));
for (const t of res.trees ?? []) {
  console.log(`\n=== 树@(${t.tree.x},markerY=${t.tree.markerY}) 铅矿Y=${t.tree.oreY} 泥土层数=${t.tree.dirtSeen} ===`);
  console.log('干件(top→):', t.pieces.join(' | '));
  console.log('邻域:', t.hood.join('  '));
  console.log('坏帧数(24帧):', t.badFrameCount, '样例坏行:', JSON.stringify(t.sampleBad));
  console.log('相机相位坏行:', JSON.stringify(t.phasesBad));
}
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
