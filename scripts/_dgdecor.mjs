// 地牢陈设读档修复·探针（2026-08-17）：零帧陈设墙 id 诊断 + 修复量 + 幂等 + 旗帜样式。
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
  const g = window.__swGame, st = g.world.store;
  const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
  const { repairZeroFrameDungeonDecor } = await import('/src/world/gen/vanilla/DungeonDecorRepair.ts');
  const sheets = [14, 15, 18, 33, 79, 87, 88, 89, 90, 91, 93, 100, 101, 104, 105, 240, 241, 242];
  const wallsAt = {};
  for (const sheet of sheets) {
    const type = TILE_INTERNAL_BY_SHEET.get(sheet);
    if (type == null) continue;
    const walls = {};
    for (let i = 0; i < st.frameX.length; i++) {
      if (st.flags[i] && st.type[i] === type && st.frameX[i] === 0 && st.frameY[i] === 0) {
        const w = st.wall[i];
        walls[w] = (walls[w] ?? 0) + 1;
      }
    }
    if (Object.keys(walls).length) wallsAt[sheet] = walls;
  }
  const fixed = repairZeroFrameDungeonDecor(st);
  const fixed2 = repairZeroFrameDungeonDecor(st);
  return { wallsAt, fixed, fixed2 };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length ? 1 : 0);
