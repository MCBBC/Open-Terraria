// 世界生成预览帧节奏实测：worker 路径 preview 帧到达时间分布。
// 背景：用户反馈"生成预览曾从左到右刷过，现在疑似跳过/不走"——位图模式(08-10)
// 每个 pass 整帧替换、无扫描线；本探针量化实际观感（帧间隔 vs 60Hz 显示能力）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const W = Number(process.env.PW ?? 6400), H = Number(process.env.PH ?? 1800);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + ORIGIN + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等主菜单挂载（=模块链已加载），不需要进游戏
let menuOk = false;
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await page.evaluate(() => !!document.querySelector('[data-act=mp]')).catch(() => false);
  if (menuOk) break;
}
if (!menuOk) { console.log('主菜单未挂载'); await browser.close(); process.exit(1); }

const out = await page.evaluate(async (W, H) => {
  const t0 = performance.now();
  const evs = [];   // {t, kind, name, p}
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const client = new WorldGenClient();
  const ok = await client.probe();
  if (!ok) return { error: 'worker 不可用' };
  let lastPrevT = t0;
  const gaps = [];
  await client.generate(
    { width: W, height: H, seedText: 'cadence-probe', preview: true },
    {
      onProgress: (_ph, label, p) => evs.push({ t: performance.now() - t0, kind: 'prog', name: label, p }),
      onPreview: (f) => {
        const now = performance.now();
        gaps.push(now - lastPrevT);
        lastPrevT = now;
        evs.push({ t: now - t0, kind: 'prev', name: f.passName, w: f.width, h: f.height });
      },
    },
  );
  // 60fps 显示角度：相邻两帧间隔 <16.7ms 时第二次替换在同一显示帧内，肉眼不可见
  const mergedAt60 = gaps.filter((g) => g < 16.7).length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const q = (r) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * r))] ?? 0;
  const first1s = gaps.filter((_, i) => evs.filter((e) => e.kind === 'prev')[i].t < 1000).length;
  const totalMs = performance.now() - t0;
  return {
    passEvents: evs.filter((e) => e.kind === 'prog').length,
    previews: gaps.length,
    totalMs: Math.round(totalMs),
    prevSpanMs: Math.round(evs.find((e) => e.kind === 'prev')?.t ?? 0),
    gapMedianMs: Math.round(q(0.5)), gapP90Ms: Math.round(q(0.9)), gapMaxMs: Math.round(q(1)),
    gapsLt60fps: mergedAt60,
    previewsInFirst1s: first1s,
    sampleHead: evs.filter((e) => e.kind === 'prev').slice(0, 12).map((e) => `${Math.round(e.t)}ms ${e.name}`),
    sampleTail: evs.filter((e) => e.kind === 'prev').slice(-5).map((e) => `${Math.round(e.t)}ms ${e.name}`),
  };
}, W, H);
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
