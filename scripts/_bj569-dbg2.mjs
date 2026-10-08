// ★BJ569 S2 调试:铺线路由落点全域扫
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj569d2]', ...a);

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
      g.wireToolMode = 1; // 单红
    });
    await pump(page, 10);

    const base = await page.evaluate(() => {
      const g = window.__swGame;
      return { px: Math.floor(g.player.cx / 16), py: Math.floor(g.player.cy / 16) };
    });
    const tA = [base.px + 22, base.py + 2];
    const tB = [base.px + 28, base.py + 2];
    log('base', JSON.stringify({ base, tA, tB }));

    const toScreen = async ([tx, ty]) => page.evaluate(([tx, ty]) => {
      const cam = window.__swGame.camera;
      return [Math.round((tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2),
              Math.round((ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2)];
    }, [tx, ty]);

    // 逐帧追踪:按下 → 拖拽每帧读 tileUnder(鼠标) 与 anchor
    const [sx0, sy0] = await toScreen(tA);
    await page.evaluate(([sx, sy]) => {
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, [sx0, sy0]);
    await pump(page, 1);
    const f1 = await page.evaluate(([tx, ty]) => {
      const g = window.__swGame;
      const cam = g.camera;
      return { anchor: g.grandAnchor, mouseDown: g.input.mouseDown,
        invTile: [Math.floor((cam.x + (g.input.mouseX - cam.viewW / 2) / cam.zoom) / 16),
                  Math.floor((cam.y + (g.input.mouseY - cam.viewH / 2) / cam.zoom) / 16)] };
    }, tA);
    log('f1', JSON.stringify(f1));

    const [sx1, sy1] = await toScreen(tB);
    await page.evaluate(([sx, sy]) => {
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy; g.input.mouseDown = false; g.input.mouseHeld = true;
    }, [sx1, sy1]);
    for (let i = 0; i < 3; i++) {
      await pump(page, 1);
      const fr = await page.evaluate(([tx, ty]) => {
        const g = window.__swGame;
        const cam = g.camera;
        return { i: undefined, anchor: g.grandAnchor, held: g.input.mouseHeld,
          invTile: [Math.floor((cam.x + (g.input.mouseX - cam.viewW / 2) / cam.zoom) / 16),
                    Math.floor((cam.y + (g.input.mouseY - cam.viewH / 2) / cam.zoom) / 16)] };
      }, tB);
      log('drag' + i, JSON.stringify(fr));
    }
    await page.evaluate(() => { window.__swGame.input.mouseHeld = false; });
    await pump(page, 2);
    const post = await page.evaluate(([txa, txb, ty]) => {
      const g = window.__swGame;
      const st = g.world.store;
      const cells = [];
      for (let x = txa - 3; x <= txb + 3; x++) {
        const w = st.wire[st.idx(x, ty)];
        if (w) cells.push([x, w]);
      }
      return { anchor: g.grandAnchor, cells, stack: g.player.inv.slots[1]?.stack };
    }, [tA[0], tB[0], tA[1]]);
    log('post', JSON.stringify(post));
  } finally {
    await closeAllBrowsers();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
