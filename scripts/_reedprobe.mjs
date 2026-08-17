// 芦苇呼吸管水下渲染探针（2026-08-17 用户报障：水下不显示）：
//  天然海洋水列 → 玩家沉入水中 → 定帧捕获 drawImage 的 atlas 子矩形调用，
//  与 renderer.atlasIcon(held.id) 的期望矩形【精确比对】（像素差分被水波/光照
//  帧抖淹没；近身坐标过滤又会被 translate 上下文局部原点骗过——精确矩形匹配
//  是唯一可靠信号）。
// 断言：
//   ① 水下芦苇管 186 渲染（atlas 矩形命中）
//   ② 水下火把 8 noWet 隐（零命中——熄灭语义保持）
//   ③ 珊瑚火把 4384（DefaultToTorch(17,allowWaterPlacement) → noWet=false）
//     水下照常显示（原版水火把行为）
//   ④ 火把出水恢复显示（wet 门非永久隐）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').catch(() => {}));
await sleep(1000);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// 天然水场（自挖坑会被液体沉降排干——世界边缘海洋垂直扫首个 ≥6 格深水列）
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  let col = -1, surfY = -1;
  for (let x = 20; x < 120 && col < 0; x++) {
    for (let y = 40; y < st.h - 60; y++) {
      if (st.liquid[st.idx(x, y)] > 200 && st.liquidType[st.idx(x, y)] === 1) {
        let depth = 0;
        while (st.liquid[st.idx(x, y + depth)] > 200) depth++;
        if (depth >= 6) { col = x; surfY = y + 2; break; }
      }
    }
  }
  if (col >= 0) {
    g.player.x = col * 16 + 2; g.player.y = surfY * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  }
});
await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60); });

// 持物 → 定帧捕获（itemIcons 懒建须 cb.onInventoryChanged 触发）
const cap = (key) => page.evaluate(async (k) => {
  const g = window.__swGame;
  const m = await import('/src/data/items.ts');
  g.player.inv.slots[0] = k ? m.mkStack(k, 1) : null;
  g.player.inv.selected = 0;
  g.cb.onInventoryChanged();
  await new Promise((r) => setTimeout(r, 500));
  const held = g.player.inv.heldItem();
  let expect = null, mode = null;
  if (held) {
    const ar = g.renderer.atlasIcon(held.id);
    if (ar) { expect = [ar.sx, ar.sy, ar.sw, ar.sh]; mode = 'atlas'; }
    else {
      const ic = g.renderer.itemIcon(held.id);
      if (ic) { expect = [Math.round(ic.width * 0.6), Math.round(ic.height * 0.6)]; mode = 'icon'; }
    }
  }
  g.running = false;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.fixedUpdate(1 / 60);
  const ctxProto = CanvasRenderingContext2D.prototype;
  const orig = ctxProto.drawImage;
  const hits = [];
  ctxProto.drawImage = function (...args) {
    if (args.length >= 9) hits.push([args[1], args[2], args[3], args[4], 'A']);
    else if (args.length >= 5) hits.push([args[3], args[4], 'D']);
    return orig.apply(this, args);
  };
  try {
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    g.render();
  } finally { ctxProto.drawImage = orig; }
  g.running = true;
  let seen = false;
  if (expect && mode === 'atlas') seen = hits.some((c) => c[4] === 'A' && c[0] === expect[0] && c[1] === expect[1] && c[2] === expect[2] && c[3] === expect[3]);
  if (expect && mode === 'icon') seen = hits.some((c) => c[2] === 'D' && Math.round(c[0]) === expect[0] && Math.round(c[1]) === expect[1]);
  return { k, inWater: g.player.inWater, mode, expect, seen };
}, key);

const reed = await cap('vi_186_breathing_reed');
check('水下芦苇管渲染（atlas 矩形命中）', reed.inWater === true && reed.seen === true, JSON.stringify(reed));

const torch = await cap('vi_8_Torch');
check('水下火把 noWet 隐（零命中）', torch.inWater === true && torch.seen === false, JSON.stringify(torch));

const coral = await cap('vi_4384_CoralTorch');
check('珊瑚火把 4384（allowWater 火把 noWet=false）水下照常显示', coral.inWater === true && coral.seen === true, JSON.stringify(coral));

// 出水对照：火把恢复显示——直上抬 30 格 + 500ms 期间逐帧钉 vy（cap 内的
// sleep 有真实 rAF 在跑，重力会回落；用 rAF 钩子钉住）
const dryPos = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const st = g.world.store;
  let ty = Math.floor(g.player.y / 16) - 30;
  while (ty > 10 && st.isSolid(Math.floor(g.player.cx / 16), ty)) ty--;
  const y0 = ty * 16;
  g.player.y = y0;
  g.player.vx = 0; g.player.vy = 0;
  // 常驻钉位（cap 内 500ms 真实 rAF 也在跑——重力回落会再入水；钉到断言完）
  window.__dryPin = setInterval(() => { g.player.y = y0; g.player.vy = 0; g.player.vx = 0; }, 16);
  setTimeout(() => {
    const st2 = g.world.store;
    resolve({ y: g.player.y, feetLiq: st2.liquid[st2.idx(Math.floor(g.player.cx / 16), Math.floor((g.player.y + g.player.h - 4) / 16))], inWater: g.player.inWater });
  }, 300);
}));
console.log('[dbg] dry pos:', JSON.stringify(dryPos));
const torchDry = await cap('vi_8_Torch');
check('火把出水恢复显示（wet 门非永久隐）', torchDry.inWater === false && torchDry.seen === true,
  `inWater=${torchDry.inWater} seen=${torchDry.seen}`);
await page.evaluate(() => clearInterval(window.__dryPin));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
