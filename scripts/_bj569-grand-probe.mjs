// ★BJ569 2026-10-08「宏伟蓝图无法使用」实机探针——私有端口探针(SW_ORIGIN 注入)。
// 场景:
//   S0 数据面: 3611 def.wireTool.grand / itemCombat(3611) / TILE_BOOST_BY_VID(3611)
//   S1 两击协议: 击1 设锚(grandAnchor) → 击2 执行 L 铺线 → wire 位变化
//   S2 单击+拖拽+松开(原版手势): 锚后松开是否执行(原版 channel 松手=执行)
//   S3 剪线模式(R 键循环后): 两击对已铺线区域执行剪线
//   S4 途中读数: useTime/useWireTool 早退门逐面判读(range/useTime/netCanEditTile)
// 用法(game/): SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj569-grand-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = 'docs/evidence/bj569';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj569]', ...a);
const A = [];
const ok = (n, pass, x) => { A.push({ name: n, pass: !!pass, ...(x ?? {}) }); log(pass ? 'PASS' : 'FAIL', n, x ? JSON.stringify(x) : ''); };

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

    // ---- S0 数据面 ----
    const s0 = await page.evaluate(() => {
      const g = window.__swGame;
      const w = g.world;
      const defs = g.ITEM_DEFS_REF;
      // 经 held def 走:先装填再读。这里直接找 vid 3611 的 def。
      let def = null, defKey = '';
      for (const k in (g.__itemByKeyProbe || {})) void k;
      // Game 未暴露 ITEM_DEFS → 走 inv 装填后读 heldItem
      return { hasWiring: !!g.wiring, worldW: w.store.w, worldH: w.store.h, hasDefProbe: !!g.ITEM_DEFS_REF };
    });
    log('S0 env', JSON.stringify(s0));

    // ---- 装填:3611 → 热栏 0 选中;530 电线 ×200 → 槽 1 ----
    const equip = await page.evaluate(() => {
      const g = window.__swGame;
      const items = window.__swItems;
      if (!items) return { err: 'no __swItems' };
      const key = Object.keys(items).find((k) => /^vi_3611_/.test(k));
      const id = items[key];
      const wireId = items['wire'] ?? items[Object.keys(items).find((k) => /^vi_530_/.test(k))];
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id, stack: 1 };
      g.player.inv.slots[1] = { id: wireId, stack: 200 };
      g.cb.onInventoryChanged?.();
      const held = g.player.inv.heldItem();
      const def = g.player.inv.defOf ? null : null;
      return { id, wireId, heldId: held?.id, key, selected: g.player.inv.selected };
    });
    ok('装填 3611 到热栏', equip.heldId !== undefined, equip);

    // held def 数据面
    const s0b = await page.evaluate(() => {
      const g = window.__swGame;
      const held = g.player.inv.heldItem();
      // def 表不可直达 → 用 useWireTool 的判据面:走一次 game 内部接口
      // Game 上 ITEM_DEFS 经 import;此处借 window.__swGame 的 defOf 面不存在 → 用 dispatch 探
      return { heldId: held.id, stack: held.stack };
    });
    log('S0b held', JSON.stringify(s0b));

    // ---- 传送开阔地 ----
    await page.evaluate(() => {
      const g = window.__swGame;
      const sx = g.world.spawnX * 16;
      const sy = (g.world.spawnY - 6) * 16;
      g.player.x = sx; g.player.y = sy; g.player.vx = 0; g.player.vy = 0;
    });
    await pump(page, 10);

    // 选定两格(玩家前方地表,范围内):tx0=spawnX+3, ty0=spawnY-1;tx1=spawnX+6
    const tileSel = await page.evaluate(() => {
      const g = window.__swGame;
      const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
      return { px, py, t0: [px + 3, py - 1], t1: [px + 6, py - 1] };
    });
    log('tiles', JSON.stringify(tileSel));

    // 屏幕坐标换算 helper(页内)
    const toScreen = async ([tx, ty]) => page.evaluate(([tx, ty]) => {
      const g = window.__swGame;
      const sx = tx * 16 - g.camera.x, sy = ty * 16 - g.camera.y;
      return [sx, sy];
    }, [tx, ty]);

    // wire 位读数 helper
    const wireAt = async ([tx, ty]) => page.evaluate(([tx, ty]) => {
      const g = window.__swGame;
      const st = g.world.store;
      const i = st.idx(tx, ty);
      return st.wire[i];
    }, [tx, ty]);

    // ---- S1 两击协议 ----
    const before0 = await wireAt(tileSel.t0);
    // 击1:mouseDown 边沿
    const [sx0, sy0] = await toScreen(tileSel.t0);
    await page.evaluate(([sx, sy]) => {
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, [sx0, sy0]);
    await pump(page, 3);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
    await pump(page, 2);
    const anchorState = await page.evaluate(() => {
      const g = window.__swGame;
      return { grandAnchor: g.grandAnchor, useTime: g.player.useTime };
    });
    ok('击1 设锚 grandAnchor', !!anchorState.grandAnchor, anchorState);

    const [sx1, sy1] = await toScreen(tileSel.t1);
    await page.evaluate(([sx, sy]) => {
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, [sx1, sy1]);
    await pump(page, 3);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
    await pump(page, 2);
    const after1 = await wireAt(tileSel.t1);
    const afterMid = await page.evaluate(([tx, ty]) => {
      const g = window.__swGame; const st = g.world.store; return st.wire[st.idx(tx, ty)];
    }, [tileSel.t0[0] + 1, tileSel.t0[1]]);
    const inv = await page.evaluate(() => {
      const g = window.__swGame;
      return g.player.inv.slots[1] ? g.player.inv.slots[1].stack : 0;
    });
    ok('击2 执行铺线(t1 wire 位)', after1 > 0, { before0, after1, afterMid, wireStackLeft: inv, grandAnchor: await page.evaluate(() => window.__swGame.grandAnchor) });

    // ---- S2 原版手势:单击设锚后拖拽+松开(应执行? 本仓=两击,松开无操作) ----
    const [sx2, sy2] = await toScreen([tileSel.t0[0], tileSel.t0[1] - 3]);
    await page.evaluate(([sx, sy]) => {
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, [sx2, sy2]);
    await pump(page, 2);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });
    await pump(page, 2);
    // 松开
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseHeld = false; });
    await pump(page, 5);
    const s2 = await page.evaluate(() => {
      const g = window.__swGame;
      return { grandAnchor: g.grandAnchor, useTime: g.player.useTime };
    });
    ok('S2 松开后锚保留(等二次点击执行)', s2.grandAnchor !== null, s2);
    // 用击2清锚
    const [sx3, sy3] = await toScreen([tileSel.t0[0], tileSel.t0[1] - 6]);
    await page.evaluate(([sx, sy]) => {
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = false; g.input.rightDown = false;
    }, [sx3, sy3]);
    await pump(page, 3);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });

    // ---- S4 早退门逐面判读(对 t0 重试并抓取门状态) ----
    const gates = await page.evaluate(() => {
      const g = window.__swGame;
      const p = g.player;
      const held = p.inv.heldItem();
      // def 面只能从行为读;这里读玩家侧可观测门
      return {
        useTime: p.useTime, cced: p.cced, dead: p.dead,
        selected: p.inv.selected, heldId: held?.id,
        uiBlocking: g.input.uiBlocking, blockMouse: g.input.blockMouse, delayUseItem: g.input.delayUseItem,
      };
    });
    ok('S4 门面干净', gates.useTime === 0 && !gates.uiBlocking && !gates.blockMouse && !gates.delayUseItem, gates);

    writeFileSync(join(OUT, 'bj569-probe-results.json'), JSON.stringify({
      when: new Date().toISOString(), origin: ORIGIN, results: A,
    }, null, 2));
    log('results →', join(OUT, 'bj569-probe-results.json'));
  } finally {
    await closeAllBrowsers();
  }
  const fails = A.filter((r) => !r.pass);
  console.log(`[bj569] ${A.length - fails.length}/${A.length} PASS`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
