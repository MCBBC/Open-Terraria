// 精确取证:标注格中心 16x16 + 右邻左 4 列的原始 RGB(hex)——
// 区分"水色暗"(浸润带已覆盖)与"视差背景色"(漏光)。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const MAP = '/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (4).json';
const mapStr = readFileSync(MAP, 'utf8');
const marksJson = JSON.parse(readFileSync('/Users/vinlic/Downloads/marks-浮夸的羡慕顶峰 (3).json', 'utf8'));
const byNo = new Map(marksJson.marks.map((m) => [m.no, m]));
const picks = process.env.SW_PICKS ? process.env.SW_PICKS.split(',').map(Number) : [1, 3, 24];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope-profile8',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

for (const no of picks) {
  const m = byNo.get(no);
  await page.evaluate((mx, my) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    // 玩家挪到标注格下方 4 格(实体内,防玩家精灵糊住采样窗);相机 follow 打桩钉死在标注格
    g.player.x = mx * 16 + 8; g.player.y = (my + 4) * 16 + 8;
    g.camera.setZoomTarget(2); g.camera.zoom = 2;
    g.camera.follow = function () {};   // 停跟随(实例打桩,只影响本页)
    g.camera.x = mx * 16 + 8; g.camera.y = my * 16 + 8;
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
    if (g.renderer) g.renderer.fullbright = true;
  }, m.x, m.y);
  await new Promise((r) => setTimeout(r, 2400));
  const dump = await page.evaluate((mx, my) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const [sx, sy] = g.camera.worldToScreen(mx * 16, my * 16);
    const z = g.camera.zoom;
    const dpr = cv.width / (cv.clientWidth || 1280);
    const rows = [];
    for (let ty = 0; ty < 16; ty++) {
      const row = [];
      for (let tx = 0; tx < 20; tx++) {   // 本格 16 + 右邻前 4 列
        const px = Math.round((sx + (tx + 0.5) * z) * dpr);
        const py = Math.round((sy + (ty + 0.5) * z) * dpr);
        const d = c2.getImageData(Math.min(px, cv.width - 1), Math.min(py, cv.height - 1), 1, 1).data;
        row.push([d[0], d[1], d[2], d[3]]);
      }
      rows.push(row);
    }
    const st = g.world.store;
    const i = st.idx(mx, my);
    return { rows, slope: st.slope[i], half: !!st.half[i], type: st.type[i] };
  }, m.x, m.y);
  console.log(`\n#${no} ${m.typeKey} @(${m.x},${m.y}) slope=${dump.slope}${dump.half ? 'H' : ''}`);
  for (let ty = 0; ty < 16; ty++) {
    const cells = dump.rows[ty].map((c) => {
      const hex = c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
      return hex;
    });
    console.log(` y${String(ty).padStart(2, '0')} ` + cells.slice(0, 16).join(' ') + ' | ' + cells.slice(16).join(' '));
  }
}
await browser.close();
