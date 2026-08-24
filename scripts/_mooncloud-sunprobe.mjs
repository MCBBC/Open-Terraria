// 一次性:①月亮照云缺失——游戏内午夜满月读 cloudCelestial 全链状态+近月/远月云像素差;
// ②晨昏太阳观感——黄昏窗截图+镜头光斑链状态(occ/sunset/celestial)。菜单侧同题对照。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 天体态/光斑链状态 dump */
const STATE_FN = `(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  return {
    isDay: sky.lastIsDay,
    lastMoonPhase: sky.lastMoonPhase,
    vis: sky.horizonVisCache ? {
      sunrise: +sky.horizonVisCache.sunrise.toFixed(4),
      sunset: +sky.horizonVisCache.sunset.toFixed(4),
      celestial: +sky.horizonVisCache.celestial.toFixed(4)
    } : null,
    moonScreen: sky.moonScreen,
    sunScreen: sky.sunScreen,
    cel: sky.cloudCelestial ? {
      posX: Math.round(sky.cloudCelestial.posX),
      posY: Math.round(sky.cloudCelestial.posY),
      intensity: +sky.cloudCelestial.intensity.toFixed(4),
      rgb: [Math.round(sky.cloudCelestial.r * 255), Math.round(sky.cloudCelestial.g * 255), Math.round(sky.cloudCelestial.b * 255)]
    } : null,
    cloudBGAlpha: +(sky.cloudBGAlpha ?? 0).toFixed(4),
    nClouds: sky.vclouds ? sky.vclouds.length : -1,
    cots: sky.cots ? sky.cots.map((v) => Math.round(v)) : null,
    gl: sky.cloudGlLayer ? {
      unavailable: !!sky.cloudGlLayer.unavailable,
      cloudFxOK: !!sky.cloudGlLayer.cloudFxOK
    } : null,
    useGLClouds: sky.useGLClouds,
    sunVisSampled: sky.sunVisSampled,
    sunVisibility: +((sky.sunVisibility ?? -1)).toFixed(4)
  };
})()`;

/** 近月/远月云像素对比 */
const NEAR_FAR_FN = `(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const body = sky.lastIsDay ? sky.sunScreen : sky.moonScreen;
  if (!body) return { err: 'no body' };
  const d = ctx.getImageData(0, 0, W, H).data;
  const near = [];
  const far = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const lum = (r + gg + b) / 3;
      const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      if (lum < 60 || lum > 250 || sat > 70) continue;
      const dx = x - body.x;
      const dy = y - body.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 260) near.push([r, gg, b]);
      else if (dist > 700 && x < W * 0.9 && y < H * 0.55) far.push([r, gg, b]);
    }
  }
  const avg = (arr) => arr.length
    ? [0, 1, 2].map((k) => Math.round(arr.reduce((s, p) => s + p[k], 0) / arr.length))
    : null;
  return {
    body: { x: Math.round(body.x), y: Math.round(body.y) },
    nearN: near.length, farN: far.length, near: avg(near), far: avg(far)
  };
})()`;

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

// ---------- 游戏内:午夜满月 ----------
{
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
  await p.evaluate(() => {
    const g = window.__swGame;
    // 午夜: DUSK(0.8125)+16200/32400*0.375=1.0 → 用 −0.0005 稳落夜窗
    g.world.clock.timeOfDay = 0.8125 + (16200 / 32400) * 0.375 - 0.0005;
    g.world.clock.moonPhase = 0;          // 满月(GetMoonStrength=|4-0|/4=1 最大)
    g.world.clock.bloodMoon = false;
    const pl = g.player;
    pl.x = g.world.store.w * 16 / 2;
    pl.vx = 0;
  });
  await sleep(4000);
  const nightState = await p.evaluate(STATE_FN);
  const nearFar = await p.evaluate(NEAR_FAR_FN);
  await shot(p, 'ingame-midnight-fullmoon');
  console.log('INGAME_MIDNIGHT_STATE:', JSON.stringify(nightState));
  console.log('INGAME_NEARFAR:', JSON.stringify(nearFar));
  await b.close();
}

// ---------- 游戏内:黄昏两时刻(t=50400 峰值 / t=52500 尾段) ----------
for (const T of [50400, 52500]) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const p = await b.newPage();
  await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
  await p.evaluate((t) => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.1875 + (t / 54000) * 0.625;
    const pl = g.player;
    pl.x = g.world.store.w * 16 / 2;
    pl.vx = 0;
  }, T);
  await sleep(3500);
  const st = await p.evaluate(STATE_FN);
  await shot(p, `ingame-dusk-${T}`);
  console.log(`INGAME_DUSK_${T}_STATE:`, JSON.stringify(st));
  await b.close();
}

// ---------- 菜单:午夜满月 / 黄昏 ----------
{
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const p = await b.newPage();
  await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 100 && !await p.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await sleep(1000);
  for (let i = 0; i < 30; i++) {
    if (await p.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
    await sleep(500);
  }
  await p.evaluate(() => {
    const mb = window.__swMenuBg;
    mb.dayTime = false;
    mb.vTime = 16200;
    mb.sky.moonType = 0;
  });
  await sleep(1500);
  await shot(p, 'menu-midnight');
  const mst = await p.evaluate(() => {
    const s = window.__swMenuBg.sky;
    return {
      isDay: s.lastIsDay,
      vis: s.horizonVisCache
        ? { sunrise: +s.horizonVisCache.sunrise.toFixed(4), sunset: +s.horizonVisCache.sunset.toFixed(4), celestial: +s.horizonVisCache.celestial.toFixed(4) }
        : null,
      moonScreen: s.moonScreen,
      cel: s.cloudCelestial
        ? {
            posX: Math.round(s.cloudCelestial.posX),
            posY: Math.round(s.cloudCelestial.posY),
            intensity: +s.cloudCelestial.intensity.toFixed(4),
            rgb: [Math.round(s.cloudCelestial.r * 255), Math.round(s.cloudCelestial.g * 255), Math.round(s.cloudCelestial.b * 255)]
          }
        : null,
      gl: s.cloudGlLayer ? { unavailable: !!s.cloudGlLayer.unavailable, cloudFxOK: !!s.cloudGlLayer.cloudFxOK } : null
    };
  });
  console.log('MENU_MIDNIGHT:', JSON.stringify(mst));
  await p.evaluate((t) => {
    const mb = window.__swMenuBg;
    mb.dayTime = true;
    mb.vTime = t;
  }, 50400);
  await sleep(900);
  await shot(p, 'menu-dusk-50400');
  await b.close();
}
console.log('DONE →', OUT);
