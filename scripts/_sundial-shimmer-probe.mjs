// 一次性：附魔日晷 3064 入微光 → 附魔月晷 5381 实机探针。
// 手工造微光池（store.setLiquid type 4）+ spawnDrop 3064 落池 + 手动 tick fixedUpdate，
// 对照参考 drop（3064/5381 内部 id）验证转化。
// 用法: SW_ORIGIN=http://localhost:5251 node tools/run-diag.mjs scripts/_sundial-shimmer-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1200, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const key = (vid) => items.VANILLA_ITEM_KEY_BY_ID[vid];
  const res = { keys: { sundial: key(3064), moondial: key(5381) } };
  if (!key(3064) || !key(5381)) return { fail: 'key unresolved', res };
  // ---- 手工微光池：远离玩家（x=1500..1520, 地表上方空旷区 y 用 groundLevel-30 一带）----
  const Y = Math.max(20, Math.floor(g.world.groundLevel) - 30);
  const X0 = 1500, X1 = 1520;
  const st = g.world.store;
  for (let x = X0 - 1; x <= X1 + 1; x++) {
    st.setTile(x, Y + 7, 1);                       // 池底
    for (let y = Y; y < Y + 7; y++) st.setLiquid(x, y, 255, 4);   // 微光满格
    for (let y = Y - 3; y < Y; y++) st.setTile(x, y, 0);          // 上方清空
  }
  // ---- 参考 drop：拿内部 id ----
  const ref1 = g.spawnDrop((X0 - 30) * 16, (Y - 2) * 16, key(3064), 1, 0, 0);
  const ref2 = g.spawnDrop((X0 - 30) * 16, (Y - 2) * 16, key(5381), 1, 0, 0);
  res.refSundialIid = ref1 ? ref1.itemId : null;
  res.refMoondialIid = ref2 ? ref2.itemId : null;
  if (ref1) ref1.dead = true;
  if (ref2) ref2.dead = true;
  // ---- 被试 drop：3064 落池中 ----
  const d = g.spawnDrop((X0 + 10) * 16, (Y + 3) * 16, key(3064), 1, 0, 0);
  if (!d) return { fail: 'sundial drop null' };
  res.dropIid0 = d.itemId;
  // 手动 tick 300 拍（进度 0.01/t → ~90 拍触发）
  const trace = [];
  for (let i = 0; i < 300; i++) {
    g.fixedUpdate(1 / 60);
    if (i === 30 || i === 60 || i === 89 || i === 95) trace.push({ i, iid: d.itemId, shim: d.shimmered, t: +d.shimmerTime.toFixed(2), wet: d.shimmerWet });
    if (d.dead) { trace.push({ i, dead: true }); break; }
    if (i > 95 && d.shimmered) break;
  }
  res.trace = trace;
  res.final = { iid: d.itemId, shimmered: d.shimmered, dead: d.dead, shimmerTime: d.shimmerTime };
  res.transformed = res.refMoondialIid != null && d.itemId === res.refMoondialIid;
  // ---- 冰雪刃 724 → 冰霜回旋镖 670（1457 重锚补表实机复检）----
  const ref670 = g.spawnDrop((X0 - 30) * 16, (Y - 2) * 16, key(670), 1, 0, 0);
  res.ref670Iid = ref670 ? ref670.itemId : null;
  if (ref670) ref670.dead = true;
  const d724 = g.spawnDrop((X0 + 12) * 16, (Y + 3) * 16, key(724), 1, 0, 0);
  if (d724) {
    for (let i = 0; i < 200; i++) { g.fixedUpdate(1 / 60); if (d724.shimmered || d724.dead) break; }
    res.ice724 = { iid: d724.itemId, shimmered: d724.shimmered, ok: res.ref670Iid != null && d724.itemId === res.ref670Iid };
  }
  // 对照：池内液体实况（采样池心一格）
  const ci = st.idx(X0 + 10, Y + 3);
  res.poolCell = { liquid: st.liquid[ci], type: st.liquidType[ci] };
  // ---- 真实玩家抛掷路径复核：入背包 → spawnDrop 由 UI 抛掷面走（这里只验背包授给）----
  const iid = items.ITEM_BY_KEY[key(3064)];
  const inv = g.player.inv;
  res.invAddOk = inv.add(iid, 1) === 0;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
