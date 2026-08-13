// 天气视觉三件 E2E 探针（一次性诊断，经 tools/run-diag.mjs 跑）。
// 结构：分多次短 evaluate（单次 <180s protocolTimeout），newWorld 后轮询等世界就绪。
//  ① 雨/阴天 → 云走 18-21 风暴云族（Cloud.cs:115-126）；灰云 9-13 雨天 kill
//  ② AmbientSky：白天晴天 → 鸟群入场；夜+神圣 → 腹足怪群体（3-7 只磁吸群）
//  ③ 暴风雪环境音循环轨状态机（headless 无音频只验轨逻辑/音量不抛）
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 800, height: 600 },
  protocolTimeout: 300000,
});
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 240000 });
await new Promise((r) => setTimeout(r, 3000));

// ① 开小世界（840×300，fire-and-forget + 轮询——生成在页面主线程跑，
//    await 会把 evaluate 挂到生成结束，高负载下超 protocolTimeout）
await page.evaluate(() => { void (window as any).__swFlow.newWorld('weather-visual-probe', 840, 300); });
let ready = false;
for (let i = 0; i < 240 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  ready = await page.evaluate(() => !!(window as any).__swGame?.world);
}
if (!ready) { console.log(JSON.stringify({ err: 'world not ready', pageErrors }, null, 1)); await browser.close(); process.exit(1); }

// ② 雨天风暴云族（强制雨 + 推进天气帧，让云族重掷）
const rain = await page.evaluate(async () => {
  const game = (window as any).__swGame;
  const w = game.world.weather;
  const sky = game.renderer.sky;
  w.startRain(true, 0.85);
  for (let i = 0; i < 240; i++) { game.updateWeather?.(); await new Promise((r) => setTimeout(r, 8)); }
  const clouds: any[] = sky['vclouds'];
  return {
    cloudTotal: clouds.length,
    stormClouds: clouds.filter((c) => c.type >= 18 && c.type <= 21).length,
    grayCloudsLeft: clouds.filter((c) => c.type >= 9 && c.type <= 13).length,
    cloudAlpha: Math.round(w.cloudAlpha * 100) / 100,
    numClouds: w.numClouds,
  };
});

// ③ 晴天 + 白天 → 鸟群（强制到期触发）
const birds = await page.evaluate(async () => {
  const game = (window as any).__swGame;
  const w = game.world.weather;
  const sky = game.renderer.sky;
  w.stopRain(true); w.cloudBGActive = 0; w.cloudAlpha = 0;
  game.world.clock.timeOfDay = 0.5;   // 正午
  sky.amb.dayTime = true; sky.amb.raining = false; sky.amb.eclipse = false;
  sky['ambNextAttempt'] = 0;
  await new Promise((r) => setTimeout(r, 200));
  const ents: any[] = sky['ambEntities'];
  const bird = ents.find((e) => e.kind === 'birds');
  return {
    kinds: [...new Set(ents.map((e) => e.kind))],
    count: ents.length,
    birdDepth: bird ? Math.round(bird.depth * 100) / 100 : null,
    birdLifeTicks: bird ? bird.life : null,
    birdDir: bird ? bird.dir : null,
  };
});

// ④ 夜 + 神圣 → 腹足怪群（磁吸参数 + 淡出触发验证）
const gasts = await page.evaluate(async () => {
  const game = (window as any).__swGame;
  const sky = game.renderer.sky;
  sky['ambEntities'].length = 0;
  game.world.clock.timeOfDay = 0.0;   // 午夜
  sky.amb.dayTime = false; sky.amb.zoneHallow = true; sky.amb.raining = false;
  sky['ambNextAttempt'] = 0;
  await new Promise((r) => setTimeout(r, 200));
  const g: any[] = sky['ambEntities'].filter((e) => e.kind === 'gastropod');
  const out: Record<string, unknown> = { count: g.length };
  if (g.length) {
    out.depthRange = [Math.min(...g.map((x) => x.depth)), Math.max(...g.map((x) => x.depth))].map((v) => Math.round(v * 100) / 100);
    out.magAcc = [g[0].magAccX, g[0].magAccY].map((v) => Math.round(v * 10000) / 10000);
    out.lifeRange = [Math.min(...g.map((x) => x.life)), Math.max(...g.map((x) => x.life))];
  }
  return out;
});

// ⑤ 暴风雪循环轨状态机（雪原带 + 雨 → blizzardSoundVolume 渐入；音量快照）
const bliz = await page.evaluate(async () => {
  const game = (window as any).__swGame;
  const w = game.world.weather;
  game.scene.zoneSnow = true;
  w.startRain(true, 0.8);
  for (let i = 0; i < 150; i++) game.updateWeather?.();
  return {
    blizzardVol: Math.round(w.blizzardSoundVolume * 100) / 100,
    loopVols: game['weatherLoopVol'] ?? null,
    handles: Object.keys(game['weatherLoops'] ?? {}),
    volumes: w.loopVolumes(1),
  };
});

// ⑥ 贴图装载 + 页面错误
const tex = await page.evaluate(() => {
  const sky = (window as any).__swGame.renderer.sky;
  return {
    cloudsLoaded: sky['cloudTexs'].filter((t: any) => t && t.complete && t.naturalWidth > 0).length,
    cloudsTotal: sky['cloudTexs'].length,
    birdsTex: !!(sky['birdsTex'] && sky['birdsTex'].complete && sky['birdsTex'].naturalWidth > 0),
    gastropodTex: !!(sky['gastropodTex'] && sky['gastropodTex'].complete && sky['gastropodTex'].naturalWidth > 0),
  };
});

console.log(JSON.stringify({ rain, birds, gasts, bliz, tex, pageErrors }, null, 1));
await browser.close();
