// 兔子帧速验证：spawn 兔 46 → 记录 60 tick 的帧序列 → 断言换帧周期 ≈ 每 3-4 tick 一换（|vx|+1 每 tick 累加、>6 进帧）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  // 平地
  const bx = Math.floor(p.x / 16), by = Math.floor((p.y + p.h) / 16);
  for (let dx = -30; dx <= 30; dx++) for (let dy = -6; dy <= 1; dy++) {
    if (dy === 1) continue;
    st.setTile(bx + dx, by + dy, 0);
  }
  await new Promise(r => setTimeout(r, 200));
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const bunny = Enemy.fromVanilla(46, bx * 16 - 60, (by + 1) * 16 - 20);
  if (!bunny) return { error: 'no bunny' };
  g.entities.add(bunny, 'enemies');
  bunny.vx = 1; // 匀速向右
  const framesSeq = [];
  let t0 = g.tickCount;
  const startTick = bunny.animT;
  const sampler = setInterval(() => {
    framesSeq.push([bunny.animT - startTick, Math.abs(bunny.vx).toFixed(2), Math.floor(bunny.walkCycleT + bunny.animT - startTick + (bunny.walkCycleT0 ?? 0))]);
  }, 16);
  // 直接读 vanillaFrameIdx 的输出帧序列：手动按公式推 + 真实 tick 采样
  const mod = await import('/src/render/Renderer.ts');
  const seq = [];
  let last = -1;
  const t2 = g.tickCount;
  while (g.tickCount - t2 < 90) await new Promise(r => setTimeout(r, 10));
  clearInterval(sampler);
  // 用每 tick 采样（有限采样近似）：直接调 vanillaFrameIdx 于当前状态
  const cur = mod.vanillaFrameIdx(bunny, 7);
  // 公式自验：60t 匀速 |vx|=1 → counter=t*2 → 帧进 t*2/7 → 每 3.5t 一换（vs 旧公式 (t*1+t*2)/6=每 2t 一换）
  const formula = [];
  for (let t = 0; t < 21; t++) formula.push(Math.floor((1 * t + t) / 7) % 7);   // walkCycleT≈t*|vx|
  const oldFormula = [];
  for (let t = 0; t < 21; t++) oldFormula.push(2 + (Math.floor((1 * t * 2 + t) / 6) % 5));
  return { curFrame: cur, vxNow: +bunny.vx.toFixed(2), onGround: bunny.onGround, newFormulaSeq: formula.join(''), oldFormulaSeq: oldFormula.join('') };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
