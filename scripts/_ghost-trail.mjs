// 硬核幽灵三拖影（LegacyPlayerRenderer.cs:272-281 + DrawGhost :515-533）渲染抽验。
// 渲染循环异步抖动（fixedUpdate 累加器+相机平滑）使 e2e 像素窗漂移不可控 →
// 单元级直调：把真幽灵挪出屏，构造 fake player（同 drawGhostSprite 消费字段），
// 在相机变换内同步调用后立即采样（evaluate 同步段内画布不被下一帧覆盖）。
// 断言：① vx=+8 时 −16/−32px 窗亮于 vx=−8 同窗（拖影在 −速度侧）② 本体窗亮于
// 空窗 ③ vx=0 时 −16 窗与本体窗同亮（四份同位）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  const res = {};
  // ---- 幽灵相位注入（hardcoreDead 挡 respawnPlayer → 停留 ghost 相）----
  p.appearance ??= {
    name: 'probe', hair: 0, skinVariant: 0,
    hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 }, eyeColor: { r: 255, g: 0, b: 255 },
    shirtColor: { r: 175, g: 165, b: 140 }, undershirtColor: { r: 160, g: 180, b: 215 },
    pantsColor: { r: 255, g: 230, b: 175 }, shoeColor: { r: 160, g: 105, b: 60 },
    difficulty: 0, team: 0,
  };
  p.appearance = { ...p.appearance, difficulty: 2, hardcoreDead: true };
  p.dead = true;
  p.respawnTimer = 700;
  p.hp = 0;
  await new Promise(r => setTimeout(r, 1200));   // Ghost 贴图懒加载就绪
  res.ghostPhase = p.isGhostPhase(g.world);
  // 真幽灵留在地表（相机锚定玩家位）；采样锚取高空纯天空（相隔 24 格互不干扰，
  // 不可把玩家挪出屏——相机会跟走导致采样窗越界全黑）
  const savedX = p.x, savedY = p.y;
  await new Promise(r => setTimeout(r, 250));
  // 采样锚（高空纯天空）
  const anchorX = savedX, anchorY = savedY - 160;   // 玩家上方 160px（屏内、地表上空）
  const scr = (wx, wy) => [
    Math.round((wx - cam.x) * cam.zoom + cv.width / 2),
    Math.round((wy - cam.y) * cam.zoom + cv.height / 2),
  ];
  const windowLum = (wx, wy) => {
    const [sx, sy] = scr(wx - 18, wy - 23);
    const img = g.renderer.ctx.getImageData(
      Math.max(0, sx), Math.max(0, sy), Math.round(36 * cam.zoom), Math.round(46 * cam.zoom)).data;
    let s = 0;
    for (let i = 0; i < img.length; i += 4) s += img[i] + img[i + 1] + img[i + 2];
    return s;
  };
  const fake = { x: anchorX, y: anchorY, vx: 0, vy: 0, facing: 1, miscCounter: 0, ghostFrame: 0 };
  const callDraw = () => {
    const ctx = g.renderer.ctx;
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    g.renderer.drawGhostSprite(fake);
    ctx.restore();
  };
  await new Promise(r => requestAnimationFrame(r));   // 让最后一次真渲染帧走完
  // 单元级差分：evaluate 同步段内 canvas 累积 → 每次绘制先采基线、画后复采，
  // 净贡献 = 后 − 前。幽灵是 alpha 合成（叠亮天空 = 压暗 G/B）→ 幅度取 |Δ|。
  const wins = () => ({
    trail0: windowLum(anchorX - 16, anchorY),   // 拖影 i=0 位
    trail1: windowLum(anchorX - 32, anchorY),   // 拖影 i=1 位
    trail2: windowLum(anchorX - 48, anchorY),   // 拖影 i=2 位
    body: windowLum(anchorX, anchorY),          // 本体位
    sky: windowLum(anchorX + 90, anchorY),      // 前方空窗（对照）
  });
  const measure = (vx) => {
    const pre = wins();
    fake.vx = vx;
    callDraw();
    const post = wins();
    const d = {};
    for (const k of Object.keys(post)) d[k] = post[k] - pre[k];
    return d;
  };
  const fwd = measure(8);    // 拖影画进 −16/−32/−48 窗
  const rev = measure(-8);   // 拖影翻到 +16/+32/+48（−侧窗无拖影）
  const still = measure(0);  // 四份同位
  res.fwd = fwd; res.rev = rev; res.still = still;
  // 拖影 i 的净贡献：|fwd.trail_i| 应显著大于 |rev.trail_i|（后者≈0）
  res.trail0Delta = Math.abs(fwd.trail0) - Math.abs(rev.trail0);
  res.trail1Delta = Math.abs(fwd.trail1) - Math.abs(rev.trail1);
  res.trail2Delta = Math.abs(fwd.trail2) - Math.abs(rev.trail2);
  res.bodyDelta = Math.abs(fwd.body) - Math.abs(fwd.sky);
  // 拖影 i=0（shadow0.5：alpha≈0.19×150 ≈ ΔG −22/px）；i=1（×0.3）次之
  res.trailsVisible = res.trail0Delta > 1500 && res.trail1Delta > 500;
  // 本体窗在两向各含本体叠画（窗几何含本体左缘）——非零即画上
  res.bodyVisible = Math.abs(fwd.body) + Math.abs(rev.body) > 1500;
  // 静止（vx=0）：四份同位 [anchorX, anchorX+34]——−侧三窗无离散拖影（全 ~0）
  // 且本体窗有叠画（trail0 窗只覆盖精灵左缘 2px，恒 0 属窗位而非实现）
  res.stillOverlaps = Math.abs(still.trail0) < 300 && Math.abs(still.trail1) < 300
    && Math.abs(still.body) > 800;
  p.x = savedX; p.y = savedY;
  p.dead = false;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
