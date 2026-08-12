// 天塔柱族（Monolith）浏览器冒烟：进世界 → 直接置滤镜态（单测已覆盖 tile→scan 与
// 状态机，这里验证 Renderer 集成链：render() 扫描调用/状态机推进/全屏滤镜绘制/恢复）。
// 运行：node tools/run-diag.mjs scripts/_monoprobe.mjs（依赖 5199 dev server）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 30)));
  const g = window.__swGame;
  const r = g.renderer;
  const canvas = r.canvas;
  const sum = () => {
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 40) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  };
  const scanBefore = { ...r.monoScan };
  // 基线：等几帧让画面稳定
  await nextFrame(); await nextFrame();
  const before = sum();
  // 直接置 CRT + 星尘柱态（render() 每帧 update 会把 active 拉回 false，
  // 但 Opacity 下斜 1/s → 1 秒内仍 >0，draw 会执行——足以验证整屏合成链路）
  const crt = r.monoFilters.filters.find((x) => x.def.key === 'CRT');
  const stardust = r.monoFilters.filters.find((x) => x.def.key === 'MonolithStardust');
  crt.active = true; crt.opacity = 1;
  stardust.active = true; stardust.opacity = 1;
  await nextFrame();
  const crtDuring = { ...crt };
  const during = sum();
  // 恢复：等 1.5s 下斜归零
  await new Promise((res) => setTimeout(res, 1500));
  const crtAfter = r.monoFilters.filters.find((x) => x.def.key === 'CRT');
  const after = sum();
  return {
    scanBeforeType: scanBefore.activeMonolithType,
    crtActiveDuring: crtDuring.active, crtOpacityDuring: crtDuring.opacity,
    crtOpacityAfter: crtAfter.opacity,
    pixelDelta: Math.abs(during - before),
    recovered: Math.abs(after - before),
  };
});
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
console.log(JSON.stringify(out));
check('空场景扫描 activeMonolithType=-1', out.scanBeforeType === -1, `got ${out.scanBeforeType}`);
check('滤镜置位后当帧参与合成（opacity>0）', out.crtOpacityDuring > 0.9, `op=${out.crtOpacityDuring}`);
check('画面发生滤镜变化', out.pixelDelta > 500, `delta=${out.pixelDelta}`);
check('1.5s 后下斜归零', out.crtOpacityAfter === 0, `after=${out.crtOpacityAfter}`);
check('关闭后画面恢复', out.recovered < out.pixelDelta, `recovered=${out.recovered} delta=${out.pixelDelta}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
