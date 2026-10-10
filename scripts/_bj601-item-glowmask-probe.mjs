// ★BJ601 实机探针——掉落物光罩链路（collectDropItemGlow → itemGlowQueue →
// flushItemGlow）+ 手持收集直调。运行：私有 vite（SW_PORT=520x SW_NO_HMR=1）后
// SW_ORIGIN=http://localhost:520x node tools/run-diag.mjs scripts/_bj601-item-glowmask-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  if (!r || !r.collectDropItemGlow || !r.flushItemGlow) return { fail: 'renderer-missing' };
  const defs = await import('/src/data/items.ts');
  // vid 3253 LavaLamp（glow 129）/ vid 8 dirt（无 glow,对照）
  const findByVid = (vid) => Object.values(defs.ITEM_DEFS).find((d) => d && d.vid === vid);
  const lava = findByVid(3253);
  const dirt = findByVid(1);
  if (!lava || !dirt) return { fail: 'defs', lava: !!lava, dirt: !!dirt };

  // 收集/冲刷计数（实例覆写,不改原型）
  let dropCollect = 0, flush = 0, lastDropVid = -1;
  const origCollect = r.collectDropItemGlow.bind(r);
  r.collectDropItemGlow = (ctx, vid, ...rest) => { dropCollect++; lastDropVid = vid; return origCollect(ctx, vid, ...rest); };
  const origFlush = r.flushItemGlow.bind(r);
  r.flushItemGlow = () => { flush++; return origFlush(); };

  // 掉落物落在玩家脚边（屏幕内）
  const px = g.player.cx, py = g.player.cy + 24;
  g.spawnDrop(px - 20, py, lava.key, 1);
  g.spawnDrop(px + 20, py, dirt.key, 1);
  await new Promise((res) => setTimeout(res, 700));

  // 队列直检：冲刷后应清空；手动直调手持收集（vid 2772 VortexAxe=white 档,无光照依赖）
  const qAfterFlush = r.itemGlowQueue.length;
  const fakeP = { cx: px, cy: py, y: py - 21, h: 42, miscCounter: 5 };
  const qBefore = r.itemGlowQueue.length;
  r.collectHeldItemGlow(r.ctx, fakeP, 2772, 10, 10, 36, 40, null);
  const qAfterHeld = r.itemGlowQueue.length;
  const heldOp = qAfterHeld > qBefore ? r.itemGlowQueue[qAfterHeld - 1] : null;
  const heldShape = heldOp ? {
    tex: heldOp.ops[0].tex, blend: heldOp.ops[0].blend, alpha: heldOp.ops[0].alpha,
    tint: heldOp.ops[0].tint, sw: heldOp.ops[0].sw, sh: heldOp.ops[0].sh, k: heldOp.k,
  } : null;
  // 手动冲刷（真画布上执行一遍 = 主路径同款）——无异常即结构面绿
  let flushThrow = null;
  try { r.flushItemGlow(); } catch (e) { flushThrow = String(e).slice(0, 200); }
  const qFinal = r.itemGlowQueue.length;
  return { dropCollect, flush, lastDropVid, qAfterFlush, qAfterHeld, heldShape, flushThrow, qFinal,
    glowQueueInit: Array.isArray(r.itemGlowQueue) };
});
await new Promise((r) => setTimeout(r, 400));
console.log(JSON.stringify({ out, errs }, null, 1));
await browser.close();
