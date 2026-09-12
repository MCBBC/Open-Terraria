// SW-BJ63 2026-09-11 取证探针 v2（一次性,`_` 前缀经 tools/probe.mjs 运行）:
// 宝箱智能交互高亮四态直读 —— 关箱/开箱 × Ctrl智能光标/纯鼠标。
// v1 教训:g.input.mouseX 直写被真 mousemove 事件覆盖(headless 指针 (0,0) 欢迎弹窗
// 点击落点),mouse 世界坐标出界 → 块门 shouldBlockSmartInteract 整链清空——探针
// 伪影,非游戏断链。v2 一律真指针事件(page.mouse.move 于 worldToScreen+canvas rect)。
// 链路逐环:①tile 帧态(smartInteractTileFrame) ②mask 21 加载(直读+fetch 过 SW)
// ③渲染调用计数(prototype 包裹) ④元素截图像素 diff(可视面) ⑤坐标链单源核对。
import { launchBrowser, openPage, bootstrap, createGame, waitForGame, ledger } from '../tools/probe/lib/index.mjs';
import fs from 'node:fs';

const L = ledger();
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
await waitForGame(page, { log: (m) => console.log(m) });

// ---- 场地搭建 + 链路仪表 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const chestId = 16;   // TILE_BY_KEY['chest']=16(vanilla.sheet=21)——真实宝箱 store 域
  for (let x = 44; x <= 82; x++) for (let y = 114; y <= 134; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 46; x <= 80; x++) st.setTileSilent(x, 132, 1, 0, 0);   // stone floor
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    st.setTileSilent(58 + i, 128 + j, chestId, i * 18, j * 18);
  }
  g.chunks.markDirtyArea(44, 114, 82, 134);
  g.world.spawnX = 54; g.world.spawnY = 130; g.world.spawnX0 = 54; g.world.spawnY0 = 130;
  const pl = g.player;
  pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
  pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false; pl.fallStartY = null;
  pl.x = 54 * 16; pl.y = 132 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  g.world.chests.length = 0;
  g.world.chests.push({ x: 58, y: 128, items: Array(40).fill(null), frame: 0 });
  st.setTileSilent(61, 131, 4, 0, 0);   // 火把点亮(avg 门 :4523-4525)
  g.chunks.markDirtyArea(60, 129, 62, 133);

  const { Renderer } = await import('/src/render/Renderer.ts');
  window.__bj63draws = 0;
  if (!Renderer.prototype.__bj63wrapped) {
    const orig = Renderer.prototype.drawSmartInteractTileHighlights;
    Renderer.prototype.drawSmartInteractTileHighlights = function (...a) {
      window.__bj63draws++;
      return orig.apply(this, a);
    };
    Renderer.prototype.__bj63wrapped = true;
  }
  const m = await import('/src/core/SmartInteractTiles.ts');
  const tiles = await import('/src/data/tiles.ts');
  window.__bj63frame = () => {
    const f = m.smartInteractTileFrame;
    return { tileWon: f.tileWon, n: f.coords.length, sel: [...f.selected] };
  };
  window.__bj63screenOf = (tx, ty) => {
    const g2 = window.__swGame, c = g2.camera;
    const [sx, sy] = c.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    // ★v2 教训:DOM 首个 canvas 是隐藏件(w=0)——真画布=有非零 bbox 的那个
    const cvs = [...document.querySelectorAll('canvas')];
    const vis = cvs.find((cv) => { const r = cv.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const r = vis ? vis.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    return { cx: r.left + sx, cy: r.top + sy, nCanvas: cvs.length, rect: { l: r.left, t: r.top, w: r.width, h: r.height } };
  };
  window.__bj63diag = async () => {
    const g2 = window.__swGame;
    const st2 = g2.world.store;
    const si = st2.idx(58, 128);
    const storeType = st2.type[si];
    const sheet = (tiles.TILE_DEFS[storeType] ?? {})?.vanilla?.sheet ?? -1;
    const [mwx, mwy] = g2.camera.screenToWorld(g2.input.mouseX, g2.input.mouseY);
    const gtx = g2.smartCursor.showing ? g2.smartCursor.x : Math.floor(mwx / 16);
    const gty = g2.smartCursor.showing ? g2.smartCursor.y : Math.floor(mwy / 16);
    const { loadHighlightMask } = await import('/src/render/TileHighlight.ts');
    const light = g2.lighting.lightAt(58, 128);
    const cv = document.querySelector('canvas');
    return {
      storeType, sheet, active: !!(st2.flags[si] & 1),
      fx: st2.frameX[si], fy: st2.frameY[si],
      wanted: g2.smartCursor.wanted, showing: g2.smartCursor.showing,
      scxy: [g2.smartCursor.x, g2.smartCursor.y],
      block: m.shouldBlockSmartInteract(st2, gtx, gty), gateTile: [gtx, gty],
      mask21: !!loadHighlightMask(21),
      held: !!(g2.uiHeldItemRef && g2.uiHeldItemRef()),
      light, avg: Math.floor((light[0] + light[1] + light[2]) / 3),
      chestFrame: g2.world.chests[0]?.frame,
      mouseW: [Math.round(mwx), Math.round(mwy)],
      mouseRaw: [g2.input.mouseX, g2.input.mouseY],
      cam: { x: Math.round(g2.camera.x), y: Math.round(g2.camera.y), zoom: g2.camera.zoom, vw: g2.camera.viewW, vh: g2.camera.viewH, flipY: g2.camera.flipY },
      rect: { l: g2.input.canvasRectLeft, t: g2.input.canvasRectTop },
      canvases: document.querySelectorAll('canvas').length,
      player: { x: Math.round(g2.player.x), y: Math.round(g2.player.y) },
    };
  };
  window.__bj63maskFetch = async () => {
    const r = await fetch('sprites/vanilla/Misc_TileOutlines_Tiles_21.png');
    return { status: r.status, type: r.headers.get('content-type'), len: (await r.blob()).size };
  };
});
await page.waitForFunction(() => !!window.__bj63frame, { timeout: 30000 });
const maskNet = await page.evaluate(() => window.__bj63maskFetch());
await page.waitForFunction(async () => {
  const { loadHighlightMask } = await import('/src/render/TileHighlight.ts');
  return !!loadHighlightMask(21);
}, { timeout: 15000 }).catch(() => {});

// 相机先跟住玩家(传送后 settle),再取宝箱屏坐标
await new Promise((r) => setTimeout(r, 1200));
const chestPos = await page.evaluate(() => window.__bj63screenOf(59, 129));
console.log('BJ63 chestScreen', JSON.stringify(chestPos));
await page.mouse.move(chestPos.cx, chestPos.cy, { steps: 4 });

const visibleCanvasHandle = async () => {
  const handles = await page.$$('canvas');
  for (const h of handles) {
    const bb = await h.boundingBox();
    if (bb && bb.width > 0 && bb.height > 0) return h;
  }
  return handles[0];
};
const shot = async (name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const el = await visibleCanvasHandle();
  await el.screenshot({ path: `/tmp/probe-out/_bj63/${name}.png` });
  return fs.readFileSync(`/tmp/probe-out/_bj63/${name}.png`);
};
fs.mkdirSync('/tmp/probe-out/_bj63', { recursive: true });

// ---- 态1:关箱 × 纯鼠标(指针在宝箱,无 Ctrl —— 预期无高亮=原版) ----
await new Promise((r) => setTimeout(r, 600));
const s1 = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws }));
const buf1 = await shot('s1-closed-mouse');
const diag1 = await page.evaluate(() => window.__bj63diag());

// ---- 态2:关箱 × Ctrl(真键按下 —— 预期 tileWon+候选≥4+draws 增+像素 diff) ----
await page.keyboard.down('Control');
await new Promise((r) => setTimeout(r, 800));
const s2 = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws }));
const buf2 = await shot('s2-closed-ctrl');
const diag2 = await page.evaluate(() => window.__bj63diag());

// ---- 态3:开箱(直置 frame=1,80ms 内快读) × Ctrl —— 预期绘制保持 ----
await page.evaluate(() => { window.__swGame.world.chests[0].frame = 1; });
await new Promise((r) => setTimeout(r, 80));
const s3 = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws, chestFrame: window.__swGame.world.chests[0].frame }));
const buf3 = await shot('s3-open-ctrl');

// ---- 态4:开箱 × 纯鼠标(松 Ctrl —— 预期无高亮) ----
await page.keyboard.up('Control');
await new Promise((r) => setTimeout(r, 600));
const s4 = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws }));
const buf4 = await shot('s4-open-mouse');
const diag4 = await page.evaluate(() => window.__bj63diag());

const diffBytes = (a, b) => { let n = 0; const m = Math.min(a.length, b.length); for (let i = 0; i < m; i++) if (a[i] !== b[i]) n++; return n; };

L.chk('maskNet 200+image/png（SW 通道）', maskNet.status === 200 && /image\//.test(maskNet.type || ''), JSON.stringify(maskNet));
L.chk('态1 关箱×纯鼠标:无候选（原版本相）', s1.frame.tileWon === false && s1.frame.n === 0, JSON.stringify(s1));
L.chk('态1 diag:光 avg>10+mask 就绪+真宝箱 sheet21', diag1.avg > 10 && diag1.mask21 && diag1.sheet === 21,
  `avg=${diag1.avg} mask21=${diag1.mask21} sheet=${diag1.sheet} storeType=${diag1.storeType} mouseW=${JSON.stringify(diag1.mouseW)} mouseRaw=${JSON.stringify(diag1.mouseRaw)} rect=${JSON.stringify(diag1.rect)} cam=${JSON.stringify(diag1.cam)}`);
L.chk('态2 关箱×Ctrl:tileWon+候选≥4', s2.frame.tileWon === true && s2.frame.n >= 4, JSON.stringify(s2));
L.chk('态2 diag:块门放行+mask 就绪', diag2.block === false && diag2.mask21 === true,
  JSON.stringify({ block: diag2.block, gate: diag2.gateTile, scxy: diag2.scxy, showing: diag2.showing, wanted: diag2.wanted, mouseW: diag2.mouseW }));
L.chk('态2 绘制调用发生', s2.draws > s1.draws, `draws ${s1.draws}→${s2.draws}`);
L.chk('态2 像素可视 diff（高亮真上屏）', diffBytes(buf1, buf2) > 0, `diffBytes=${diffBytes(buf1, buf2)}`);
L.chk('态3 开箱×Ctrl:候选保持+绘制保持', s3.frame.tileWon === true && s3.frame.n >= 4 && s3.draws > s2.draws, JSON.stringify(s3));
L.chk('态4 开箱×纯鼠标:无候选', s4.frame.tileWon === false && s4.frame.n === 0, JSON.stringify(s4));

console.log('BJ63 DIAG1', JSON.stringify(diag1));
console.log('BJ63 DIAG2', JSON.stringify(diag2));
console.log('BJ63 DIAG4', JSON.stringify(diag4));
console.log('BJ63 SUM', JSON.stringify({ s1, s2, s3, s4, diffs: { d12: diffBytes(buf1, buf2), d13: diffBytes(buf1, buf3), d14: diffBytes(buf1, buf4) } }));

await browser.close();
process.exit(L.exitCode());
