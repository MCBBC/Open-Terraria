// ★IIIII227 探针②：运行时旗清偿验收（rainbowroad / truckstop /
//   wedonteventestforthat=portalGunInChests）。
//   rainbowroad：gen 转换 tile 普查（云→彩虹云 719 / 全火把 disco 帧 frameY=308 /
//     巨石→711 / 202→692 / moss→627 / wall82→346 / 旗 91 frameX 1206 / 播种 126）
//     + 箱物六选一池（{3556,2870,1067,1066,5075,4469}）+ 彩虹物件渲染抽帧（atlas 命中）
//   truckstop：poo 666 普查 + 渲染抽帧 + 截图
//   wedonteventestforthat：箱枪率普查（≈1/7 有货箱）+ 物品注册 + **实弹**（装备 3384
//     → mouseDown → fixedUpdate 泵 → PortalGunBolt 实体出现 + 602 传送门落位）
//   产物 /tmp/iii227-out/runtime-report.json + runtime-<seed>.png。
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=1800000 scripts/_iii227-runtime.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const OUT = '/tmp/iii227-out';
mkdirSync(OUT, { recursive: true });
const BUST = Date.now();

const SEEDS = ['rainbowroad', 'truckstop', 'wedonteventestforthat'];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 1800000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 300)));

const report = { seeds: [], pageErrors: errs };

async function openPage() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
  await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });
}

for (const seed of SEEDS) {
  console.log('== world', seed);
  await openPage();
  await page.evaluate((s) => {
    void window.__swFlow.createWorldProbe({ seed: s, size: 0, name: 'iii227r', difficulty: 0, evil: 0 })?.catch?.(() => {});
  }, seed);
  const t1 = Date.now();
  let ok = false;
  while (Date.now() - t1 < 420000) {
    ok = await page.evaluate(() => !!globalThis.__swGame?.world && !!globalThis.__swGame?.renderer?.minimap).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) { report.seeds.push({ seed, error: 'world not ready in 420s' }); continue; }
  await new Promise((r) => setTimeout(r, 2000));

  const rep = await page.evaluate(async (bust, seedName) => {
    const { TILE, CHUNK } = await import(`/src/core/constants.ts?t=${bust}`);
    const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
    const { ITEM_DEFS } = await import(`/src/data/items.ts?t=${bust}`);
    const vidOfIid = (iid) => (iid >= 0 && iid < ITEM_DEFS.length && ITEM_DEFS[iid]) ? (ITEM_DEFS[iid].vid ?? -1) : -1;
    const g = globalThis.__swGame;
    const world = g.world, st = world.store, mm = g.renderer.minimap;
    const w = world.w, h = world.h;
    const SHEET = new Int32Array(st.type.length);
    for (let i = 0; i < st.type.length; i++) SHEET[i] = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
    const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
    const out = { seed: seedName, flags: { ...world.seedFlags } };

    // ---- tile 普查（全格单遍）----
    const counts = { s719: 0, s160: 0, s711: 0, s692: 0, s627: 0, s666: 0, s126: 0, wall346: 0, wall320: 0 };
    let torchTotal = 0, torchDisco = 0, bannerTotal = 0, bannerRainbow = 0, mossDisco = 0;
    const idTorch = bySheet(4), idMoss184 = bySheet(184), idBanner = bySheet(91);
    const chestGun = [], chestRainbow = [];
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        const i = rowOff + x;
        if (!st.flags[i]) continue;
        const s = SHEET[st.type[i]];
        if (s === 719) counts.s719++;
        else if (s === 160) counts.s160++;
        else if (s === 711) counts.s711++;
        else if (s === 692) counts.s692++;
        else if (s === 627) counts.s627++;
        else if (s === 666) counts.s666++;
        else if (s === 126) counts.s126++;
        if (st.wall[i] === 346) counts.wall346++;
        if (st.wall[i] === 320) counts.wall320++;
        if (s === 4) { torchTotal++; if (st.frameY[i] === 308) torchDisco++; }
        if (s === 184 && st.frameX[i] === 220) mossDisco++;
        if (s === 91) { bannerTotal++; if (st.frameX[i] === 1206) bannerRainbow++; }
      }
    }
    out.tileCensus = counts;
    out.torch = { total: torchTotal, discoFrame: torchDisco };       // rainbowroad: 全火把 frameY=308
    out.banner = { total: bannerTotal, rainbowFrame: bannerRainbow };
    out.moss184DiscoFrame = mossDisco;
    // ---- 箱物普查 ----
    const RAINBOW_POOL = new Set([3556, 2870, 1067, 1066, 5075, 4469]);
    let chestsTotal = 0, chestsEligible = 0, chestsWithGun = 0, chestsWithRainbow = 0;
    for (const chest of world.chests) {
      if (!chest) continue;
      chestsTotal++;
      const it1 = chest.items[1];
      if (!it1 || it1.stack === 0) continue;
      chestsEligible++;
      let hasGun = false, hasRainbow = false;
      for (const it of chest.items) {
        if (!it || it.stack <= 0) continue;
        const vid = vidOfIid(it.id);
        if (vid === 3384) hasGun = true;
        if (RAINBOW_POOL.has(vid)) hasRainbow = true;
      }
      if (hasGun) chestsWithGun++;
      if (hasRainbow) chestsWithRainbow++;
    }
    out.chests = { total: chestsTotal, eligible: chestsEligible, withPortalGun: chestsWithGun, withRainbowItem: chestsWithRainbow };
    // 物品注册面
    out.itemRegistry = {
      portalGun: window.__swFlow.itemByVid(3384),
      rainbowDye: window.__swFlow.itemByVid(1066),
      meowMinecart: window.__swFlow.itemByVid(4469),
      spectreGoggles: window.__swFlow.itemByVid(4409),
    };
    // ---- 渲染抽帧：找第一个目标格，读 chunk 烘焙画布非空 ----
    const targetSheet = seedName === 'truckstop' ? 666 : seedName === 'rainbowroad' ? 627 : 160;
    const idT = bySheet(targetSheet);
    let cellHit = null;
    if (idT > 0) {
      for (let y = 40; y < h - 40 && !cellHit; y += 3) {
        for (let x = 40; x < w - 40 && !cellHit; x += 3) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.type[i] === idT) cellHit = { x, y };
        }
      }
    }
    if (cellHit) {
      const pair = g.chunks.get(Math.floor(cellHit.x / CHUNK), Math.floor(cellHit.y / CHUNK));
      const lx = cellHit.x % CHUNK, ly = cellHit.y % CHUNK;
      const d = pair.tile.getContext('2d').getImageData(pair.sx + lx * TILE, pair.sy + ly * TILE, 1, 1).data;
      out.renderProbe = { sheet: targetSheet, at: [cellHit.x, cellHit.y], px: [d[0], d[1], d[2], d[3]], nonEmpty: d[3] > 0 };
    } else {
      out.renderProbe = { sheet: targetSheet, hit: false };
    }
    return out;
  }, BUST, seed);

  report.seeds.push(rep);

  // ---- portalGun 实弹测试（wedonteventestforthat）----
  if (seed === 'wedonteventestforthat') {
    try {
      const fire = await page.evaluate(async () => {
        const iid = window.__swFlow.itemByVid(3384);
        if (!iid || iid < 0) return { error: 'portal gun item not registered' };
        const g = globalThis.__swGame;
        g.player.inv.selected = 0;
        g.player.inv.slots[0] = { id: iid, stack: 1 };
        g.cb.onInventoryChanged?.();
        const [sx, sy] = g.camera.worldToScreen(g.player.cx + 200, g.player.cy - 40);
        g.input.mouseX = sx; g.input.mouseY = sy;
        for (let t = 0; t < 6; t++) {
          g.input.mouseDown = true; g.input.mouseHeld = true;
          g.fixedUpdate(1 / 60);
          g.input.mouseDown = false;
        }
        await new Promise((r) => setTimeout(r, 100));
        const projs = [];
        for (const p of g.entities.projectiles) {
          projs.push({ kind: p.constructor?.name ?? 'proj', x: Math.round(p.x), y: Math.round(p.y), ai: p.ai?.[0] });
        }
        return { iid, projs: projs.slice(0, 8), count: projs.length };
      });
      report.seeds[report.seeds.length - 1].portalFire = fire;
      // 泵 60 tick 让 601 落位 602 传送门（extraUpdates 30 近瞬达）
      await page.evaluate(async () => {
        const g = globalThis.__swGame;
        for (let t = 0; t < 60; t++) g.fixedUpdate(1 / 60);
        await new Promise((r) => setTimeout(r, 50));
        const portals = [];
        for (const p of g.entities.projectiles) {
          portals.push({ kind: p.constructor?.name ?? 'proj', x: Math.round(p.x), y: Math.round(p.y), ai: p.ai?.[0] });
        }
        globalThis.__iii227portals = portals;
      });
      report.seeds[report.seeds.length - 1].portalsAfterPump = await page.evaluate(() => globalThis.__iii227portals?.slice(0, 8) ?? null);
    } catch (e) { errs.push('FIRE:' + String(e).slice(0, 150)); }
  }

  // 截图（地表出生区）
  try {
    await page.evaluate(() => {
      const g = globalThis.__swGame;
      const st = g.world.store;
      const gx = Math.floor(st.w / 2), gy = Math.floor(g.world.groundLevel);
      g.player.x = gx * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
      g.camera.x = g.player.x; g.camera.y = g.player.y;
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${OUT}/runtime-${seed}.png` });
  } catch (e) { errs.push('SHOT:' + String(e).slice(0, 120)); }
}

writeFileSync(`${OUT}/runtime-report.json`, JSON.stringify(report, null, 1));
console.log('report written; pageErrors =', errs.length);
await browser.close();
