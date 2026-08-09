// 半砖系统全链路验证：生成放置 / 渲染裁剪 / 水浸润（IsHalfBrick 分支） / 物理碰撞 / 瀑布触发
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 1) 生成期半砖存在：统计全图 + 水线半砖
const gen = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  let total = 0, atWater = 0;
  for (let i = 0; i < st.half.length; i++) {
    if (st.half[i]) {
      total++;
      // 水线半砖：上方或左右有液体
      const x = i % st.w, y = (i / st.w) | 0;
      if (y > 0 && st.liquid[i - st.w] > 0) atWater++;
      else if (x > 0 && st.liquid[i - 1] > 100) atWater++;
      else if (x < st.w - 1 && st.liquid[i + 1] > 100) atWater++;
    }
  }
  return { total, atWater };
});
check('生成期产生半砖（Smooth World/Waterfalls pass）', gen.total > 200, JSON.stringify(gen));
check('水线处存在半砖（浸润载体）', gen.atWater > 20, `atWater=${gen.atWater}`);

// 2) 渲染：半砖格上半 8px 应透明（贴图只占下半）
if (gen.atWater > 0) {
  const sample = await page.evaluate((gen2) => {
    const g = window.__swGame;
    const st = g.world.store;
    // 找一个"上方有水"的半砖
    let target = null;
    for (let i = 0; i < st.half.length && !target; i++) {
      if (st.half[i] && i - st.w >= 0 && st.liquid[i - st.w] > 200) {
        const x = i % st.w, y = (i / st.w) | 0;
        target = { x, y };
      }
    }
    if (!target) return null;
    g.renderer.fullbright = true;
    // 清迷雾（否则未探索区采样被雾染色）
    g.world.explored.fill(1);
    g.world.exploredVersion++;
    g.camera.zoom = 2.0; g.camera.zoomTarget = 2.0;
    g.player.x = target.x * 16 - 8;
    g.player.y = (target.y - 8) * 16;
    return target;
  });
  if (sample) {
    await new Promise((r) => setTimeout(r, 1000));
    const px = await page.evaluate((t) => {
      const g = window.__swGame;
      const p = (ox, oy) => {
        const [sx, sy] = g.camera.worldToScreen(t.x * 16 + ox, t.y * 16 + oy);
        const d = g.renderer.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      };
      return { sliver: p(8, 6), band: p(8, 2), bottomHalf: p(8, 13), aboveWater: p(8, -5) };
    }, sample);
    // 半砖上半应显示液体浸润（蓝）而非贴图；下半是贴图
    const waterish = (c) => c[2] > c[0] + 20 && c[2] > 60;
    check('半砖格水条渲染（IsHalfBrick：格内 4-8px 水色，原版 MIN_LIQUID_SIZE=0.25）',
      waterish(px.sliver), `sliver=${px.sliver} band=${px.band} bottom=${px.bottomHalf}`);
  } else {
    check('找到水上半砖采样点', false);
  }
}

// 3) 物理：主角站上半砖，脚底 = 半砖顶面 (ty*16+8)
const phys = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找一个地表半砖（上方 4 格净空，避免落体途中撞到遮挡）
  let target = null;
  for (let y = Math.floor(g.world.groundLevel) - 10; y < Math.floor(g.world.groundLevel) + 40 && !target; y++) {
    for (let x = 100; x < st.w - 100 && !target; x++) {
      if (!st.half[st.idx(x, y)]) continue;
      let clear = true;
      for (let d = 1; d <= 4; d++) {
        if (st.isSolid(x, y - d)) { clear = false; break; }
      }
      if (clear) target = { x, y };
    }
  }
  if (!target) return null;
  // 主角放半砖上方 4 格，落体 60 帧模拟
  const p = g.player;
  p.x = target.x * 16;
  p.y = (target.y - 4) * 16;
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 240; i++) p.fixedUpdate(1 / 60, g);
  return { target, feetY: p.y + p.h, expected: target.y * 16 + 8, onGround: p.onGround };
});
if (phys) {
  check('主角站在半砖顶面（下半 8px 碰撞盒）', phys.onGround && Math.abs(phys.feetY - phys.expected) <= 1,
    `feet=${phys.feetY} expected=${phys.expected}`);
} else {
  check('找到地表半砖', false);
}

// 4) 瀑布：原版唇缘条件（半砖 + 侧旁水>160 + 上方干 + 对侧空）应触发 WaterfallRenderer
if (gen.atWater > 0) {
  const lip = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const solid = (x, y) => {
      const t = st.get(x, y);
      if (t === 0) return false;
      const d = window.__TILE_DEFS__?.[t];
      return st.isSolid(x, y);
    };
    // 原版唇缘：half && (上干或上实) && 一侧 liquid>160 && 对侧空
    for (let y = 30; y < st.h - 30; y++) {
      for (let x = 30; x < st.w - 30; x++) {
        const i = st.idx(x, y);
        if (!st.half[i]) continue;
        const uq = st.liquid[i - st.w];
        if (!(uq < 16 || st.isSolid(x, y - 1))) continue;
        const lq = st.liquid[i - 1], rq = st.liquid[i + 1];
        const lOpen = lq === 0 && !st.isSolid(x - 1, y);
        const rOpen = rq === 0 && !st.isSolid(x + 1, y);
        if ((lq > 160 || rq > 160) && (lOpen || rOpen)) {
          g.world.explored.fill(1); g.world.exploredVersion++;
          g.player.x = x * 16 - 8;
          g.player.y = (y - 10) * 16;
          return { x, y };
        }
      }
    }
    return null;
  });
  await new Promise((r) => setTimeout(r, 1200)); // 等瀑布扫描（30 帧节流）
  const count = await page.evaluate(() => window.__swGame.renderer.waterfalls.count);
  check('瀑布唇缘触发（原版 halfBrick 条件）', lip !== null && count > 0, `lip=${JSON.stringify(lip)} count=${count}`);
}

// 5) 液体回归快查：海洋未被破坏
const ocean = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  let water = 0;
  for (let i = 0; i < st.liquid.length; i++) if (st.liquid[i] > 0 && st.liquidType[i] === 1) water++;
  return water;
});
check('海洋回归（水格数量正常）', ocean > 100000, `water=${ocean}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(fail ? 1 : 0);
