// 一次性探针:生命果（236）生长链真机端到端——
//  ① constructor 后置条件:真 Game+真演化域,脚本化蔓延流直呼 grassGrowth →
//     2×2 落地+帧语义（36*styleX/{+18}×0/{+18},底承双列丛林草）
//  ② 时间加速采样:真 flags(hardMode+双机械) × 真地形(地下丛林地板) ×
//     8000 次真实 update() → 区域内出现 ≥1 株生命果
//  ③ 2×2 条件门:关 hardMode → 同地形 3000 tick 零生命果
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const SID = new Map();
  for (let id = 0; id < tiles.TILE_DEFS.length; id++) {
    const sh = tiles.TILE_DEFS[id]?.vanilla?.sheet;
    if (sh != null && !SID.has(sh)) SID.set(sh, id);
  }
  const S = (sh) => SID.get(sh) ?? 0;
  const sheetOf = (id) => tiles.TILE_DEFS[id]?.vanilla?.sheet ?? -1;
  const countIn = (x0, x1, y0, y1, sheet) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (st.flags[st.idx(x, y)] && sheetOf(st.type[st.idx(x, y)]) === sheet) n++;
    return n;
  };

  // 真机械/困难 flags（用户实报场景=双机械）
  g.world.flags.hardMode = true;
  g.world.flags['downed_134'] = true;
  g.world.flags['downed_125'] = true;

  // 地下丛林地板地形：groundLevel+120 起 5 层,层距 6（草行+下承泥 2 行+空气 3 行）
  const px = Math.floor(g.player.cx / 16);
  const baseY = Math.floor(g.world.groundLevel) + 120;
  const floors = [];
  for (let f = 0; f < 5; f++) {
    const y = baseY + f * 6;
    floors.push(y);
    for (let x = px - 250; x <= px + 250; x++) {
      st.setTile(x, y, S(60));
      st.setTile(x, y + 1, S(59));
      st.setTile(x, y + 2, S(59));
      st.setTile(x, y - 1, 0);
      st.setTile(x, y - 2, 0);
      for (let dy = 1; dy <= 2; dy++) { st.liquid[st.idx(x, y - dy)] = 0; }   // 洞窟积水清位（case60 liquid 门）
    }
  }
  const region = { x0: px - 252, x1: px + 252, y0: baseY - 3, y1: baseY + 5 * 6 + 2 };

  // ① constructor 后置条件:脚本化蔓延流 [顶植物败,1/25 过,1/40 过,style=0]
  const evo = g.evolution;
  evo.update();   // 刷新演化域 hardMode 缓存字段（update() 头每 tick 重读 flags）
  const gy = floors[2];
  const rng = evo.spreadRng;
  const origNext = rng.next.bind(rng);
  const q = [0.99, 0.0, 0.0, 0.0];
  let qi = 0;
  rng.next = () => (qi < q.length ? q[qi++] : 0.99);
  evo.grassGrowth(px, gy, px - 1, px + 2, gy - 1, gy + 2, true);
  rng.next = origNext;
  const dump = [[px - 1, gy - 2], [px, gy - 2], [px - 1, gy - 1], [px, gy - 1]]
    .map(([x, y]) => [x, y, st.flags[st.idx(x, y)], st.type[st.idx(x, y)], sheetOf(st.type[st.idx(x, y)])]);
  const post = {
    dump,
    tiles236: countIn(px - 2, px + 2, gy - 3, gy - 1, 236),
    frames: [[px - 1, gy - 2], [px, gy - 2], [px - 1, gy - 1], [px, gy - 1]].map(([x, y]) => [st.frameX[st.idx(x, y)], st.frameY[st.idx(x, y)]]),
    grassKept: sheetOf(st.type[st.idx(px, gy)]) === 60,
  };
  // 清理定谳果,进入统计段
  for (const [x, y] of [[px - 1, gy - 2], [px, gy - 2], [px - 1, gy - 1], [px, gy - 1]]) st.setTile(x, y, 0);

  // ② 时间加速:12000 次真实 update()
  for (let t = 0; t < 12000; t++) evo.update();
  const accelFruit = countIn(region.x0, region.x1, region.y0, region.y1, 236);

  // ③ 负例:关 hardMode → 清果 → 3000 tick 零生长
  g.world.flags.hardMode = false;
  for (let y = region.y0; y <= region.y1; y++) for (let x = region.x0; x <= region.x1; x++) {
    const i = st.idx(x, y);
    if (st.flags[i] && sheetOf(st.type[i]) === 236) st.setTile(x, y, 0);
  }
  for (let t = 0; t < 6000; t++) evo.update();
  const negFruit = countIn(region.x0, region.x1, region.y0, region.y1, 236);
  g.world.flags.hardMode = true;

  return { post, accelFruit, negFruit, floors: floors.length };
});
console.log('[lifefruit-probe]', JSON.stringify(out));
const ok = out.post.tiles236 === 4
  && JSON.stringify(out.post.frames) === JSON.stringify([[0, 0], [18, 0], [0, 18], [18, 18]])
  && out.post.grassKept && out.accelFruit >= 4 && out.negFruit === 0;
console.log(ok ? 'PROBE PASS' : 'PROBE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
