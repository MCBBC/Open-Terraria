// ★BJ557 放置预览探针：开关开 → 持可放件瞄准地台 → 幽灵状态面在册 + 画布像素实测；
// 开关关 → 状态面清空 + 像素回落。判别 = 选项翻转前后 ghost 区域像素哈希差。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame?.world, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1200));

// 场地：出生点旁清一块平地（清 14×8、地板 row=by），玩家站地板左上
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const dirt = TILE_BY_KEY['dirt'];
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  const bx = Math.max(8, px - 4), by = py + 2;              // 地板行
  for (let y = by - 7; y < by + 3; y++) {
    for (let x = bx; x < bx + 14; x++) {
      if (!st.inBounds(x, y)) continue;
      st.setTile(x, y, y === by ? dirt : 0);
      st.setLiquid(st.idx(x, y), 0, 0);
      st.wall[st.idx(x, y)] = 0;
    }
  }
  g.player.x = (bx + 1) * 16 + 8 - g.player.w / 2;
  g.player.y = (by - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 40; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  // 持物：热栏 0 = 工作台（vi_36_work_bench，vid 36）
  const iid = ITEM_DEFS.findIndex((d) => d?.vid === 36);
  g.player.inv.slots[0] = { id: iid, stack: 9 };
  g.player.inv.selected = 0;
  return { bx, by, iid };
});
if (!setup?.iid) { console.log('SETUP FAIL', JSON.stringify(setup)); await browser.close(); process.exit(1); }

// 瞄准：地板上方 2 格的左格（工作台 prim 位，足印 2×1，底锚=地板行）
const aim = await page.evaluate(async (setup) => {
  const g = window.__swGame;
  const tx = setup.bx + 6, ty = setup.by - 2;
  const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
  return { sx, sy, tx, ty };
}, setup);
await page.mouse.move(aim.sx, aim.sy);
await new Promise((r) => setTimeout(r, 700));

// 读状态面（开关开）
const stateOn = await page.evaluate(async () => {
  const { placePreviewFrame } = await import('/src/core/PlacePreview.ts');
  const { options } = await import('/src/core/Options.ts');
  await new Promise((r) => setTimeout(r, 120));
  return {
    data: placePreviewFrame.data ? {
      sheet: placePreviewFrame.data.sheet, ax: placePreviewFrame.data.ax, ay: placePreviewFrame.data.ay,
      w: placePreviewFrame.data.w, h: placePreviewFrame.data.h,
      cells: Array.from(placePreviewFrame.data.cells),
    } : null,
    opt: options.data.placementPreview,
    heldId: window.__swGame.player.inv.slots[0]?.id ?? null,
  };
});
console.log('STATE_ON:', JSON.stringify(stateOn));

// ghost 区域 = 足印两格的世界→屏幕盒（画布像素读回）
const ghostRect = await page.evaluate(async (setup) => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen((setup.bx + 6) * 16, (setup.by - 2) * 16);
  return { x: Math.floor(sx), y: Math.floor(sy), w: 32, h: 20 };
}, setup);
// 全画布哈希（稳健判别——避免局部坐标/层选错）
const fullRect = await page.evaluate(() => {
  const cv = [...document.querySelectorAll('#game-root canvas, body > canvas')]
    .filter((c) => !!c.getContext('2d'))
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return { x: 0, y: 0, w: cv.width, h: cv.height };
});
const hashRegion = (r) => {
  const canvases = [...document.querySelectorAll('#game-root canvas, body > canvas')]
    .filter((c) => !!c.getContext('2d'))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const cv = canvases[0];
  const sc = document.createElement('canvas');
  sc.width = r.w; sc.height = r.h;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const d = sctx.getImageData(0, 0, r.w, r.h).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
};
const pixOn = await page.evaluate(hashRegion, fullRect);

// 开关关 → 再读状态面 + 像素
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.placementPreview = false;
});
await new Promise((r) => setTimeout(r, 700));
const stateOff = await page.evaluate(async () => {
  const { placePreviewFrame } = await import('/src/core/PlacePreview.ts');
  return placePreviewFrame.data;
});
const pixOff = await page.evaluate(hashRegion, fullRect);

const verdict = {
  stateOn: !!stateOn.data && stateOn.data.sheet === 18 && stateOn.data.cells.every((v) => v === 1)
    && stateOn.data.ax === aim.tx && stateOn.data.ay === aim.ty,
  stateOffIsNull: stateOff === null,
  pixelDiffers: pixOn !== pixOff,
  pixOn, pixOff, ghostRect,
};
console.log('VERDICT:', JSON.stringify(verdict));
await browser.close();
process.exit(verdict.stateOn && verdict.stateOffIsNull && verdict.pixelDiffers ? 0 : 1);
