// IIII220 探针B：实机世界渲染取证——火焰花族田间态 + 掉落物 + 结构读回。
//   SW_ORIGIN=http://localhost:5277 node tools/run-diag.mjs --timeout=300000 scripts/_iii220-world.mjs
// 产物: /tmp/iii220-out/shot-inventory.png / shot-garden.png / shot-bloom.png / world-report.json
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const OUT = '/tmp/iii220-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/error/i.test(t)) errs.push(t.slice(0, 160)); });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 2000));

const report = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const sheetOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const T = {
    s82: TILE_BY_KEY['v_82_herbs_sprout'], m83: TILE_BY_KEY['v_83_herbs_mature'],
    b84: TILE_BY_KEY['v_84_herbs_bloom'], ash: TILE_BY_KEY['ash'],
  };
  const out = { tileIds: T };

  // sheet 57=灰烬(内部 id 经 TILE_DEFS 映射):搜地狱 ash 平台
  let garden = null;
  for (let y = st.h - 12; y > st.h - 160 && !garden; y--) {
    let run = 0, best = 0, bx = 0;
    for (let x = 20; x < st.w - 20; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && sheetOf(st.type[i]) === 57) { run++; if (run > best) { best = run; bx = x - run + 1; } }
      else run = 0;
    }
    if (best >= 24) garden = { x: bx + 2, y: y - 1, floorY: y };
  }
  out.garden = garden;
  if (!garden) return out;

  // ---- 建实验田:平台上 84 逐一栽种 + 读回 ----
  const rows = [];
  // 家族 7 株 mature(style 0-6) @ garden.x .. +7
  for (let s = 0; s < 7; s++) {
    const x = garden.x + s, y = garden.y;
    st.setTile(x, y, T.m83, 18 * s, 0);
    rows.push({ tag: `mature_s${s}`, x, y });
  }
  // 火焰花三态 82/83/84 style5 @ 第二排
  const states = [[T.s82, 'sprout'], [T.m83, 'mature'], [T.b84, 'bloom']];
  states.forEach(([t, tag], k) => {
    const x = garden.x + k, y = garden.y - 3;
    st.setTile(x, y, t, 18 * 5, 0);
    rows.push({ tag: `fire_${tag}`, x, y });
  });
  // 岩浆浸泡株:83 style5 + 岩浆灌到 >16
  const lx = garden.x + 8, ly = garden.y - 3;
  st.setTile(lx, ly, T.m83, 18 * 5, 0);
  rows.push({ tag: 'fire_lava_mature', x: lx, y: ly });
  // 空腔装岩浆:株所在格及上方灌岩浆(liquid 字节 255)
  for (let yy = ly; yy > ly - 4; yy--) {
    const ii = st.idx(lx, yy);
    st.liquid[ii] = 255; st.liquidType[ii] = 2;
  }
  await wait(2500);   // LiquidSim 若干 tick → CheckAlch bloom 切换
  const lx2 = st.idx(lx, ly);
  out.lavaSoak = {
    typeAfter: st.type[lx2], expect: T.b84,
    bloomSwitched: st.type[lx2] === T.b84,
    liquid: st.liquid[lx2],
  };

  // ---- 掉落物:火焰花材料 + 种子 撒在田上 ----
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const mk = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k ? ITEM_BY_KEY[k] : -1; };
  const fireId = mk(318), seedId = mk(312);
  out.itemIds = { fire: fireId, seed: seedId };
  if (g.spawnDrop) {
    g.spawnDrop((garden.x + 3) * 16, (garden.y - 5) * 16, VANILLA_ITEM_KEY_BY_ID[318], 1);
    g.spawnDrop((garden.x + 4) * 16, (garden.y - 5) * 16, VANILLA_ITEM_KEY_BY_ID[312], 1);
  }
  // 背包塞入材料+种子(UI 展示域)
  p.inv.add(fireId, 999);
  p.inv.add(seedId, 999);

  // ---- 传送 + 截图锚点 ----
  p.x = (garden.x + 4) * 16 - 8; p.y = (garden.y) * 16 - p.h - 2; p.vx = 0; p.vy = 0;
  p.teleportSafe?.(); void p;
  await wait(1800);   // 相机+懒载+烘焙
  out.readback = rows.map((r) => {
    const i = st.idx(r.x, r.y);
    return { ...r, type: st.type[i], fx: st.frameX[i], fy: st.frameY[i], ok: st.type[i] === r.tag.startsWith('fire_') ? undefined : undefined };
  });
  out.gardenPx = { x: garden.x * 16, y: (garden.y - 6) * 16 };
  out.camZoom = g.camera.zoom;
  return out;
});

// 岩浆浸泡株窗口截图(结构面已读回;视觉取证两连拍)
await page.screenshot({ path: `${OUT}/shot-garden.png` }).catch(() => {});
const clip = await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
  const sc = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const r = window.__iii220clip;
  return r ?? null;
});
writeFileSync(`${OUT}/world-report.json`, JSON.stringify(report, null, 2));
console.log('SUMMARY', JSON.stringify({ garden: report.garden, lavaSoak: report.lavaSoak, itemIds: report.itemIds, readback: report.readback?.slice(0, 12), errs: errs.slice(0, 5) }, null, 1));
await browser.close();
