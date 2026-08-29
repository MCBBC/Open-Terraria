// EoS 绘制矩形挂钩：拦截 ctx.drawImage(NPC_6 源)，抓精确 (dx,dy,dw,dh)，
// 与物理盒 worldToScreen 矩形同帧对比 → 直接量化绘制偏移。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(200, 120, 777, 'eos-spy');
  for (let x = 0; x < 200; x++) for (let y = 40; y < 120; y++) world.store.setTile(x, y, 1);
  for (let x = 46; x < 66; x++) for (let y = 86; y < 104; y++) world.store.setTile(x, y, 0);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  document.getElementById('sw-boot-prime')?.remove();
  const g = window.__swGame;
  g.paused = true;
  if (g.player.dead) g.respawnPlayer?.();
  g.player.x = 47 * 16; g.player.y = 93 * 16;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const eos = Enemy.fromVanilla(6, 56 * 16, 95 * 16);
  g.entities.add(eos, 'enemies');
  for (let i = 0; i < 30; i++) { eos.visAngle = 0; g.fixedUpdate(1 / 60); eos.visAngle = 0; }
  eos.vx = 0; eos.vy = 0;
  // 挂 drawImage 间谍：源高 160 的 NPC_6 贴图 = EoS
  const calls = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (img, ...args) {
    try {
      if (args.length >= 5 && args.length <= 9) {
        const dw = args.length >= 7 ? args[4 + 2] : (img && img.width);
        const dh = args.length >= 7 ? args[4 + 3] : (img && img.height);
        calls.push({ nargs: args.length, sx: args[0], sy: args[1], sw: args[2], sh: args[3], dx: args[4], dy: args[5], dw, dh, iw: img && img.width, ih: img && img.height });
      }
    } catch {}
    return orig.apply(this, [img, ...args]);
  };
  window.__spyInstalled = true;
  // 挂 Renderer.drawEnemy 间谍：v_6 实体进绘制时记录 r 矩形与锚
  const { Renderer } = await import('/src/render/Renderer.ts');
  const oDE = Renderer.prototype.drawEnemy;
  Renderer.prototype.drawEnemy = function (e, world, ents) {
    calls.push({ key: e.key, vid: e.vanillaId, frame: e.frame, dead: e.dead });
    return oDE.call(this, e, world, ents);
  };
  // 渲染两帧抓调用
  await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r2))));
  const [bx, by] = g.camera.worldToScreen(eos.x, eos.y);
  const z = g.camera.zoom;
  const boxRect = { left: bx, top: by, right: bx + eos.w * z, bottom: by + eos.h * z };
  return { calls: calls.slice(0, 25), boxRect, zoom: z, cx: eos.cx, cy: eos.cy, w: eos.w, h: eos.h };
});
console.log(JSON.stringify(out, null, 1));
if (out.calls?.length) {
  const c = out.calls[0];
  console.log(`drawImage: 源矩形(sx=${c.sx},sy=${c.sy},sw=${c.sw},sh=${c.sh}) → 目标(dx=${c.dx},dy=${c.dy},dw=${c.dw},dh=${c.dh})`);
  const cyScreen = out.boxRect.top + (out.boxRect.bottom - out.boxRect.top) / 2;
  const cxScreen = out.boxRect.left + (out.boxRect.right - out.boxRect.left) / 2;
  console.log(`物理盒中心: (${cxScreen}, ${cyScreen})`);
  console.log(`绘制中心: (${c.dx + c.dw / 2}, ${c.dy + c.dh / 2})`);
  console.log(`绘制中心-盒中心: dx=${c.dx + c.dw / 2 - cxScreen}, dy=${c.dy + c.dh / 2 - cyScreen}`);
} else {
  console.log('NPC_6 绘制调用未捕获');
}
await browser.close();
