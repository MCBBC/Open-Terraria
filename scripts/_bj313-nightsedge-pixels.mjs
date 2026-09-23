// BJ313 探针3:像素级终验——273 紫弧/尘 + 675 绿斩用户可见性 + 光照取样
// 截图在挥击中段获取,node 侧 pngjs 解码,按玩家屏幕位盒内数紫/绿像素
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let crashed = null;
page.on('pageerror', (e) => { crashed = crashed ?? e.message; console.error('PAGEERROR:', e.message.slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

async function runSwing(vid) {
  const meta = await page.evaluate(async (vid) => {
    const g = window.__swGame;
    const items = await import('/src/data/items.ts');
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16);
    let gy = Math.floor(g.world.groundLevel) + 4;
    while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
    for (let dy = -14; dy <= 1; dy++) for (let dx = -24; dx <= 24; dx++) st.setTile(px + dx, gy + dy, 0);
    for (let dx = -24; dx <= 24; dx++) st.setTile(px + dx, gy + 1, 2);
    g.player.x = px * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    const idx = items.ITEM_DEFS.findIndex((d) => d && d.vid === vid);
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id: idx, stack: 1 };
    g.input.mouseX = g.renderer.canvas.width / 2 + 200;
    g.input.mouseY = g.renderer.canvas.height / 2 - 40;
    // 挥击起手
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    const arc = g.entities.projectiles.find((p) => p.constructor.name === 'SwingArc' || p.constructor.name === 'TrueNightsEdgeSlash' || p.constructor.name === 'NightsEdgeFly');
    const arcPos = arc ? { cx: arc.cx, cy: arc.cy } : null;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    // 弧中心屏幕位(弧锚在玩家身位)
    const lightHere = g.lighting ? g.lighting.lightAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)) : null;
    return { idx, arcCtor: arc?.constructor.name ?? null, screenX: sx, screenY: sy, lightHere, canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height, dpr: window.devicePixelRatio };
  }, vid);
  // 中段截图(真实时间推进,游戏循环跑)
  await new Promise((r) => setTimeout(r, 160));
  const shot = await page.screenshot({ encoding: 'binary' });
  // 停挥
  await page.evaluate(() => { g_stop(); });
  return { meta, shot };
}
// 停挥助手(页内)
await page.evaluate(() => { window.g_stop = () => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; }; });

const res273 = await runSwing(273);
fs.writeFileSync('/tmp/bj313-273.png', res273.shot);
const res675 = await runSwing(675);
fs.writeFileSync('/tmp/bj313-675.png', res675.shot);

function analyze(file, want) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { meta } = want === 'violet' ? res273 : res675;
  // 世界坐标→截图像素(截图含 dpr 缩放)
  const scale = png.width / meta.canvasW;
  const cx = Math.round(meta.screenX * scale), cy = Math.round(meta.screenY * scale);
  let violet = 0, green = 0, bright = 0;
  const R = Math.round(170 * scale);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
    const i = (y * png.width + x) * 4;
    const r = png.data[i], gg = png.data[i + 1], b = png.data[i + 2];
    if (b - gg > 45 && r - gg > 12 && b > 85) violet++;           // 紫弧/紫尘族
    if (gg - r > 25 && gg - b > 25 && gg > 95) green++;           // 绿斩族
    if (r > 235 && gg > 235 && b > 235) bright++;                 // 白芯/星闪
  }
  return { file, pngW: png.width, center: [cx, cy], violet, green, bright, ctor: meta.arcCtor, lightHere: meta.lightHere };
}
console.log(JSON.stringify({
  v273: analyze('/tmp/bj313-273.png', 'violet'),
  v675: analyze('/tmp/bj313-675.png', 'green'),
  pageCrashed: crashed,
}, null, 1));
await browser.close();
