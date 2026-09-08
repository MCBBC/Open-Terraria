// SW-BJ30 坡轨失速逐 tick 取证:包装 cart.fixedUpdate 记录探针内部量
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1280, height: 832 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
const clickText = async (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);
console.log('[boot]', await clickText('单人模式'), await clickText('新建'));
await new Promise((r) => setTimeout(r, 1500));
console.log('[create]', await page.evaluate(() => {
  const b = document.querySelector('[data-act="create"]');
  if (b && b.offsetParent) { b.click(); return true; }
  return false;
}));
await new Promise((r) => setTimeout(r, 1500));
console.log('[world]', await clickText('创建新世界'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 420000, polling: 2000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MT = await import('/src/world/MinecartTrack.ts');
  const tiles = await import('/src/data/tiles.ts');
  const idOfSheet = (sh) => { for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i; return -1; };
  const STONE = idOfSheet(1);
  const TRACK = MT.TRACK_TILE;
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 60), st.w - 90);
  const F = Math.floor(st.h / 2) - 260;
  for (let x = x0 - 26; x <= x0 + 50; x++) for (let y = F - 16; y <= F + 3; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.get(x, y) !== 0 || st.slope[st.idx(x, y)] !== 0 || st.half[st.idx(x, y)] !== 0) st.setTile(x, y, 0, 0, 0);
    st.setSlope(x, y, 0);
    const i = st.idx(x, y);
    if (st.liquid[i] > 0) st.liquid[i] = 0;
  }
  const layTrack = (tx, ty) => { MT.placeTrack(st, tx, ty, 0); MT.frameTrackArea(st, tx, ty); };
  for (let x = x0 - 22; x <= x0 + 7; x++) st.setTile(x, F, STONE, 0, 0);
  for (let x = x0 - 22; x <= x0 + 7; x++) layTrack(x, F - 1);
  for (let k = 0; k <= 5; k++) {
    const col = x0 + 8 + k, surf = F - 1 - k;
    st.setTile(col, surf, STONE, 0, 0); st.setSlope(col, surf, 1);
    for (let y = surf + 1; y <= F; y++) st.setTile(col, y, STONE, 0, 0);
    layTrack(col, surf - 1);
  }
  for (let x = x0 + 14; x <= x0 + 18; x++) st.setTile(x, F - 6, STONE, 0, 0);
  for (let x = x0 + 14; x <= x0 + 18; x++) layTrack(x, F - 7);
  for (let k = 0; k <= 5; k++) {
    const col = x0 + 19 + k, surf = F - 5 + k;
    st.setTile(col, surf, STONE, 0, 0); st.setSlope(col, surf, 2);
    for (let y = surf + 1; y <= F; y++) st.setTile(col, y, STONE, 0, 0);
    layTrack(col, surf - 1);
  }
  for (let x = x0 + 25; x <= x0 + 38; x++) st.setTile(x, F, STONE, 0, 0);
  for (let x = x0 + 25; x <= x0 + 38; x++) layTrack(x, F - 1);

  // 上车 + 逐 tick 记录（多次亚像素相位重复,捕捉失速窗口）
  const p = g.player;
  const results = [];
  for (let phase = 0; phase < 8; phase++) {
    if (g.minecart) g.dismountMinecart();
    await sleep(150);
    const ok = g.mountMinecartAt(x0 - 18, F - 1, -1);
    if (!ok) return { mountFail: true, x0, F };
    const cart = g.minecart;
    cart.x = (x0 - 18) * 16 + 8 - cart.w / 2 + phase * 0.125;
    cart.y = (F - 1) * 16 - cart.h;
    cart.vx = 10; cart.vy = 0;
    const orig = cart.fixedUpdate;
    const log = [];
    cart.fixedUpdate = function (dt, hooks) {
      orig.call(this, dt, hooks);
      const headX = Math.floor((this.x + this.w / 2 + Math.sign(this.vx) * this.w / 2) / 16);
      const feetY = Math.floor((this.y + this.h - 4) / 16);
      const inB = st.inBounds(headX, feetY);
      log.push({
        x: +(this.x / 16).toFixed(2), y: +(this.y / 16).toFixed(2),
        vx: +this.vx.toFixed(2), vy: +this.vy.toFixed(3), on: !!this.onTrackNow,
        wg: !!this.onWrongGround,
        headX, feetY,
        t: inB ? st.get(headX, feetY) : -9,
        sl: inB ? st.slope[st.idx(headX, feetY)] : -9,
        solid: inB ? st.isSolid(headX, feetY) : false,
        trkA: st.inBounds(headX, feetY) && st.get(headX, feetY) === TRACK,
        trkB: st.inBounds(headX, feetY - 1) && st.get(headX, feetY - 1) === TRACK,
      });
      if (log.length > 400) throw new Error('log overflow');
    };
    Object.defineProperty(p, 'inputX', { configurable: true, get: () => 1, set: (v) => { void v; } });
    await sleep(1400);
    delete p.inputX;
    // 只保留脱轨窗口（on true→false 前后各 8 tick）或全程摘要
    let idx = -1;
    for (let i = 1; i < log.length; i++) if (log[i - 1].on && !log[i].on) { idx = i; break; }
    const summary = {
      phase, ticks: log.length,
      derail: idx >= 0,
      endX: log.length ? log[log.length - 1].x : null,
      stuck: idx >= 0 && log[log.length - 1].vx === 0 && !log[log.length - 1].on,
    };
    let window = null;
    if (idx >= 0) window = log.slice(Math.max(0, idx - 8), idx + 4);
    results.push({ ...summary, window });
  }
  return { x0, F, results };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
