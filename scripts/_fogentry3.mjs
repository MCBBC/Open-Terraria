// 迷雾 HUD 合成定位探针 v3:数据(fogP32@玩家=0 清雾)与 HUD 画布(中心=雾色)
// 矛盾 → 包裹 mmHudBlit 记录它当帧读到的 fog[fi]/映射坐标,抓现场。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 800, H = 300;
  const world = new World(W, H, 777, 'fog-entry-probe3');
  world.spawnX = 400; world.spawnY = 150;
  world.groundLevel = 100; world.rockLevel = 180; world.lavaLine = 260;
  for (let x = 0; x < W; x++) {
    for (let y = 155; y < 180; y++) world.store.setTile(x, y, 1);
    for (let y = 180; y < H; y++) world.store.setTile(x, y, 2);
    world.store.setTile(x, 154, 3);
  }
  const parts = sf.buildSaveParts(world);
  const json = sf.serializeSave(parts.view, parts.meta, parts.player, 0);
  await window.__swFlow.loadJson(json);
  const g = window.__swGame;
  const rr = g.renderer;
  // 包裹 mmHudBlit:记录中心映射与当帧 fog 值
  const proto = Object.getPrototypeOf(rr);
  const orig = proto.mmHudBlit;
  const trace = [];
  proto.mmHudBlit = function (world_, sx, sy, viewTiles) {
    const sizeI = Math.min(512, viewTiles);
    const step = viewTiles > 512 ? viewTiles / 512 : 1;
    const mm = this.minimap;
    const cy = Math.floor(sizeI / 2), cx2 = Math.floor(sizeI / 2);
    const my = Math.min(mm.h - 1, sy + Math.floor(cy * step));
    const mx = Math.min(mm.w - 1, sx + Math.floor(cx2 * step));
    const fi = (my >> 1) * this.fogW + (mx >> 1);
    const fogv = this.fogP32 ? this.fogP32[fi] : -1;
    const exv = world_.explored ? world_.explored[my * mm.w + mx] : -1;
    if (trace.length < 400) trace.push({ sx, sy, vt: viewTiles, my, mx, fi, fogv, exv, v: world_.exploredVersion, fv: this.fogVersion });
    return orig.call(this, world_, sx, sy, viewTiles);
  };
  await new Promise((r2) => setTimeout(r2, 2000));   // 静止 2s
  proto.mmHudBlit = orig;
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
  const post = {
    ptx, pty,
    fogAtPlayer: rr.fogP32[(pty >> 1) * rr.fogW + (ptx >> 1)],
    exploredAtPlayer: g.world.explored[pty * W + ptx],
    fogVersion: rr.fogVersion, worldV: g.world.exploredVersion, row: rr.fogRebuildRow,
  };
  const c = rr._mmHudCanvas;
  const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
  return { post, hudCenter: [d[0], d[1], d[2], d[3]],
    traceFirst: trace.slice(0, 3), traceLast: trace.slice(-3),
    fogNonZeroFrames: trace.filter((t) => t.fogv !== 0).length, totalFrames: trace.length };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
