// 天气渲染 E2E 探针：进世界 → 强制 startRain(0.85)+大风 → 断言雨滴活跃数/风偏角度；
// 闪电触发 → 白闪帧；雷声 wav 加载
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const res: Record<string, unknown> = {};
  await (window as any).__swFlow.newWorld('weather-probe', 1200, 400);
  const t0 = Date.now();
  while (!(window as any).__swGame?.world && Date.now() - t0 < 240000) await new Promise((r) => setTimeout(r, 1000));
  const game = (window as any).__swGame;
  if (!game?.world) return { err: 'world not ready' };
  const w = game.world.weather;

  // 强制雨 + 大风（等 cloudAlpha 爬升）
  w.startRain(true, 0.85);
  w.windSpeedTarget = 0.7;
  await new Promise((r) => setTimeout(r, 3000));

  const fx = game.renderer.weatherFx;
  const active = fx.pool.filter((d: any) => d.active);
  res.rainActive = active.length;
  res.cloudAlpha = Math.round(w.cloudAlpha * 100) / 100;
  res.windCurrent = Math.round(w.windSpeedCurrent * 100) / 100;
  // 风偏：雨滴 vx = wind×18×scale > 0（风向右 → 雨向右斜）
  res.rainVxSample = active.slice(0, 5).map((d: any) => Math.round(d.vx * 100) / 100);
  res.skyAttached = !!game.renderer.sky.weatherRef;
  res.cloudCount = game.renderer.sky['vclouds'].length;

  // 闪电：instant 触发 → 下一帧 lightning>0
  w.newLightning(true);
  game.updateWeather?.(); // 推进一帧计时（私有——直接再等一帧）
  await new Promise((r) => setTimeout(r, 60));
  res.lightningAfterTrigger = Math.round(w.lightning * 100) / 100;

  // 雨停：cloudAlpha 归零后雨滴池清空
  w.stopRain(true);
  await new Promise((r) => setTimeout(r, 4000));
  res.rainAfterStop = fx.pool.filter((d: any) => d.active).length;
  res.cloudAlphaAfterStop = Math.round(w.cloudAlpha * 100) / 100;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
