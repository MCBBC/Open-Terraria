// 变体全等对质:游戏导入店(用户现档)上,注入 rig 见证序变体 fn + forceFresh,
// 输出帧必须与 rig 原始 (fx,fy) 逐位相等(不存在任何归一化,oracle 注释:双轴漂移无单一公式)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = '/Users/vinlic/Downloads/map-FTW_V2 (6).json';
const ROWS = JSON.parse(fs.readFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/marks-rig.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 900, height: 600 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(4000);
const res = await p.evaluate(async (rows) => {
  const vf = await import('/src/render/VanillaFraming.ts');
  const st = window.__swGame.world.store;
  const rock = window.__swGame.world.rockLevel ?? 0;
  const out = [];
  let exact = 0, diff = 0;
  for (const r of rows) {
    if (r.fn < 0) { out.push({ ...r, skip: 'noRig' }); continue; }
    const v = vf.vanillaFrameFor(st, r.x, r.y, st, r.fn, rock, true);
    const ok = v.fx === r.rfx && v.fy === r.rfy;
    if (ok) exact++; else diff++;
    out.push({ x: r.x, y: r.y, t: r.t, fn: r.fn, chain: [v.fx, v.fy], rig: [r.rfx, r.rfy], ok });
  }
  return { exact, diff, bad: out.filter((o) => o.ok === false).slice(0, 20) };
}, ROWS);
console.log(JSON.stringify(res));
await b.close();
