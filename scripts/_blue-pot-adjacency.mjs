// 蓝队复核探针 B-1 v2：smashPot 四邻洪水是否越权收编相邻共边瓦罐
// 场景几何（原版 PlacePot 1457 WorldGen.cs:54529）：罐占 (x..x+1, y-1..y)，锚行 y+1。
//   石板锚行 = F；A 罐 = 列 x0..x0+1 行 F-2..F-1（frameY 0/18，variant 0）；
//   B 罐 = 列 x0+2..x0+3 同行（与 A 共边，variant 36）。
// 原版语义预期：敲 A → 只清 A 的 4 格 + potLoot 恰 1 次；B 的 4 格完整保留。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (23).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';
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
  const idOfSheet = (sh) => { for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i; return -1; };
  const POT = idOfSheet(28), STONE = idOfSheet(1);
  if (POT < 0 || STONE < 0) return { fail: 'resolve', POT, STONE };
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 40);
  const F = Math.floor(st.h / 2) - 260;
  if (!st.inBounds(x0 + 8, F + 3)) return { fail: 'bounds', x0, F };
  for (let x = x0 - 2; x <= x0 + 9; x++) for (let y = F - 6; y <= F + 2; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTileSilent(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0) st.liquid[i2] = 0;
  }
  for (let x = x0 - 1; x <= x0 + 6; x++) st.setTileSilent(x, F, STONE, 0, 0);
  // vanilla PlacePot 帧序：占行 y-1(fy=0)/y(fy=18)，锚行 y+1=F → y=F-1
  const putPot = (px, variant) => {
    for (let k = 0; k < 2; k++) for (const [row, fy] of [[F - 2, 0], [F - 1, 18]]) {
      st.setTileSilent(px + k, row, POT, k * 18 + variant, fy);
    }
  };
  putPot(x0, 0);       // A
  putPot(x0 + 2, 36);  // B（与 A 共边）
  const cellsOf = (lo, hi) => {
    const r = {};
    for (let x = x0 + lo; x <= x0 + hi; x++) for (const row of [F - 2, F - 1]) {
      const i2 = st.idx(x, row);
      if (st.get(x, row) === POT) r[`${x},${row}`] = [st.frameX[i2], st.frameY[i2]];
    }
    return r;
  };
  const before = { A: cellsOf(0, 1), B: cellsOf(2, 3) };
  let lootCalls = [], lootErr = null;
  const origLoot = g.potLoot;
  g.potLoot = function (x, y, s) { lootCalls.push([x, y, s]); try { return origLoot.call(this, x, y, s); } catch (e) { lootErr = String(e); } };
  let smashErr = null;
  try { g.smashPot(x0 + 1, F - 1); } catch (e) { smashErr = String(e && e.stack || e); }
  g.potLoot = origLoot;
  const after = { A: cellsOf(0, 1), B: cellsOf(2, 3) };
  // 对照：单罐（无邻居）应恰清 4 格
  for (let x = x0 - 2; x <= x0 + 9; x++) for (let y = F - 6; y <= F - 1; y++) if (st.isActive(x, y)) st.setTileSilent(x, y, 0, 0, 0);
  putPot(x0, 0);
  let soloLoot = 0;
  g.potLoot = function () { soloLoot++; };
  try { g.smashPot(x0, F - 1); } catch (e) { smashErr = String(e); }
  g.potLoot = origLoot;
  let soloCleared = 0;
  for (let k = 0; k < 2; k++) for (const row of [F - 2, F - 1]) if (st.get(x0 + k, row) !== POT) soloCleared++;
  const liveB = Object.keys(after.B).length;
  return {
    POT, beforeCount: [Object.keys(before.A).length, Object.keys(before.B).length],
    beforeFrames: before, afterCount: [Object.keys(after.A).length, liveB], afterB: after.B,
    lootCalls, lootErr, smashErr, soloCleared, soloLoot,
    verdict: liveB === 0 ? 'B-1 CONFIRMED: 相邻 B 罐被洪水一并清除' : `B-1 部分成立? B 剩 ${liveB} 格`,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
