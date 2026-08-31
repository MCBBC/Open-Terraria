// 站半砖(halfBrick)/平台(platform)时荆棘旋刃发射复现探针。
// 记录:落台后脚线与格线关系 / store.half / 三角度投掷轨迹。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 60 && !st.isSolid(px0, gy)) gy++;

  // 半砖行
  const gy2 = gy + 30;
  // 平台行(可选)
  const gyP = gy + 50;

  const clearRows = (rowTop) => {
    for (let dx = -40; dx <= 40; dx++) for (let dy = -16; dy <= -1; dy++) st.setTile(px0 + dx, rowTop + dy, 0);
    for (let dx = -40; dx <= 40; dx++) { st.setTile(px0 + dx, rowTop, 0); }
  };
  const buildSolid = (row) => {
    clearRows(row);
    for (let dx = -40; dx <= 40; dx++) { st.setTile(px0 + dx, row, 2); st.setHalfBrick(px0 + dx, row, false); }
  };
  const buildHalf = (row) => {
    clearRows(row);
    for (let dx = -20; dx <= 20; dx++) {
      for (let dy = 1; dy <= 6; dy++) st.setTile(px0 + dx, row + dy, 2);
      st.setTile(px0 + dx, row, 2);
      st.setHalfBrick(px0 + dx, row, true);
      st.setSlope(px0 + dx, row + 1, 0);
    }
  };

  buildSolid(gy);

  const equipKey = () => {
    const id = window.__swItems['vi_191_ThornChakram'];
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.entities.projectiles.length = 0;
    g.player.useTime = 0;
    g.swing = null; g.recallChannel = null;
  };
  const settleOn = (surfaceRowY, expectHalf) => {
    g.player.x = px0 * 16 + 8 - g.player.w / 2;
    g.player.y = (surfaceRowY - 4) * 16 - g.player.h;
    if ('vx' in g.player) g.player.vx = 0;
    if ('vy' in g.player) g.player.vy = 0;
    for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    const feet = +(g.player.y + g.player.h).toFixed(2);
    return {
      feet,
      footInCellPx: +(feet - surfaceRowY * 16).toFixed(2),
      isSolidHere: st.isSolid(px0, surfaceRowY),
      halfBit: !!st.half[st.idx(px0, surfaceRowY)],
      slopeBit: st.slope[st.idx(px0, surfaceRowY)],
      onGroundOk: !!g.player.onGround || feet >= surfaceRowY * 16,
    };
  };
  const chaks = () => g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead);

  const res = {};
  // ---- 控制组:实心地面 ----
  equipKey(); const sInfo = settleOn(gy, false);
  res.solidCtl = { ...sInfo };
  // 控制组投一次
  equipKey();
  g.input.mouseX = 960; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60); g.input.mouseDown = false; g.input.mouseHeld = false;
  res.solidCtl.spawned = chaks().length > 0;

  // ---- 半砖行:信息+三向投掷 ----
  buildHalf(gy2);
  equipKey();
  const hInfo = settleOn(gy2, true);
  res.halfBrick = hInfo;
  res.halfThrows = [];
  for (const [name, sx, sy] of [['up', 0, -360], ['horizRight', 320, 0], ['down', 0, 280]]) {
    equipKey();
    settleOn(gy2, true);
    g.input.mouseX = 640 + sx; g.input.mouseY = 400 + sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const p0 = chaks()[0];
    const trace = [];
    let maxDist = 0;
    if (p0) {
      for (let i = 0; i < 24; i++) {
        trace.push({ t: i, x: +p0.x.toFixed(1), y: +p0.y.toFixed(1), vx: p0.vx, vy: p0.vy, ai0: p0.ai0 });
        g.fixedUpdate(1 / 60);
        if (!p0.dead && chaks().includes(p0)) maxDist = Math.max(maxDist, Math.hypot(p0.cx - g.player.cx, p0.cy - g.player.cy));
        if (!chaks().includes(p0)) break;
      }
    }
    res.halfThrows.push({ name, spawned: !!p0, maxDist: Math.round(maxDist), stuckNearBody: !!p0 && maxDist < 25, firstFew: trace.slice(0, 5) });
    let wq = 0;
    while ((chaks().length || g.player.useTime > 0) && wq++ < 260) g.fixedUpdate(1 / 60);
    g.entities.projectiles.length = 0;
  }

  // ---- 平台行:找类型并测落台脚线(仅记录口径,不判弹体——原版 fallThrough 缺省 true) ----
  let platType = -1;
  for (let ty = 19; ty < 500 && platType < 0; ty++) {
    st.setTile(px0, gyP, ty);
    if (st.isPlatform(px0, gyP)) { platType = ty; break; }
    st.setTile(px0, gyP, 0);
  }
  res.platformTypeId = platType;
  if (platType >= 0) {
    for (let dx = -30; dx <= 30; dx++) { clearAround(px0 + dx, gyP); st.setTile(px0 + dx, gyP, platType); }
    function clearAround(x, y) { for (let dy2 = -8; dy2 <= -1; dy2++) st.setTile(x, y + dy2, 0); }
    equipKey();
    const pInfo = settleOn(gyP, false);
    res.platformStand = pInfo;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('[pageerrors]', errors.slice(0, 4));
await browser.close();
