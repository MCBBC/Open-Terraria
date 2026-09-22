// ★BJ259 探针：住房踢出链实证（用户实报「不能把 NPC 踢出房间」）。
// 流程：__swFlow.newWorld → 天空标准房（tests/town-npc-movein buildHouse 配方）→
// 商人入住（home 直置）→ ①UI 关右键旗=不踢（BJ125 负控）→ ②UI 开右键旗=踢出
// （homeless+lookForHomeTimeout=3600+kickedOut）→ ③旗矩形命中/未命中对照。
// 跑法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj259-housing-kick.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  protocolTimeout: 420000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
page.on('dialog', async (d) => { console.log('[ALERT]', d.message().slice(0, 300)); await d.dismiss().catch(() => {}); });

const t0 = Date.now();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
console.log('[probe] menu ok', Date.now() - t0, 'ms');

// —— 标准尺寸新世界（4200×1200）——
await page.evaluate(() => window.__swFlow.newWorld('bj259', 4200, 1200));
try {
  await page.waitForFunction('!!window.__swGame?.world', { timeout: 300000, polling: 500 });
} catch {
  throw new Error('world not ready in 300s');
}
console.log('[probe] world ready', Date.now() - t0, 'ms');
await new Promise((r) => setTimeout(r, 3000));   // 首帧/出生链稳定

const built = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const st = g.world.store;
  const T = TILE_BY_KEY;
  // 玩家邻位标准房：ox..ox+10 × oy..oy+5（室内 9×4 ≥60 格），自含盒不依赖地形
  //（★须落在玩家屏内——相机跟玩家,天空盒会出屏=右键落空）
  const ox = Math.max(20, Math.floor(g.player.x / 16) + 6);
  const oy = Math.max(20, Math.floor(g.player.y / 16) - 9);
  const box = (x, y, t, fx = 0, fy = 0) => st.setTileSilent(x, y, t, fx, fy);
  for (let x = ox; x <= ox + 10; x++) { box(x, oy, T.wood); box(x, oy + 5, T.wood); }
  for (let y = oy + 1; y <= oy + 4; y++) { box(ox, y, T.wood); box(ox + 10, y, T.wood); }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) {
    st.wall[st.idx(x, y)] = 4;                       // 木墙（墙 = house 域）
    if (st.type[st.idx(x, y)] !== 0 || st.type[st.idx(x, y)] === T.wood) st.setTileSilent(x, y, 0, 0, 0);
  }
  for (const dx of [ox, ox + 10]) for (let y = oy + 2; y <= oy + 4; y++) box(dx, y, 17, 0, (y - oy - 2) * 18);   // 闭合门 17
  box(ox + 1, oy + 1, T.torch, 22, 0); box(ox + 9, oy + 1, T.torch, 44, 0); box(ox + 6, oy + 2, T.torch, 0, 0);
  box(ox + 4, oy + 3, T.chair); box(ox + 4, oy + 4, T.chair, 0, 18);
  for (let dx = 0; dx <= 2; dx++) { box(ox + 5 + dx, oy + 3, T.table, dx * 18, 0); box(ox + 5 + dx, oy + 4, T.table, dx * 18, 18); }
  // 商人入住：站室内 + home=站立格（ore layout 同 ①''/assign 口径）
  const n = new TownNPC('merchant', (ox + 5) * 16, (oy + 4) * 16);
  n.home = { x: ox + 5, y: oy + 4 };
  n.leashHome = true;
  g.entities.add(n, 'npcs');
  const banner = { bx: (ox + 5) * 16 + 8, by: (oy + 1) * 16 + 18 };   // 天花板行=oy（vanilla num3 上行找实心）
  window.__bj259 = { ox, oy, npc: n, banner };
  return { ox, oy, home: n.home, vanillaId: n.vanillaId, banner, npcs: g.entities.npcs.length };
});
console.log('[probe] built', JSON.stringify(built));

// 命中对照：旗中心应命中;旗外应 null
const hit = await page.evaluate(() => {
  const g = window.__swGame;
  const { banner } = window.__bj259;
  const ok = g.renderer.houseBannerNpcAt(banner.bx, banner.by, g.entities.npcs, g.world);
  const miss = g.renderer.houseBannerNpcAt(banner.bx + 400, banner.by + 400, g.entities.npcs, g.world);
  return { hitKey: ok ? ok.npcKey : null, missNull: miss === null };
});
console.log('[probe] banner hit-test', JSON.stringify(hit));
if (!hit.hitKey || !hit.missNull) { console.log('[probe] FAIL banner geometry'); await browser.close(); process.exit(1); }

// 屏幕坐标（世界→屏幕）
const sPos = await page.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(window.__bj259.banner.bx, window.__bj259.banner.by);
  return { sx, sy };
});
console.log('[probe] banner screen px', JSON.stringify(sPos));
await page.mouse.move(sPos.sx, sPos.sy);
await new Promise((r) => setTimeout(r, 200));

// ① 负控（BJ125 面）：住房 UI 关 → 右键旗 = 无踢出（走世界右键族,不碰住房态）
const beforeNeg = await page.evaluate(() => {
  const n = window.__bj259.npc;
  return { home: !!n.home, timeout: n.lookForHomeTimeout };
});
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 400));
const afterNeg = await page.evaluate(() => {
  const n = window.__bj259.npc;
  return { home: !!n.home, timeout: n.lookForHomeTimeout, uiActive: window.__swUI?.housingUiActive ?? null };
});
console.log('[probe] NEG(ui closed) before', JSON.stringify(beforeNeg), 'after', JSON.stringify(afterNeg));
const negOk = afterNeg.home === true && afterNeg.timeout === 0 && afterNeg.uiActive === false;

// ② 正控：UI 开（setHousingOpen 挂真态）→ 右键旗 = 踢出
await page.evaluate(() => window.__swUI.setHousingOpen(true));
await new Promise((r) => setTimeout(r, 300));
await page.mouse.move(sPos.sx, sPos.sy);
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 600));
const kicked = await page.evaluate(() => {
  const n = window.__bj259.npc;
  return { home: n.home, timeout: n.lookForHomeTimeout, kickedOut: n.kickedOut, leashHome: n.leashHome };
});
console.log('[probe] KICK(ui open) →', JSON.stringify(kicked));
// timeout=3600 起步、断言前已递减若干 tick（600ms 睡眠≈36+ tick）——区间断言，
// 同时实证递减面（NPC.cs:91434）在跑
const kickOk = kicked.home === null && kicked.kickedOut === true && kicked.leashHome === false
  && kicked.timeout > 3400 && kicked.timeout <= 3600;

// 证据截图（踢出后：旗消失 + 无家者游走）
await page.screenshot({ path: '/tmp/bj259-after-kick.png' });

console.log('[probe] VERDICT negOk=' + negOk + ' kickOk=' + kickOk + ' pageerrs=' + errs.length);
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(negOk && kickOk && errs.length === 0 ? 0 : 1);
