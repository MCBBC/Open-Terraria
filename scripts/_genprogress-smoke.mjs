// 一次性验收探针：创建世界进度条顺滑度（GenProgress 对齐后的实机观测）。
// 经 tools/run-diag.mjs + SW_ORIGIN 运行（CLAUDE.md 约定）：
//   SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_genprogress-smoke.mjs
// 验收面：① 进度消息总数（旧实现仅 ~64 条）；② overall 单调不减；
//         ③ 段内 local 值出现（原版短条语义）；④ 标签呈原版词条形态。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1200, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });

// 织入 Worker 进度事件记录（worker 内 GenProgress → protocol progress(local)）
await page.evaluateOnNewDocument(() => {
  const recs = [];
  globalThis.__swProgRecs = recs;
  const OW = globalThis.Worker;
  globalThis.Worker = class extends OW {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.type === 'progress') recs.push({ label: d.label, p: d.p, local: d.local });
      });
    }
  };
});
// 绕过资产预载门直接走创建流（window.__swFlow.newWorld 与正式 UI 同链路）
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 180000 });
const t0 = Date.now();
await page.evaluate(() => window.__swFlow.newWorld(String(424242), 4200, 1200));
await page.waitForFunction(() => !!globalThis.__swGame?.world?.store?.w, { timeout: 240000 });
const secs = (Date.now() - t0) / 1000;

const out = await page.evaluate(() => {
  const r = globalThis.__swProgRecs;
  let mono = true; let prev = -1;
  for (const e of r) {
    if (e.p < prev - 1e-9 && e.p !== 1) { mono = false; break; }
    if (e.p > prev) prev = e.p;
  }
  const withLocal = r.filter((e) => typeof e.local === 'number');
  const stickyUndefinedLabel = r.filter((e) => e.label === undefined).length;
  // 相邻采样间距分布（顺滑度）：>8% 跳变的次数
  let bigJumps = 0; let p0 = -1;
  for (const e of r) { if (p0 >= 0 && e.p > p0 + 0.08 && e.p !== 1) bigJumps++; p0 = Math.max(p0, e.p); }
  return {
    total: r.length, withLocal: withLocal.length, stickyUndefinedLabel, mono, bigJumps,
    firstLabels: r.slice(0, 6).map((e) => `${String(e.label)}@${e.p.toFixed(3)}${e.local != null ? `l${e.local.toFixed(2)}` : ''}`),
    last: r[r.length - 1],
  };
});
console.log(JSON.stringify({ genSecs: +secs.toFixed(1), ...out }));
process.exit(0);
