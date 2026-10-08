// ★BJ569 落刀后实机复核探针 v2——宏伟蓝图全屏路由手势（私有端口,SW_ORIGIN 注入）。
// v2 修正:v1 探针伪影=玩家坠落期相机漂移,固定屏幕坐标跨帧映射到漂移世界格。
//   本版先 settle 玩家(vy=0 落地),拖拽终点以【释放帧页内 invTile 实读】为判据。
// 场景:
//   S1 远距起手:玩家 22 格外点击落锚（旧射程门=静默无效,定谳主因）
//   S2 按住拖拽+松开执行:L 形铺线 + 耗线对账（vanilla 段序 facing=1 先垂直）
//   S3 右键取消:引导期右键=路由消亡不执行
//   S4 剪线路由:已铺线区域批量拆除
// 用法(game/): SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj569-verdict-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = 'docs/evidence/bj569';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj569v]', ...a);
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

    await page.evaluate(async () => {
      const g = window.__swGame;
      const items = await import('/src/data/items.ts');
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id: items.ITEM_BY_KEY['vi_3611_WireKite'], stack: 1 };
      g.player.inv.slots[1] = { id: items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[530]], stack: 200 };
      g.player.x = g.world.spawnX * 16; g.player.y = (g.world.spawnY - 6) * 16;
      g.player.vx = 0; g.player.vy = 0;
      g.wireToolMode = 1;                            // 单红（耗线数=格数）
    });
    // settle:泵 90 帧等玩家落地静止（v1 伪影根除）
    for (let i = 0; i < 6; i++) await pump(page, 15);
    const settled = await page.evaluate(() => {
      const g = window.__swGame;
      return { px: Math.floor(g.player.cx / 16), py: Math.floor(g.player.cy / 16), vy: Math.abs(g.player.vy), onGround: g.player.onGround };
    });
    log('settled', JSON.stringify(settled));

    // 页面内 helper:屏幕坐标逆推 + wire 读 + vanilla L 格集(facing=1 先垂直)
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__bj569 = {
        toScreen(tx, ty) {
          const cam = g.camera;
          return [Math.round((tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2),
                  Math.round((ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2)];
        },
        invTile() {
          const cam = g.camera;
          return [Math.floor((cam.x + (g.input.mouseX - cam.viewW / 2) / cam.zoom) / 16),
                  Math.floor((cam.y + (g.input.mouseY - cam.viewH / 2) / cam.zoom) / 16)];
        },
        wireAt(tx, ty) { const st = g.world.store; return st.wire[st.idx(tx, ty)]; },
        lCells(a, e) {                                // Wiring.cs:3263-3335 facing=1
          const cells = [];
          for (let y = a[1]; y !== e[1]; y += Math.sign(e[1] - a[1])) cells.push([a[0], y]);
          for (let x = a[0]; x !== e[0]; x += Math.sign(e[0] - a[0])) cells.push([x, e[1]]);
          cells.push([e[0], e[1]]);
          return cells;
        },
      };
    });

    const base = await page.evaluate(() => {
      const g = window.__swGame;
      return { px: Math.floor(g.player.cx / 16), py: Math.floor(g.player.cy / 16) };
    });
    const tA = [base.px + 22, base.py + 1];
    const tB = [base.px + 28, base.py + 1];
    log('targets', JSON.stringify({ tA, tB }));

    // ---- S1 远距起手落锚 ----
    await page.evaluate(([tx, ty]) => {
      const [sx, sy] = window.__bj569.toScreen(tx, ty);
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, tA);
    await pump(page, 1);
    const s1 = await page.evaluate(() => {
      const g = window.__swGame;
      return { anchor: g.grandAnchor, useTime: g.player.useTime, mouseDown: g.input.mouseDown, inv: window.__bj569.invTile() };
    });
    ok('S1 远距(22 格)起手落锚+吞边沿', !!s1.anchor && s1.mouseDown === false && s1.useTime > 0
      && s1.anchor[0] === s1.inv[0] && s1.anchor[1] === s1.inv[1], s1);

    // ---- S2 拖拽+释放:vanilla L 段序 + 耗线 ----
    await page.evaluate(([tx, ty]) => {
      const [sx, sy] = window.__bj569.toScreen(tx, ty);
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = false; g.input.mouseHeld = true;
    }, tB);
    await pump(page, 2);
    const rel = await page.evaluate(() => ({ anchor: window.__swGame.grandAnchor, end: window.__bj569.invTile() }));
    await page.evaluate(() => { window.__swGame.input.mouseHeld = false; });
    await pump(page, 1);
    const s2 = await page.evaluate(([t0x, t0y]) => {
      const g = window.__swGame;
      const cells = window.__bj569.lCells([t0x, t0y], window.__bj569.invTile());
      const wired = cells.filter(([x, y]) => (window.__bj569.wireAt(x, y) & 1) !== 0);
      return { anchor: g.grandAnchor, nCells: cells.length, nWired: wired.length,
        stack: g.player.inv.slots[1]?.stack ?? -1, cells, wired };
    }, rel.anchor ?? tA);
    ok('S2 松开执行 L 铺线(vanilla 段序)+耗线对账', rel.anchor !== null && s2.anchor === null
      && s2.nWired === s2.nCells && s2.stack === 200 - s2.nCells,
      { rel, nCells: s2.nCells, nWired: s2.nWired, stack: s2.stack });

    // ---- S3 引导期右键取消 ----
    // S1 起手 itemTime=10 tick 未清零前重按=拒（vanilla flag4 ItemTimeIsZero 同相）
    await pump(page, 12);
    const tC = [tA[0], tA[1] - 5];
    await page.evaluate(([tx, ty]) => {
      const [sx, sy] = window.__bj569.toScreen(tx, ty);
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, tC);
    await pump(page, 1);
    const s3a = await page.evaluate(() => ({ anchor: window.__swGame.grandAnchor }));
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.rightDown = true; });
    await pump(page, 2);
    const s3b = await page.evaluate(() => ({ anchor: window.__swGame.grandAnchor, rightDown: window.__swGame.input.rightDown }));
    await page.evaluate(() => { const g = window.__swGame; g.input.rightDown = false; g.input.mouseHeld = false; });
    await pump(page, 2);
    const s3wire = await page.evaluate(([tx, ty]) => window.__bj569.wireAt(tx, ty), tC);
    ok('S3 右键取消(路由消亡不执行+吞右键)', !!s3a.anchor && s3b.anchor === null && s3b.rightDown === false && s3wire === 0,
      { ...s3a, ...s3b, s3wire });

    // ---- S4 剪线路由（S2 铺的红线拆净） ----
    // S3 起手重置 itemTime=10,同窗重按=拒（vanilla flag4 同相）
    await pump(page, 12);
    await page.evaluate(() => { window.__swGame.wireToolMode = 32 | 1; });   // TOOL_CUTTER|TOOL_RED
    await page.evaluate(([tx, ty]) => {
      const [sx, sy] = window.__bj569.toScreen(tx, ty);
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
    }, tA);
    await pump(page, 1);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });
    const rel4 = await page.evaluate(() => ({ anchor: window.__swGame.grandAnchor, end: window.__bj569.invTile() }));
    await page.evaluate(([tx, ty]) => {
      const [sx, sy] = window.__bj569.toScreen(tx, ty);
      const g = window.__swGame;
      g.input.mouseX = sx; g.input.mouseY = sy; g.input.mouseHeld = true;
    }, tB);
    await pump(page, 1);
    await page.evaluate(() => { window.__swGame.input.mouseHeld = false; });
    await pump(page, 1);
    const s4 = await page.evaluate(([t0x, t0y]) => {
      const cells = window.__bj569.lCells([t0x, t0y], window.__bj569.invTile());
      const stillWired = cells.filter(([x, y]) => (window.__bj569.wireAt(x, y) & 1) !== 0);
      return { stillWired: stillWired.length, stack: window.__swGame.player.inv.slots[1]?.stack ?? -1 };
    }, rel4.anchor ?? tA);
    ok('S4 剪线路由拆除+不耗线材', rel4.anchor !== null && s4.stillWired === 0 && s4.stack === 200 - s2.nCells,
      { rel4, ...s4 });
    await page.screenshot({ path: join(OUT, 's4-after-cut.png') });

    writeFileSync(join(OUT, 'bj569-verdict-results.json'), JSON.stringify({
      when: new Date().toISOString(), origin: ORIGIN, results: A,
    }, null, 2));
    log('results →', join(OUT, 'bj569-verdict-results.json'));
  } finally {
    await closeAllBrowsers();
  }
  const fails = A.filter((r) => !r.pass);
  console.log(`[bj569v] ${A.length - fails.length}/${A.length} PASS`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
