// CPU flame 探针:CDP Profiler.start 采样巡游全程,输出 selfTime top40 函数。
// ★平台面:iOS 的 Safari 远程检视无法脚本化 —— iOS 基线一律人工谱样(Safari 开发
//   菜单连真机录制),本探针只在 Chromium 面(桌面 Chrome 预演 / Android WebView 壳)
//   自动化。Android 真机变体:chrome://inspect 打端口转发后设 SW_CDP=<ws endpoint>,
//   本脚本自动改走 connect CDP(SW_CDP 存在时跳过本地 launch)。
// 用法:SW_DUR=20 SW_ORIGIN=http://localhost:5201 \
//   node tools/run-diag.mjs scripts/_cpu-flame-probe.mjs
import puppeteer from 'puppeteer-core';
import { launch as launchLocal, armPerfMeter, loadDefaultWorld, teleportTour, TOUR_POINTS, origin, sleep } from './_perf-lib.mjs';

const DUR = Number(process.env.SW_DUR ?? 20);
const CDP_WS = process.env.SW_CDP ?? '';

let browser;
let page;
if (CDP_WS) {
  browser = await puppeteer.connect({ browserWSEndpoint: CDP_WS, defaultViewport: null });
  page = (await browser.pages())[0] ?? await browser.newPage();
} else {
  browser = await launchLocal();
  page = await browser.newPage();
}

try {
  if (!CDP_WS) {
    await armPerfMeter(page);
    await page.goto(`${origin()}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loadDefaultWorld(page);
  } else {
    // 真机壳内页面已在前台运行中;仅确认游戏就绪
    for (let i = 0; i < 120; i++) {
      const ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false);
      if (ok) break;
      await sleep(1000);
    }
  }

  const client = await page.createCDPSession();
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 500 }); // µs,默认 100µs 过密
  await client.send('Profiler.start');

  const dwell = Math.max(1500, Math.floor((DUR * 1000 * 0.7) / TOUR_POINTS.length));
  await teleportTour(page, TOUR_POINTS, dwell);
  await sleep(1000);

  const { profile } = await client.send('Profiler.stop');
  // 按 selfTime(hitCount×sampleInterval)排 top40;附 URL:line 方便对源码
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfHits = new Map();
  let total = 0;
  for (const s of profile.samples ?? []) {
    selfHits.set(s, (selfHits.get(s) ?? 0) + 1);
    total++;
  }
  const rows = [...selfHits.entries()]
    .map(([id, hits]) => ({ id, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 40)
    .map(({ id, hits }) => {
      const n = byId.get(id) ?? {};
      const f = n.callFrame ?? {};
      return {
        pctOfTotal: +(hits * 100 / Math.max(1, total)).toFixed(2),
        samples: hits,
        fn: f.functionName || '(anonymous)',
        url: (f.url || '').replace(/^.*\//, ''),
        line: f.lineNumber >= 0 ? f.lineNumber + 1 : null,
      };
    });
  console.log(JSON.stringify({
    probe: 'cpu-flame',
    platform: CDP_WS ? 'remote-android' : 'desktop-chrome',
    totalSamples: total,
    durationSec: DUR,
    top: rows,
  }, null, 1));
} finally {
  if (CDP_WS) await browser.disconnect();
  else await browser.close();
}
