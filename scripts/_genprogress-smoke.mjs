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
const errs = [];
page.on('console', (m) => { const t = m.text(); if (/error|ERROR|缺失/.test(t)) errs.push(t.slice(0, 160)); });
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
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
        if (d && d.type === 'preview') recs.push({ pv: true, at: performance.now(), idx: d.passIndex, name: d.passName, w: d.width });
      });
    }
  };
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });

// （织入块已上移至 goto 前）
// 绕过资产预载门直接走创建流（window.__swFlow.newWorld 与正式 UI 同链路）
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 180000 });
const t0 = Date.now();
try {
  // 走真实创建流（双进度条 + worker 预览抓帧），legacy newWorld 桥不带 preview opts
  await page.evaluate(() => window.__swFlow.createWorldProbe());
} catch (e) {
  console.log('NEWWORLD_THROW:', JSON.stringify({ msg: String(e).slice(0, 200), errs: errs.slice(0, 8) }));
  process.exit(3);
}
await page.waitForFunction(() => !!globalThis.__swGame?.world?.store?.w, { timeout: 240000 });
const secs = (Date.now() - t0) / 1000;

let out;
try {
  out = await page.evaluate(() => {
  const r = globalThis.__swProgRecs ?? [];   // 兜底：织入未命中时按空集判等
  const pvs = r.filter((e) => e.pv);         // 预览帧事件（到达序）
  const gaps = [];
  for (let i = 1; i < pvs.length; i++) gaps.push(+(pvs[i].at - pvs[i - 1].at).toFixed(0));
  const minGap = gaps.length ? Math.min(...gaps) : -1;
  const over1sGaps = gaps.filter((g) => g > 1000).length;   // >1s 冻结段计数
  const maxWidths = [...new Set(pvs.map((e) => e.w))];
  let mono = true; let prev = -1;
  for (const e of r) {
    if (e.pv) continue;
    if (e.p < prev - 1e-9 && e.p !== 1) { mono = false; break; }
    if (e.p > prev) prev = e.p;
  }
  const prog = r.filter((e) => !e.pv);
  const withLocal = prog.filter((e) => typeof e.local === 'number');
  const stickyUndefinedLabel = prog.filter((e) => e.label === undefined).length;
  // 相邻采样间距分布（顺滑度）：>8% 跳变的次数
  let bigJumps = 0; let p0 = -1;
  for (const e of prog) { if (p0 >= 0 && e.p > p0 + 0.08 && e.p !== 1) bigJumps++; p0 = Math.max(p0, e.p); }
  const firstLabels = [];
  for (const e of prog) {
    if (firstLabels.length >= 6) break;
    firstLabels.push(`${String(e.label)}@${e.p.toFixed(3)}${e.local != null ? `l${e.local.toFixed(2)}` : ''}`);
  }
  const prevShotsWithIdx = pvs.map((e) => `${e.idx}:${(e.name || '').slice(0, 8)}`);
  return {
    total: prog.length, withLocal: withLocal.length, stickyUndefinedLabel, mono, bigJumps,
    firstLabels: firstLabels.slice(0, 6),
    previews: pvs.length, previewMinGapMs: minGap, previewOver1sGaps: over1sGaps,
    previewFirstShots: prevShotsWithIdx.slice(0, 8), previewMaxWidths: maxWidths.slice(0, 2),
    last: prog[prog.length - 1] ?? null,
  };
});
} catch (e) {
  out = { evaluateError: String(e).slice(0, 300) };
}
console.log(JSON.stringify({ genSecs: +secs.toFixed(1), ...out, errs: errs.slice(0, 6) }));
process.exit(0);
