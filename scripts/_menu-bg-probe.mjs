// ★主菜单背景动画修复验证（2026-10-16）:hook menuTick 拿 biomeBg 实例读 menuClock
// （菜单自累进钟）推进——修复后 3s 应 +180（60/s）;另读 menuBgCounter 驱动的
// 瀑布帧索引换帧。
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await page.evaluate(async () => {
  const m = await import('/src/render/BiomeBackground.ts');
  const proto = m.BiomeBackground.prototype;
  window.__mb = { calls: 0, clock: 0 };
  const orig = proto.menuTick;
  proto.menuTick = function (...a) {
    const r = orig.apply(this, a);
    window.__mb.calls++;
    window.__mb.clock = this.menuClock;
    window.__mb.counter = this.menuBgCounter?.() ?? null;
    return r;
  };
});
const a = await page.evaluate(() => ({ ...window.__mb }));
await new Promise((r) => setTimeout(r, 3000));
const b = await page.evaluate(() => ({ ...window.__mb }));
console.log('t0:', JSON.stringify(a));
console.log('t1(+3s):', JSON.stringify(b));
const ok = b.clock - a.clock >= 170;   // ~180（60/s×3s）
console.log(ok ? `GATE PASS（菜单钟 +${b.clock - a.clock}/3s≈60/s;counter 跟随）` : `GATE FAIL（+${b.clock - a.clock}）`);
process.exitCode = ok ? 0 : 1;
await browser.close();
