// SW-BJ54 2026-09-10 冒烟探针(一次性):智能交互 tile 高亮运行时链——
// 按住 Ctrl(智能光标 hold)光标悬停宝箱 → smartInteractTileFrame.coords 非空 +
// HighlightMask 21 就绪 + 截图像素 diff(高亮出现/松开消失)。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj54-highlight-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = '/tmp/bj54-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj54-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj54', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, .btn, [role=button]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
  for (const id of ['sw-welcome-announce', 'sw-boot-prime', 'sw-splash']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await new Promise((r) => setTimeout(r, 400));

await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  // ★直写 21: tiles.ts TILE_BY_KEY['chest'] 实为 16(瓶,键表被占)——曾致探针
  // 放出 2×1 瓶件(n=2 自洽假象)。宝箱 def(vanilla.sheet=21)的 store type=21 直取。
  const chestId = 21;
  // ---- 场地:石地板行 132(列 46-80),宝箱 2×2 @ (58,128),周边清空 ----
  for (let x = 44; x <= 82; x++) for (let y = 114; y <= 134; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 46; x <= 80; x++) st.setTileSilent(x, 132, 1, 0, 0);   // stone
  // 宝箱 2×2:frameX=0/18(件内列) frameY=0/18(件内行),锚 (58,128)
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    st.setTileSilent(58 + i, 128 + j, chestId, i * 18, j * 18);
  }
  g.chunks.markDirtyArea(44, 114, 82, 134);
  g.world.spawnX = 54; g.world.spawnY = 130; g.world.spawnX0 = 54; g.world.spawnY0 = 130;
  const pl = g.player;
  pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
  pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false; pl.fallStartY = null;
  pl.x = 54 * 16; pl.y = 132 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  g.world.chests.push({ x: 58, y: 128, items: Array(40).fill(null), frame: 0 });
  window.__bj54frame = async () => {
    const m = await import('/src/core/SmartInteractTiles.ts');
    const f = m.smartInteractTileFrame;
    return { tileWon: f.tileWon, n: f.coords.length, sel: [...f.selected] };
  };
  window.__bj54aim = (tx, ty) => {
    const c = g.camera;
    g.input.mouseX = Math.round((tx * 16 + 8 - c.x) * c.zoom + c.viewW / 2);
    g.input.mouseY = Math.round((ty * 16 + 8 - c.y) * c.zoom + c.viewH / 2);
  };
  window.__bj54chestPixel = async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d');
    if (!ctx) return -1;
    const c = g.camera;
    const [sx, sy] = [Math.round((58 * 16 - c.x) * c.zoom + cv.width / 2), Math.round((128 * 16 - c.y) * c.zoom + cv.height / 2)];
    const d = ctx.getImageData(sx, sy, Math.round(32 * c.zoom), Math.round(32 * c.zoom)).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  };
  window.__bj54dump = () => {
    const st2 = g.world.store;
    const cells = [];
    for (let i = 58; i <= 59; i++) for (let j = 128; j <= 129; j++) {
      const si = st2.idx(i, j);
      cells.push({ i, j, type: st2.type[si], active: st2.flags[si] & 1, fx: st2.frameX[si], fy: st2.frameY[si] });
    }
    const pl2 = g.player;
    const reach = 5;
    return {
      cells,
      player: { x: pl2.x, y: pl2.y, w: pl2.w, h: pl2.h },
      wanted: g.smartCursor.wanted,
      mouse: { mx: g.input.mouseX, my: g.input.mouseY },
      chestIdProbe: chestId,
      chests: g.world.chests.map((c) => ({ x: c.x, y: c.y, frame: c.frame })),
      canvasCtx: (() => { const cv = document.querySelector('canvas'); return cv ? cv.getContext('2d') ? '2d' : 'other' : 'none'; })(),
    };
  };
});
await page.evaluate(() => window.__bj54alive || null);
await page.waitForFunction(() => !!window.__bj54frame, { timeout: 30000 });

// ---- 步骤 1:松开 Ctrl、光标在宝箱上 → frame 无候选(纯鼠标无高亮=原版) ----
await page.evaluate(() => window.__bj54aim(59, 129));
await new Promise((r) => setTimeout(r, 400));
const idleState = await page.evaluate(() => window.__bj54frame());
// 宝箱区 clip(相机实时换算,120×120 世界像素窗)
const clipOf = () => page.evaluate(() => {
  const g = window.__swGame, c = g.camera, cv = document.querySelector('canvas');
  const sx = Math.round((57 * 16 - c.x) * c.zoom + cv.width / 2);
  const sy = Math.round((127 * 16 - c.y) * c.zoom + cv.height / 2);
  const s = Math.round(80 * c.zoom);
  return { x: Math.max(0, sx - 10), y: Math.max(0, sy - 10), width: s + 20, height: s + 20 };
});
await (await page.$('canvas')).screenshot({ path: OUT + '/idle.png', clip: await clipOf() });
const idleBuf = fs.readFileSync(OUT + '/idle.png');

// ---- 步骤 2:按住 Ctrl(智能光标 hold)同位置 → tileWon+coords 4 格+selected ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.keys.add('ControlLeft');
});
// 火把点亮宝箱区(tile 4 直置于箱旁地板上;光照引擎自动传播——avg 高→高亮显著;
// 暗处 avg 低=原版"高亮随光照弱化"语义,不阻塞)
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  st.setTileSilent(61, 131, 4, 0, 0);
  g.chunks.markDirtyArea(60, 129, 62, 133);
});
await new Promise((r) => setTimeout(r, 1200));
const smartState = await page.evaluate(() => window.__bj54frame());
await (await page.$('canvas')).screenshot({ path: OUT + '/smart.png', clip: await clipOf() });
const smartBuf = fs.readFileSync(OUT + '/smart.png');
// PNG 字节级 diff(截图确定性渲染,同参数帧差=高亮绘制增量)
let diffBytes = 0;
const n = Math.min(idleBuf.length, smartBuf.length);
for (let i = 0; i < n; i++) if (idleBuf[i] !== smartBuf[i]) diffBytes++;

// ---- 步骤 3:光标移到空地(域内无物)→ 高亮消失 ----
await page.evaluate(() => window.__bj54aim(74, 120));
await new Promise((r) => setTimeout(r, 400));
const emptyState = await page.evaluate(() => window.__bj54frame());
const dump = await page.evaluate(() => window.__bj54dump());

console.log('RESULT', JSON.stringify({ idleState, smartState, emptyState, diffBytes, dump }, null, 1));

await browser.close();
