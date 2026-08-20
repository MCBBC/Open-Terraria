// 史莱姆跳跃物理对拍：长平台 + 史莱姆 → 逐帧记录 (x,y) →
// 起跳点/顶点/落点 → 跳跃高度（顶点-起点 bottom）与水平距离（落点-起点 x）。
// 原版理论值（NPC.cs:6026 g=0.3；AI_001 小跳 vy=-6, vx+=2dir；滞空段 +0.2/t 钳 3）：
//   高度 = 6²/(2·0.3) = 60px（3.75 格）；滞空 = 2·6/0.3 = 40t
//   距离 ≈ 前几帧加速(vx 2→3) + 其余 3/t ≈ 117px
// 修复前（g=0.4）：高度 45px、滞空 30t、距离 ~87px
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
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  // 长平台：bx±60 石块一行；清空上方
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  for (let dx = -70; dx <= 70; dx++) {
    for (let dy = -40; dy <= 0; dy++) st.setTile(bx + dx, by - dy, 0);
    st.setTile(bx + dx, by, 1);
  }
  // 史莱姆（绿 1 号）
  const sl = g.entities ? g.entities : null;
  const spawn = () => {
    const e = g.spawnEnemyAt ? g.spawnEnemyAt(bx * 16, (by - 2) * 16, 'slime_green')
      : (g.entities?.spawnVanilla ? g.entities.spawnVanilla(1, bx * 16, (by - 2) * 16) : null);
    return e;
  };
  let slime = spawn();
  if (!slime) {
    // 兜底：直接 new
    const { Enemy } = await import('/src/entities/Enemy.ts');
    slime = Enemy.fromVanilla(1, bx * 16, (by - 2) * 16);
    if (slime) g.entities.add(slime, 'enemies');
  }
  if (!slime) return { error: 'no slime spawn path' };
  // 玩家拉远（防史莱姆索敌玩家打断/转向），夜间 flag3 保证激愤+连跳
  g.world.clock.isDay = false;
  p.x = (bx + 40) * 16; p.y = (by - 3) * 16; p.vx = 0; p.vy = 0;
  slime.facing = -1;               // 朝远离玩家方向（左）
  slime.ai0 = 0; slime.ai2 = 1;    // 首跳立即触发（ai0>=0 → stage1）
  await new Promise(r => setTimeout(r, 300));
  // 逐帧采样 400 帧（~6.7s，覆盖 3+ 个完整跳）
  const frames = [];
  for (let i = 0; i < 400; i++) {
    frames.push({ t: i, x: +slime.x.toFixed(2), y: +slime.y.toFixed(2), vy: +slime.vy.toFixed(2), vx: +slime.vx.toFixed(2), ai0: slime.ai0 });
    await new Promise(r => requestAnimationFrame(r));
  }
  // 解析跳跃弧：vy 由 0→负（起跳）到回归 0（落地）
  const jumps = [];
  let cur = null;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.vy < -0.5 && !cur) cur = { i0: i - 1, x0: frames[i - 1].x, y0: frames[i - 1].y, apexY: f.y, apexI: i };
    if (cur) {
      if (f.y < cur.apexY) { cur.apexY = f.y; cur.apexI = i; }
      if (f.vy >= -0.01 && f.vy <= 0.01 && i > cur.i0 + 3) {
        cur.i1 = i; cur.x1 = f.x; cur.y1 = f.y;
        cur.h = +(cur.y0 - cur.apexY).toFixed(1);
        cur.d = +(cur.x1 - cur.x0).toFixed(1);
        cur.air = i - cur.i0;
        jumps.push(cur); cur = null;
      }
    }
  }
  return {
    slime: { x: slime.x, y: slime.y, vanillaId: slime.vanillaId },
    jumps: jumps.slice(0, 6).map(j => ({ height: j.h, dist: j.d, airFrames: j.air, dir: Math.sign(j.x1 - j.x0) })),
    frameDt: frames.slice(1, 20).map(f => 0),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
