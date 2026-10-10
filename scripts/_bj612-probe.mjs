// BJ612 真机端到端探针:蜘蛛女王哨兵(377)贴图完整性+平台落地双取证
// 运行: SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs scripts/_bj612-probe.mjs
import { launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, createGame, pump, giveItems, camSnapToTile } from '../tools/probe/lib/index.mjs';
import { saveCanvasShot, saveJson } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5212';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const boot = await bootstrap(page, ORIGIN);
console.log('bootstrap:', JSON.stringify(boot));
// 桥重断言(bootstrap 后 createGame 前桥若被 SW 接管 reload 撕掉,这里补位)
let bridgeOk = await waitForBridge(page, { timeout: 60_000 });
if (!bridgeOk) {
  console.log('bridge down after bootstrap — gotoApp 补位');
  await gotoApp(page, ORIGIN, { tries: 20 });
  bridgeOk = await waitForBridge(page, { timeout: 120_000 });
}
console.log('bridgeOk:', bridgeOk);
let gen = await createGame(page, { seed: '05162020', size: 'small' });
if (!gen.ok) {
  console.log('createGame retry after re-bridge');
  await gotoApp(page, ORIGIN, { tries: 20 });
  await waitForBridge(page, { timeout: 120_000 });
  gen = await createGame(page, { seed: '05162020', size: 'small' });
}
console.log('gen:', JSON.stringify(gen).slice(0, 120));
if (!gen.ok) {
  console.log('page errors:', errors.slice(0, 5));
  await browser.close();
  process.exit(2);
}

// —— 1. 场地:spawn 附近整平,建 7 列平台(地面上 7 格),清上方空间
const site = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const platId = window.__swTileByKey('platform');   // 内部 id(≠原版 19,探针初版踩坑)
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
  let gy = pty;
  for (; gy < st.h - 5; gy++) if (st.isSolid(ptx, gy)) break;
  const platRow = gy - 7;
  for (let x = ptx + 2; x <= ptx + 16; x++) {
    for (let y = platRow - 4; y < gy; y++) {
      if (st.type[st.idx(x, y)] !== 0) st.setTile(x, y, 0, 0, 0);
    }
  }
  for (let x = ptx + 4; x <= ptx + 10; x++) st.setTile(x, platRow, platId, 0, 0);
  g.player.x = (ptx + 1) * 16; g.player.y = (gy - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  return { ptx, gy, platRow, platId, platSolid2: st.isSolid2(ptx + 7, platRow) };
});
console.log('site:', JSON.stringify(site));

// —— 2. 给杖+选中
const give = await giveItems(page, [{ vid: 2366, stack: 1 }], { wipe: true, select: 0 });
console.log('give:', JSON.stringify(give));

// —— 3. 相机对准玩家,鼠标瞄平台中心,按下施放(真实 item-use 链)
await camSnapToTile(page, site.ptx + 1, site.gy - 4, { player: false });
await pump(page, 2);
const aim = await page.evaluate(({ platRow }) => {
  const g = window.__swGame;
  const wx = (Math.floor(g.player.cx / 16) + 7) * 16;
  const wy = platRow * 16;
  const [sx, sy] = g.camera.worldToScreen(wx, wy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.input.mouseDown = true;
  return { sx: Math.round(sx), sy: Math.round(sy), wx, wy };
}, { platRow: site.platRow });
console.log('aim:', JSON.stringify(aim));
await pump(page, 3);
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });

// —— 4. 泵 180 帧,读哨兵状态
await pump(page, 180);
const state = await page.evaluate(({ platRow }) => {
  const g = window.__swGame;
  const list = (g.entities?.projectiles || []).filter((e) => e.projId === 377);
  const s = list[0];
  if (!s) return { found: false };
  return {
    found: true, x: s.x, y: s.y, w: s.w, h: s.h, onGround: !!s.onGround,
    bottom: s.y + s.h, platTop: platRow * 16,
    onPlatform: Math.abs((s.y + s.h) - platRow * 16) < 0.5,
  };
}, { platRow: site.platRow });
console.log('sentry-state:', JSON.stringify(state));

// —— 5. 相机对准哨兵盒心,截图
if (state.found) {
  await page.evaluate(({ sx0, sy0 }) => {
    const g = window.__swGame;
    g.camera.x = sx0 + 33; g.camera.y = sy0 + 25;
  }, { sx0: state.x, sy0: state.y });
  await pump(page, 3);
  await saveCanvasShot(page, '/tmp/bj612-probe/sentry-on-platform.png');
}

// —— 6. 对照组:瞄右侧无平台列(玩家 +16 格)——照旧落实体地面
await page.evaluate(() => {
  const g = window.__swGame;
  const wx = g.player.cx + 16 * 16, wy = (Math.floor(g.player.cy / 16) - 1) * 16;
  const [sx, sy] = g.camera.worldToScreen(wx, wy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.input.mouseDown = true;
});
await pump(page, 3);
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await pump(page, 180);
const state2 = await page.evaluate(() => {
  const g = window.__swGame;
  const list = (g.entities?.projectiles || []).filter((e) => e.projId === 377);
  const s = list[list.length - 1];
  if (!s) return { found: false };
  const st = g.world.store;
  const tx = Math.floor((s.x + s.w / 2) / 16);
  const row = Math.floor((s.y + s.h) / 16);
  return {
    found: true, x: s.x, bottom: s.y + s.h, onGround: !!s.onGround,
    restRow: row, tileAtRest: st.type[st.idx(tx, row)], count: list.length,
  };
});
console.log('control-state:', JSON.stringify(state2));

// —— 7. 像素取证:截图里蜘蛛暗像素横向跨度(≈66×zoom=完整 vs ≈33×zoom=半图)
try {
  const { PNG } = await import('pngjs');
  const fs = await import('node:fs');
  if (state.found) {
    const png = PNG.sync.read(fs.readFileSync('/tmp/bj612-probe/sentry-on-platform.png'));
    const dims = await page.evaluate(() => {
      const g = window.__swGame;
      const cv = g.renderer.canvas;
      return { cw: cv.width, ch: cv.height, zoom: g.camera.zoom, cx: g.camera.x, cy: g.camera.y };
    });
    const bx = (state.x + 33 - dims.cx) * dims.zoom + dims.cw / 2;
    const by = (state.y + 25 - dims.cy) * dims.zoom + dims.ch / 2;
    const half = Math.ceil(34 * dims.zoom);
    let minX = 1e9, maxX = -1, cnt = 0;
    for (let y = Math.max(0, Math.round(by - half)); y < Math.min(png.height, Math.round(by + half)); y++) {
      for (let x = Math.max(0, Math.round(bx - half)); x < Math.min(png.width, Math.round(bx + half)); x++) {
        const i = (y * png.width + x) * 4;
        const r = png.data[i], gg = png.data[i + 1], b = png.data[i + 2];
        if (r < 125 && gg < 115 && b < 115 && !(gg > r + 15)) { // 暗躯干(排除绿草:草绿分量高于红)
          if (x < minX) minX = x; if (x > maxX) maxX = x; cnt++;
        }
      }
    }
    console.log('pixel-audit:', JSON.stringify({
      spiderSpanPx: maxX > minX ? maxX - minX + 1 : 0, darkCount: cnt, zoom: dims.zoom,
      expectFull: Math.round(66 * dims.zoom), expectHalf: Math.round(33 * dims.zoom),
    }));
  }
} catch (e) { console.log('pixel-audit skip:', e.message); }

saveJson('/tmp/bj612-probe/result.json', { site, aim, state, state2, errors });
console.log('page errors:', errors.slice(0, 5));
await browser.close();
process.exit(0);
