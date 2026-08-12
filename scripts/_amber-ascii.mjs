// 一次性诊断：宝石树区域 ASCII 色相图（可读渲染验证）
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_amber-ascii.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未就绪'); process.exit(1); }
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 2209 * 16; g.player.y = (974 - 8) * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
});
await new Promise((r) => setTimeout(r, 5000));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const camX = cam.x, camY = cam.y; // 采样时相机实际值
  const toScreen = (wx, wy) => [(wx - (camX - cv.width / 2 / z)) * z, (wy - (camY - cv.height / 2 / z)) * z];
  // 每个 tile 一格：tile (2205..2214) x (966..984)，取格内 4x4 采样的众数色
  const letter = (r, gg, b) => {
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx < 45) return '.';
    if (mx - mn < 24) return mx > 190 ? '#' : ':';
    if (b > r && b > gg) return 'B';            // 蓝(蓝宝石)
    if (r > 195 && gg > 105 && gg < 195 && b < 105) return 'A';  // 琥珀橙
    if (gg > r && gg > b) return 'G';
    if (r > gg && r > b) return r > 140 ? 'R' : 'r';
    if (r > 90 && b > 90 && gg < Math.min(r, b)) return 'P';
    if (gg > 170 && b > 170 && r < 140) return 'C';
    return '?';
  };
  const rows = [];
  for (let ty = 966; ty <= 984; ty++) {
    let row = '';
    for (let tx = 2205; tx <= 2214; tx++) {
      const votes = {};
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const [px, py] = toScreen(tx * 16 + 2 + sx * 4, ty * 16 + 2 + sy * 4);
        if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) { votes[' '] = (votes[' '] || 0) + 1; continue; }
        const d = ctx2.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
        if (d[3] < 40) { votes[' '] = (votes[' '] || 0) + 1; continue; }
        const L = letter(d[0], d[1], d[2]);
        votes[L] = (votes[L] || 0) + 1;
      }
      row += Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    }
    rows.push(row);
  }
  return { cam: { x: camX, y: camY, z }, ascii: rows };
});
console.log('cam:', JSON.stringify(out.cam));
for (const r of out.ascii) console.log(r);
console.log('图例: B=蓝 A=琥珀橙 G=绿 R/r=红 P=紫 C=青 #=白 :=灰 .=黑 空格=透明');
console.log('pageerrors:', errors.slice(0, 5));
await browser.close();
