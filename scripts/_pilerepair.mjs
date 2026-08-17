// 读档石堆样式回填·探针（2026-08-17）：模拟用户旧世界（187 零帧）→
// repairZeroFramePileStyles → 断言沙地堆回填样式 52-54（fx≥2808 原始帧）且
// drawVanillaCell 按分带换算采样（sx≈918/936/954 带）；幂等。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
await page.evaluateOnNewDocument(() => {
  const poll = () => {
    if (window.__swGame) {
      import('/src/entities/TownNPC.ts').then((m) => {
        if (m?.TownNPC && typeof m.TownNPC.prototype.socialUpdate !== 'function') {
          m.TownNPC.prototype.socialUpdate = function () { return false; };
        }
      }).catch(() => {});
      return;
    }
    setTimeout(poll, 20);
  };
  poll();
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { drawVanillaCell } = await import('/src/render/VanillaTiler.ts');
  const { repairZeroFramePileStyles } = await import('/src/world/gen/vanilla/PilesPass.ts');
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const PILE = TILE_BY_KEY['v_187_decos_3x2_group_2'];
  const SAND = TILE_BY_KEY['sand'];
  const atlas = g.renderer.atlas ?? g.atlas;
  const def = TILE_DEFS[PILE];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // 找一个"底行下方是沙"的 3×2 组（沙漠簇）
  let found = null;
  for (let y = 1; y < st.h - 3 && !found; y++) {
    for (let x = 1; x < st.w - 3; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== PILE) continue;
      if (st.type[st.idx(x - 1, y)] === PILE || st.type[st.idx(x, y - 1)] === PILE) continue;
      const gi = st.idx(x + 1, y + 2);
      if (st.flags[gi] && st.type[gi] === SAND) { found = { x, y }; break; }
    }
  }
  if (!found) return { noSandPile: true };

  // 传送 + 等渲染（素材懒加载）
  p.x = found.x * 16 + 24; p.y = (found.y + 1) * 16 - p.h; p.vx = 0; p.vy = 0;
  await wait(1500);

  // 模拟用户旧世界：整组清零
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    const ii = st.idx(found.x + dx, found.y + dy);
    st.frameX[ii] = 0; st.frameY[ii] = 0;
  }
  const drawRow = () => {
    const arr = [];
    for (let dx = 0; dx < 3; dx++) {
      const ii = st.idx(found.x + dx, found.y + 1);
      const calls = [];
      drawVanillaCell({ drawImage: (_im, sx, sy) => calls.push([sx, sy]) }, atlas,
        187, 'style', def.vanilla.fw, def.vanilla.fh, st, found.x + dx, found.y + 1, PILE,
        (t) => t === PILE, 0, 0, st.frameX[ii], st.frameY[ii]);
      arr.push(calls[0] ?? null);
    }
    return arr;
  };
  const beforeRepair = drawRow();          // 零帧重建（style 0）
  const fixed = repairZeroFramePileStyles(st);
  const fixed2 = repairZeroFramePileStyles(st);   // 幂等
  const afterRepair = drawRow();           // 应回填 52-54 → 分带换算 sx
  const rawFx = [0, 1, 2].map(dx => st.frameX[st.idx(found.x + dx, found.y)]);
  return {
    found, fixed, fixed2,
    beforeRepair, afterRepair, rawFx,
    styleBack: Math.floor((rawFx[0] ?? 0) / 54),
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
const styleOK = (out.styleBack ?? -1) >= 52 && (out.styleBack ?? -1) <= 54;
const sxOK = (out.afterRepair ?? []).every(r => r && r[0] >= 900 && r[0] <= 1100);
await browser.close();
process.exit(errors.length || !(out.fixed === 6 && out.fixed2 === 0 && styleOK && sxOK) ? 1 : 0);
