// 天空视觉深化批运行时冒烟：涟漪/月塔天空层/月总死亡戏剧/稀有云/环境族（scripts/_skyvisual-probe.mjs）
// 经 tools/run-diag.mjs 运行；SW_ORIGIN 指向本会话私有静默实例。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('天空视觉');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const sky = g.renderer.sky;

  // ===== 0. 帧数据挂点在位（Renderer 每帧注入） =====
  out.frameCtx = !!sky.frameCtx && !!sky.frameCtx.world && Array.isArray(sky.frameCtx.entities);
  out.scene = !!sky.frameCtx?.scene;

  // ===== 1. 雨点涟漪：下雨 → 水面入池 =====
  const st = g.world.store;
  let waterTx = -1, waterTy = -1;
  for (let r = 0; r < 400 && waterTx < 0; r++) {
    const tx = Math.floor(g.world.spawnX) + r * 5;
    for (let ty = Math.floor(g.world.groundLevel) - 8; ty < Math.floor(g.world.groundLevel) + 22; ty++) {
      if (st.inBounds(tx, ty) && st.liquid[st.idx(tx, ty)] > 0) { waterTx = tx; waterTy = ty; break; }
    }
  }
  out.waterFound = waterTx >= 0;
  const p0 = g.player;
  p0.x = (waterTx >= 0 ? waterTx : g.world.spawnX) * 16;
  p0.y = (waterTy >= 0 ? waterTy - 4 : g.world.spawnY - 4) * 16;
  p0.vx = 0; p0.vy = 0;
  g.world.weather.startRain(true, 0.8);
  out.rainBudget = g.world.weather.rippleBudget(g.renderer.canvas.width);
  await wait(1500);
  out.ripplesSpawned = g.world.weather.ripples.length > 0;
  g.world.weather.stopRain(true);
  await wait(1200);
  out.ripplesClearedAfterRain = g.world.weather.ripples.length === 0;

  // ===== 2. 月塔天空近距门：贴脸生成塔 NPC → 激活；拉远 → 关门淡出 =====
  const px = Math.floor(p0.x / 16), py = Math.floor(p0.y / 16) - 8;
  const tower = g.spawnNpcByVanilla(507, px * 16, py * 16);   // 星云塔
  out.towerSpawned = !!tower;
  await wait(500);
  out.nebulaActiveNear = sky.towerSky?.nebula?.active ?? null;
  out.nebulaFadeNear = +(sky.towerSky?.nebula?.fade ?? -1).toFixed(3);
  out.towerCloudMul = +sky.towerCloudAlphaMul().toFixed(3);   // GetCloudAlpha < 1
  if (tower) { tower.x = (px + 500) * 16; }                    // 拉远 8000px
  await wait(700);
  out.nebulaActiveFar = sky.towerSky?.nebula?.active ?? null;

  // ===== 3. 月总死亡戏剧：生成 398 → 死亡态 → 爆炎/碎块/白光 =====
  const ml = g.spawnNpcByVanilla(398, px * 16, (py - 10) * 16);
  out.mlSpawned = !!ml;
  if (ml) {
    ml.hp = 1;
    ml.ai0 = 2; ml.ai1 = 120;   // 死亡演出段（>60 每 3t 出爆炎）
    await wait(900);
    out.explosionsDuringDeath = (sky.dramaExplosions?.length ?? 0) > 0;
    ml.ai1 = 595;               // 逼近终死线 600
    await wait(1500);           // 自行跨线 → ThrowPieces（或消失兜底）
    out.piecesAfterDeath = sky.dramaPieces?.length ?? -1;
    out.whitening = +(sky.dramaWhitening ?? -1).toFixed(3);
  }

  // ===== 4/5. 纯函数侧（稀有云门 + 全族表）——vitest 已覆盖，此处运行时抽样 =====
  const mod = await import('/src/render/SkyRenderer.ts');
  const flags = { downedBoss1: true, downedBoss2: true, downedBoss3: true, hardMode: true, crimson: true, dontStarveWorld: false, tenthAnniversaryWorld: false };
  const seen = new Set();
  for (let i = 0; i < 3000; i++) seen.add(mod.rollRareCloud(flags, Math.random));
  out.rareCoverage = seen.size;              // 旗标全开 → 19 种全可达
  out.families = Object.keys(mod.AMBIENT_FAMILY_PARAMS).length;   // 17 族
  out.groups = Object.keys(mod.AMBIENT_GROUP_SPEC).length;        // 5 群体族
  out.hellbatsBand = mod.AMBIENT_FAMILY_PARAMS.hellbats.hellBand === true;

  // ===== 6. 渲染循环健康（含塔天空/戏剧/涟漪绘制路径无异常） =====
  await wait(1200);
  return out;
});
console.log(JSON.stringify(res, null, 2));
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 8), null, 2));
await browser.close();
process.exit(errs.length ? 1 : 0);
