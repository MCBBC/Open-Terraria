// 发布包冒烟探针(build:release 产物 G1 闸):preview 静态服上验证
// ①混淆主包可启动 ②混淆 worldGen.worker 能生成世界 ③光照引擎运行 ④无页面错误。
// 用法:先 npx vite preview --port 4174 --strictPort,然后
//   SW_ORIGIN=http://localhost:4174 node tools/run-diag.mjs scripts/_release-smoke.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4174';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 200)); });

await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await p.waitForFunction(() => window.__swGame?.world?.store, { timeout: 300_000 });
await new Promise((r) => setTimeout(r, 8000));

const out = await p.evaluate(() => {
  const g = window.__swGame;
  return {
    worldReady: !!(g.world?.store),
    worldSize: g.world?.store ? `${g.world.store.w}x${g.world.store.h}` : null,
    playerAlive: g.player?.hp > 0,
    lighting: g.lighting ? { rw: g.lighting.rw, rh: g.lighting.rh, dirty: g.lighting.dirty } : null,
    entities: g.entities ? (g.entities.enemies?.length ?? 0) : -1,
  };
});
const swErrors = await p.evaluate(() => (window.__swErrors ?? []).length);
console.log(JSON.stringify({ ...out, pageErrors: pageErrors.slice(0, 5), pageErrorCount: pageErrors.length, swErrors }));
const ok = out.worldReady && out.playerAlive && out.lighting && out.lighting.rw > 0 && pageErrors.length === 0 && swErrors === 0;
console.log(ok ? 'RELEASE SMOKE OK' : 'RELEASE SMOKE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
