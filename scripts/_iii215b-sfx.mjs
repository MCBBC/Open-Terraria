// ★IIIII215b 一次性验收探针②：生成流音效接线（onActivate/onDeactivate 双 MenuOpen
//   + WARMUP 资产解析）。不 await 创建流;60ms 采样 sfxCounts + 全程 fetch 记录。
//   SW_ORIGIN=http://localhost:5273 node tools/run-diag.mjs --timeout=240000 scripts/_iii215b-sfx.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5273';
const OUT = '/tmp/iii215b-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  const hits = [];
  globalThis.__swSfxFetch = hits;
  const of = globalThis.fetch;
  globalThis.fetch = function (u, ...rest) {
    try {
      const s = String(u);
      if (/(^|\/)sounds\/(Menu_Open|Menu_Close|menu_accept|Chat|Menu_Tick)\./.test(s)) {
        hits.push({ url: s.slice(-40), at: Math.round(performance.now()) });
      }
    } catch { /* 间谍不参与 */ }
    return of.call(this, u, ...rest);
  };
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
// 音频门手势解锁（AudioGate 监听 pointerdown/keydown capture——headless 无手势时
// AudioContext 恒挂起,Sfx 播放全部 defer,fetch 层零记录;此处合成手势开门）
await page.mouse.click(640, 400).catch(() => {});
await page.keyboard.press('a').catch(() => {});
await new Promise((r) => setTimeout(r, 1500));

const out = { bootFetch: null, samples: [], done: false };
const t0 = Date.now();
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'celebrationmk10', size: 0, name: 'iii215b', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
while (Date.now() - t0 < 150000) {
  const s = await page.evaluate(() => ({
    counts: globalThis.__swGenUi?.sfxCounts ?? null,
    inGame: !!globalThis.__swGame?.world,
  })).catch(() => null);
  if (s) {
    out.samples.push({ t: Math.round((Date.now() - t0) / 100) / 10, ...s });
    if (s.inGame) { out.done = true; break; }
  }
  await new Promise((r) => setTimeout(r, 60));
}
out.bootFetch = await page.evaluate(() => globalThis.__swSfxFetch).catch(() => []);
writeFileSync(`${OUT}/sfx-report.json`, JSON.stringify(out, null, 2));
const c0 = out.samples.find((s) => s.counts)?.counts ?? null;
const cEnd = out.samples.length ? out.samples[out.samples.length - 1].counts : null;
console.log('SFX_SUMMARY', JSON.stringify({ done: out.done, firstCounts: c0, lastCounts: cEnd, fetchUrls: [...new Set(out.bootFetch.map((f) => f.url))] }));
await browser.close();
