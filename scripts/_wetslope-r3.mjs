// 第二轮:17 残留标注格全量上下文(slope/half/liquid 八邻)+ 16x20 逐像素 RGB
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (4).json', 'utf8');
const marksJson = JSON.parse(readFileSync('/Users/vinlic/Downloads/marks-浮夸的羡慕顶峰 (3).json', 'utf8'));
const OUT = '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope-profile7',
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

const ctx = await page.evaluate(async (marks) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const key = (t) => TILE_DEFS[t]?.key ?? `#${t}`;
  return marks.marks.map((m) => {
    const cell = (x, y) => {
      if (!st.inBounds(x, y)) return null;
      const i = st.idx(x, y);
      const d = TILE_DEFS[st.type[i]];
      return `${key(st.type[i]).slice(0, 22)}/s${st.slope[i]}${st.half[i] ? 'H' : ''}` +
        `/lq${st.liquid[i]}${d?.solid ? '' : '/NS'}`;
    };
    const n8 = {};
    for (const [dn, dx, dy] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0],
      ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]]) n8[dn] = cell(m.x + dx, m.y + dy);
    return { no: m.no, x: m.x, y: m.y, tk: m.typeKey, self: cell(m.x, m.y), n8 };
  });
}, marksJson);
for (const m of ctx) {
  const f = (c) => c ?? '∅';
  console.log(`#${m.no} (${m.x},${m.y}) ${m.tk} self=${f(m.self)}`);
  console.log(`   n=${f(m.n8.n)}  s=${f(m.n8.s)}  w=${f(m.n8.w)}  e=${f(m.n8.e)}`);
  console.log(`   nw=${f(m.n8.nw)}  ne=${f(m.n8.ne)}  sw=${f(m.n8.sw)}  se=${f(m.n8.se)}`);
}

// 逐像素 RGB(前 10 格)
for (const m of ctx.slice(0, 10)) {
  await page.evaluate((mx, my) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = mx * 16 + 8; g.player.y = (my + 4) * 16 + 8;
    g.camera.setZoomTarget(2); g.camera.zoom = 2;
    g.camera.follow = function () {};
    g.camera.x = mx * 16 + 8; g.camera.y = my * 16 + 8;
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
    if (g.renderer) g.renderer.fullbright = true;
  }, m.x, m.y);
  await new Promise((r) => setTimeout(r, 2200));
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
      for (let tx = 0; tx < 16; tx++) {
        const px = Math.round((sx + (tx + 0.5) * z) * dpr);
        const py = Math.round((sy + (ty + 0.5) * z) * dpr);
        const d = c2.getImageData(Math.min(px, cv.width - 1), Math.min(py, cv.height - 1), 1, 1).data;
        row.push([d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      }
      rows.push(row);
    }
    const st = g.world.store;
    const i = st.idx(mx, my);
    return { rows, slope: st.slope[i], half: !!st.half[i] };
  }, m.x, m.y);
  console.log(`\n#${m.no} RGB slope=${dump.slope}${dump.half ? 'H' : ''}`);
  dump.rows.forEach((r, y) => console.log(` y${String(y).padStart(2, '0')} ` + r.join(' ')));
  await page.screenshot({ path: `${OUT}/r2-${m.no}.png`, clip: { x: 1280 / 2 - 80, y: 800 / 2 - 80, width: 160, height: 160 } });
}
await browser.close();
