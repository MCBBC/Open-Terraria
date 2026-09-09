// SW-BJ40 2026-09-09 地狱熔炉（TileID 77）多格语义真机探针（一次性诊断）：
//   A 放置=整件 3×2 一次放下 + 六格帧值（frameX=dx*18 / frameY=dy*18）
//   B 拒放面：底锚缺列 / 占位格阻挡
//   C 挖掘=任意格恰 1 掉 221 + 整件清 + 触发格坐标（SquareTileFrame 列优先窗扫首格）
//   D 失撑级联=底锚中列挖空 → 整件塌 + 单掉
// 世界 = 合成空 World（patch WorldGenClient，同 _bj28-platform-torch-probe.mjs 先例）。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj40-hellforge.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj40-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj40', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const TILE = 16;
  const stoneId = tilesMod.TILE_BY_KEY['stone'];
  const hfTile = tilesMod.TILE_BY_KEY['v_77_hellforge'];
  const hfDef = tilesMod.TILE_DEFS[hfTile];
  const hfItem = items.ITEM_DEFS[items.ITEM_BY_KEY['place_v_77_hellforge']];
  const report = { def: { w: hfDef.w, h: hfDef.h, framed: hfDef.framed, drop: hfDef.drop }, errors: [] };
  const drops = [];
  g.spawnDrop = (x, y, key, n) => { drops.push({ key, x, y, n }); return null; };

  // ---- 地形：石地板行 60（列 30-90）+ 出生点钉地板 ----
  for (let x = 30; x <= 90; x++) st.setTileSilent(x, 60, stoneId, 0, 0);
  g.world.spawnX = 60; g.world.spawnY = 58; g.world.spawnX0 = 60; g.world.spawnY0 = 58;
  g.player.maxHp = 999999; g.player.hp = 999999; g.player.dead = false;

  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  const holdItem = (id) => { inv.slots[selIdx] = { id, stack: 999, favorited: false, prefix: 0 }; inv.selected = selIdx; };
  const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
  const place = async (cx, cy, item) => {
    g.player.x = cx * 16 + 8; g.player.y = cy * 16 - 42;
    g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0; g.player.dead = false;
    await wait(40);
    holdItem(items.ITEM_DEFS.indexOf(item));
    g['tryPlace'].call(g, cx, cy, item);
  };
  const cell = (x, y) => ({ t: st.get(x, y), fx: st.frameX[st.idx(x, y)], fy: st.frameY[st.idx(x, y)] });
  const boxStr = (ax, ay, w, h) => {
    const rows = [];
    for (let dy = 0; dy < h; dy++) {
      rows.push([ax, ax + w - 1].map((ax2) => { const c = cell(ax2, ay + dy); return `${c.t === hfTile ? 'F' : c.t ? 'X' : '.'}/${c.fx},${c.fy}`; }).join(' '));
    }
    return rows.join(' | ');
  };

  try {
    // ---- A. 整件放置：点击 (50,59)=底中格 → 盒 (49..51, 58..59) ----
    await place(50, 59, hfItem);
    report.A_place = {
      cells: boxStr(49, 58, 3, 2),
      allForge: [49, 50, 51].every((x) => [58, 59].every((y) => st.get(x, y) === hfTile)),
      frames: [49, 50, 51].map((x) => [58, 59].map((y) => `${st.frameX[st.idx(x, y)]},${st.frameY[st.idx(x, y)]}`)),
      floorUntouched: st.get(50, 60) === stoneId,
    };

    // ---- B1. 拒放：底锚右列 (51,60) 挖空 + 吸附窗全毁（清掉 A 后重放）----
    //  （注：仅挖一列锚面时,全窗吸附 QoL 会在近旁另寻满分锚落件——家族共享行为,
    //   非缺陷;本例要验「锚窗内无解=零格变更」,故把吸附窗锚行整段挖空）
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(49 + dx, 58 + dy, 0);
    for (let x = 45; x <= 55; x++) st.setTileSilent(x, 60, 0);
    await place(50, 59, hfItem);
    report.B1_anchorHoleRejected = {
      placedAnywhere: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].some((x) => [56, 57, 58, 59].some((y) => st.get(x, y) === hfTile)),
      primBoxEmpty: [49, 50, 51].every((x) => [58, 59].every((y) => st.get(x, y) === 0)),
    };
    for (let x = 45; x <= 55; x++) st.setTileSilent(x, 60, stoneId, 0, 0);

    // ---- B2. 拒放：占位格土块 ----
    const dirtId = tilesMod.TILE_BY_KEY['dirt'];
    st.setTileSilent(60, 59, dirtId, 0, 0);
    await place(60, 59, hfItem);
    report.B2_blockedRejected = {
      primBoxEmpty: [59, 60, 61].every((x) => [58, 59].every((y) => (x === 60 && y === 59) ? st.get(x, y) === dirtId : st.get(x, y) === 0)),
    };
    st.setTileSilent(60, 59, 0);

    // ---- C. 挖掘六例：整件清 + 恰 1 掉 221 + 触发格坐标 ----
    // 触发格账（SquareTileFrame 列优先窗扫首格）：
    //  顶左→(X,Y+1) 顶中→(X,Y) 顶右→(X+1,Y) 底左→(X,Y) 底中→(X,Y) 底右→(X+1,Y)
    const BX = 40, BY = 58;
    const TRIG = [[0, 0, 0, 1], [1, 0, 0, 0], [2, 0, 1, 0], [0, 1, 0, 0], [1, 1, 0, 0], [2, 1, 1, 0]];
    report.C_mine = [];
    for (const [mx, my, tx, ty] of TRIG) {
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
        st.setTileSilent(BX + dx, BY + dy, hfTile, dx * 18, dy * 18);
      }
      drops.length = 0;
      g.breakTile(BX + mx, BY + my, true);
      report.C_mine.push({
        mine: [mx, my],
        cleared: [0, 1, 2].every((dx) => [0, 1].every((dy) => st.get(BX + dx, BY + dy) === 0)),
        dropCount: drops.length,
        dropAt: drops.length ? [drops[0].x, drops[0].y] : null,
        dropExpect: [(BX + tx) * TILE + 8, (BY + ty) * TILE],
        dropKey: drops.length ? drops[0].key : null,
      });
    }

    // ---- D. 失撑级联：中列锚面挖空 → checkFurnitureSupport(11,20) 链 ----
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(BX + dx, BY + dy, hfTile, dx * 18, dy * 18);
    }
    drops.length = 0;
    st.setTileSilent(BX + 1, 60, 0);       // 中列锚面挖空 → onTileChanged(41,60)
    g.checkFurnitureSupport(BX + 1, BY + 1);   // 监听位换算 (x, y-1)
    report.D_supportLoss = {
      cleared: [0, 1, 2].every((dx) => [0, 1].every((dy) => st.get(BX + dx, BY + dy) === 0)),
      dropCount: drops.length,
      dropAt: drops.length ? [drops[0].x, drops[0].y] : null,
    };

    // ---- E. 相邻他件不连带：A(70..72) B(73..75) 挖 B 顶左 ----
    for (const ox of [70, 73]) {
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
        st.setTileSilent(ox + dx, BY + dy, hfTile, dx * 18, dy * 18);
      }
    }
    drops.length = 0;
    g.breakTile(73, BY, true);
    report.E_adjacent = {
      aIntact: [70, 71, 72].every((x) => [BY, BY + 1].every((y) => st.get(x, y) === hfTile)),
      bCleared: [73, 74, 75].every((x) => [BY, BY + 1].every((y) => st.get(x, y) === 0)),
      dropCount: drops.length,
      dropAt: drops.length ? [drops[0].x, drops[0].y] : null,
    };

    inv.slots[selIdx] = savedSlot;
  } catch (e) {
    report.errors.push(String(e && e.stack || e));
  }
  return report;
});

console.log(JSON.stringify(result, null, 2));
const ok = result.A_place?.allForge
  && result.A_place?.frames?.[0]?.[0] === '0,0'
  && result.A_place?.frames?.[2]?.[1] === '36,18'
  && result.A_place?.floorUntouched
  && result.B1_anchorHoleRejected?.primBoxEmpty
  && result.B2_blockedRejected?.primBoxEmpty
  && (result.C_mine || []).every((r) => r.cleared && r.dropCount === 1 && r.dropAt && r.dropAt[0] === r.dropExpect[0] && r.dropAt[1] === r.dropExpect[1])
  && result.D_supportLoss?.cleared && result.D_supportLoss?.dropCount === 1
  && result.E_adjacent?.aIntact && result.E_adjacent?.bCleared && result.E_adjacent?.dropCount === 1;
console.log(ok ? 'BJ40-PROBE: ALL GREEN' : 'BJ40-PROBE: RED');
await browser.close();
process.exit(ok ? 0 : 1);
