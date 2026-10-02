// BJ433 输入链诊断 v3：克隆天然树干帧建场景（防帧机清除）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1200));
const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  g.setupDevMode();
  const items = window.__swItems;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const isTrunk = (x, y) => {
    if (!st.inBounds(x, y)) return false;
    const d = TILE_DEFS[st.get(x, y)];
    return !!(d && d.vanilla && d.vanilla.sheet === 5);
  };
  const p0x = g.world.spawnX, p0y = g.world.spawnY;
  // 找天然树：列扫描，找底部干格并向上收集 5 格帧
  let clone = null;
  for (let dx = -90; dx <= 90 && !clone; dx++) {
    for (let y = Math.floor(p0y) - 24; y <= Math.floor(p0y) + 10; y++) {
      const col = Math.floor(p0x) + dx;
      if (isTrunk(col, y) && !isTrunk(col, y + 1)) {
        const seg = [];
        for (let k = 0; k < 5 && isTrunk(col, y - k); k++) {
          const i = st.idx(col, y - k);
          seg.push({ t: st.get(col, y - k), fx: st.frameX[i], fy: st.frameY[i] });
        }
        if (seg.length >= 4) clone = { from: { x: col, y }, seg };
        break;
      }
    }
  }
  if (!clone) return { fail: 'no natural tree to clone' };
  // 场地：spawn 右 8 格,平移克隆树（保留原帧值）+ 铺地
  const DIRT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 0);   // 原版泥土(0)
  const S = Math.floor(p0x) + 8;
  const base = Math.floor(p0y) + 2;   // 克隆底格行
  for (let x = S - 6; x <= S + 6; x++) {
    for (let y = base - 8; y <= base + 2; y++) {
      if (st.inBounds(x, y)) st.setTileSilent(x, y, 0, 0, 0);
    }
  }
  for (let x = S - 6; x <= S + 6; x++) {
    for (let y = base; y <= base + 2; y++) if (st.inBounds(x, y)) st.setTileSilent(x, y, DIRT, 0, 0);
  }
  for (let k = 0; k < clone.seg.length; k++) {
    const s = clone.seg[k];
    st.setTileSilent(S, base - 1 - k, s.t, s.fx, s.fy);
  }
  if (g.chunks?.markDirtyArea) g.chunks.markDirtyArea(S - 7, base - 9, S + 7, base + 3);
  const axeKey = Object.keys(items).find((k) => /^vi_3506_/.test(k));
  const pickKey = Object.keys(items).find((k) => /^vi_3509_/.test(k));
  const cattivaKey = Object.keys(items).find((k) => /^vi_5663_/.test(k));
  const inv = g.player.inv;
  inv.slots[3] = { id: items[cattivaKey], stack: 1 };
  inv.slots[4] = { id: items[axeKey], stack: 1 };
  inv.slots[5] = { id: items[pickKey], stack: 1 };
  const p = g.player;
  p.x = (S - 2) * 16 + 8 - p.w / 2;
  p.y = base * 16 - p.h;
  p.vx = 0; p.vy = 0;
  window.__t = { x: S, y: base - 1 };
  window.__dirt = { x: S + 2, y: base };
  inv.selected = 4;
  return {
    ok: true, cloneFrom: clone.from, seg: clone.seg, base, S,
    trunk: window.__t,
    check0: { alive: st.hasTile(S, base - 1), t: st.get(S, base - 1) },
  };
});
console.log('[prep]', JSON.stringify(prep));
if (prep.fail) { await browser.close(); process.exit(1); }
await page.evaluate(() => { window.__swGame.player.vx = 0; window.__swGame.player.vy = 0; });
await new Promise((r) => setTimeout(r, 2000));
const persist = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  const t = window.__t;
  return { alive2s: st.hasTile(t.x, t.y), t2s: st.get(t.x, t.y) };
});
console.log('[persist2s]', JSON.stringify(persist));
if (!persist.alive2s) { await browser.close(); console.log('trunk did not persist'); process.exit(2); }
// 包一层 tryMine / addDamage 计数
await page.evaluate(() => {
  const g = window.__swGame;
  window.__mineCalls = [];
  window.__addCalls = [];
  const orig = g.tryMine.bind(g);
  g.tryMine = (tx, ty, ...rest) => {
    window.__mineCalls.push([tx, ty, rest[0], rest[1]]);
    return orig(tx, ty, ...rest);
  };
  const ht = g.hitTiles;
  const origAdd = ht.addDamage.bind(ht);
  ht.addDamage = (x, y, d, ...rest) => {
    window.__addCalls.push([x, y, d]);
    return origAdd(x, y, d, ...rest);
  };
});
// 等相机落定
for (let i = 0; i < 25; i++) {
  const k1 = await page.evaluate(() => { const c = window.__swGame.camera; return `${Math.round(c.x)},${Math.round(c.y)}`; });
  await new Promise((r) => setTimeout(r, 200));
  const k2 = await page.evaluate(() => { const c = window.__swGame.camera; return `${Math.round(c.x)},${Math.round(c.y)}`; });
  if (k1 === k2 && i > 3) break;
}
const aim = await page.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(window.__t.x * 16 + 8, window.__t.y * 16 + 8);
  return { sx, sy };
});
const cvBox = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  return { x: r.x, y: r.y };
});
await page.mouse.move(cvBox.x + aim.sx, cvBox.y + aim.sy);
await page.mouse.down();
// 钉扎玩家（防刷怪击退位移）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const px = p.x, py = p.y;
  window.__pin = setInterval(() => { p.x = px; p.y = py; p.vx = 0; p.vy = 0; }, 200);
});
await new Promise((r) => setTimeout(r, 14000));
await page.evaluate(() => clearInterval(window.__pin));
const stat = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  return {
    mineCalls: window.__mineCalls.length,
    addCalls: window.__addCalls.length,
    addFirst: window.__addCalls.slice(0, 8),
    playerCol: Math.floor(p.cx / 16), playerRow: Math.floor(p.cy / 16),
    igIntention: g.intentionGuesser?.intention,
    igWindow: g.intentionGuesser?.playerActiveActionTimeLeft,
    trunkDmg: g.hitTiles?.getDamage(window.__t.x, window.__t.y) ?? -1,
    trunkAlive: g.world.store.hasTile(window.__t.x, window.__t.y),
  };
});
console.log('[stat]', JSON.stringify(stat));
await page.mouse.up();
await browser.close();
