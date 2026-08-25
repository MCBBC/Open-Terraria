// 行走怪弹射/贴顶 症状·自然刷怪遥测（第二探针）：
//   假设链 = 刷怪点校验过松 → 僵尸嵌进地形出生 → TileCollision.unembedPass 逐 tick
//   棘轮（上抬 ≤48px/tick / 平移 ≤32px/tick）→ 观感=「从屏幕外弹射抛入」+「落在
//   地形顶上行走像飞」。
//   方法：整游戏 fixedUpdate 泵（驱动自然刷怪器），逐 tick 记录每只新怪：
//   出生时中心格实心性/嵌入深度 → 后续 120 tick 的 ≥12px 瞬移序列。
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_walker-float-probe2.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5231', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = true;
  // 玩家放报障区，夜晚（僵尸主刷窗口）
  g.player.x = 30720; g.player.y = 3900; g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.0;
  window.__tel2 = { seen: new Set(), spawns: [], ticks: 0 };
});
const CHUNKS = 8, PER = 450;   // 3600 tick = 60s 游戏时
for (let c = 0; c < CHUNKS; c++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const tel = window.__tel2;
    const st = g.world.store;
    const TRACK = new Map();   // id -> {n, lastX, lastY, embedded, launches}
    const onTick = () => {
      tel.ticks++;
      for (const e of g.entities.enemies) {
        if (e.dead) continue;
        if (!tel.seen.has(e.id)) {
          tel.seen.add(e.id);
          const cx = Math.floor((e.x + e.w / 2) / 16), cy = Math.floor((e.y + e.h / 2) / 16);
          const ci = st.inBounds(cx, cy) ? st.idx(cx, cy) : -1;
          const centerSolid = ci >= 0 && !!st.flags[ci] && st.isSolid(cx, cy) && st.slope[ci] === 0 && !st.half[ci] && !st.isPlatform(cx, cy);
          // 嵌入深度：中心列向上数到首个非实心
          let depth = 0;
          if (centerSolid) {
            for (let k = 1; k <= 6; k++) {
              const ty = cy - k;
              if (!st.inBounds(cx, ty) || st.isSolid(cx, ty)) break;
              depth = k;
            }
          }
          TRACK.set(e.id, { n: 0, lastX: e.x, lastY: e.y, embedded: centerSolid, depth, launches: 0, walker: e.vanillaId === 3 });
          tel.spawns.push({ id: e.id, vid: e.vanillaId, at: [Math.round(e.x), Math.round(e.y)], centerSolid, depth, t: tel.ticks });
        }
        const tr = TRACK.get(e.id);
        if (!tr || tr.n > 120) return;
        tr.n++;
        const d = Math.hypot(e.x - tr.lastX, e.y - tr.lastY);
        if (d >= 12) {
          tr.launches++;
          if (tr.launches <= 3) {
            tel.spawns.push({ id: e.id, vid: e.vanillaId, launchAt: tr.n, from: [Math.round(tr.lastX), Math.round(tr.lastY)], to: [Math.round(e.x), Math.round(e.y)], t: tel.ticks });
          }
        }
        tr.lastX = e.x; tr.lastY = e.y;
      }
    };
    for (let t = 0; t < 450; t++) { g.fixedUpdate(1 / 60); onTick(); }
  });
}

const out = await page.evaluate(() => {
  const tel = window.__tel2;
  const spawns = tel.spawns.filter((s) => s.at);
  const embedded = spawns.filter((s) => s.centerSolid);
  const launches = tel.spawns.filter((s) => s.launchAt);
  return {
    ticks: tel.ticks, spawnCount: spawns.length,
    embeddedCount: embedded.length,
    embeddedWalkers: embedded.filter((s) => s.vid === 3).length,
    launchEvents: launches.length,
    launchWalkers: launches.filter((s) => s.vid === 3).length,
    embeddedSample: embedded.slice(0, 8),
    launchSample: launches.slice(0, 10),
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
