// SW-BJ50 实机探针 v2：放置各 style 篝火→扫描整件帧→挖→掉落物对拍（点燃态 + 修复前对照）。
// tryPlace 成功路径返回 void → 以对象格扫描为成功判据；3×2 Origin 居中：点击格=中列,
// 锚左上 = (clickX-1, clickRow)。运行：
//   SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj50-campfire-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world && window.__swTiles && window.__swItems && window.__swVANILLA_ITEM_KEY_BY_ID)) {
    if (Date.now() - t0 > 120000) return { fatal: 'timeout waiting handles' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const st = g.world.store;
  const camp = window.__swTiles['v_215_campfires'];
  if (camp === undefined) return { fatal: 'v_215_campfires not in TILE_BY_KEY' };
  const dirt = window.__swTiles['dirt'] ?? 1;
  const gy = Math.floor(g.world.groundLevel) + 12;
  const bx = Math.max(40, Math.floor(g.player.x / 16) - 4);
  const cx0 = bx - 8, cx1 = bx + 84;
  for (let x = cx0; x <= cx1; x++) for (let y = gy - 14; y < gy + 6; y++) {
    if (st.inBounds(x, y)) st.setTileSilent(x, y, 0);
  }
  for (let x = cx0; x <= cx1; x++) { st.setTileSilent(x, gy, dirt, 0, 0); st.setTileSilent(x, gy + 1, dirt, 0, 0); }
  const GOLD_STYLE = { 966: 0, 3046: 1, 3047: 2, 3048: 3, 3049: 4, 3050: 5, 3723: 6, 3724: 7, 4689: 8, 4690: 9, 4691: 10, 4692: 11, 4693: 12, 4694: 13, 5299: 14, 5357: 15 };
  const GOLD_DROP = [966, 3046, 3047, 3048, 3049, 3050, 3723, 3724, 4689, 4690, 4691, 4692, 4693, 4694, 5299, 5357];
  const vidOfKey = (k) => Number((/^vi_(\d+)_/.exec(k ?? '') ?? [])[1] ?? -1);
  const results = [];
  const realSpawnDrop = g.spawnDrop.bind(g);
  // place+scan+break：click=(tx,gy-2)（ty=顶行,对象占 (tx-1..tx+1, gy-2..gy-1),地板 gy 支撑）
  const runCase = (tx, def, litOffset = 0) => {
    g.player.x = (tx - 4) * 16; g.player.y = (gy - 6) * 16; g.player.useTime = 0;
    const slotBackup = g.player.inv.slots[g.player.inv.selected];
    g.player.inv.slots[g.player.inv.selected] = { id: ITEM_BY_KEY[def.key], stack: 99 };
    const drops = [];
    g.spawnDrop = (x, y, k, n) => { drops.push({ vid: vidOfKey(k), n }); return realSpawnDrop(x, y, k, n); };
    let err = null;
    try { g.tryPlace(tx, gy - 2, def); } catch (e) { err = String(e).slice(0, 140); }
    // 扫描整件（点击点 ±3 窗）
    const cells = [];
    for (let y = gy - 4; y <= gy; y++) for (let x = tx - 3; x <= tx + 3; x++) {
      const i = st.idx(x, y);
      if (st.type[i] === camp) cells.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
    }
    let frameOk = false, anchorFx = null, anchorFy = null;
    if (cells.length === 6) {
      const s = cells[0].fx - (cells[0].fx % 54);
      const sorted = [...cells].sort((a, b) => (a.fx - a.fx % 54 - b.fx + b.fx % 54) || (a.fx % 54) - (b.fx % 54) || a.fy - b.fy);
      anchorFx = sorted[0].fx; anchorFy = sorted[0].fy;
      frameOk = sorted.every((c, idx) => {
        const col = Math.floor((c.fx - s) / 18), row = c.fy - s === undefined ? 0 : c.fy - Math.floor(c.fy / 36) * 36;
        const expFx = s + col * 18;
        const baseRow = (c.fy - litOffset) % 36;
        const expFy = (row === 0 ? 0 : 18) + litOffset;
        return c.fx === expFx && ((c.fy - litOffset) === 0 || (c.fy - litOffset) === 18);
      }) && cells.every((c) => c.fy >= litOffset);
    }
    let drop = null;
    if (cells.length) {
      const hit = cells[Math.floor(cells.length / 2)];
      try { g.breakTile(hit.x, hit.y, false); } catch (e) { err = String(e).slice(0, 140); }
      drop = drops[0] ?? null;
    }
    g.player.inv.slots[g.player.inv.selected] = slotBackup;
    g.spawnDrop = realSpawnDrop;
    return { cellsN: cells.length, frameOk, anchorFx, anchorFy, drop, err };
  };
  for (const vidStr of Object.keys(GOLD_STYLE)) {
    const vid = Number(vidStr);
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    const idx = ITEM_BY_KEY[key];
    if (idx === undefined) { results.push({ vid, fatal: 'no def' }); continue; }
    const def = ITEM_DEFS[idx];
    const tx = bx + GOLD_STYLE[vid] * 4;
    const c = runCase(tx, def);
    results.push({
      vid, key, placeStyle: def.placeStyle ?? null, placed: c.cellsN === 6, err: c.err,
      anchorFx: c.anchorFx, frameOk: c.frameOk,
      dropVid: c.drop?.vid ?? -1, dropN: c.drop?.n ?? 0, expDropVid: GOLD_DROP[GOLD_STYLE[vid]],
      expFx: GOLD_STYLE[vid] * 54, cellsN: c.cellsN,
    });
  }
  // 点燃态：放置后按 ToggleCampFire 语义全格 frameY+=36 再挖（Wiring.cs:3013-3060）
  {
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3050]]];
    const c = runCase(bx + 76, def, 36);
    results.push({
      vid: 'lit-ctrl', placed: c.cellsN === 6, anchorFx: c.anchorFx,
      dropVid: c.drop?.vid ?? -1, expDropVid: 3050, err: c.err, cellsN: c.cellsN,
    });
  }
  // 修复前对照：placeStyle 强制 undefined（=提取器原产物）→ frameX=0 普通篝火 + 掉 966
  {
    const defBefore = { ...ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3046]]], placeStyle: undefined };
    const c = runCase(bx + 80, defBefore);
    results.push({
      vid: 'before-fix-ctrl', placed: c.cellsN === 6, anchorFx: c.anchorFx,
      dropVid: c.drop?.vid ?? -1, expDropVid: 966, err: c.err, cellsN: c.cellsN,
    });
  }
  return { results, groundY: gy };
});
await browser.close();
if (r.fatal) { console.log('FATAL', r.fatal); process.exit(2); }
let ok = 0, bad = 0;
for (const row of r.results) {
  let good;
  if (row.vid === 'lit-ctrl') good = row.placed && row.anchorFx === 270 && row.dropVid === 3050;
  else if (row.vid === 'before-fix-ctrl') good = row.placed && row.anchorFx === 0 && row.dropVid === 966;
  else good = row.placed && !row.err && row.frameOk && row.dropVid === row.expDropVid && row.dropN === 1;
  if (good) ok++; else bad++;
  console.log(`${good ? 'OK ' : 'BAD'} vid=${row.vid} placeStyle=${row.placeStyle} cells=${row.cellsN} frameOk=${row.frameOk} anchorFx=${row.anchorFx} dropVid=${row.dropVid} n=${row.dropN} exp=${row.expDropVid} ${row.err ?? ''}`);
}
console.log(`SUMMARY ok=${ok} bad=${bad} groundY=${r.groundY}`);
process.exit(bad ? 1 : 0);
