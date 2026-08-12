// 时间系统 1:1 验证：①边界 4:30/19:30 ②昼15min/夜9min 分段速率 ③起始 8:15AM ④isDay
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  const r = { start: Math.round(c.timeOfDay * 1e5) / 1e5, hour: Math.round(c.hourFloat * 100) / 100 };
  // 边界
  c.timeOfDay = 0.19; r.b431 = c.isDay;          // 4:33 → 昼
  c.timeOfDay = 0.18; r.b419 = c.isDay;          // 4:19 → 夜
  c.timeOfDay = 0.81; r.e1944 = c.isDay;         // 19:26 → 昼
  c.timeOfDay = 0.82; r.e1953 = c.isDay;         // 19:41 → 夜
  // 分段速率：昼段 1 秒推进 vs 夜段 1 秒推进（比例应 9:15=0.6）
  c.timeOfDay = 0.5; const t0 = c.timeOfDay; c.tick(1000); r.dayRate = Math.round((c.timeOfDay - t0) * 1e6) / 1e6;
  c.timeOfDay = 0.9; const t1 = c.timeOfDay; c.tick(1000); r.nightRate = Math.round((c.timeOfDay - t1) * 1e6) / 1e6;
  r.rateRatio = Math.round(r.dayRate / r.nightRate * 100) / 100; // 1.0（恒速）
  // 昼段 1s 推进量 × 900s = 0.625（15min 占比）
  r.daySpan = Math.round(r.dayRate * 900 * 1000) / 1000;
  return r;
});
console.log(JSON.stringify(out));
const ok = Math.abs(out.start - 0.34375) < 0.01 && out.b431 === true && out.b419 === false
  && out.e1944 === true && out.e1953 === false
  && Math.abs(out.rateRatio - 1) < 0.02 && Math.abs(out.daySpan - 0.625) < 0.01;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
