// lanternOpacity 推进速率实测:强置 lanternsUp→采样 3s→Δ/帧 ≈ 0.005@120fps(dt 折算)=单源
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5205';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
const r = await page.evaluate(async () => {
  const sky = window.__swGame.renderer.sky;
  const { LanternNight } = await import('/src/render/lanternNight.ts').catch(() => ({ LanternNight: null })) ?? {};
  // 直接强置:opacity=0.5 起,lanternsUp 由 sky.lanternOpacity 门消费——rate 只看 opacity 漂移
  sky.lanternOpacity = 0.5;
  const samples = [];
  const t0 = performance.now();
  await new Promise((res) => {
    const rec = () => {
      samples.push({ t: performance.now(), o: sky.lanternOpacity });
      if (performance.now() - t0 < 3000) requestAnimationFrame(rec); else res();
    };
    requestAnimationFrame(rec);
  });
  // 前 30 帧斜率（避开 0 钳制稀释——0.49 在帧 49 就到底,均值失真判例）
  const n = Math.min(30, samples.length - 1);
  const ratePerFrame = (samples[n].o - samples[0].o) / n;
  return { frames: samples.length, o0: samples[0].o, o30: samples[n].o, ratePerFrame: ratePerFrame.toFixed(5), expected: (0.01 * 16.7 / 16.7).toFixed(3) };
});
console.log(JSON.stringify(r));
process.exit(0);
