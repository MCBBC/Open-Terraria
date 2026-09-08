// SW-BJ30 2026-09-08 轨道三症状法证探针（真实游戏）
// ①45°坡轨行驶 ②挖下方块→轨道是否被破坏 ③下方空格插火把→轨道是否被破坏
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
const SHOT = process.env.SW_SHOT_DIR ?? '/tmp/bj30';
fs.mkdirSync(SHOT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1280, height: 832 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]') || t.startsWith('PAGE') || /error|异常/i.test(t)) console.log('PAGE:', t.slice(0, 240)); });
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
console.log('[probe] UI 单人模式 → 创建新世界');
console.log('[click]', await clickText('单人模式'));
await new Promise((r) => setTimeout(r, 1200));
console.log('[click 小]', await clickText('小'));
await new Promise((r) => setTimeout(r, 600));
console.log('[click 创建新世界]', await clickText('创建新世界'));
console.log('[probe] wait world');
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 420000, polling: 2000 });
await new Promise((r) => setTimeout(r, 2000));
// 关掉欢迎弹窗（挡输入/可能暂停更新）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 800));
console.log('[probe] world ready');

const shot = async (name) => {
  await page.screenshot({ path: `${SHOT}/${name}.png` });
};

const outJson = await page.evaluate(async () => {
  try {
  console.log('[probe] build scene');
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MT = await import('/src/world/MinecartTrack.ts');
  const tiles = await import('/src/data/tiles.ts');
  const idOfSheet = (sh) => { for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i; return -1; };
  const STONE = idOfSheet(1);
  const TORCH = idOfSheet(4);
  const TRACK = MT.TRACK_TILE;
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 30), st.w - 60);
  const F = Math.floor(st.h / 2) - 260;
  // 清空大场景
  for (let x = x0 - 4; x <= x0 + 44; x++) for (let y = F - 14; y <= F + 3; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.get(x, y) !== 0 || st.slope[st.idx(x, y)] !== 0 || st.half[st.idx(x, y)] !== 0) st.setTile(x, y, 0, 0, 0);
    st.setSlope(x, y, 0);
    const i = st.idx(x, y);
    if (st.liquid[i] > 0) st.liquid[i] = 0;
  }
  // ---- 场景①：平轨 8 → 45°上坡 6（带坡面山体）→ 平顶 5 ----
  const layTrack = (tx, ty) => { MT.placeTrack(st, tx, ty, 0); MT.frameTrackArea(st, tx, ty); };
  // 平地
  for (let x = x0; x <= x0 + 7; x++) st.setTile(x, F, STONE, 0, 0);
  for (let x = x0; x <= x0 + 7; x++) layTrack(x, F - 1);
  // 山体 45°（slope 1 = 右上行坡）+ 轨道
  for (let k = 0; k <= 5; k++) {
    const col = x0 + 8 + k, surf = F - 1 - k;
    st.setTile(col, surf, STONE, 0, 0); st.setSlope(col, surf, 1);
    for (let y = surf + 1; y <= F; y++) st.setTile(col, y, STONE, 0, 0);
    layTrack(col, surf - 1);
  }
  // 平顶
  for (let x = x0 + 14; x <= x0 + 18; x++) st.setTile(x, F - 6, STONE, 0, 0);
  for (let x = x0 + 14; x <= x0 + 18; x++) layTrack(x, F - 7);
  // 下山 45°（镜像）+ 谷底平轨：用于速度测量（上坡/下坡/平直）
  for (let k = 0; k <= 5; k++) {
    const col = x0 + 19 + k, surf = F - 7 + k;
    st.setTile(col, surf, STONE, 0, 0); st.setSlope(col, surf, 2);   // slope 2 = 右下行坡
    for (let y = surf + 1; y <= F; y++) st.setTile(col, y, STONE, 0, 0);
    layTrack(col, surf - 1);
  }
  for (let x = x0 + 25; x <= x0 + 31; x++) st.setTile(x, F, STONE, 0, 0);
  for (let x = x0 + 25; x <= x0 + 31; x++) layTrack(x, F - 1);
  const trackFrames = [];
  for (let x = x0; x <= x0 + 31; x++) {
    const rel = x - x0;
    const ty = rel <= 7 ? F - 1 : rel <= 13 ? (F - 2 - (rel - 8)) : rel <= 18 ? F - 7 : rel <= 24 ? (F - 8 + (rel - 19)) : F - 1;
    trackFrames.push({ x: rel, y: ty - (F - 7), fx: st.frameX[st.idx(x, ty)], fy: st.frameY[st.idx(x, ty)] === 0xFFFF ? -1 : st.frameY[st.idx(x, ty)] });
  }
  // 镜头对准场景
  const p = g.player;
  p.x = (x0 + 2) * 16 + 8; p.y = (F - 3) * 16; p.vx = 0; p.vy = 0; p.useTime = 0;
  await sleep(600);
  return JSON.stringify({ x0, F, STONE, TORCH, TRACK, trackFrames });
  } catch (e) {
    return JSON.stringify({ buildError: String(e && e.stack || e).slice(0, 500) });
  }
});
const out = JSON.parse(outJson);
if (out.buildError) { console.log('[probe] BUILD ERROR:', out.buildError); process.exit(1); }

// 截图场景①（轨道铺设形态）
await page.evaluate((o) => { const g = window.__swGame; g.player.x = (o.x0 + 9) * 16; g.player.y = (o.F - 4) * 16; }, out);
await new Promise((r) => setTimeout(r, 800));
await shot('scene1-slope-track-before-drive');

const drive = await page.evaluate(async (o) => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = g.player;
  const ok = g.mountMinecartAt(o.x0 + 2, o.F - 1, -1);
  if (!ok) return { mountFail: true };
  const cart = g.minecart;
  cart.x = (o.x0 + 2) * 16 + 8 - cart.w / 2;
  cart.y = (o.F - 1) * 16 - cart.h;
  cart.vx = 0; cart.vy = 0;
  Object.defineProperty(p, 'inputX', { configurable: true, get: () => 1, set: (v) => { void v; } });
  const samples = [];
  for (let i = 0; i < 28; i++) {
    await sleep(250);
    samples.push({
      t: +((i + 1) * 0.25).toFixed(2),
      tx: +(cart.x / 16).toFixed(1), ty: +(cart.y / 16).toFixed(1),
      vx: +cart.vx.toFixed(2), on: !!cart.onTrackNow,
    });
    if (!g.minecart) break;
  }
  delete p.inputX;
  const startX = o.x0 + 2;
  const reachedTop = g.minecart ? (g.minecart.x / 16 >= o.x0 + 14) : samples.some((s) => s.tx >= o.x0 + 14);
  const maxY = samples.length ? Math.min(...samples.map((s) => s.ty)) : null;
  const endX = g.minecart ? +(g.minecart.x / 16).toFixed(1) : samples.length ? samples[samples.length - 1].tx : null;
  return { mounted: true, startX, endX, reachedTop, minTyOnCart: maxY, samples };
}, out);
await shot('scene1-slope-track-after-drive');

const rest = await page.evaluate(async (o) => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = g.player;
  if (g.minecart) g.dismountMinecart();
  p.inputX = 0;
  const MT = await import('/src/world/MinecartTrack.ts');
  const res = {};
  // ---- 场景②：挖轨道正下方支撑块（真实 mining 链）----
  const b0 = o.x0 + 22;
  for (let x = b0; x <= b0 + 5; x++) st.setTile(x, o.F, 1, 0, 0);       // 石头支座
  for (let x = b0; x <= b0 + 5; x++) { MT.placeTrack(st, x, o.F - 1, 0); MT.frameTrackArea(st, x, o.F - 1); }
  p.x = (b0 + 3) * 16; p.y = (o.F - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0;
  await sleep(400);
  const trackBefore2 = st.get(b0 + 2, o.F - 1) === MT.TRACK_TILE;
  g.breakTile(b0 + 2, o.F);                                            // 挖支撑
  await sleep(400);
  res.digBelow = {
    trackBefore: trackBefore2,
    supportGone: st.get(b0 + 2, o.F) === 0,
    trackAfter: st.get(b0 + 2, o.F - 1) === MT.TRACK_TILE,
    trackTypeAfter: st.get(b0 + 2, o.F - 1),
  };
  // ---- 场景③：轨道下方空格插火把（真实 torch 放置链）----
  const c0 = o.x0 + 30;
  for (let x = c0; x <= c0 + 5; x++) st.setTile(x, o.F + 1, 1, 0, 0);   // 地面（火把锚）
  // 悬空轨道：轨道格下 (x,F) 保持空
  for (let x = c0; x <= c0 + 5; x++) { MT.placeTrack(st, x, o.F - 1, 0); MT.frameTrackArea(st, x, o.F - 1); }
  p.x = (c0 + 3) * 16; p.y = (o.F - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0;
  await sleep(400);
  const trackBefore3 = st.get(c0 + 2, o.F - 1) === MT.TRACK_TILE;
  // 真实火把放置：手持火把 + tryPlace 于 (c0+2, o.F)（轨道正下方空格）
  const items = await import('/src/data/items.ts');
  const inv = g.player.inv;
  const sel = inv.selected;
  const saved = inv.slots[sel];
  let torchIdx = -1;
  for (let i = 0; i < items.ITEM_DEFS.length; i++) {
    if (items.ITEM_DEFS[i]?.tile === 'v_4_torch' || items.ITEM_DEFS[i]?.key === 'torch') { torchIdx = i; break; }
  }
  let torchPlace = null;
  if (torchIdx >= 0) {
    inv.slots[sel] = { id: torchIdx, stack: 10, favorited: false, prefix: 0 };
    inv.selected = sel;
    g.player.useTime = 0;
    g['tryPlace'].call(g, c0 + 2, o.F, items.ITEM_DEFS[torchIdx]);
    torchPlace = {
      torchPlaced: st.get(c0 + 2, o.F) !== 0,
      torchType: st.get(c0 + 2, o.F),
    };
    inv.slots[sel] = saved;
  }
  await sleep(400);
  res.torchBelow = {
    trackBefore: trackBefore3,
    ...torchPlace,
    trackAfter: st.get(c0 + 2, o.F - 1) === MT.TRACK_TILE,
    trackTypeAfter: st.get(c0 + 2, o.F - 1),
  };
  // 补充定谳：轨道本身无支撑要求复核——纯悬空孤轨（无任何邻轨/邻块）写入后帧
  const iso = { x: o.x0 + 40, y: o.F - 1 };
  MT.placeTrack(st, iso.x, iso.y, 0);
  MT.frameTrackArea(st, iso.x, iso.y);
  res.isolatedTrack = { survives: st.get(iso.x, iso.y) === MT.TRACK_TILE, fx: st.frameX[st.idx(iso.x, iso.y)] };
  return res;
}, out);

await shot('scene23-dig-torch');
console.log(JSON.stringify({ scene: out, drive, ...rest }, null, 2));
await browser.close();
