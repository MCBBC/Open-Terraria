// 芦苇呼吸管水下渲染探针（2026-08-17 用户报障：水下不显示）：
//  场景 = 平地挖水坑 → 玩家手持 186 芦苇管沉入水中 → 静持渲染层逐像素采样。
//  断言：
//   ① 水下手持芦苇管：玩家头侧区域存在非水体/非身体像素簇（管子 44×44 图标斜持）
//   ② 水下手持火把（vi_8 对照组）：持物位无火把像素（noWet 熄灭语义保持）
//   ③ 珊瑚火把 523（vanilla 无 noWet）：水下照常显示（原版不一致行为照抄）
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

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const mk = g.__swITEMS ? null : null;
  return { ok: !!g };
});
check('世界就绪', setup.ok);

// 天然水场（自挖坑会被液体沉降排干——改用世界边缘海洋：垂直扫首个深水列）
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 从 x=25 起向内找一列：顶部 40 格以下有连续 ≥6 格水体的列
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
  window.__reedCol = col; window.__reedY = surfY;
  if (col >= 0) {
    g.player.x = col * 16 + 2; g.player.y = surfY * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;   // 相机直跳（follow 缓动太慢）
  }
});
await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60); });
const posDbg = await page.evaluate(() => ({ col: window.__reedCol, y: window.__reedY }));
check('找到天然水列并传送', posDbg.col >= 0, JSON.stringify(posDbg));

const holdItem = (key) => page.evaluate(async (k) => {
  const g = window.__swGame;
  const m = await import('/src/data/items.ts');
  g.player.inv.slots[0] = k ? m.mkStack(k, 1) : null;
  g.player.inv.selected = 0;
  return { held: g.player.inv.heldItem()?.id, inWater: g.player.inWater, key: k };
}, key);

// 稳帧后采样玩家头侧持物区像素（世界坐标→屏幕）——**差分法**：区域被水/身体
// 填满时绝对像素无区分度，改为对"空手基线"逐像素 diff（差异像素数 = 持物贡献）
// 定帧快照：停 rAF 循环 → 手动 1 fixedUpdate + 1 render（消除水波/溺水/气泡时变噪声）
const snap = () => page.evaluate(() => {
  const g = window.__swGame;
  g.running = false;                       // 停自动循环（rAF 帧尾不再推进）
  g.player.vx = 0; g.player.vy = 0;       // 冻结位移
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;   // 相机回中（消除帧间漂移整幅差）
  g.fixedUpdate(1 / 60);
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;   // 一步后再回中（follow 缓动清零）
  g.render();
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d');
  const cam = g.camera;
  const sx = Math.round((g.player.cx + 20 - (cam.x - cam.viewW / (2 * cam.zoom))) * cam.zoom);
  const sy = Math.round((g.player.y - 30 - (cam.y - cam.viewH / (2 * cam.zoom))) * cam.zoom);
  const w = 70, h = 70;
  const img = ctx.getImageData(Math.max(0, sx), Math.max(0, sy), w, h);
  g.running = true;
  return Array.from(img.data);
});
const diffCount = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24 || Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
  }
  return n;
};
const settle = (ticks) => page.evaluate((t) => { const g = window.__swGame; for (let i = 0; i < t; i++) g.fixedUpdate(1 / 60); }, ticks);

// 空手基线
const st0 = await holdItem(null);
await settle(20); await sleep(400);
const base = await snap();

const liqDbg = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor((g.player.y + g.player.h - 4) / 16);
  return { px, py, y: g.player.y, h: g.player.h, liq: st.liquid[st.idx(px, py)], lt: st.liquidType[st.idx(px, py)],
    tile: st.get(px, py), inWater: g.player.inWater, headUnder: g.player.headUnderwater };
});
console.log('[dbg] liquid@feet:', JSON.stringify(liqDbg));
const st1 = await holdItem('vi_186_breathing_reed');
const gateDbg = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/data/vanillaItemFunc.ts');
  const f = m.itemFuncOfVid(186);
  const p = g.player;
  const held = p.inv.heldItem();
  return { heldId: held?.id, holdStyle: f?.holdStyle, inWater: p.inWater, swingT: g.swing?.t ?? null,
    facing: p.facing, px: p.x, py: p.y };
});
console.log('[dbg] gate:', JSON.stringify(gateDbg));
await settle(20); await sleep(400);
const reedDiff = diffCount(base, await snap());
check('水下持芦苇管：玩家确在水中', st1.inWater === true, JSON.stringify({ ...st1, held: undefined }));
check('水下芦苇管渲染（对空手差分 >150 px）', reedDiff > 150, `diff=${reedDiff}`);

// 对照组：火把水下熄灭（noWet 隐）
await holdItem('vi_8_torch');
await settle(10); await sleep(300);
const torchDiff = diffCount(base, await snap());
check('水下火把 noWet 隐（差分 ≪ 芦苇管）', torchDiff < reedDiff - 100, `torch=${torchDiff} reed=${reedDiff}`);

// 珊瑚火把 523（vanilla 无 noWet）水下照常
await holdItem('vi_523_coral_torch');
await settle(10); await sleep(300);
const coralDiff = diffCount(base, await snap());
check('珊瑚火把 523（vanilla 无 noWet）水下照常显示（差分 >150）', coralDiff > 150, `diff=${coralDiff}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
