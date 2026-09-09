// SW-FX3 实机探针 v2：33 族抽验（每族 2 件非零档）——tryPlace 真放置链 → 帧 → 挖 → 掉落对拍。
// 运行：SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_swfx3-live-probe.mjs
// 每件物品依次尝试 4 种微环境（互不相交子窗）：
//   A 平地（dy=1/2）  B 桌面（3×2 木桌+其上点击,ON_TABLE_1X1 族）
//   C 门框（顶底双锚,fh=3 门）  D 顶棚（吊挂族 anchorTop）
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
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const { framedCellFrame } = await import('/src/world/FurnitureStyle.ts');
  const { styleDropVidOfFrames, styleFromFrame } = await import('/src/data/vanillaStyleDrops.ts');
  const st = g.world.store;
  const dirt = window.__swTiles['dirt'] ?? 1;
  const tableT = window.__swTiles['table'];
  const vidOfKey = (k) => Number((/^vi_(\d+)_/.exec(k ?? '') ?? [])[1] ?? -1);

  const FAMILIES = [
    ['bathtub', 90], ['bed', 79], ['bench', 89], ['bookcase', 101], ['candelabra', 100],
    ['candle', 33], ['chair', 15], ['chandelier', 34], ['chest', 21], ['door_closed', 10],
    ['dresser', 88], ['grandfather_clock', 104], ['lantern', 42], ['piano', 87], ['table', 14],
    ['tombstone_v', 85], ['workbench', 18], ['v_93_lamps', 93], ['v_103_bowls', 103],
    ['v_105_statue', 105], ['v_13_placed_bottles', 13], ['v_144_timers', 144],
    ['v_172_sinks', 172], ['v_240_wall_hangings_3x3', 240], ['v_242_paintings_6x4', 242],
    ['v_245_paintings_2x3', 245], ['v_246_paintings_3x2', 246], ['v_337_text_statue', 337],
    ['v_376_fishing_crates', 376], ['v_440_gemlocks', 440], ['v_441_fakecontainers', 441],
    ['v_420_logicgate', 420], ['v_572_souls_in_a_bottle', 572],
  ];
  const membersByTk = {};
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    const m = /^vi_(\d+)_/.exec(d.key);
    if (!m || !d.tile) continue;
    if (FAMILIES.some(([tk]) => tk === d.tile)) (membersByTk[d.tile] ??= []).push({ vid: Number(m[1]), idx: i });
  }
  const cases = [];
  for (const [tk, sheet] of FAMILIES) {
    const tdef = TILE_DEFS[window.__swTiles[tk]];
    const fw = tdef?.vanilla?.fw ?? 1, fh = tdef?.vanilla?.fh ?? 1;
    const mem = (membersByTk[tk] ?? []).slice().sort((a, b) => a.vid - b.vid);
    const nz = mem.filter(({ idx }) => (ITEM_DEFS[idx].placeStyle ?? 0) !== 0);
    const picks = nz.length >= 2 ? [nz[0], nz[nz.length - 1]] : [...nz, ...mem].slice(0, 2);
    for (const p of picks) cases.push({ tk, sheet, fw, fh, vid: p.vid, idx: p.idx, style: ITEM_DEFS[p.idx].placeStyle ?? 0 });
  }
  // 布景：每 case 一个大窗（宽 3 子槽 × (fw+8) + 8,高 16）
  const SUB = 3;
  const CASE_W = SUB * 14 + 8, CASE_H = 17;
  const COLS = 8;
  const ROWS = Math.ceil(cases.length / COLS);
  const gy = Math.floor(g.world.groundLevel) + 30 + ROWS * 0;
  const x0 = Math.max(60, Math.floor(g.player.x / 16) - 120);
  const yTop = gy - 12;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const wx = x0 + col * (CASE_W + 4), wy = Math.floor(g.world.groundLevel) + 30 - row * (CASE_H + 3);
      for (let x = wx - 2; x <= wx + CASE_W; x++) {
        for (let y = wy - 13; y <= wy + 3; y++) {
          if (!st.inBounds(x, y)) continue;
          st.setTileSilent(x, y, 0);
          st.setWallSilent(x, y, 1);
        }
        if (st.inBounds(x, wy)) { st.setTileSilent(x, wy, dirt, 0, 0); st.setTileSilent(x, wy + 1, dirt, 0, 0); }
      }
    }
  }
  const results = [];
  const realSpawnDrop = g.spawnDrop.bind(g);
  for (let ci = 0; ci < cases.length; ci++) {
    const c = cases[ci];
    const col = ci % COLS, row = Math.floor(ci / COLS);
    const wx = x0 + col * (CASE_W + 4);
    const gy2 = Math.floor(g.world.groundLevel) + 30 - row * (CASE_H + 3);
    const slotX = (s) => wx + 2 + s * 14;
    // 子槽环境构建（惰性只建所需,先都建好：A/B/D 三槽 + C 门框并入 A 槽变体）
    const buildFloor = (sx) => { for (let x = sx - 2; x <= sx + c.fw + 2; x++) { if (st.inBounds(x, gy2)) { st.setTileSilent(x, gy2, dirt, 0, 0); st.setTileSilent(x, gy2 + 1, dirt, 0, 0); } } };
    const buildTable = (sx) => {
      for (let x = sx - 2; x <= sx + 5; x++) for (let y = gy2 - 12; y <= gy2 - 1; y++) st.setTileSilent(x, y, 0);
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(sx - 1 + dx, gy2 - 2 + dy, tableT, dx * 18, 54 + dy * 18);
    };
    const buildDoorFrame = (sx) => {
      for (let x = sx - 2; x <= sx + 2; x++) for (let y = gy2 - 12; y <= gy2 - 1; y++) st.setTileSilent(x, y, 0);
      for (let x = sx - 2; x <= sx + 2; x++) { st.setTileSilent(x, gy2, dirt, 0, 0); st.setTileSilent(x, gy2 + 1, dirt, 0, 0); }
      st.setTileSilent(sx, gy2 - 4, dirt, 0, 0);   // 门顶锚（3 格门占 gy2-3..gy2-1）
    };
    const buildCeil = (sx) => {
      for (let x = sx - 2; x <= sx + c.fw + 2; x++) for (let y = gy2 - 12; y <= gy2 - 1; y++) st.setTileSilent(x, y, 0);
      for (let x = sx - 2; x <= sx + c.fw + 2; x++) st.setTileSilent(x, gy2 - 7, dirt, 0, 0);
    };
    // 依次环境尝试
    const envs = [
      ['floor', slotX(0), () => buildFloor(slotX(0)), [gy2 - 1, gy2 - 2, gy2 - 3]],
      ['table', slotX(1), () => buildTable(slotX(1)), [gy2 - 3, gy2 - 4]],
      ['ceil', slotX(1), () => buildCeil(slotX(1)), [gy2 - 6, gy2 - 5]],
      ['doorframe', slotX(2), () => buildDoorFrame(slotX(2)), [gy2 - 1, gy2 - 2, gy2 - 3]],
    ];
    let outcome = null;
    const key = VANILLA_ITEM_KEY_BY_ID[c.vid];
    for (const [mode, sx, build, cys] of envs) {
      build();
      for (const cy of cys) {
        const cx = sx;
        g.player.x = (cx - 6) * 16; g.player.y = (cy - 4) * 16; g.player.useTime = 0;
        const slotBackup = g.player.inv.slots[g.player.inv.selected];
        g.player.inv.slots[g.player.inv.selected] = { id: ITEM_BY_KEY[key], stack: 99 };
        const drops = [];
        g.spawnDrop = (x, y, k, n) => { drops.push({ vid: vidOfKey(k), n }); return realSpawnDrop(x, y, k, n); };
        let err = null;
        try { g.tryPlace(cx, cy, ITEM_DEFS[c.idx]); } catch (e) { err = String(e).slice(0, 140); }
        const bx = framedCellFrame(c.sheet, c.fw, c.style, 0, 0);
        let anchor = null; const cells = [];
        for (let y = gy2 - 12; y <= gy2 + 2; y++) for (let x = sx - 3; x <= sx + c.fw + 3; x++) {
          if (!st.inBounds(x, y)) continue;
          const i = st.idx(x, y);
          if (st.type[i] === window.__swTiles[c.tk]) {
            cells.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
            if (st.frameX[i] === bx[0] && st.frameY[i] === bx[1]) anchor = { x, y };
          }
        }
        g.player.inv.slots[g.player.inv.selected] = slotBackup;
        // 方向备选族（椅 15 朝向档 0/18、浴缸 90 镜像带 72 等）：锚检测按「相对帧型」
        // 匹配——物件格集相对 (minFx,minFy) 的偏移 == framedCellFrame 相对 (bx[0],bx[1])
        // 的格内偏移;style 反推 styleFromFrame 逐格 == placeStyle（方向不变式）。
        if (cells.length === c.fw * c.fh) {
          const minFx = Math.min(...cells.map((cl) => cl.fx));
          const minFy = Math.min(...cells.map((cl) => cl.fy));
          const rel = (cl) => (cl.fx - minFx) + ',' + (cl.fy - minFy) + '@' + (cl.x) + ',' + (cl.y);
          const expRel = [];
          let okRel = true;
          const byCell = cells.find((cl) => cl.fx === minFx && cl.fy === minFy);
          for (let dx = 0; dx < c.fw && okRel; dx++) {
            for (let dy = 0; dy < c.fh; dy++) {
              const [, fyOff] = framedCellFrame(c.sheet, c.fw, c.style, dx, dy);
              const off = [dx * 18, fyOff - bx[1]];
              const hit = cells.find((cl) => cl.fx - minFx === off[0] && cl.fy - minFy === off[1]
                && cl.x === byCell.x + dx && cl.y === byCell.y + dy);
              if (!hit) { okRel = false; break; }
              expRel.push(rel(hit));
            }
          }
          // 门 10/11 的 style 反推在 styleDropVidOfFrames 内部（无 styleFromFrame 表项）——
          // 该族 styleOk 由下方 expDrop（同入口反推）间接断言
          const styleOk = !styleFromFrame[c.sheet] || cells.every((cl) => styleFromFrame[c.sheet]?.(cl.fx, cl.fy) === c.style);
          if (byCell && okRel && styleOk) {
            g.breakTile(byCell.x, byCell.y, false);
            const got = drops.map((d) => d.vid);
            // 期望掉落 = 生产同入口帧反推（门 10/11 内部钳制块也走这里）
            const expDrop = styleDropVidOfFrames(c.sheet, byCell.fx, byCell.fy);
            outcome = { placed: true, mode, cellsN: cells.length, frameOk: true, dropVid: got, expDrop, err };
            break;
          }
          outcome = { placed: false, mode, cellsN: cells.length, frameOk: okRel && styleOk, dropVid: [], expDrop: null, err };
        } else {
          outcome = outcome ?? { placed: false, mode, cellsN: cells.length, frameOk: false, dropVid: [], expDrop: null, err };
        }
        outcome = outcome ?? { placed: false, mode, cellsN: cells.length, frameOk: false, dropVid: [], expDrop: null, err };
        g.spawnDrop = realSpawnDrop;
        if (anchor) break;
      }
      g.spawnDrop = realSpawnDrop;
      if (outcome?.placed) break;
    }
    results.push({ tk: c.tk, vid: c.vid, style: c.style, ...outcome });
  }
  return { results };
});
await browser.close();
if (r.fatal) { console.log('FATAL', r.fatal); process.exit(2); }
let ok = 0, bad = 0;
for (const row of r.results) {
  const good = row.placed && row.frameOk && Array.isArray(row.dropVid) && row.dropVid.includes(row.expDrop);
  if (good) ok++; else bad++;
  console.log(`${good ? 'OK ' : 'BAD'} ${row.tk} vid=${row.vid} style=${row.style} placed=${row.placed} mode=${row.mode ?? '-'} cells=${row.cellsN} frameOk=${row.frameOk} drop=${JSON.stringify(row.dropVid)} exp=${row.expDrop} ${row.err ?? ''}`);
}
console.log(`SUMMARY ok=${ok} bad=${bad}`);
process.exit(bad ? 1 : 0);
