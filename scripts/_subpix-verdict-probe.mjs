// ★subpix 定谳实证探针（2026-10-07;刀2 销案判语的 dpr=2 活机侧证据）。
//
// 判据:
//   SA  dpr=2 页面上主画布背板 = window.innerWidth（CSS 分辨率,无 dpr 因子）
//       ——画布内不存在设备像素网格,「按设备像素取整」无落点=旗为空操作。
//   SB  DOM 合成上采样率 = dpr（clientWidth×dpr / width）——dpr=2 的 2 设备 px
//       阶跃源=浏览器整幅上采样,非渲染链取整选择。
//   SC  渲染链取整粒度=1 画布 px:相机 +0.5 世界 px（zoom 1=0.5 画布 px）→
//       chunk 矩形 round 后不动或动 1 画布 px,永无半步;+1 世界 px → 恰 1 画布 px。
// 运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs scripts/_subpix-verdict-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({ viewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261007 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__swGame.paused = true; });

const verdict = await page.evaluate(async () => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const wait = (n) => new Promise((res) => {
    const t0 = g._paintedFrames;
    const f = () => { if (g._paintedFrames >= t0 + n) res(); else requestAnimationFrame(f); };
    f();
  });
  await wait(10);
  const dpr = window.devicePixelRatio;
  const sa = { dpr, backingW: cv.width, cssW: window.innerWidth, backingIsCss: cv.width === window.innerWidth };
  // DOM 上采样率
  const rect = cv.getBoundingClientRect();
  const sb = { upscale: +((rect.width * dpr) / cv.width).toFixed(3) };
  // 取整粒度:相机 +0.5 世界 px 与 +1 世界 px 的 chunk 矩形位移（drawChunkGrid 同式）
  const gridProbe = (camX) => {
    const z = g.camera.zoom, zz = z;
    const camRX = Math.round(camX * z) / z;
    const cx = Math.round(camX / 256);
    return {
      d0: Math.round((cx * 256 - camRX) * zz),
      d1: Math.round(((cx + 1) * 256 - camRX) * zz),
    };
  };
  const base = g.camera.x;
  const at0 = gridProbe(base);
  const atHalf = gridProbe(base + 0.5);   // 半世界 px:round 后同格或 ±1,永无半步
  const atOne = gridProbe(base + 1);      // 整世界 px:恰 ±1 画布 px
  return { sa, sb, shifts: { half: atHalf.d0 - at0.d0, one: atOne.d0 - at0.d0 } };
});
chk('SA1 dpr=2 页画布背板=CSS 分辨率（无设备像素网格）', verdict.sa.dpr === 2 && verdict.sa.backingIsCss === true,
  JSON.stringify(verdict.sa));
chk('SB1 DOM 合成上采样率=dpr（阶跃源=浏览器整幅拉伸）', verdict.sb.upscale === 2, JSON.stringify(verdict.sb));
chk('SC1 取整粒度=1 画布 px（位移恒整数:相机右移=内容左移;+0.5 世界 px→整数位移无半步;+1→|1|）',
  Number.isInteger(verdict.shifts.half) && Number.isInteger(verdict.shifts.one)
  && Math.abs(verdict.shifts.half) <= 1 && Math.abs(verdict.shifts.one) === 1,
  JSON.stringify(verdict.shifts));
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
console.log(`\n== subpix verdict: ${results.filter((r) => r.ok).length}/${results.length} PASS ==`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
