// 荆棘旋刃修复终验 v3(自然节拍+原版选项面):
//   预置 options.autoReuseAllItems=true(种子 localStorage,kvGet 回退层)再进世界:
//   A 平地四向:出生盒心(读数剔除速度向量)+飞行
//   B 单发在场门:飞行中点击拦截/消亡后重生
//   C 持握链:autoReuseAllItems=true ⇒ 回手后自动再掷(spawns>=2)
//   D 木回旋镖站立回归
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1000));
// 种子选项:IndexedDB('sandboxworld'.'kv')清键 + localStorage 回退层写入
await page.evaluate(() => new Promise((resolve) => {
  const KEY = 'sandboxworld.options';
  localStorage.setItem(KEY, JSON.stringify({ autoReuseAllItems: true }));
  try {
    const rq = indexedDB.open('sandboxworld', 2);
    rq.onsuccess = () => {
      try {
        const db = rq.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_) { resolve(); }
    };
    rq.onerror = () => resolve();
  } catch (_) { setTimeout(resolve, 200); }
}));
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy;
  for (let dx = -40; dx <= 40; dx++) { for (let dy = -14; dy <= -1; dy++) st.setTile(px0 + dx, py + dy, 0); st.setTile(px0 + dx, py, 2); }
  const chaks = (pid = 33) => g.entities.projectiles.filter((p) => p.projId === pid && !p.dead);
  const cleanUpToIdle = () => {
    // 自然节拍收尾:松手后等弹体死光(useTime 期间自然走完)
    g.input.mouseDown = false; g.input.mouseHeld = false;
    let t = 0;
    while ((chaks().length || g.player.useTime > 0) && t < 260) { g.fixedUpdate(1 / 60); t++; }
    g.entities.projectiles.length = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  };
  const equipKey = (key) => {
    cleanUpToIdle();
    const id = window.__swItems[key];
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
  };
  const standFlush = () => {
    g.player.x = px0 * 16 + 8 - g.player.w / 2;
    g.player.y = py * 16 - g.player.h;
    if ('vx' in g.player) g.player.vx = 0;
    if ('vy' in g.player) g.player.vy = 0;
  };
  const out = {};
  out.optionValueOn = true; // 本次页面运行期即开启
  // ---- A ----
  out.A = {};
  for (const [name, sx, sy] of [['horizRight', 320, 0], ['diagUp', 220, -220], ['up', 0, -360]]) {
    equipKey('vi_191_ThornChakram'); standFlush();
    g.input.mouseX = 640 + sx; g.input.mouseY = 400 + sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const p0 = chaks()[0];
    if (!p0) { out.A[name] = null; continue; }
    const bornDX = +(p0.x + p0.w / 2 - p0.vx - g.player.cx).toFixed(2);
    const bornDY = +(p0.y + p0.h / 2 - p0.vy - g.player.cy).toFixed(2);
    let maxDist = 0, aliveAt15 = false;
    for (let i = 0; i < 30; i++) {
      g.fixedUpdate(1 / 60);
      if (!chaks().includes(p0)) break;
      maxDist = Math.max(maxDist, Math.hypot(p0.cx - g.player.cx, p0.cy - g.player.cy));
      if (i >= 14) { aliveAt15 = true; break; }
    }
    out.A[name] = { bornDX, bornDY, maxDist: Math.round(maxDist), aliveAt15 };
    cleanUpToIdle();
  }
  // ---- B 单发门(连点拦截/消亡后重生) ----
  equipKey('vi_191_ThornChakram'); standFlush();
  g.input.mouseX = 960; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const firstAlive = chaks().length;
  for (let i = 0; i < 30 && firstAlive; i++) g.fixedUpdate(1 / 60);
  g.input.mouseY = 200;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const afterBlockedClick = chaks().length;
  let waited = 0;
  while (chaks().length && waited < 220) { g.fixedUpdate(1 / 60); waited++; }
  g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.B = { firstAlive, afterBlockedClick, respawnAfterDeath: chaks().length, waited };
  cleanUpToIdle();
  // ---- C 持握链(autoReuseAllItems=true):回手后自动再掷 ----
  equipKey('vi_191_ThornChakram'); standFlush();
  g.input.mouseX = 960; g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const seen = new Set();
  const seq = [];
  let lastAlive = 0;
  for (let i = 0; i < 220; i++) {
    g.fixedUpdate(1 / 60);
    for (const p of chaks()) if (!seen.has(p)) { seen.add(p); seq.push(i); }
    const a = chaks().length;
    if (seq.length >= 1 && lastAlive === 1 && a === 0) seq.push('|death|');
    lastAlive = a;
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.C = { spawns: seen.size, seq: seq.slice(0, 8) };
  cleanUpToIdle();
  // ---- D 木回旋镖 ----
  equipKey('vi_284_wooden_boomerang'); standFlush();
  g.input.mouseX = 640 + 320; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const wb = chaks(52)[0];
  out.D = wb ? {
    bornDX: +(wb.x + wb.w / 2 - wb.vx - g.player.cx).toFixed(2),
    bornDY: +(wb.y + wb.h / 2 - wb.vy - g.player.cy).toFixed(2),
    maxDist8: (() => { let m = 0; for (let i = 0; i < 8 && chaks(52).includes(wb); i++) { g.fixedUpdate(1 / 60); m = Math.max(m, Math.hypot(wb.cx - g.player.cx, wb.cy - g.player.cy)); } return Math.round(m); })(),
  } : null;
  cleanUpToIdle();
  // ---- E 半砖站立发射（2026-08-31 二次报修）----
  const gyHalf = py + 30;
  const buildHalfRow = () => {
    for (let dx = -24; dx <= 24; dx++) {
      for (let dy = -16; dy <= 6; dy++) st.setTile(px0 + dx, gyHalf + dy, dy === 0 ? 2 : 0);
      st.setHalfBrick(px0 + dx, gyHalf, true);
      // ★不得再调 setSlope 清余波——store.setSlope 无条件 halfBrick(false),
      //   会把刚置的半砖位抹掉（终审实录：footInCellPx 落回 0 的根因）
    }
  };
  buildHalfRow();
  const settleOnRow = (row) => {
    g.player.x = px0 * 16 + 8 - g.player.w / 2;
    g.player.y = (row - 4) * 16 - g.player.h;
    if ('vx' in g.player) g.player.vx = 0;
    if ('vy' in g.player) g.player.vy = 0;
    for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  };
  out.E = {};
  for (const [name, sx, sy] of [['horizRight', 320, 0], ['up', 0, -360]]) {
    equipKey('vi_191_ThornChakram');
    const dbgHalf0 = !!st.half[st.idx(px0, gyHalf)];
    const dbgSolid0 = st.isSolid(px0, gyHalf);
    const dbgType0 = st.type[st.idx(px0, gyHalf)];
    settleOnRow(gyHalf);
    const dbgHalfAfter = !!st.half[st.idx(px0, gyHalf)];
    out.E.standFootInCellPx = +(g.player.y + g.player.h - gyHalf * 16).toFixed(2);
    out.E.dbg = { half0: dbgHalf0, halfAfter: dbgHalfAfter, solid0: dbgSolid0, type0: dbgType0 };
    g.input.mouseX = 640 + sx; g.input.mouseY = 400 + sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const p0 = chaks()[0];
    let maxDist = 0, alive10 = false;
    if (p0) for (let i = 0; i < 14; i++) {
      g.fixedUpdate(1 / 60);
      if (!chaks().includes(p0)) break;
      maxDist = Math.max(maxDist, Math.hypot(p0.cx - g.player.cx, p0.cy - g.player.cy));
      if (i >= 9) { alive10 = true; break; }
    }
    out.E[name] = { spawned: !!p0, maxDist: Math.round(maxDist), alive10 };
    cleanUpToIdle();
  }
  // ---- F(平台穿透):浏览器鼠标→世界 Y 映射对探针环境过敏不可靠,已改为
  //        tests/halfbrick-boomerang-collision.test.ts 对 boomerangCellBlocks 直测
  //        (平台 tile 在本仓 TILE_DEFS.solid=false ⇒ isSolid=false 恒不拦=原版
  //         flag6 fallThrough 缺省 true 同义),不再做端到端断言。
  // ---- G 斜砖站立发射（2026-09-01 用户实录 behavior-log…16-41-58）----
  const gySlope = py + 44;
  const buildSlopeRow = () => {
    for (let dx = -40; dx <= 40; dx++) {
      for (let dy = -18; dy <= 4; dy++) st.setTile(px0 + dx, gySlope + dy, 0);
    }
    for (let dx = -30; dx <= 30; dx++) { st.setTile(px0 + dx, gySlope + 2, 2); }
    for (let dx = -12; dx <= 12; dx++) { st.setTile(px0 + dx, gySlope + 1, 2); st.setTile(px0 + dx, gySlope, 0); st.setSlope(px0 + dx, gySlope + 1, 1); }
    for (let dx = -13; dx <= 13; dx++) st.setHalfBrick(px0 + dx, gySlope + 1, false);
  };
  out.G = {};
  for (const [name, standDX] of [['slopeHigh', -6], ['slopeLow', 10]]) {
    buildSlopeRow();
    equipKey('vi_191_ThornChakram');
    settleOnRow(gySlope + (name === 'slopeHigh' ? 1 : 2));
    // 精站位:横轴压到坡段指定偏移再补一次落地收敛
    g.player.x = (px0 + standDX) * 16 + 8 - g.player.w / 2;
    if ('vx' in g.player) g.player.vx = 0; if ('vy' in g.player) g.player.vy = 8;
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    const footInCellPx = +(g.player.y + g.player.h - Math.floor((g.player.y + g.player.h) / 16) * 16).toFixed(2);
    g.input.mouseX = 960; g.input.mouseY = 400;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const p0 = chaks()[0];
    let maxDist = 0, alive10 = false;
    if (p0) for (let i = 0; i < 14; i++) {
      g.fixedUpdate(1 / 60);
      if (!chaks().includes(p0)) break;
      maxDist = Math.max(maxDist, Math.abs(p0.cx - g.player.cx));
      if (i >= 9) { alive10 = true; break; }
    }
    out.G[name] = { spawned: !!p0, footInCellPx, maxDist: Math.round(maxDist), alive10 };
    cleanUpToIdle();
  }

  return out;
});

for (const [k, v] of Object.entries(res.A ?? {})) {
  check(`A ${k} 出生盒心+平地飞出`, !!v && Math.abs(v.bornDX) < 0.5 && Math.abs(v.bornDY) < 0.5 && v.aliveAt15 && v.maxDist > 40,
    JSON.stringify(v));
}
check('B 连点拦截+消亡后重生', res.B.firstAlive === 1 && res.B.afterBlockedClick === 1 && res.B.respawnAfterDeath === 1,
  JSON.stringify(res.B));
check('C 持握:回手后自动再掷(spawns>=2)', res.C.spawns >= 2, JSON.stringify(res.C));
check('D 木回旋镖站立盒心+飞出', !!res.D && Math.abs(res.D.bornDX) < 0.5 && Math.abs(res.D.bornDY) < 0.5 && res.D.maxDist8 > 20,
  JSON.stringify(res.D));
check('E 半砖横掷不再原地锁死(foot=+8, 飞≥10t)', !!res.E && res.E.standFootInCellPx === 8
  && res.E.horizRight.spawned && res.E.horizRight.alive10 && res.E.horizRight.maxDist > 40
  && res.E.up.alive10, JSON.stringify(res.E));
check('G 斜砖高/低侧横掷飞出', !!res.G && res.G.slopeHigh.alive10 && res.G.slopeLow.spawned
  && res.G.slopeHigh.maxDist > 40 && res.G.slopeLow.maxDist > 20, JSON.stringify(res.G));
if (errors.length) console.log('[pageerrors]', errors.slice(0, 4));
console.log(`${pass} pass / ${fail} fail`);
process.exitCode = fail ? 1 : 0;
await browser.close();
