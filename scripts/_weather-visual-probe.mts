// 天气视觉三件 E2E 探针（一次性诊断，经 tools/run-diag.mjs 跑）：
//  ① 雨/阴天 → 云走 18-21 风暴云族（Cloud.cs:115-126）；晴天高空 → 9-13 灰云
//  ② AmbientSky 选族：白天 → 鸟群实体入场；夜+神圣 → 腹足怪群体
//  ③ 天气环境音循环轨句柄创建（暴风雪双轨）——无音频设备只验轨逻辑不抛
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome.app', headless: true, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const res: Record<string, unknown> = {};
  await (window as any).__swFlow.newWorld('weather-visual-probe', 1200, 400);
  const t0 = Date.now();
  while (!(window as any).__swGame?.world && Date.now() - t0 < 240000) await new Promise((r) => setTimeout(r, 1000));
  const game = (window as any).__swGame;
  if (!game?.world) return { err: 'world not ready' };
  const w = game.world.weather;
  const sky = game.renderer.sky;

  // ① 雨天风暴云族：强制雨 + 等云族重掷（云 kill 淡出 0.001/tick → 加速等待）
  w.startRain(true, 0.85);
  for (let i = 0; i < 200; i++) {
    game.updateWeather?.();
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 2500));
  const clouds: any[] = sky['vclouds'];
  res.cloudTotal = clouds.length;
  res.stormClouds = clouds.filter((c) => c.type >= 18 && c.type <= 21).length;
  res.grayCloudsKilled = clouds.filter((c) => c.type >= 9 && c.type <= 13).length;

  // 晴天重置 → 灰云族回归
  w.stopRain(true);
  w.cloudBGActive = 0;
  w.cloudAlpha = 0;
  for (let i = 0; i < 600; i++) game.updateWeather?.();
  await new Promise((r) => setTimeout(r, 1500));
  res.cloudsAfterClear = sky['vclouds'].length;

  // ② AmbientSky：白天晴天 → 强制到期一次尝试 → 鸟群入场
  sky.amb.dayTime = true; sky.amb.raining = false; sky.amb.eclipse = false;
  sky['ambNextAttempt'] = 0;
  game.world.clock.timeOfDay = 0.5;   // 正午
  const before = sky['ambEntities'].length;
  for (let i = 0; i < 5; i++) { sky['ambNextAttempt'] = 0; await new Promise((r) => setTimeout(r, 40)); }
  const ents: any[] = sky['ambEntities'];
  res.ambientBefore = before;
  res.ambientAfter = ents.length;
  res.ambientKinds = [...new Set(ents.map((e) => e.kind))];
  const bird = ents.find((e) => e.kind === 'birds');
  if (bird) {
    res.birdDepth = Math.round(bird.depth * 100) / 100;
    res.birdLifeTicks = bird.life;
    res.birdOpacity = Math.round(bird.opacity * 100) / 100;
    res.birdDir = bird.dir;
  }
  // 夜晚 + 神圣 → 腹足怪群体（3-7 只 + 磁吸参数）
  ents.length = 0;
  sky.amb.dayTime = false; sky.amb.zoneHallow = true;
  game.world.clock.timeOfDay = 0.0;   // 午夜
  for (let i = 0; i < 5; i++) { sky['ambNextAttempt'] = 0; await new Promise((r) => setTimeout(r, 40)); }
  const gasts: any[] = sky['ambEntities'].filter((e) => e.kind === 'gastropod');
  res.gastropodCount = gasts.length;
  if (gasts.length) {
    res.gastropodDepthRange = [Math.min(...gasts.map((g) => g.depth)), Math.max(...gasts.map((g) => g.depth))].map((v) => Math.round(v * 100) / 100);
    res.gastropodMagAcc = [gasts[0].magAccX, gasts[0].magAccY].map((v) => Math.round(v * 1000) / 1000);
  }
  // 雨天 → 鸟群立即淡出（StartFadingOut :479-483）
  const birds2 = sky['ambEntities'].filter((e) => e.kind === 'birds');
  if (birds2.length) {
    sky.amb.raining = true;
    for (let i = 0; i < 300; i++) { /* 等渲染帧推进 */ await new Promise((r) => setTimeout(r, 8)); }
    res.birdFadeOnRain = Math.round(birds2[0].opacity * 100) / 100;
  }

  // ③ 环境音循环轨：暴风雪状态 → applyWeatherLoops 建轨（headless 无音频只验不抛）
  w.startRain(true, 0.8);
  game.scene.zoneSnow = true;
  for (let i = 0; i < 150; i++) game.updateWeather?.();
  res.blizzardVol = Math.round(w.blizzardSoundVolume * 100) / 100;
  res.loopHandles = Object.keys(game['weatherLoops'] ?? {});
  res.loopVols = game['weatherLoopVol'] ?? null;

  res.texLoaded = {
    clouds: sky['cloudTexs'].filter((t: any) => t && t.complete && t.naturalWidth > 0).length,
    birds: !!(sky['birdsTex'] && sky['birdsTex'].complete && sky['birdsTex'].naturalWidth > 0),
    gastropod: !!(sky['gastropodTex'] && sky['gastropodTex'].complete && sky['gastropodTex'].naturalWidth > 0),
  };
  return res;
});
console.log(JSON.stringify({ ...out, pageErrors }, null, 1));
await browser.close();
