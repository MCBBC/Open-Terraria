// BJ313 探针4(修正版):预种 welcome ack + 等光照点亮 + 热栏校验 + 中段截图像素分析
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let crashed = null;
page.on('pageerror', (e) => { crashed = crashed ?? e.message; console.error('PAGEERROR:', e.message.slice(0, 200)); });
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {}
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
// 等光照引擎点亮玩家位(白天地表应 >0);最多 10s
await page.waitForFunction(() => {
  const g = window.__swGame;
  if (!g.lighting) return true;
  const [r, gg, b] = g.lighting.lightAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16));
  return (r + gg + b) > 90;
}, { timeout: 12000, polling: 500 }).catch(() => {});

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
    const lightHere = g.lighting ? g.lighting.lightAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)) : null;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { idx, hotbar0: g.player.inv.slots[0]?.id, expectIdx: idx, screenX: sx, screenY: sy, lightHere, canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height };
  }, vid);
  if (meta.hotbar0 !== meta.expectIdx) return { meta, aborted: 'hotbar-mismatch' };
  // 真实循环驱动挥击;~170ms 处中段截图(弧存活窗 ~400ms)
  await page.evaluate(() => {
    const g = window.__swGame;
    g.input.mouseX = g.renderer.canvas.width / 2 + 200;
    g.input.mouseY = g.renderer.canvas.height / 2 - 40;
    g.input.mouseDown = true; g.input.mouseHeld = true;
  });
  await new Promise((r) => setTimeout(r, 170));
  const shot = await page.screenshot({ encoding: 'binary' });
  const mid = await page.evaluate(() => {
    const g = window.__swGame;
    const arcs = g.entities.projectiles.filter((p) => ['SwingArc', 'NightsEdgeFly', 'TrueNightsEdgeSlash'].includes(p.constructor.name));
    return { live: arcs.map((a) => ({ ctor: a.constructor.name, t: a.t ?? null, projId: a.projId ?? null })), lightHere: g.lighting ? g.lighting.lightAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)) : null };
  });
  await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
  return { meta, mid, shot };
}

const res273 = await runSwing(273);
fs.writeFileSync('/tmp/bj313-273b.png', res273.shot);
const res675 = await runSwing(675);
fs.writeFileSync('/tmp/bj313-675b.png', res675.shot);

function analyze(file, res, want) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const meta = res.meta;
  const scale = png.width / meta.canvasW;
  const cx = Math.round(meta.screenX * scale), cy = Math.round(meta.screenY * scale);
  let violet = 0, green = 0, bright = 0;
  const R = Math.round(170 * scale);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
    const i = (y * png.width + x) * 4;
    const r = png.data[i], gg = png.data[i + 1], b = png.data[i + 2];
    if (b - gg > 45 && r - gg > 12 && b > 85) violet++;
    if (gg - r > 25 && gg - b > 25 && gg > 95) green++;
    if (r > 235 && gg > 235 && b > 235) bright++;
  }
  return { file, center: [cx, cy], violet, green, bright, liveAtShot: res.mid?.live, lightMid: res.mid?.lightHere, lightPre: meta.lightHere };
}
console.log(JSON.stringify({
  v273: analyze('/tmp/bj313-273b.png', res273, 'violet'),
  v675: analyze('/tmp/bj313-675b.png', res675, 'green'),
  pageCrashed: crashed,
}, null, 1));
await browser.close();
