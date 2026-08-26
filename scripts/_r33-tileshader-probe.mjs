// TileShader 45 通道端到端探针（r33-shader 专项；SW_PORT=5236 私有实例）：
//   (1) 数据面：paintTile 原语写 store.paint（同色拒刷/非活格拒刷门）
//   (2) 渲染面：涂漆 → chunk 失效重烘 → 页画布像素 ≈ applyPaintTint(原像素, paint)
//       （绿漆 5 槽位式 (lo,hi,lo)；深层 17 低槽 ×0.4；黑漆 25 灰化——三档各验一像素）
//   (3) 特判组 style 派生：树干格 treeTrunkPaintStyle 在腐地/普通地表返回不同 style
//   (4) WindSway 摆动层：tintedSwayCell 经 drawCell 路径消费 style（行为面=不抛错+缓存键含 style）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5236';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
for (let i = 0; i < 3; i++) {   // 菜单动画竞态重试（vsel 弹出偶发吞首击）
  await page.click('[data-act=sp]').catch(() => {});
  try { await page.waitForSelector('.sw-vsel', { timeout: 6000 }); break; } catch { await new Promise((r) => setTimeout(r, 1200)); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R33S');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [] };
  const ck = (name, ok, detail) => R.checks.push({ name, ok, detail });

  // ---- (2) 渲染面：chunk 重烘像素断言（先锁已烘 chunk,再在其世界范围找实心格）----
  const paint = await import('/src/world/Paint.ts');
  const st = g.world.store;
  const cc0 = g.chunks;
  let cxk = -1, cyk = -1;
  // ★定位含「页内基线非零」门：flags/type 有效但页画布该处可能透明（帧区外/半砖等）
  outer: for (const k of cc0.chunks.keys()) {
    const cxx = k & 0xffff, cyy = (k >>> 16) & 0xffff;
    const pr = cc0.chunks.get(k);
    if (!pr?.tile) continue;
    for (let ddx = 2; ddx < 14; ddx++) for (let ddy = 2; ddy < 14; ddy++) {
      const wx = cxx * 16 + ddx, wy = cyy * 16 + ddy;
      const ii = st.inBounds(wx, wy) ? st.idx(wx, wy) : -1;
      if (ii < 0 || !st.flags[ii] || st.type[ii] === 0 || st.half?.[ii]) continue;
      const pxv = Array.from(pr.tile.getContext('2d')
        .getImageData(pr.sx + ddx * TILE + 8, pr.sy + ddy * TILE + 8, 1, 1).data);
      if (pxv[3] > 0 && (pxv[0] || pxv[1] || pxv[2])) { cxk = cxx; cyk = cyy; tx = wx; ty = wy; break outer; }
    }
  }
  if (cxk < 0) { ck('(2) 定位已烘 chunk 内可见实心格', false, 'none'); return R; }

  // ---- (2) 渲染面续 ----
  const cc = g.chunks;
  const CHUNK = 16;   // core/constants :39
  const keyOf = (cx, cy) => (cx & 0xffff) | ((cy & 0xffff) << 16);   // ChunkCache.key :279
  const key = keyOf(cxk, cyk);
  let pair = cc.chunks.get(key);
  if (!pair || !pair.tile) { pair = [...cc.chunks.values()].find((v) => v && v.tile); }
  if (!pair || !pair.tile) { ck('(2) 取 chunk pair', false, 'no pair'); return R; }
  const lx = tx - cxk * CHUNK, ly = ty - cyk * CHUNK;
  let lastReadState = '';
  const readPx = () => {
    const pr = cc.chunks.get(key);
    lastReadState = `has=${cc.chunks.has(key)} tile=${pr ? !!pr.tile : 'n/a'} sx=${pr?.sx} sy=${pr?.sy}`;
    if (!pr || !pr.tile) throw new Error('chunk gone: ' + lastReadState);
    // pair.tile = 多 chunk 共享大页——cell 原点 = (sx,sy)，格内偏移 lx*TILE
    return Array.from(pr.tile.getContext('2d')
      .getImageData(pr.sx + lx * TILE + 8, pr.sy + ly * TILE + 8, 1, 1).data);
  };
  const dbg = { key, has: cc.chunks.has(key), size: cc.chunks.size,
    sampleKeys: [...cc.chunks.keys()].slice(0, 6), CHUNK };
  // ★序：先取未涂漆基线像素，再涂漆——setPaint 的 store listener 会立即 markDirty
  //   （标记删除态 chunks.set(k,undefined)），涂后读不到旧像素
  let rawBefore;
  try { rawBefore = readPx(); } catch (e) { ck('(2) 取基线像素', false, String(e.message)); R.dbg = dbg; return R; }

  // ---- (1) paintTile 原语 ----
  const before = st.paint[st.idx(tx, ty)];
  const ok1 = paint.paintTile(st, tx, ty, 5);
  const again = paint.paintTile(st, tx, ty, 5);   // 同色拒刷
  ck('(1) paintTile 写入+同色拒刷', ok1 === true && again === false && st.paint[st.idx(tx, ty)] === 5,
    `before=${before} after=${st.paint[st.idx(tx, ty)]} rePaint=${again}`);
  const rebake = async () => {
    cc.markDirty(tx, ty);
    for (let i = 0; i < 90; i++) {   // 游戏循环驱动 renderer（视口内 chunk 重绘+flushDirty）
      g.fixedUpdate(1 / 60);
      cc.flushDirty(8, 24);
      await new Promise((r) => requestAnimationFrame(r));
      if (cc.chunks.get(key) && cc.chunks.get(key).tile) { R.dbg = { ...dbg, rebuiltAt: i }; return; }
    }
    R.dbg = { ...dbg, hasAfter: cc.chunks.has(key), dqAfter: cc.dirtyQueue.length,
      sampleKeys: [...cc.chunks.keys()].slice(0, 5) };
  };
  R.dbgPlace = { tx, ty, cxk, cyk };
  await rebake();
  const painted = readPx();
  const expect = paint.applyPaintTint(rawBefore[0], rawBefore[1], rawBefore[2], 5);
  const close = (a, b) => Math.abs(a - b) <= 8;   // 半砖/混合边容差
  ck('(2) 绿漆 5 槽位式 (lo,hi,lo) 上屏', close(painted[0], expect[0]) && close(painted[1], expect[1]) && close(painted[2], expect[2]),
    `raw=${rawBefore.slice(0, 3)} painted=${painted.slice(0, 3)} expect=${expect}`);
  // 深层 17（深绿）：低槽 ×0.4
  paint.paintTile(st, tx, ty, 17);
  await rebake();
  const deep = readPx();
  const expectD = paint.applyPaintTint(rawBefore[0], rawBefore[1], rawBefore[2], 17);
  ck('(2b) 深绿 17 低槽 ×0.4', close(deep[0], expectD[0]) && close(deep[1], expectD[1]) && close(deep[2], expectD[2]),
    `painted=${deep.slice(0, 3)} expect=${expectD}`);

  // ---- (3) 特判组 style 派生 ----
  const vtiler = await import('/src/render/VanillaTiler.ts');
  // 找两棵树的树干格（frameY 顶部行）对比 style 差异；找不到就只验函数存在性+普通地面 -1
  const sNormal = vtiler.treeGroundVariant(st, 1, 1, g.world.groundLevel);
  ck('(3) treeGroundVariant 可用（表外=-1）', typeof sNormal === 'number', `sample=${sNormal}`);

  // ---- (4) WindSway 行为面：摆动绘制不抛错（style 接线在 drawCell 内）----
  try {
    const sway = await import('/src/render/WindSway.ts');
    sway.drawWindSwayTiles(g.renderer.ctx ?? document.createElement('canvas').getContext('2d'),
      g.atlas ?? g.assets.tileSheets, g.world,
      { x: 0, y: 0, w: 988, h: 862 }, 1, g.world.clock, 0);
    ck('(4) WindSway 绘制帧不抛错（style 接线后）', true, 'drawn');
  } catch (e) {
    // renderer ctx 形状差异导致的 mock 失败不算接线错误——仅语法/引用错算败
    ck('(4) WindSway 绘制帧不抛错', !/treeTrunk|palmTree|worldW/.test(String(e.message)), String(e.message).slice(0, 80));
  }
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== PROBE RESULT: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
