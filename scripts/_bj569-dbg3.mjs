// ★BJ569 S3 调试:起手门逐面快照
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj569d3]', ...a);

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await page.evaluate(async () => {
      const g = window.__swGame;
      const items = await import('/src/data/items.ts');
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id: items.ITEM_BY_KEY['vi_3611_WireKite'], stack: 1 };
      g.player.inv.slots[1] = { id: items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[530]], stack: 200 };
      g.player.x = g.world.spawnX * 16; g.player.y = (g.world.spawnY - 6) * 16;
      g.player.vx = 0; g.player.vy = 0;
      g.wireToolMode = 1;
    });
    for (let i = 0; i < 6; i++) await pump(page, 15);

    await page.evaluate(() => {
      const g = window.__swGame;
      window.__bj569 = {
        toScreen(tx, ty) {
          const cam = g.camera;
          return [Math.round((tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2),
                  Math.round((ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2)];
        },
      };
    });
    const base = await page.evaluate(() => {
      const g = window.__swGame;
      return { px: Math.floor(g.player.cx / 16), py: Math.floor(g.player.cy / 16) };
    });
    const tC = [base.px + 22, base.py - 4];
    log('tC', JSON.stringify(tC));
    await page.evaluate(([tx, ty]) => {
      const [sx, sy] = window.__bj569.toScreen(tx, ty);
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
      window.__bj569.gates = {
        uiBlocking: g.input.uiBlocking, blockMouse: g.input.blockMouse,
        delayUseItem: g.input.delayUseItem, overDom: g.inpOverDomUi(),
        annotate: g.annotateMode, fullMap: g.renderer.fullMap.open,
        useTime: g.player.useTime, mode: g.wireToolMode,
        held: g.player.inv.heldItem()?.id, selected: g.player.inv.selected,
        screen: [sx, sy], anchor: g.grandAnchor,
      };
    }, tC);
    const gates = await page.evaluate(() => window.__bj569.gates);
    log('gates-at-press', JSON.stringify(gates));
    await pump(page, 1);
    const after = await page.evaluate(() => ({ anchor: window.__swGame.grandAnchor, md: window.__swGame.input.mouseDown }));
    log('after1', JSON.stringify(after));
    await pump(page, 1);
    const after2 = await page.evaluate(() => ({ anchor: window.__swGame.grandAnchor, md: window.__swGame.input.mouseDown }));
    log('after2', JSON.stringify(after2));
  } finally {
    await closeAllBrowsers();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
