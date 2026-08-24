// 雨环境音层（Music_28）地下泄漏验证：强制降雨 → 地表 vs 地底 rainGain 对比
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 2000));
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wd = g.world.weather;
  // 强风雨：wind 过门 + 持续降雨（rainTime 拉高防 updateRainSchedule 停雨）cloudAlpha=0.6
  wd.windSpeedTarget = 0.7; wd.windSpeedCurrent = 0.7;
  wd.raining = true; wd.rainTime = 360000; wd.maxRaining = 0.6; wd.cloudAlpha = 0.6;

  const sfx = g.sfx;
  sfx.setWind(0, false); sfx.setRain(0, false);
  if (sfx.ctx && sfx.ctx.state === 'suspended') { try { await sfx.ctx.resume(); } catch { /* ignore */ } }

  const snap = async (label) => ({
    label,
    tileY: Math.floor(g.player.cy / 16),
    gl: +g.world.groundLevel.toFixed(1),
    surfaceAtmospherics: !!g.scene?.surfaceAtmospherics,
    raining: wd.raining, cloudAlpha: +wd.cloudAlpha.toFixed(3),
    windGain: sfx.cueLayers.wind.gain ? +sfx.cueLayers.wind.gain.gain.value.toFixed(4) : null,
    rainGain: sfx.cueLayers.rain.gain ? +sfx.cueLayers.rain.gain.gain.value.toFixed(4) : null,
  });
  const visit = (tileY) => {
    g.player.x = g.world.spawnX * 16 + 8; g.player.y = tileY * 16;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
  };

  const res = {};
  visit(g.world.spawnY - 6);
  await sleep(3000);
  res.surface = await snap('surface');
  visit(g.world.rockLevel + 120);
  await sleep(5000);
  res.deep5s = await snap('deep+5s');
  // 退出路径验证（destroy→stopWeatherLoops→stopAmbientCues 等价直调）：双轨应瞬时归零
  sfx.stopAmbientCues();
  res.afterStop = {
    windGain: sfx.cueLayers.wind.gain ? +sfx.cueLayers.wind.gain.gain.value.toFixed(4) : null,
    rainGain: sfx.cueLayers.rain.gain ? +sfx.cueLayers.rain.gain.gain.value.toFixed(4) : null,
  };
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
