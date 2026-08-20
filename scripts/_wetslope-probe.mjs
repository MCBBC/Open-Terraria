// 湿坡浸润探针:加载用户世界"浮夸的羡慕顶峰",对 136 标注格逐格导出
// slope/half/liquid/liquidType/wall + 八邻同字段,并按 (type,slope,水位邻) 组合
// 抽样截图 4×,定位"3-5px 透明像素"洞的精确位置。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const MARKS = '/Users/vinlic/Downloads/marks-浮夸的羡慕顶峰 (1).json';
const MAP = '/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (2).json';
const OUT = '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const marksJson = JSON.parse(readFileSync(MARKS, 'utf8'));
const mapStr = readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wetslope-profile',
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

const data = await page.evaluate(async (marks) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const key = (t) => TILE_DEFS[t]?.key ?? `#${t}`;
  const cell = (x, y) => {
    if (!st.inBounds(x, y)) return null;
    const i = st.idx(x, y);
    const d = TILE_DEFS[st.type[i]];
    return {
      k: key(st.type[i]), sheet: d?.vanilla?.sheet ?? -1, solid: !!d?.solid,
      act: !!st.flags[i], slope: st.slope[i], half: !!st.half[i],
      lq: st.liquid[i], lt: st.liquidType[i] || 0, wall: st.wall[i],
    };
  };
  const out = marks.marks.map((m) => {
    const n8 = {};
    for (const [dn, dx, dy] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0],
      ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]]) n8[dn] = cell(m.x + dx, m.y + dy);
    return { no: m.no, x: m.x, y: m.y, tk: m.typeKey, self: cell(m.x, m.y), n8 };
  });
  return { out, worldSurface: g.world.surface ?? -1, groundLevel: g.world.groundLevel ?? -1 };
}, marksJson);

// 统计:slope 分布 / 邻水分布
const stats = { slope: {}, half: {}, adjWater: {}, slopeAdjWater: {} };
for (const m of data.out) {
  const s = m.self.slope, h = m.self.half;
  stats.slope[s] = (stats.slope[s] ?? 0) + 1;
  stats.half[h ? 1 : 0] = (stats.half[h ? 1 : 0] ?? 0) + 1;
  const dirs = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
  const wet = dirs.filter((d) => (m.n8[d]?.lq ?? 0) > 0 || (m.n8[d]?.k === m.self.k && m.n8[d]?.act));
  const wdirs = dirs.filter((d) => (m.n8[d]?.lq ?? 0) > 0);
  const sig = `${s}h${h ? 1 : 0}|${wdirs.join('')}`;
  stats.adjWater[sig] = (stats.adjWater[sig] ?? 0) + 1;
  stats.slopeAdjWater[m.tk] = stats.slopeAdjWater[m.tk] ?? { n: 0, slopeN: 0, wetN: 0 };
  stats.slopeAdjWater[m.tk].n++;
  if (s !== 0 || h) stats.slopeAdjWater[m.tk].slopeN++;
  if (wdirs.length) stats.slopeAdjWater[m.tk].wetN++;
}
console.log('[surface]', data.worldSurface, '[groundLevel]', data.groundLevel);
console.log('[stats.slope]', JSON.stringify(stats.slope));
console.log('[stats.half]', JSON.stringify(stats.half));
console.log('[stats.type]', JSON.stringify(stats.slopeAdjWater));
console.log('[stats.slope|wetDirs]');
for (const [k, v] of Object.entries(stats.adjWater).sort((a, b) => b[1] - a[1])) console.log('  ', k.padEnd(24), v);

// 逐格明细(前 20 + 所有 slope!=0 且邻水的)
const wetSlope = data.out.filter((m) => (m.self.slope !== 0 || m.self.half)
  && ['n', 's', 'w', 'e'].some((d) => (m.n8[d]?.lq ?? 0) > 0));
console.log(`[wetSlope n=${wetSlope.length}]`);
for (const m of wetSlope.slice(0, 24)) {
  const f = (c) => c ? `${c.k.slice(0, 22)}/s${c.slope}${c.half ? 'H' : ''}/lq${c.lq}` : '∅';
  console.log(`#${m.no} (${m.x},${m.y}) ${m.tk} self=s${m.self.slope}${m.self.half ? 'H' : ''}lq${m.self.lq} ` +
    `n=${f(m.n8.n)} s=${f(m.n8.s)} w=${f(m.n8.w)} e=${f(m.n8.e)}`);
}

// 截图:按类型抽代表格(每种 typeKey 取第一个 wet 或第一个)
const byType = {};
for (const m of data.out) {
  if (!byType[m.tk]) byType[m.tk] = m;
  const isWet = ['n', 's', 'w', 'e'].some((d) => (m.n8[d]?.lq ?? 0) > 0);
  if (isWet && !byType[`wet:${m.tk}`]) byType[`wet:${m.tk}`] = m;
}
const shots = [];
for (const [tag, m] of Object.entries(byType)) {
  await page.evaluate((mx, my) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = mx * 16 + 8; g.player.y = my * 16 + 8;
    g.camera.setZoomTarget(2.5);
    g.camera.x = mx * 16 + 8; g.camera.y = my * 16 + 8;
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
  }, m.x, m.y);
  await new Promise((r) => setTimeout(r, 2600));
  const path = `${OUT}/m${String(m.no).padStart(3, '0')}-${tag.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path, clip: { x: 1280 / 2 - 150, y: 800 / 2 - 150, width: 300, height: 300 } });
  shots.push({ no: m.no, tag, x: m.x, y: m.y, self: `${m.self.slope}${m.self.half ? 'H' : ''}`, path });
}
console.log('[shots]', JSON.stringify(shots, null, 1));

// 全量明细落盘
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/marks-full.json`, JSON.stringify(data.out, null, 1));
await browser.close();
