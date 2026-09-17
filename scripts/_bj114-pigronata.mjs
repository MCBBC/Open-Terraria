// BJ114 猪龙彩罐端到端探针（页面内实演）：放置 4×3 → 渲染 → 打碎 → 战利品。
// 锚：Item 3746/tile 454/CheckChand 战利品掷（WorldGen.cs:53339-53414）。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (1).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5218';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => console.log('PAGE-EXC', String(e).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
console.log('STAGE goto done');
console.log('STAGE swFlow wait');
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
console.log('STAGE swFlow ready');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const PG = tiles.TILE_BY_KEY['v_454_pigronata'];
  const STONE = tiles.TILE_BY_KEY['stone'];
  const k3746 = items.VANILLA_ITEM_KEY_BY_ID[3746];
  const def3746 = items.ITEM_DEFS[items.ITEM_BY_KEY[k3746]];
  const defPv = items.ITEM_DEFS[items.ITEM_BY_KEY['place_v_454_pigronata']];
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 30), st.w - 30);
  const F = Math.floor(st.h / 2) - 260;
  // 清空域 + 天花行
  for (let x = x0 - 3; x <= x0 + 8; x++) for (let y = F - 2; y <= F + 4; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i = st.idx(x, y);
    st.liquid[i] = 0;
  }
  for (let x = x0 - 2; x <= x0 + 5; x++) st.setTile(x, F, STONE, 0, 0);
  // 手持 3746
  const inv = g.player.inv;
  const sel = inv.selected;
  const saved = inv.slots[sel];
  const id3746 = items.ITEM_BY_KEY[k3746];
  inv.slots[sel] = { id: id3746, stack: 10, favorited: false, prefix: 0 };
  inv.selected = sel;
  g.player.x = (x0 + 1) * 16 + 8; g.player.y = (F + 1) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
  // 放置（点击格 = Origin 格 ax+2/ay = (x0+2, F+1)）
  g.tryPlace(x0 + 2, F + 1, def3746);
  const count = (bx, by) => {
    let n = 0;
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) if (st.get(bx + dx, by + dy) === PG) n++;
    return n;
  };
  const placed = count(x0, F + 1);
  // 重复放置门：同排重叠第二件（须拒）
  g.player.useTime = 0;
  const drops0 = [];
  const oldSpawn = g.spawnDrop.bind(g);
  g.spawnDrop = (...a) => { drops0.push(a); return null; };
  g.tryPlace(x0 + 3, F + 1, def3746);
  g.spawnDrop = oldSpawn;
  const afterGateTry = count(x0, F + 1);
  // 打碎（挖中段格）→ 整件清 + 战利品
  const drops = [];
  g.spawnDrop = (...a) => { drops.push({ key: a[2], n: a[3], x: a[0], y: a[1] }); return null; };
  g.breakTile(x0 + 1, F + 2, true);
  g.spawnDrop = oldSpawn;
  const leftAfterBreak = count(x0, F + 1);
  inv.slots[sel] = saved;
  return {
    defTile: def3746.tile, defTilePv: defPv?.tile ?? null,
    placed, afterGateTry, leftAfterBreak,
    drops: drops.map((d) => ({ key: d.key, n: d.n })),
    gx: (x0) * 16, gy: (F + 1) * 16,
  };
});
console.log('STAGE game ready');
console.log(JSON.stringify(out, null, 1));
// 截图渲染面：重放一件到原位再截
await page.evaluate(async (o) => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const PG = tiles.TILE_BY_KEY['v_454_pigronata'];
  for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
    st.setTileSilent(o.gx / 16 + dx, o.gy / 16 + dy, PG, dx * 18, dy * 18);
  }
  g.player.x = o.gx + 40; g.player.y = o.gy + 40;
}, out);
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/bj114-pigronata-render.png' });
await browser.close();
