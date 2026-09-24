// BJ333 终极仪器：monkey-patch tryMine/addDamage/setWall 记录链内实参 + 节流三态直读
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const items = await import('/src/data/items.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const cx = Math.floor(st.w / 2);
  const RX0 = cx - 60, RX1 = cx + 60, RY0 = 20, RY1 = 78;
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) {
    const i = st.idx(x, y);
    if (st.type[i] !== 0 || st.flags[i] !== 0) st.setTile(x, y, 0);
    if (st.wall[i] !== 0) st.setWall(x, y, 0);
    st.liquid[i] = 0; st.liquidType[i] = 0;
  }
  const A = { x0: cx - 24, y0: 34, x1: cx - 5, y1: 47 };
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };
  const settle = (px, py, n = 50) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };
  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;

  // ---- 终极仪器：包一层 tryMine / hitTiles.addDamage / setWall ----
  const trace = { tryMine: [], addDamage: [], setWall: [] };
  const origTryMine = g.tryMine.bind(g);
  g.tryMine = function (tx, ty, power, toolType, speed, useTime, opts) {
    trace.tryMine.push({
      tx, ty, power, toolType,
      wallAtAim: st.wall[st.idx(tx, ty)],
      tileAtAim: st.get(tx, ty),
      flagsAtAim: st.flags[st.idx(tx, ty)],
      inRange: (() => { const r = 5, ry = 3; const LX = Math.floor(g.player.x / 16) - r, HX = Math.ceil((g.player.x + g.player.w) / 16) - 1 + r, LY = Math.floor(g.player.y / 16) - ry, HY = Math.ceil((g.player.y + g.player.h) / 16) - 1 + ry; return tx >= LX && tx <= HX && ty >= LY && ty <= HY; })(),
      throttled: g.tickCount - g.lastMineHitTick < g.lastMineItemTime,
      tick: g.tickCount, lastHit: g.lastMineHitTick, lastItemTime: g.lastMineItemTime,
      poundRelease: g.hammerPoundRelease,
    });
    return origTryMine(tx, ty, power, toolType, speed, useTime, opts);
  };
  const origAdd = g.hitTiles.addDamage.bind(g.hitTiles);
  g.hitTiles.addDamage = function (x, y, dmg, dom) {
    trace.addDamage.push({ x, y, dmg, dom });
    return origAdd(x, y, dmg, dom);
  };
  const origSetWall = st.setWall.bind(st);
  st.setWall = function (x, y, w) { trace.setWall.push({ x, y, w }); return origSetWall(x, y, w); };

  const T = A.x0 + 3, Ty = A.y0;
  const run = (tag, standX, standY) => {
    trace.tryMine.length = 0; trace.addDamage.length = 0; trace.setWall.length = 0;
    settle(standX, standY, 30);
    for (let i = 0; i < 8; i++) {
      pin(standX, standY);
      g.fixedUpdate(1 / 60);
      const [sx, sy] = g.camera.worldToScreen(T * 16 + 8, Ty * 16 + 8);
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return {
      tag, standCellWall: wallAt(standX, standY),
      tryMineCalls: trace.tryMine.length, first3: trace.tryMine.slice(0, 3),
      addDamageCalls: trace.addDamage.slice(0, 5),
      setWallCalls: trace.setWall.slice(0, 5),
      wallAfter: wallAt(T, Ty),
    };
  };

  const results = [];
  results.push(run('stand-in-row (T-2,34)', T - 2, Ty));       // 站位在墙行内=此前拒锤形态
  st.setWall(T, Ty, 200);
  results.push(run('stand-above-row (T-2,33)', T - 2, Ty - 1)); // 站位在行上方空格
  st.setWall(T, Ty, 200);
  results.push(run('stand-below2 (T,36)', T, Ty + 2));          // 站位在行下方空格

  return { results };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
