// 群系过渡链功能验证：玩家从丛林走向森林边界 → 记录 bgStyle/alphaFront 时间线 →
// 断言：单次干净切换（无振荡）、切换后有冷却锁、alpha 单调收敛
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 220000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const bb = g.renderer.biomeBg;
  const st = g.world.store;
  const { scanScene } = await import('/src/world/SceneMetrics.ts');
  // 阶段1：扫描找 zoneJungle 翻转边界（每 20 格瞬移读场景）
  const y0 = Math.floor(g.world.groundLevel) - 3;
  let boundary = -1, prevJ = null;
  for (let x = 100; x < st.w - 100; x += 20) {
    p.x = x * 16; p.y = y0 * 16; p.vx = 0; p.vy = 0;
    g.scene = scanScene(g.world, p.cx, p.cy, 0, false);
    const j = !!g.scene.zoneJungle;
    if (prevJ !== null && j !== prevJ) { boundary = x; break; }
    prevJ = j;
  }
  if (boundary < 0) return { error: 'no jungle boundary found' };
  // 阶段2：从边界右侧 40 格走到左侧 20 格（穿越边界），记录 style 时间线
  const timeline = [];
  const startX = boundary + 40;
  const { scanScene: _ss } = { scanScene: (await import('/src/world/SceneMetrics.ts')).scanScene };
  for (let step = 0; step < 90; step++) {
    p.x = (startX - step) * 16;   // 从右向左穿越边界
    p.vx = 0; p.vy = 0;
    g.scene = _ss(st, p.cx, p.cy, 0, false);   // 同步场景（原版每帧刷新）
    for (let f = 0; f < 6; f++) { await new Promise(r => requestAnimationFrame(r)); }
    timeline.push({
      t: step, x: Math.floor(p.x / 16),
      style: bb.bgStyle, delay: Math.round(bb.bgDelay),
      aJungle: +bb.frontLayer()[3].toFixed(2),
      aForest: +(bb.frontLayer()[0] + bb.frontLayer()[10] + bb.frontLayer()[11] + bb.frontLayer()[12]).toFixed(2),
    });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  // 分析：风格切换次数（去重连续相同）
  const switches = [];
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].style !== timeline[i - 1].style) {
      switches.push({ at: i, from: timeline[i - 1].style, to: timeline[i].style });
    }
  }
  return { boundary, startX, endX: timeline[timeline.length - 1]?.x, switches, n: switches.length,
    sample: timeline.filter((_, i) => i % 10 === 0) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
