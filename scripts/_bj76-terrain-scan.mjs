// BJ76 一次性诊断:出生点地形/光照/屏幕内容全貌
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
  // 玩家周边 tile 类型表（±6 × 40..+2）
  const rows = [];
  for (let y = pty - 6; y <= pty + 4; y++) {
    let row = '';
    for (let x = ptx - 8; x <= ptx + 8; x++) {
      const i = st.idx(x, y);
      const t = st.tileType?.(x, y) ?? st.type?.[i] ?? -1;
      row += (t > 0 ? (t < 10 ? t : '#') : '.');
    }
    rows.push(`y=${y}: ${row}`);
  }
  // 向下扫:每 8 行统计实心数
  const prof = [];
  for (let y = pty - 20; y < pty + 80; y += 4) {
    let n = 0;
    for (let x = ptx - 20; x <= ptx + 20; x++) if (st.isSolid(x, y)) n++;
    prof.push(`y=${y}: solid=${n}/41`);
  }
  return { rows, prof, playerTile: [ptx, pty], groundLevel: g.world.groundLevel,
    cam: [g.camera.x, g.camera.y], spawnPoint: g.world.spawnPoint ?? g.world.spawn ?? null };
});
console.log('playerTile:', JSON.stringify(info.playerTile), 'groundLevel:', info.groundLevel, 'cam:', JSON.stringify(info.cam), 'spawn:', JSON.stringify(info.spawnPoint));
console.log('--- tile 表 (x=player-8..+8) ---');
for (const r of info.rows) console.log(r);
console.log('--- 实心剖面 ---');
for (const p of info.prof) console.log(p);
// 屏幕内容:均值亮度
const shot = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const c2 = off.getContext('2d', { willReadFrequently: true });
  c2.drawImage(cv, 0, 0);
  const img = c2.getImageData(0, 0, cv.width, cv.height).data;
  const rows2 = [];
  for (let y = 0; y < cv.height; y += 40) {
    let s = 0;
    for (let x = 0; x < cv.width; x += 8) { const o = (y * cv.width + x) * 4; s += (img[o] + img[o + 1] + img[o + 2]) / 3; }
    rows2.push(`screenY=${y}: mean=${(s / 100).toFixed(1)}`);
  }
  return rows2;
});
console.log('--- 屏幕行亮度 ---');
for (const s of shot) console.log(s);
await browser.close();
