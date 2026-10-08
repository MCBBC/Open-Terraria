// ★BJ569 追踪探针:点击路径分派追踪 + useWireTool 直调二分
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj569t]', ...a);

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

    // 装填 3611 + 电线(经模块面取 id,不碰 onInventoryChanged)
    await page.evaluate(async () => {
      const g = window.__swGame;
      const items = await import('/src/data/items.ts');
      const id3611 = items.ITEM_BY_KEY['vi_3611_WireKite'];
      const idWire = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[530]];
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id: id3611, stack: 1 };
      g.player.inv.slots[1] = { id: idWire, stack: 200 };
    });

    // 传送开阔地 + 找地表实心格
    const spot = await page.evaluate(() => {
      const g = window.__swGame;
      const sx = g.world.spawnX * 16;
      const sy = (g.world.spawnY - 6) * 16;
      g.player.x = sx; g.player.y = sy; g.player.vx = 0; g.player.vy = 0;
      const st = g.world.store;
      const px = Math.floor(g.player.cx / 16);
      let groundY = -1;
      for (let y = Math.floor(g.player.cy / 16); y < st.h - 5; y++) {
        if (st.isSolid(px, y)) { groundY = y; break; }
      }
      return { px, groundY, py: Math.floor(g.player.cy / 16) };
    });
    log('spot', JSON.stringify(spot));
    await pump(page, 10);

    // 追踪包装:候选消费方法 + toast
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__bj569trace = [];
      const T = window.__bj569trace;
      const wrap = (name) => {
        const orig = g[name]?.bind(g);
        if (!orig) { T.push({ skip: name }); return; }
        g[name] = (...args) => {
          T.push({ fn: name, args: args.map((a) => (a && typeof a === 'object' ? (a.key ?? JSON.stringify(a).slice(0, 60)) : a)) });
          return orig(...args);
        };
      };
      ['useWireTool', 'tryUsePaintTool', 'useExtractinator', 'useSwing', 'tryMine', 'tryPlaceWall', 'tryPlaceTile', 'quickHeal', 'useEquippedGrapple'].forEach(wrap);
      const oldToast = g.cb.onToast;
      g.cb.onToast = (m) => { T.push({ toast: m }); oldToast?.(m); };
    });

    // 目标:玩家右侧 3 格的地表格(实心)与地面上 1 格(空气)
    const tSolid = [spot.px + 3, spot.groundY];
    const tAir = [spot.px + 3, spot.groundY - 1];
    log('targets', JSON.stringify({ tSolid, tAir }));

    // 击1: mouseDown 边沿,鼠标指向实心格
    await page.evaluate(([tx, ty]) => {
      const g = window.__swGame;
      g.input.mouseX = (tx * 16 - g.camera.x) | 0;
      g.input.mouseY = (ty * 16 - g.camera.y) | 0;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
      window.__bj569frames = [];
    }, tSolid);
    // 逐帧读数 4 帧
    for (let i = 0; i < 4; i++) {
      await pump(page, 1);
      const f = await page.evaluate(() => {
        const g = window.__swGame;
        return { fr: (window.__bj569frames.push(1), window.__bj569frames.length), anchor: g.grandAnchor, useTime: g.player.useTime, mouseDown: g.input.mouseDown, traceN: window.__bj569trace.length };
      });
      log('frame', i, JSON.stringify(f));
    }
    const wireSolid = await page.evaluate(([tx, ty]) => {
      const g = window.__swGame; const st = g.world.store;
      return { wire: st.wire[st.idx(tx, ty)], solid: st.isSolid(tx, ty), type: st.type[st.idx(tx, ty)] };
    }, tSolid);
    log('wireSolid', JSON.stringify(wireSolid));
    const trace = await page.evaluate(() => window.__bj569trace);
    log('trace', JSON.stringify(trace, null, 1));

    // ---- useWireTool 直调二分(绕过分派) ----
    const direct = await page.evaluate(async ([tx, ty]) => {
      const items = await import('/src/data/items.ts');
      const def = items.ITEM_DEFS[items.ITEM_BY_KEY['vi_3611_WireKite']];
      const g = window.__swGame;
      const st = g.world.store;
      const out = { defWireTool: def.wireTool, defKey: def.key };
      g.useWireTool(tx, ty, def);           // 第1次:设锚?
      out.afterCall1 = { anchor: g.grandAnchor, useTime: g.player.useTime };
      g.useWireTool(tx + 3, ty, def);       // 第2次:执行?
      out.afterCall2 = { anchor: g.grandAnchor, useTime: g.player.useTime, wire: st.wire[st.idx(tx, ty)], wireEnd: st.wire[st.idx(tx + 3, ty)] };
      // 清场再试空气格
      g.grandAnchor = null;
      const inv = g.player.inv;
      out.wireStack = inv.slots[1]?.stack;
      return out;
    }, tSolid);
    log('direct', JSON.stringify(direct, null, 1));
  } finally {
    await closeAllBrowsers();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
