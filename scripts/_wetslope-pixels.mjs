// 像素级取证:对代表标注格导出合成画布的逐像素分类矩阵,
// 定位"亮缝"精确落在坡面斜边的哪几行/列。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const MARKS = '/Users/vinlic/Downloads/marks-浮夸的羡慕顶峰 (1).json';
const MAP = '/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (2).json';
const marksJson = JSON.parse(readFileSync(MARKS, 'utf8'));
const mapStr = readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope-profile2',
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

// 代表格:1(s1 丛林草) 3(s2 丛林草) 24(s2 草) 2(s1 上邻empty水) 半砖 与 平块样本
const picks = [];
const seen = new Set();
for (const m of marksJson.marks) {
  const k = `${m.typeKey}`;
  if (!seen.has(k)) { seen.add(k); picks.push(m.no); }
  if (picks.length >= 8) break;
}
const byNo = new Map(marksJson.marks.map((m) => [m.no, m]));

for (const no of picks) {
  const m = byNo.get(no);
  await page.evaluate((mx, my) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = mx * 16 + 8; g.player.y = my * 16 + 8;
    g.camera.setZoomTarget(2);
    g.camera.x = mx * 16 + 8; g.camera.y = my * 16 + 8;
    g.camera.zoom = 2;
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
  }, m.x, m.y);
  await new Promise((r) => setTimeout(r, 2400));
  const dump = await page.evaluate((mx, my) => {
    const g = window.__swGame;
    const r = g.renderer;
    const cv = r.canvas;
    const c2 = cv.getContext('2d');
    const [sx, sy] = g.camera.worldToScreen(mx * 16 - 16, my * 16 - 16); // 3x3 tile 区左上
    const z = g.camera.zoom;
    const dpr = cv.width / (cv.clientWidth || 1280);
    // 取 3x3 tile = 48x48 世界px,按世界像素逐点采样(canvas 设备像素取该世界px 覆盖的中心)
    const grid = [];
    for (let ty = 0; ty < 48; ty++) {
      const row = [];
      for (let tx = 0; tx < 48; tx++) {
        const px = Math.round((sx + (tx + 0.5) * z) * dpr);
        const py = Math.round((sy + (ty + 0.5) * z) * dpr);
        const d = c2.getImageData(Math.min(px, cv.width - 1), Math.min(py, cv.height - 1), 1, 1).data;
        row.push([d[0], d[1], d[2]]);
      }
      grid.push(row);
    }
    const st = g.world.store;
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) {
      const crow = [];
      for (let dx = -1; dx <= 1; dx++) {
        const i = st.idx(mx + dx, my + dy);
        crow.push({ t: st.type[i], s: st.slope[i], h: !!st.half[i], lq: st.liquid[i] });
      }
      cells.push(crow);
    }
    return { grid, cells, zoom: z, dpr };
  }, m.x, m.y);
  // 分类:W=水蓝 B=亮(>140 亮度且非蓝) g=绿 m=棕 . =暗
  const cls = (c) => {
    const [R, G, B] = c;
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    if (B > R + 20 && B > G + 10) return 'W';          // 水系
    if (lum > 150) return 'B';                          // 亮(天光/漏光)
    if (G > R && G > B) return 'g';                     // 草
    if (R > G && R > B) return 'm';                     // 泥/沙/雪暖色
    return '.';
  };
  console.log(`\n#${no} ${m.typeKey} @(${m.x},${m.y}) zoom=${dump.zoom} dpr=${dump.dpr}`);
  for (let dy = -1; dy <= 1; dy++) {
    console.log(`  cell(${dy}) ` + dump.cells[dy + 1].map((c) => `t${c.t}s${c.s}${c.h ? 'H' : ''}l${c.lq}`).join(' '));
  }
  for (let ty = 0; ty < 48; ty++) {
    if (ty % 16 === 0) console.log('  ' + '-'.repeat(48));
    let line = '';
    for (let tx = 0; tx < 48; tx++) line += cls(dump.grid[ty][tx]);
    console.log('  ' + line);
  }
}
await browser.close();
