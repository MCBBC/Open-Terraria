// 帝后 636 攻击态 8/9/10 彩虹残影环（Main.cs:26394-26487）渲染抽验。
// e2e 大窗彩色计数被天空/昼夜波动淹没 → 单元级差分：实体 dead 出列（渲染循环
// 不再自画）后手动调 renderer.drawEmpress(e)（同步段内：先采基线、画、复采），
// 比较环显档（ai0=8/ai1=50：num8=1）与环灭档（ai1=200：lv(90,70,200)=0 → num8=0）
// 的净彩色/亮度贡献；另验态 10 椭圆轮辐档（ai1=100：num7=1 满强度）。
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
  const e = Enemy.fromVanilla(636, p.cx + 200, p.cy - 200);
  if (!e) { res.err = 'fromVanilla(636) null'; return res; }
  g.entities.add(e, 'enemies');
  await new Promise(r => setTimeout(r, 900));   // 贴图/染色缓存就绪
  e.dead = true;                                 // 出列（渲染循环不再自画）
  await new Promise(r => requestAnimationFrame(r));
  // 采样锚：玩家上方 200px 纯天空
  const ax = p.x, ay = p.y - 200;
  e.x = ax - e.w / 2; e.y = ay - e.h / 2;
  e.vx = 0; e.vy = 0; e.spawnAlpha = 0; e.ai3 = 0;
  const scr = (wx, wy) => [
    Math.round((wx - cam.x) * cam.zoom + cv.width / 2),
    Math.round((wy - cam.y) * cam.zoom + cv.height / 2),
  ];
  const colorful = () => {
    // 残影半径 ≤600·num7 + 轮辐 600 → 中心 640×360 世界窗
    const [sx, sy] = scr(ax - 320, ay - 180);
    const img = g.renderer.ctx.getImageData(
      Math.max(0, sx), Math.max(0, sy), Math.round(640 * cam.zoom), Math.round(360 * cam.zoom)).data;
    let n = 0, red = 0, green = 0, blue = 0, lum = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], gg = img[i + 1], b = img[i + 2];
      lum += r + gg + b;
      if (img[i + 3] < 80) continue;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx > 90 && mx - mn > 60) {
        n++;
        if (r === mx) red++; else if (gg === mx) green++; else blue++;
      }
    }
    return { n, red, green, blue, lum };
  };
  const callDraw = () => {
    const ctx = g.renderer.ctx;
    ctx.save();
    ctx.translate(Math.round(cv.width / 2), Math.round(cv.height / 2));
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-Math.round(cam.x * cam.zoom) / cam.zoom, -Math.round(cam.y * cam.zoom) / cam.zoom);
    g.renderer.drawEmpress(e);
    ctx.restore();
  };
  const measure = (ai0, ai1) => {
    e.ai0 = ai0; e.ai1 = ai1;
    const pre = colorful();
    callDraw();
    const post = colorful();
    return {
      n: post.n - pre.n, red: post.red - pre.red, green: post.green - pre.green,
      blue: post.blue - pre.blue, lum: post.lum - pre.lum,
    };
  };
  res.ring8On = measure(8, 50);     // num8=lv(0,30,50)×lv(90,70,50)=1 → 环满强度
  res.ring8Off = measure(8, 200);   // lv(90,70,200)=0 → num8=0 环灭
  res.ring9On = measure(9, 50);     // 同 8（侧向反）
  res.spokes10 = measure(10, 100);  // ai1≥90 椭圆轮辐 (600,150)·num7=1
  // 指标：hsl 环红相拷贝增量（red）+ 净提亮（lum，residual lighter 加色）；
  // destination-out 削底使蓝相计数下降属预期（A/=3 语义），不用总 n 判定
  res.rainbow8 = res.ring8On.red - res.ring8Off.red > 3000
    && res.ring8On.lum - res.ring8Off.lum > 5e6
    && res.ring9On.red - res.ring8Off.red > 3000;      // 态 9 同构（侧向反）
  res.spokes10On = res.spokes10.lum - res.ring8Off.lum > 1e6;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
