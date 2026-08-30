// 标注区终审取证:
// ⚠️holes 统计直调 vanillaFrameFor(生产路由之外的纯链值),且 OLD 版本曾用 +1 错位取样虚增孔数(+0 已修)。真路由判定看 _vf-composite3/真机截图。
// A. 每个标注格生产帧的官方源矩形 alpha 缺口统计(透明像素数+朝向分布)
//    ——证明"缝隙"像素来自官方 Tiles_N 过渡帧本身,非绘制错位
// B. 同机位截图 vf=1 / vf=0(vf=0 走 TEdit 近似,作"用户认可的旧观感"参照)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = '/Users/vinlic/Downloads/map-FTW_V2 (6).json';
const MARKS = JSON.parse(fs.readFileSync('/Users/vinlic/Downloads/marks-FTW_V2 (6).json', 'utf8')).marks;
const MODE = process.env.VFP_MODE ?? '1';   // 1|0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1100, height: 760 } });
const p = await b.newPage();
if (MODE === '0') await p.evaluateOnNewDocument(() => { try { localStorage.setItem('sw_vanilla_framing', '0'); } catch {} });
await p.goto(`${ORIGIN}/?nosw&vf=${MODE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(3000);
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .btn, [class*=button]')].find((el) => (el.textContent ?? '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(800);
// 机位:簇1/簇2 边界中心
await p.evaluate(() => { const g = window.__swGame; g.player.x = 3963 * 16; g.player.y = 473 * 16; g.player.vx = 0; g.player.vy = 0; });
await sleep(6000);
await p.screenshot({ path: `/Users/vinlic/.claude/jobs/4a66e745/tmp/marks-vf${MODE}.png` });

if (MODE === '1') {
  const stats = await p.evaluate(async (marks) => {
    const vf = await import('/src/render/VanillaFraming.ts');
    const td = await import('/src/data/tiles.ts');
    const g = window.__swGame;
    const st = g.world.store;
    const rock = g.world.rockLevel ?? 0;
    // 经渲染器拿 atlas(SW 全局):renderer.atlas
    const atlas = g.renderer?.atlas;
    if (!atlas) return { error: 'no-atlas' };
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    const cctx = cv.getContext('2d', { willReadFrequently: true });
    const res = [];
    for (const m of marks) {
      const { x, y } = m;
      const t = st.flags[st.idx(x, y)] ? st.type[st.idx(x, y)] : -1;
      if (t < 0) continue;
      const def = td.TILE_DEFS[t];
      const sheet = def?.vanilla?.sheet ?? null;
      if (sheet == null) continue;
      const meta = atlas.vmeta(sheet);
      if (!meta) continue;
      const v = vf.vanillaFrameFor(st, x, y, st, ((x * 7) + (y * 11)) % 3, rock);
      const img = atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
      if (!img || !meta) continue;
      cctx.clearRect(0, 0, 32, 32);
      cctx.drawImage(img, Math.floor(v.fx / 18) * 18, Math.floor(v.fy / 18) * 18, 18, 18, 0, 0, 18, 18);
      const d = cctx.getImageData(1, 1, 16, 16).data; // 内容区 16×16
      let holes = 0; const dirs = { n: 0, s: 0, w: 0, e: 0 };
      for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
        if (d[(py * 16 + px) * 4 + 3] === 0) {
          holes++;
          if (py <= 3) dirs.n++; else if (py >= 12) dirs.s++;
          else if (px <= 3) dirs.w++; else if (px >= 12) dirs.e++;
        }
      }
      res.push({ x, y, k: m.typeKey, f: [v.fx, v.fy], holes, dirs });
    }
    return { count: res.length, holey: res.filter((r) => r.holes > 0), total: res.reduce((s2, r) => s2 + r.holes, 0) };
  }, MARKS);
  fs.writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/marks-notches.json', JSON.stringify(stats, null, 1));
  console.log(JSON.stringify({ mode: MODE, shot: true, cells: stats.count, holeyCells: (stats.holey ?? []).length, totalHolePx: stats.total }));
} else {
  console.log(JSON.stringify({ mode: MODE, shot: true }));
}
await b.close();
