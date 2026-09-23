// BJ313 探针5:地表白日终验——正午+地表站位+相机就位+灰度/紫/绿三检测
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
await new Promise((r) => setTimeout(r, 1200));

async function runSwing(vid) {
  const meta = await page.evaluate(async (vid) => {
    const g = window.__swGame;
    const items = await import('/src/data/items.ts');
    // 正午
    g.world.clock.timeOfDay = 0.5;
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16);
    // 真地表:从天顶往下扫第一块实心
    let sy = 5;
    while (sy < st.h - 20 && !st.isSolid(px, sy)) sy++;
    // 站位:地表上 3 格,清 5×5 头顶空间(仅气室,不封洞)
    for (let dy = -6; dy <= -1; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (st.isSolid(px + dx, sy + dy)) st.setTile(px + dx, sy + dy, 0);
    }
    g.player.x = px * 16; g.player.y = (sy - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    const idx = items.ITEM_DEFS.findIndex((d) => d && d.vid === vid);
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id: idx, stack: 1 };
    return { idx, vid };
  }, vid);
  // 等相机+光照就位(真实时间 1.2s)
  await new Promise((r) => setTimeout(r, 1200));
  const pre = await page.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    const light = g.lighting ? g.lighting.lightAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)) : null;
    return { screenX: sx, screenY: sy, light, canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height, hotbar0: g.player.inv.slots[0]?.id, timeOfDay: g.world.clock.timeOfDay };
  });
  if (pre.hotbar0 !== meta.idx) return { aborted: 'hotbar-mismatch', meta, pre };
  await page.evaluate(() => {
    const g = window.__swGame;
    g.input.mouseX = g.renderer.canvas.width / 2 + 200;
    g.input.mouseY = g.renderer.canvas.height / 2 - 40;
    g.input.mouseDown = true; g.input.mouseHeld = true;
  });
  await new Promise((r) => setTimeout(r, 220));
  const shot = await page.screenshot({ encoding: 'binary' });
  const mid = await page.evaluate(() => {
    const g = window.__swGame;
    const arcs = g.entities.projectiles.filter((p) => ['SwingArc', 'NightsEdgeFly', 'TrueNightsEdgeSlash'].includes(p.constructor.name));
    const light = g.lighting ? g.lighting.lightAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)) : null;
    return { live: arcs.map((a) => ({ ctor: a.constructor.name, t: a.t ?? null })), light };
  });
  await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
  return { meta, pre, mid, shot };
}

const res273 = await runSwing(273);
fs.writeFileSync('/tmp/bj313-273c.png', res273.shot);
const res675 = await runSwing(675);
fs.writeFileSync('/tmp/bj313-675c.png', res675.shot);

function analyze(file, res, want) {
  if (!res.shot) return { aborted: res.aborted, pre: res.pre };
  const png = PNG.sync.read(fs.readFileSync(file));
  const meta = res.pre;
  const scale = png.width / meta.canvasW;
  const cx = Math.round(meta.screenX * scale), cy = Math.round(meta.screenY * scale);
  let violet = 0, green = 0, white = 0, gray = 0;
  const R = Math.round(170 * scale);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
    const i = (y * png.width + x) * 4;
    const r = png.data[i], gg = png.data[i + 1], b = png.data[i + 2];
    if (b - gg > 45 && r - gg > 12 && b > 85) violet++;
    if (gg - r > 25 && gg - b > 25 && gg > 95) green++;
    if (r > 235 && gg > 235 && b > 235) white++;
    if (r > 60 && Math.abs(r - gg) < 14 && Math.abs(gg - b) < 14) gray++;   // 暗中白芯层
  }
  return { file, center: [cx, cy], violet, green, white, gray, liveAtShot: res.mid?.live, lightMid: res.mid?.light, lightPre: meta.light, tod: meta.timeOfDay };
}
console.log(JSON.stringify({
  v273: analyze('/tmp/bj313-273c.png', res273, 'violet'),
  v675: analyze('/tmp/bj313-675c.png', res675, 'green'),
  pageCrashed: crashed,
}, null, 1));
await browser.close();
