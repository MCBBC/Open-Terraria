// vf 链主线程长任务探针(生产 dist):真实渲染路径下逐段传送遍历新地形,
// PerformanceObserver 收 >50ms 长任务。AB 模式经环境变量切:
//   VFP_MODE=gen(默认)   —— 新默认引擎(tileframe-codegen)
//   VFP_MODE=interp       —— localStorage sw_vanilla_framing_codegen=0 回解释器
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const WLD = needInput(join(DOWNLOADS, 'FTW V2.wld'));
const MODE = process.env.VFP_MODE ?? 'gen';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
if (MODE === 'interp') {
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('sw_vanilla_framing_codegen', '0'); } catch {} });
} else {
  await p.evaluateOnNewDocument(() => { try { localStorage.removeItem('sw_vanilla_framing_codegen'); } catch {} });
}
await p.goto(`${ORIGIN}/?vf=1&nosw&t=${MODE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const conv = await p.evaluate(async (b64) => {
  const m = await import('/src/wld/WldImport.ts').catch(() => null);
  if (!m) return 'DEVONLY';
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
if (conv === 'DEVONLY') { console.log(JSON.stringify({ error: 'probe needs dev origin (/src imports) or inline conversion' })); await b.close(); process.exit(2); }
await p.evaluate((t) => window.__swLoadJson(t), conv);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(4000); // 初始加载期抖动不计入观察窗
// 观察窗开启
await p.evaluate(() => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); })
    .observe({ type: 'longtask', buffered: false });
});
// 传送遍历:14 站覆盖 地表森林/沙漠边界/用户标注区/地下石土混合/深处/丛林侧/雪原侧
const stops = [
  [3969, 452], [3985, 460], [4002, 465], [3950, 470], [4030, 468],
  [4000, 700], [4040, 750], [3980, 900], [4060, 1050], [3930, 1100],
  [3870, 480], [4100, 500], [4160, 470], [4200, 600],
];
for (const [x, y] of stops) {
  await p.evaluate((px, py) => { const g = window.__swGame; g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; }, x, y);
  await sleep(650);
}
const res = await p.evaluate(() => {
  const lt = window.__lt ?? [];
  const sorted = [...lt].sort((a, b2) => b2[1] - a[1]);
  const sum = (f) => lt.filter(f);
  return {
    mode: location.search.includes('t=interp') ? 'interp' : 'gen',
    count: lt.length,
    totalMs: lt.reduce((s2, [, d]) => s2 + d, 0),
    over100: sum(([, d]) => d > 100).length,
    over200: sum(([, d]) => d > 200).length,
    max: sorted[0]?.[1] ?? 0,
    top10: sorted.slice(0, 10),
  };
});
console.log(JSON.stringify(res));
await b.close();
