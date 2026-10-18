// 蓝队复核 F3 聚焦探针：液先/后置序 + 双 spy（setTile/setTileSilent）+ 即时读格。
// ★红队修复批（2026-09-03）加断言：case5 转换先于统一 kill（WorldGen.cs:46451-46473
//  → :46487-46490 按转换后 type 杀）——A:83+岩浆30+坏基 → 转 84 再杀=恒掉种子 312;
//  B:84+岩浆10+坏基 → 转 83 再杀=正午无种子;C:好地基（陶罐 78）→ 转 84 不杀不掉。
// 运行：SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_blue-review-f3b.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const { LIQUID_TYPE } = await import('/src/world/TileStore.ts');
  const LOG = [];
  const PASS = [], FAIL = [];
  const check = (name, ok, extra = '') => { (ok ? PASS : FAIL).push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); };
  const m83 = tiles.TILE_BY_KEY['v_83_herbs_mature'];
  const b84 = tiles.TILE_BY_KEY['v_84_herbs_bloom'];
  const stone = tiles.TILE_BY_KEY[tiles.TILE_KEY_BY_SHEET.get(1)];
  const F = 140, TILE = 16;
  g.world.clock.timeOfDay = 0.5;
  const x0 = 240;
  // 清区
  for (let x = x0 - 4; x <= x0 + 4; x++) for (let y = F - 4; y <= F + 1; y++) {
    st.setTileSilent(x, y, 0, 0, 0); st.setLiquid(x, y, 0, LIQUID_TYPE.NONE);
  }
  for (let x = x0 - 4; x <= x0 + 4; x++) st.setTileSilent(x, F, stone, 0, 0);
  g.player.x = (x0 - 3) * TILE + 8; g.player.y = (F - 3) * TILE; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;

  const writes = [];
  const drops = [];
  const origSet = st.setTile.bind(st);
  const origSetS = st.setTileSilent.bind(st);
  const origSpawn = g.spawnDrop.bind(g);
  const spyOn = () => {
    writes.length = 0; drops.length = 0;
    st.setTile = (x, y, t, fx, fy) => { writes.push([x, y, t]); return origSet(x, y, t, fx, fy); };
    st.setTileSilent = (x, y, t, fx, fy) => { writes.push(['S', x, y, t]); return origSetS(x, y, t, fx, fy); };
    g.spawnDrop = (px, py, key, n) => { drops.push(key); return origSpawn(px, py, key, n); };
  };
  const spyOff = () => { st.setTile = origSet; st.setTileSilent = origSetS; g.spawnDrop = origSpawn; };
  const resetCol = () => {
    for (let y = F - 4; y <= F + 1; y++) { st.setTileSilent(x0, y, 0, 0, 0); st.setLiquid(x0, y, 0, LIQUID_TYPE.NONE); }
    for (let x = x0 - 4; x <= x0 + 4; x++) st.setTileSilent(x, F, stone, 0, 0);
  };
  const vidIn = (arr, vid) => arr.map((k) => Number(/^vi_(\d+)/.exec(k)?.[1] ?? 0)).includes(vid);

  // ---- 场景 A：液先置,药草后置（83 + 30 岩浆 + 坏地基）----
  st.setLiquid(x0, F - 1, 30, LIQUID_TYPE.LAVA);
  LOG.push(`A after setLiquid: get=${st.get(x0, F - 1)} liquid=${st.liquid[st.idx(x0, F - 1)]}`);
  st.setTileSilent(x0, F - 1, m83, 90, 0);
  LOG.push(`A after setTile: get=${st.get(x0, F - 1)} (m83=${m83}) liquid=${st.liquid[st.idx(x0, F - 1)]} type=${st.liquidType[st.idx(x0, F - 1)]}`);
  spyOn();
  g['checkDecorSupport'].call(g, x0, F - 1, tiles.TILE_DEFS[m83], 83, 'alch');
  spyOff();
  const wA = writes.slice(), dA = drops.slice(), cellA = st.get(x0, F - 1);
  LOG.push(`A after checkDecorSupport: writes=${JSON.stringify(wA)} drops=${JSON.stringify(dA)}`);

  // ---- 场景 B：84 + 10 岩浆 + 坏地基（重置）----
  resetCol();
  st.setLiquid(x0, F - 1, 10, LIQUID_TYPE.LAVA);
  st.setTileSilent(x0, F - 1, b84, 90, 0);
  spyOn();
  g['checkDecorSupport'].call(g, x0, F - 1, tiles.TILE_DEFS[b84], 84, 'alch');
  spyOff();
  const wB = writes.slice(), dB = drops.slice(), cellB = st.get(x0, F - 1);
  LOG.push(`B after checkDecorSupport: writes=${JSON.stringify(wB)} drops=${JSON.stringify(dB)}`);

  // ---- 场景 C：83 + 30 岩浆 + 好地基（陶罐 78）→ 转换面应可达（对照转换块本身）----
  //  ★夹具：陶罐须落在实心上（CheckPot :57295-57327 底格 SolidTile2 门）——
  //  F+1 铺石、F 置罐、F-1 药草；液先置（避开 AddWater 尾冲毁面,同场景 A 序）
  resetCol();
  const pot = tiles.TILE_KEY_BY_SHEET.get(78);
  for (let y = F; y <= F + 1; y++) st.setTileSilent(x0, y, 0, 0, 0);
  st.setTileSilent(x0, F + 1, stone, 0, 0);
  st.setTileSilent(x0, F, tiles.TILE_BY_KEY[pot], 0, 0);
  st.setLiquid(x0, F - 1, 30, LIQUID_TYPE.LAVA);
  st.setTileSilent(x0, F - 1, m83, 90, 0);
  spyOn();
  g['checkDecorSupport'].call(g, x0, F - 1, tiles.TILE_DEFS[m83], 83, 'alch');
  spyOff();
  const wC = writes.slice(), dC = drops.slice(), cellC = st.get(x0, F - 1);
  LOG.push(`C(pot) after checkDecorSupport: writes=${JSON.stringify(wC)} drops=${JSON.stringify(dC)}`);

  // ---- 断言（★修复批翻转：转换先于统一 kill）----
  check('F3b-A 83+岩浆30+坏基 → 先转 84 再杀=恒掉种子 312（WorldGen.cs:46451-46473→:46487）',
    wA.some((r) => r[2] === b84) && vidIn(dA, 312), `writes=${JSON.stringify(wA)} drops=${JSON.stringify(dA)}`);
  check('F3b-B 84+岩浆10+坏基 → 先转 83 再杀=正午无种子（同上式反向）',
    wB.some((r) => r[2] === m83) && !vidIn(dB, 312), `writes=${JSON.stringify(wB)} drops=${JSON.stringify(dB)}`);
  check('F3b-C 83+岩浆30+好地基（陶罐）→ 转 84 存活不掉落（对照转换块本身可达）',
    cellC === b84 && dC.length === 0, `cell=${cellC}(b84=${b84}) writes=${JSON.stringify(wC)} drops=${JSON.stringify(dC)}`);

  return { LOG, PASS, FAIL };
});
for (const l of [...out.LOG, ...out.PASS, ...out.FAIL]) console.log(l);
const nFail = out.FAIL.length;
console.log(`\n==== ${out.PASS.length} pass / ${nFail} fail ====`);
await browser.close();
process.exit(nFail ? 1 : 0);
