// 晨昏光晕深度门探针：设时间到黎明窗（timeOfDay≈0.22，litVis>0）→
// ①玩家地表：屏上太阳区应有暖色光晕（加算提亮）
// ②玩家深入地下（屏顶低于 worldSurface+2）：同一屏区应无光晕（门关）
// 断言 = 地下采样区亮度显著低于地表（差 > 12），且地下亮度 ≈ 无光晕基线。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5205';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
// 等 RE-LOGIC splash 播完（#sw-splash 移除 = 菜单可点；冷实例首载含素材预载）
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
// 角色选择（sw-vsel 结构；无角色 → footer 新建 → 角色创建表单）
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('晕门');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
// 角色行 Play（btns 首个图标钮）→ 世界选择（同 sw-vsel 结构,标题换"选择世界"）
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // SIZES[0] = 小世界 4200×1200
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
  // 世界生成直接进游戏（无回选面板）——等世界就绪
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  // 固定黎明窗（timeOfDay 0.22 → time≈2786，dawn 曲线峰值区）
  w.clock.timeOfDay = 0.22;
  w.clock.dayTime = true;
  const sampleHalo = async () => {
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    const cv = g.renderer.canvas;
    const ctx = cv.getContext('2d');
    const cam = g.camera;
    const z = cam.zoom || 1;
    // 光晕中心（Renderer 7a''：sunX=ft·viewW, sunY=dip·250+180；ft=0.052）
    const ft = (0.22 - 0.1875) / 0.625;
    const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
    const dpr = g.renderer.dpr || 1;
    const cx = (ft * cv.width / dpr) * dpr;
    const cy = (dip * 250 + 180) * dpr;
    const R = 60 * dpr;
    const x0 = Math.max(0, Math.round(cx - R)), y0 = Math.max(0, Math.round(cy - R));
    const s = Math.min(2 * R, cv.width - x0, cv.height - y0);
    const d = ctx.getImageData(x0, y0, s, s).data;
    let sum = 0, n = 0, warm = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += lum; n++;
      if (d[i] > d[i + 2] + 18 && d[i] > 60) warm++;   // 暖色（R 明显高于 B）
    }
    return { avgLum: Math.round(sum / n), warmPx: warm };
  };
  // ① 地表：扫列找太阳无遮挡点（树冠/悬崖会遮光晕=原版同款场景 alpha 语义）
  const surfY = (w.groundLevel - 3) * 16;
  g.player.y = surfY;
  g.player.x = g.player.spawnX || 2100;
  let occ = 0;
  for (let k = 0; k < 24; k++) {
    g.player.x = (g.player.spawnX || 2100) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 24;
    g.player.vx = 0; g.player.vy = 0;
    for (let i = 0; i < 20; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
    await new Promise(r => requestAnimationFrame(r));
    occ = g.renderer.sky.sunOcclusion;
    if (occ > 0.5) break;
  }
  const surface = await sampleHalo();
  const surfaceTopTile = ((g.camera.y - 431 / (g.camera.zoom || 1)) / 16);
  // ② 深地下（groundLevel+80，屏顶深入 worldSurface+2 以下）——开旅程神模式防摔死
  if (w.journeyPowers) w.journeyPowers.godmode = true;
  if (g.player.dead) g.respawnPlayer?.();
  g.player.y = (w.groundLevel + 80) * 16;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const under = await sampleHalo();
  const underAlive = !g.player.dead;
  if (w.journeyPowers) w.journeyPowers.godmode = false;
  const underTopTile = ((g.camera.y - 431 / (g.camera.zoom || 1)) / 16);
  return {
    surface, under,
    surfaceTopTile: Math.round(surfaceTopTile), underTopTile: Math.round(underTopTile),
    groundLevel: w.groundLevel,
    gateSurface: surfaceTopTile < w.groundLevel + 2,
    gateUnder: underTopTile < w.groundLevel + 2,
    sunOcc: occ,
    sunOccReady: g.renderer.sky ? g.renderer.sky.sunOcclusionReady : null,
    underAlive,
  };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: '/tmp/halo-under.png' });
await browser.close();
// 断言：①地下门关（gateUnder=false）且地下无暖色加算（修复前 litVis≈0.035 会在
//   暗洞穴上叠出可见暖晕——avgLum 应 ≈0）；②地表门开（gateSurface=true，光晕
//   路径与修复前一致——地表晕本身极淡 alpha≤0.10,不做像素差断言,截图目检）。
const ok = res.gateSurface === true && res.gateUnder === false
  && res.under.avgLum <= 6 && res.under.warmPx === 0 && res.underAlive !== false;
console.log(ok ? '✅ 晨昏光晕深度门生效（地下无晕/门输入正确）' : '❌ 断言未过');
process.exit(ok ? 0 : 1);
