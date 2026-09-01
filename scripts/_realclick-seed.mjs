// 真实鼠标路径终验:手持圣种(①泥土=应转化+扣1 ②草块=应无动作[原版语义])
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const DEFS = await import('/src/data/items.ts');
  const JP = await import('/src/ui/JourneyPowersUI.ts');
  const LS = await import('/src/net/leashedSync.ts');
  const TD = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const keyOf = (t) => TD.TILE_DEFS[t]?.key ?? String(t);
  const sheetOf = (t) => TD.TILE_DEFS[t]?.vanilla?.sheet ?? null;
  // 给种+选中
  JP.giveItem(g, LS.internalIdOfVid(369), 5);
  const slot = g.player.inv.slots.findIndex((s) => s && DEFS.ITEM_DEFS[s.id]?.key === 'vi_369_HallowedSeeds');
  g.player.inv.selected = slot;
  // 找目标:泥土下气 / 草块下气(各一)
  const find = (sheetWanted) => {
    for (let y = 20; y < 900; y++) {
      for (let x = ((st.w / 2 - 300) | 0); x < ((st.w / 2 + 300) | 0); x++) {
        if (sheetOf(st.get(x, y)) === sheetWanted && st.get(x, y - 1) === 0) return [x, y];
      }
    }
    return null;
  };
  const dirt = find(0), grass = find(2);
  const run = async ([tx, ty], label) => {
    if (!tx) return { label, err: 'no target' };
    // 玩家挪到目标旁(同排,距离 3 格,保证射程)
    g.player.x = (tx - 3) * 16;
    g.player.y = (ty - 2) * 16;
    g.player.vx = 0; g.player.vy = 0;
    await new Promise((r) => setTimeout(r, 250));
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
    const before = { key: keyOf(st.get(tx, ty)), stack: g.player.inv.slots[slot]?.stack };
    // ★直接驱动输入层(mouseDown 电平两拍)——隔离 DOM 合成事件是否被监听器接受
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.mouseDown = true;
    await new Promise((r2) => setTimeout(r2, 120));
    g.input.mouseDown = false;
    await new Promise((r2) => setTimeout(r2, 120));
    return {
      label, target: [tx, ty], mouse: [sx | 0, sy | 0],
      before, after: { key: keyOf(st.get(tx, ty)), sheet: sheetOf(st.get(tx, ty)), stack: g.player.inv.slots[slot]?.stack },
    };
  };
  const rDirt = await run(dirt, 'dirt');
  const rGrass = await run(grass, 'grass');
  return { rDirt, rGrass, selectedKey: DEFS.ITEM_DEFS[g.player.inv.slots[g.player.inv.selected]?.id]?.key };
});
console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 4));
await browser.close();
