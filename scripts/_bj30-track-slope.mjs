// SW-BJ30 2026-09-08 轨道三症状法证探针（真实游戏,v2）
// ①高速平轨→45°坡轨行驶（上/下坡） ②挖下方块→轨道是否被破坏 ③下方空格插火把→轨道是否被破坏
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
const SHOT = process.env.SW_SHOT_DIR ?? '/tmp/bj30';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1280, height: 832 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]') || /error|异常/i.test(t)) console.log('PAGE:', t.slice(0, 240)); });

console.log('[probe] goto', origin);
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
const clickText = async (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);
console.log('[probe] UI boot:', await clickText('单人模式'));
await new Promise((r) => setTimeout(r, 1200));
console.log('[probe] 新建:', await clickText('新建'));
await new Promise((r) => setTimeout(r, 1500));
console.log('[probe] data-act=create:', await page.evaluate(() => {
  const b = document.querySelector('[data-act="create"]');
  if (b && b.offsetParent) { b.click(); return true; }
  return false;
}));
await new Promise((r) => setTimeout(r, 1500));
// 点角色行（.sw-vitem click → close → showWorldSelect,CharSelect.ts:379）
console.log('[probe] char row click:', await page.evaluate(() => {
  const row = document.querySelector('.sw-vitem.sw-vpanel-item');
  if (row && row.offsetParent) { row.click(); return true; }
  return false;
}));
await new Promise((r) => setTimeout(r, 1500));
console.log('[probe] 创建世界:', await clickText('创建世界'));
await new Promise((r) => setTimeout(r, 900));
console.log('[probe] 创建(确认):', await clickText('创建'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 420000, polling: 2000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 600));
console.log('[probe] world ready');

const shot = async (name) => { await page.screenshot({ path: `${SHOT}/${name}.png` }); };

// ---- 构建场景 ----
const outJson = await page.evaluate(async () => {
  try {
    const g = window.__swGame;
    const st = g.world.store;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const MT = await import('/src/world/MinecartTrack.ts');
    const tiles = await import('/src/data/tiles.ts');
    const idOfSheet = (sh) => { for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i; return -1; };
    const STONE = idOfSheet(1);
    const TRACK = MT.TRACK_TILE;
    const x0 = Math.min(Math.max(Math.floor(st.w / 2), 60), st.w - 90);
    const F = 130;   // 固定高空层（地表上方,光照充足,任何世界尺寸都成立）
    // 清空大场景
    for (let x = x0 - 26; x <= x0 + 50; x++) for (let y = F - 16; y <= F + 3; y++) {
      if (!st.inBounds(x, y)) continue;
      if (st.get(x, y) !== 0 || st.slope[st.idx(x, y)] !== 0 || st.half[st.idx(x, y)] !== 0) st.setTile(x, y, 0, 0, 0);
      st.setSlope(x, y, 0);
      const i = st.idx(x, y);
      if (st.liquid[i] > 0) st.liquid[i] = 0;
    }
    const layTrack = (tx, ty) => { MT.placeTrack(st, tx, ty, 0); MT.frameTrackArea(st, tx, ty); };
    // 助跑道（平）x0-22..x0+7
    for (let x = x0 - 22; x <= x0 + 7; x++) st.setTile(x, F, STONE, 0, 0);
    for (let x = x0 - 22; x <= x0 + 7; x++) layTrack(x, F - 1);
    // 45° 上坡山体（★SW-RB8b 2026-09-09 坡 id 矫正：右上行=坡 2——smoothSlope
    //  cs:70037 位编码 case5 down+right→2,与 worldgen 生成地形一致;曾反标坡 1
    //  =镜像地形,恰好喂对当时的 vx 符号规则=伪绿,同 tests/sw-bj30 矫正）
    for (let k = 0; k <= 5; k++) {
      const col = x0 + 8 + k, surf = F - 1 - k;
      st.setTile(col, surf, STONE, 0, 0); st.setSlope(col, surf, 2);
      for (let y = surf + 1; y <= F; y++) st.setTile(col, y, STONE, 0, 0);
      layTrack(col, surf - 1);
    }
    // 顶部平轨 x0+14..x0+18
    for (let x = x0 + 14; x <= x0 + 18; x++) st.setTile(x, F - 6, STONE, 0, 0);
    for (let x = x0 + 14; x <= x0 + 18; x++) layTrack(x, F - 7);
    // 45° 下坡山体（右下行=坡 1）
    for (let k = 0; k <= 5; k++) {
      const col = x0 + 19 + k, surf = F - 5 + k;
      st.setTile(col, surf, STONE, 0, 0); st.setSlope(col, surf, 1);
      for (let y = surf + 1; y <= F; y++) st.setTile(col, y, STONE, 0, 0);
      layTrack(col, surf - 1);
    }
    // 谷底平轨 x0+25..x0+38
    for (let x = x0 + 25; x <= x0 + 38; x++) st.setTile(x, F, STONE, 0, 0);
    for (let x = x0 + 25; x <= x0 + 38; x++) layTrack(x, F - 1);
    const trackFrames = [];
    for (let x = x0 - 2; x <= x0 + 40; x++) {
      const rel = x - x0;
      const ty = rel <= 7 ? F - 1 : rel <= 13 ? (F - 2 - (rel - 8)) : rel <= 18 ? F - 7 : rel <= 24 ? (F - 6 + (rel - 19)) : F - 1;
      if (!st.inBounds(x, ty)) continue;
      trackFrames.push({ x: rel, y: ty - (F - 7), fx: st.frameX[st.idx(x, ty)], fy: st.frameY[st.idx(x, ty)] === 0xFFFF ? -1 : st.frameY[st.idx(x, ty)] });
    }
    return JSON.stringify({ x0, F, STONE, TRACK, trackFrames });
  } catch (e) {
    return JSON.stringify({ buildError: String(e && e.stack || e).slice(0, 600) });
  }
});
const out = JSON.parse(outJson);
if (out.buildError) { console.log('[probe] BUILD ERROR:', out.buildError); process.exit(1); }
console.log('[probe] frames:', JSON.stringify(out.trackFrames));

// 镜头对准场景
await page.evaluate((o) => {
  const g = window.__swGame;
  g.player.x = (o.x0 + 8) * 16; g.player.y = (o.F - 5) * 16; g.player.vx = 0; g.player.vy = 0;
}, out);
await new Promise((r) => setTimeout(r, 900));
await shot('scene1-slope-track');

// ---- 驱动测试：高速助跑 → 上坡 → 下坡 → 谷底 ----
const drive = await page.evaluate(async (o) => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = g.player;
  const run = async (vx0, label, approachRow) => {
    const ok = g.mountMinecartAt(o.x0 - 18, approachRow, -1);
    if (!ok) return { label, mountFail: true };
    const cart = g.minecart;
    cart.x = (o.x0 - 18) * 16 + 8 - cart.w / 2;
    cart.y = approachRow * 16 - cart.h;
    cart.vx = vx0; cart.vy = 0; cart.lastBoostX = 0; cart.lastBoostY = 0;
    p.x = cart.x; p.y = cart.y;
    Object.defineProperty(p, 'inputX', { configurable: true, get: () => 1, set: (v) => { void v; } });
    const samples = [];
    let last = { x: cart.x, y: cart.y };
    for (let i = 0; i < 50; i++) {
      await sleep(150);
      samples.push({
        t: +((i + 1) * 0.15).toFixed(2),
        tx: +(cart.x / 16).toFixed(1), ty: +(cart.y / 16).toFixed(1),
        dx: +(cart.x - last.x).toFixed(1), dy: +(cart.y - last.y).toFixed(1),
        vx: +cart.vx.toFixed(2), vy: +cart.vy.toFixed(2), on: !!cart.onTrackNow,
      });
      last = { x: cart.x, y: cart.y };
      if (!g.minecart) break;
      if (i > 6 && Math.abs(cart.x - samples[Math.max(0, samples.length - 5)].tx) < 0.05) break;   // 停滞早退
    }
    delete p.inputX;
    const endX = g.minecart ? +(g.minecart.x / 16).toFixed(1) : samples.length ? samples[samples.length - 1].tx : null;
    const maxVx = samples.length ? Math.max(...samples.map((s) => Math.abs(s.vx))) : null;
    const maxVy = samples.length ? Math.max(...samples.map((s) => Math.abs(s.vy))) : null;
    const maxDx = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dx))) : null;
    return { label, endX, maxAbsVx: maxVx, maxAbsVy: maxVy, maxAbsDxPerSample: maxDx, samples };
  };
  const r1 = await run(10, 'vx0=10 助跑上坡', o.F - 1);
  await sleep(500);
  if (g.minecart) g.dismountMinecart();
  await sleep(300);
  const r2 = await run(13, 'vx0=13 全速上坡', o.F - 1);
  delete p.inputX;
  return { r1, r2 };
}, out);
console.log('[drive r1]', JSON.stringify({ ...drive.r1, samples: drive.r1.samples ? drive.r1.samples.filter((_, i) => i % 2 === 0) : [] }));
console.log('[drive r2]', JSON.stringify({ ...drive.r2, samples: drive.r2.samples ? drive.r2.samples.filter((_, i) => i % 2 === 0) : [] }));
await shot('scene1-after-drive');

// ---- 场景②③：挖支撑/插火把 ----
const rest = await page.evaluate(async (o) => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = g.player;
  if (g.minecart) g.dismountMinecart();
  p.inputX = 0;
  const MT = await import('/src/world/MinecartTrack.ts');
  const tilesR = await import('/src/data/tiles.ts');
  const idOfSheetR = (sh) => { for (let i = 0; i < tilesR.TILE_DEFS.length; i++) if (tilesR.TILE_DEFS[i]?.vanilla?.sheet === sh) return i; return -1; };
  const TORCHID = idOfSheetR(4);
  const res = {};
  // 场景②：挖轨道正下方支撑块（真实 mining 链 breakTile）
  const b0 = o.x0 + 42;
  for (let x = b0; x <= b0 + 3; x++) st.setTile(x, o.F, 1, 0, 0);
  for (let x = b0; x <= b0 + 3; x++) { MT.placeTrack(st, x, o.F - 1, 0); MT.frameTrackArea(st, x, o.F - 1); }
  p.x = (b0 + 2) * 16; p.y = (o.F - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0;
  await sleep(300);
  res.digBelow = {
    trackBefore: st.get(b0 + 1, o.F - 1) === MT.TRACK_TILE,
  };
  g.breakTile(b0 + 1, o.F);
  await sleep(400);
  res.digBelow.supportGone = st.get(b0 + 1, o.F) === 0;
  res.digBelow.trackAfter = st.get(b0 + 1, o.F - 1) === MT.TRACK_TILE;
  // 场景③：轨道下方空格插火把（直写=与放置成功瞬间的级联同路径）
  const c0 = o.x0 + 48;
  for (let x = c0; x <= c0 + 3; x++) st.setTile(x, o.F + 1, 1, 0, 0);
  for (let x = c0; x <= c0 + 3; x++) { MT.placeTrack(st, x, o.F - 1, 0); MT.frameTrackArea(st, x, o.F - 1); }
  p.x = (c0 + 2) * 16; p.y = (o.F - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0;
  await sleep(300);
  res.torchBelow = { trackBefore: st.get(c0 + 1, o.F - 1) === MT.TRACK_TILE, groundRow: st.get(c0 + 1, o.F) };
  st.setTile(c0 + 1, o.F, TORCHID, 0, 0);   // 火把写入轨道正下方空格（锚=下方石台）
  await sleep(400);
  res.torchBelow.torchPlaced = st.get(c0 + 1, o.F) === TORCHID;
  res.torchBelow.trackAfter = st.get(c0 + 1, o.F - 1) === MT.TRACK_TILE;
  return res;
}, out);
console.log('[rest]', JSON.stringify(rest));
await shot('scene23-dig-torch');
await browser.close();
