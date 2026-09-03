import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (23).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
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
const items = await import('/src/data/items.ts');
const idOfSheet = (sh) => { for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i; return -1; };
const x0 = 3000;
const STONE = idOfSheet(1);
const CEIL = 200, F = CEIL + 4;
const LT_ = { xa: x0 + 12, xb: x0 + 19 };
const box = (xa, xb, ya, yb) => { for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) { if (!st.inBounds(x, y)) continue; if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0); st.setLiquid(x, y, 0, 0); } };
box(x0 - 8, LT_.xb + 6, CEIL - 6, F + 2);
for (let x = x0 - 8; x <= LT_.xb + 6; x++) { st.setTile(x, F, STONE, 0, 0); st.setTile(x, CEIL, STONE, 0, 0); }
for (const wall of [x0 - 2, LT_.xa - 1, LT_.xb + 1]) { for (let y = CEIL; y <= F; y++) st.setTile(wall, y, STONE, 0, 0); }
for (let x = LT_.xa; x <= LT_.xb; x++) for (let y = CEIL + 1; y <= F - 1; y++) st.setLiquid(x, y, 255, 2);
const doorIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_1458_obsidian_door');
const doorTile = tiles.TILE_BY_KEY['v_10_door'];
const holdItem = (id) => { g.player.inv.slots[g.player.inv.selected] = { id, stack: 10, favorited: false, prefix: 0 }; };
// 选全空列 c3
let c3 = -1;
for (let x = LT_.xa; x <= LT_.xb; x++) {
  let free = true;
  for (let y = CEIL + 1; y <= F - 1; y++) if (st.isActive(x, y)) free = false;
  if (free && st.inBounds(x, F)) { c3 = x; break; }
}
if (c3 < 0) return { fail: 'no free col' };
for (let y = CEIL + 1; y <= F - 1; y++) st.setLiquid(c3, y, 0, 0);   // 清柱（探针同款）
st.setLiquid(c3, F - 1, 255, 2);   // 仅足迹底格岩浆
holdItem(doorIdx);
g.player.x = (c3 + 1) * 16 + 8; g.player.y = (F - 1) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
const pre = [];
for (let y = F - 4; y <= F; y++) pre.push({ y, type: st.get(c3, y), liq: st.liquid[st.idx(c3, y)] });
const stackBefore = g.player.inv.slots[g.player.inv.selected].stack;
g['tryPlace'].call(g, c3, F - 2, items.ITEM_DEFS[doorIdx]);
const consumed = g.player.inv.slots[g.player.inv.selected].stack === stackBefore - 1;
const cells = [];
for (let y = F - 4; y <= F; y++) cells.push({ y, type: st.get(c3, y), active: st.isActive(c3, y), liq: st.liquid[st.idx(c3, y)] });
const doorIn = [F - 3, F - 2, F - 1].some((y) => st.get(c3, y) === doorTile);
return { c3, doorIdx, consumed, doorIn, pre, cells };
});
fs.writeFileSync('/tmp/door-lava-diag.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
