// 402 星尘织带蠕虫：ai[2] 生命计时链 + 头部 DrawPrettyStarSparkle 渲染抽验。
// 断言：① ai2 每 tick+1（玩家死亡也不冻结——type 段在 target 检查前）② 285→570
// 减速（|v|×1→×0.5）③ 恰 570 速度归一×6 冲刺 ④ ≥600 归零重开（不自灭）⑤ ai2=420
// （envelope num=1）vs ai2=30（num=0）同窗蓝色像素差 = sparkle（CornflowerBlue 加色）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const res = {};
  const e = Enemy.fromVanilla(402, p.cx + 200, p.cy - 120);
  if (!e) { res.err = 'fromVanilla(402) null'; return res; }
  g.entities.add(e, 'enemies');
  // 玩家保命（402 接触伤害大——玩家死会触发 despawn 链干扰观察）
  const keepAlive = setInterval(() => { p.hp = p.maxHp; }, 50);
  await new Promise(r => setTimeout(r, 400));
  res.spawned = !e.dead && e.vanillaId === 402;
  res.ai2Start = e.ai2;
  // ---- 计时链观察（~11s = 660t ≥ 一整轮 600）----
  let saw570 = false, spdAt570 = -1, wraps = 0, ai2Max = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 11000 && !e.dead) {
    const a = e.ai2;
    if (a > ai2Max) ai2Max = a;
    if (a >= 570 && !saw570) { saw570 = true; spdAt570 = Math.round(Math.hypot(e.vx, e.vy) * 100) / 100; }
    if (a < 50 && ai2Max > 560) { wraps++; ai2Max = 0; }
    await new Promise(r => setTimeout(r, 12));
  }
  clearInterval(keepAlive);
  res.aliveAfterFullCycle = !e.dead;
  res.saw570 = saw570;
  res.spdAt570 = spdAt570;                       // 归一×6 → ≈6
  res.wraps = wraps;                             // ≥600 归零重开
  res.ai2Final = e.ai2;
  // ---- sparkle 渲染抽验（同窗前后差分，免疫天空蓝底噪）----
  const scr = (wx, wy) => [
    Math.round((wx - cam.x) * cam.zoom + cv.width / 2),
    Math.round((wy - cam.y) * cam.zoom + cv.height / 2),
  ];
  const blueWin = () => {
    const [sx, sy] = scr(e.cx - 40, e.cy - 40);
    const img = g.renderer.ctx.getImageData(
      Math.max(0, sx), Math.max(0, sy), Math.round(80 * cam.zoom), Math.round(80 * cam.zoom)).data;
    let n = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], gg = img[i + 1], b = img[i + 2];
      if (b > 60 && b > r + 15 && b >= gg + 8 && img[i + 3] > 40) n++;
    }
    return n;
  };
  const snapAt = async (ai2) => { e.ai2 = ai2; await new Promise(r => setTimeout(r, 450)); return blueWin(); };
  const on = await snapAt(420);    // envelope num = lv(.5,.95,.7)×lv(1,.95,.7) = 1
  const off = await snapAt(30);    // num = 0（fadeIn 未过 0.5）
  res.sparkleOn = on;
  res.sparkleOff = off;
  res.sparkleGate = on > off + 20;
  e.dead = true;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
